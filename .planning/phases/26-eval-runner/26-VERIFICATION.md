---
phase: 26-eval-runner
verified: 2026-06-14T00:00:00Z
status: gaps_found
score: 9/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "The script exits non-zero with a clear stderr message when the input file is missing/unparseable, when no post carries a label, or when ANTHROPIC_API_KEY is unset"
    status: partial
    reason: >
      The missing-file, zero-labels, and missing-API-key guards all work correctly and
      print the intended message + exit(1). However, a valid-JSON-but-non-object file
      (e.g. a file containing the literal `null`) causes an unhandled TypeError crash
      at scripts/eval.ts:166 instead of the intended clean exit. JSON.parse("null")
      succeeds, the try/catch on lines 150-156 is not triggered, and execution reaches
      `parsed.flaggedPosts` which throws TypeError on null. The user sees a node
      stack trace, not the "Error: Could not read or parse file" message. This is
      CR-01 from the code review.
    artifacts:
      - path: "scripts/eval.ts"
        issue: >
          Lines 149-156: the parsed object is cast without a shape check after JSON.parse.
          A post-parse guard (`if (typeof json !== 'object' || json === null || Array.isArray(json))`)
          is missing, causing TypeError crash on null input instead of exit(1) + clear message.
    missing:
      - >
        Add shape check after JSON.parse — if the parsed value is not a non-null, non-array
        object, write the existing error message to stderr and call process.exit(1).
        The fix is 4 lines inside the try block (see CR-01 in 26-REVIEW.md).
  - truth: "EVAL-05 exit-code paths have unit test coverage (plan acceptance criteria)"
    status: failed
    reason: >
      Plan 02 Task 3 acceptance criteria explicitly required tests for: missing-argv,
      unreadable-file, missing-ANTHROPIC_API_KEY, and zero-labels exit paths. The
      SUMMARY.md claims these were delivered ("EVAL-05 exit codes" suite). They were not.
      scripts/eval.test.ts covers only the three exported pure functions (collectLabeled,
      computeMetrics, safe). None of the five process.exit(1) branches in main() have
      any test coverage. This is WR-04 from the code review.
    artifacts:
      - path: "scripts/eval.test.ts"
        issue: >
          226 lines covering collectLabeled, computeMetrics, and safe() only.
          No test stubs process.exit or mocks main() invocation for any of the
          five CLI guard paths called out in the plan.
    missing:
      - >
        Export `main()` from scripts/eval.ts and add tests that stub process.exit,
        mock fs.readFileSync, and assert each of: missing-argv, unreadable-file,
        missing-ANTHROPIC_API_KEY, null-JSON-input, and zero-labels paths each
        call process.exit(1) with the correct stderr message.
---

# Phase 26: Eval Runner Verification Report

**Phase Goal:** Provide a repeatable eval harness — (1) extract the LLM classifier into a transport-agnostic shared module so it can be exercised outside the extension, and (2) an `npm run eval` CLI that re-scores a labeled Export JSON through that shared classifier, sweeps detection thresholds, reports classification metrics and LLM cost, and persists results.
**Verified:** 2026-06-14T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A shared classifier module exists that scores post text via the Anthropic API with the API key supplied as a parameter (no chrome.storage dependency) | VERIFIED | `src/shared/classifier.ts` exports `classifyPost(postText, apiKey)`. `grep chrome src/shared/classifier.ts` = 0 matches. No `chrome.*` or `pricing.ts` import present. |
| 2 | The shared module returns both the DetectionResult and the Anthropic usage object so callers can record cost | VERIFIED | `ClassifyResult = { result: DetectionResult; usage?: AnthropicUsage }` at line 26. `classifyPost` returns `{ result, usage: data.usage }` at line 167. |
| 3 | The service worker still scores posts and records a usage-bearing trace identically to before the refactor (test suite green) | VERIFIED | `src/background/index.ts` L7 imports `SYSTEM_PROMPT, classifyPost, type AnthropicUsage` from `../shared/classifier`. No local `SYSTEM_PROMPT` or `AnthropicUsage` remain (grep returns 0). `scorePost` at L91 calls `classifyPost(postText, apiKey)` and passes `usage` to `recordTrace`. 287 tests pass. |
| 4 | SYSTEM_PROMPT and the Anthropic request build live in exactly one place (the shared module) | VERIFIED | `src/shared/classifier.ts` is the sole location of SYSTEM_PROMPT (lines 28–100) and the `fetch('https://api.anthropic.com/v1/messages', ...)` build (lines 117–132). `src/background/index.ts` imports both and has no inline copy. |
| 5 | Running `npm run eval <labeled-posts.json>` reads the live Export JSON, walks top-level flaggedPosts[] and unflaggedPosts[] (positives and negatives), and skips+counts unlabeled entries | VERIFIED | `package.json` line 15: `"eval": "tsx scripts/eval.ts"`. `collectLabeled(flaggedPosts, unflaggedPosts)` iterates both arrays, increments `skipped` on missing/invalid labels. `flaggedAccounts` count = 0 in the file. |
| 6 | Each labeled post is scored ONCE through the real LLM via classifyPost; the stored score is ignored and re-derived fresh | VERIFIED | `scripts/eval.ts` L195 calls `classifyPost(post.text, apiKey)` and uses `result.score`. The Export's stored `score` field is read nowhere in the scoring loop. |
| 7 | The script prints precision, recall, F1, accuracy at each threshold 35–90 step 5, highlights best-F1, and prints total LLM cost, avg cost/post, and total posts evaluated | VERIFIED | `THRESHOLDS = Array.from({ length: 12 }, (_, i) => 35 + i * 5)` at L23. `computeMetrics` returns all four metrics per threshold. Best-F1 marker `<- best F1` appended to the row. Compact summary line on L292-296 includes scoredCount, bestF1Threshold, P/R/F1, total cost, avg cost/post. |
| 8 | Results are written to eval/results-YYYY-MM-DD.json (directory auto-created) and a compact one-line summary is printed | VERIFIED | L269: `mkdirSync(EVAL_DIR, { recursive: true })`. L271: `writeFileSync(join(EVAL_DIR, results-${today}.json), ...)`. L293-296: compact summary line with date, post count, best-F1 threshold+metrics, total cost. |
| 9 | No metric ever renders NaN; divide-by-zero cases render 0 or null; the API key never appears in the results file or stdout | VERIFIED | `computeMetrics`: `precision = (tp+fp)>0 ? tp/(tp+fp) : null`; `recall = (tp+fn)>0 ? tp/(tp+fn) : null`; `f1 = null` when either is null. `accuracy = ... : 0`. Results object has no `apiKey` field. `apiKey` variable is only used in `classifyPost(post.text, apiKey)` call — not in any stdout write. 5 NaN-guard tests in eval.test.ts all pass. |
| 10 | The script exits non-zero with a clear stderr message when the input file is missing/unparseable, when no post carries a label, or when ANTHROPIC_API_KEY is unset | PARTIAL — see gap | Missing-file, zero-labels, and missing-API-key guards all verified functional. Null-JSON input (valid JSON that is not an object) crashes with unhandled TypeError instead of clean exit(1). EVAL-05 exit-code tests not delivered despite plan requirement. |

**Score:** 9/10 truths verified (1 partial — two sub-issues identified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/classifier.ts` | SYSTEM_PROMPT, AnthropicUsage, ClassifyResult, classifyPost — single source of truth | VERIFIED | 169 lines (≥80). Exports all 4 declared items. Zero `chrome.*` references. |
| `src/shared/classifier.test.ts` | Unit coverage for classifyPost response parsing, clamping, error propagation, usage passthrough, confidence | VERIFIED | 179 lines (≥40). 12 behavioral tests covering usage passthrough, clamping (150→100, -10→0), fence stripping, all confidence bands, HTTP 401/429 error propagation. |
| `src/background/index.ts` | Service worker scorePost wrapper delegating to classifyPost; no inline SYSTEM_PROMPT or AnthropicUsage | VERIFIED | Imports `SYSTEM_PROMPT, classifyPost, type AnthropicUsage` from `../shared/classifier`. No inline `^const SYSTEM_PROMPT` or `interface AnthropicUsage` remain. `scorePost` calls `classifyPost(postText, apiKey)`. |
| `scripts/eval.ts` | Node CLI eval harness: input walk, sequential LLM scoring, post-hoc threshold sweep, cost from real usage, results persistence, exit codes | PARTIAL | 300 lines (≥120). All functional behaviors present EXCEPT null-JSON input crashes instead of exiting cleanly (CR-01). |
| `scripts/eval.test.ts` | Unit coverage for walker (skip unlabeled), metric divide-by-zero guards, and exit-non-zero cases | PARTIAL | 226 lines (≥50). Walker and metric coverage are substantive. Exit-code coverage is entirely absent despite being an explicit plan acceptance criterion. |
| `package.json` | npm run eval script entry | VERIFIED | Line 15: `"eval": "tsx scripts/eval.ts"` — exactly matches the required pattern. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/background/index.ts` | `src/shared/classifier.ts` | `import { SYSTEM_PROMPT, classifyPost, type AnthropicUsage }` | VERIFIED | L7 of index.ts matches the expected pattern exactly. |
| `src/background/index.ts scorePost` | `recordTrace` | passes usage destructured from classifyPost return | VERIFIED | L91: `const { result: detectionResult, usage } = await classifyPost(...)`. L97: `usage` passed to `recordTrace`. |
| `scripts/eval.ts` | `src/shared/classifier.js` | `import { classifyPost }` (ESM .js extension) | VERIFIED | L12: `import { classifyPost } from '../src/shared/classifier.js'` |
| `scripts/eval.ts` | `src/shared/pricing.js` | `import { computeCostUsd }` (ESM .js extension) | VERIFIED | L11: `import { computeCostUsd } from '../src/shared/pricing.js'` |
| `package.json scripts.eval` | `scripts/eval.ts` | `tsx scripts/eval.ts` | VERIFIED | Exact match in package.json L15. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `scripts/eval.ts` | `scored[]` | `classifyPost(post.text, apiKey)` — real fetch to Anthropic API | Yes (via fetch, mocked in tests) | FLOWING |
| `scripts/eval.ts` | `thresholdRows[]` | `computeMetrics(scored, t)` — pure computation over scored array | Yes — post-hoc, no extra API calls (D-06) | FLOWING |
| `scripts/eval.ts` | `totalCostUsd` | `computeCostUsd(MODEL, usage)` — real usage object from classifyPost | Yes | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run eval` with no arg exits non-zero | Code inspection L142-146: `if (!filePath) { stderr + exit(1) }` | Guard present and unconditional | PASS (code-level) |
| Missing ANTHROPIC_API_KEY exits non-zero | Code inspection L159-163: `if (!apiKey) { stderr + exit(1) }` | Guard present and unconditional | PASS (code-level) |
| Zero labeled posts exits non-zero | Code inspection L175-181: `if (labeledPosts.length === 0) { stderr + exit(1) }` | Guard present and unconditional | PASS (code-level) |
| `null`-JSON input exits non-zero | Code inspection L149-156: try/catch only catches parse errors; `JSON.parse("null")` succeeds and does not trigger catch | TypeError crash at L166 `parsed.flaggedPosts` | FAIL (CR-01) |
| Threshold sweep covers exactly 35–90 step 5 | `THRESHOLDS = Array.from({ length: 12 }, (_, i) => 35 + i * 5)` at L23 | 12 values: 35,40,45,...,90 | PASS |
| API key never in stdout/results | Grep `apiKey` in eval.ts: only at L159 (read), L160 (null check), L195 (parameter) | No stdout/console write of apiKey found | PASS |

Step 7b: Live execution not run (requires real Anthropic API key). Code-level spot checks run instead.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EVAL-01 | 26-02-PLAN.md | Standard post-export JSON is the eval input; users annotate with `label` | SATISFIED | `collectLabeled(flaggedPosts, unflaggedPosts)` reads the exact buildJsonExport shape; label field is optional+additive |
| EVAL-02 | 26-01-PLAN.md | `npm run eval` feeds each post's text through the LLM classifier and records the verdict | SATISFIED | Scoring loop calls `classifyPost(post.text, apiKey)` once per labeled post; `result.score` from fresh call recorded |
| EVAL-03 | 26-02-PLAN.md | Eval runner computes and prints precision, recall, F1, accuracy, total LLM cost, avg cost/post, total posts evaluated | SATISFIED | All six metrics present in table output; `computeMetrics` verified correct; cost from `computeCostUsd(MODEL, usage)` |
| EVAL-04 | 26-02-PLAN.md | Results written to `eval/results-YYYY-MM-DD.json` (dir auto-created) + compact summary line | SATISFIED | `mkdirSync` + `writeFileSync` confirmed; single-line summary on L293-296 with all required fields |
| EVAL-05 (ROADMAP SC#5) | 26-02-PLAN.md | Exit non-zero with clear stderr on missing file, no labels, no API key | PARTIAL | Three of four input-error paths work. Null-JSON input path crashes instead of exiting cleanly. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/eval.ts` | 149-156 | Missing post-parse object shape guard | Blocker (CR-01) | `null`-JSON input causes unhandled TypeError crash; violates EVAL-05 clean-exit contract |
| `scripts/eval.test.ts` | — | No tests for any `process.exit(1)` branch in `main()` | Warning (WR-04) | Plan acceptance criteria not met; exit-code regressions undetectable |
| `src/shared/classifier.ts` | 145 | `JSON.parse(jsonStr)` unguarded — no try/catch | Warning (WR-01) | SyntaxError on malformed LLM response gives no diagnostic context about the raw text; error still propagates to callers correctly so behavior is not broken |
| `scripts/eval.ts` | 109 | Empty string accepted as valid post text | Warning (WR-03) | Empty-text entries pass label checks and are sent to LLM; wastes API tokens and skews metrics; no data corruption |
| `scripts/eval.ts` | 133-134 | `isMain` guard uses `endsWith('eval.ts')` | Warning (WR-02) | Fragile under tsx temp-directory rewrites and false-positive risk with any file named `*eval.ts` |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

---

### Human Verification Required

None. All behaviors are statically verifiable for this phase. Build confirmed clean (`npx tsc --noEmit` exits 0, `npx vitest run` shows 287 passing per provided test status).

---

### Gaps Summary

**Two gaps block the phase:**

**Gap 1 (BLOCKER — CR-01):** `scripts/eval.ts` crashes with an unhandled `TypeError` when the input file contains valid JSON that is not an object (e.g., the literal `null`). `JSON.parse("null")` succeeds and does not trigger the try/catch on lines 150–156. Execution continues to line 166 where `parsed.flaggedPosts` throws on null. EVAL-05 requires a clean `exit(1)` with a clear stderr message for this case. The fix is 4 lines: a shape check between the `JSON.parse` call and the cast.

**Gap 2 (WARNING — WR-04):** Plan 02 Task 3 acceptance criteria explicitly required tests for all five `process.exit(1)` branches in `main()`. The SUMMARY.md incorrectly claims these were delivered. `scripts/eval.test.ts` covers only the three pure exported functions. The missing-argv, unreadable-file, missing-API-key, null-JSON-input, and zero-labels paths have no test coverage. This does not affect the CLI's runtime behavior (the guards themselves exist) but the plan's acceptance criteria were not met and exit-code regressions are undetectable.

The two gaps share a root cause: the `null`-JSON path was never tested, so the crash was never caught. A single additional test for the null-input path would have surfaced CR-01 during Task 3.

The remaining code review findings (WR-01 unguarded JSON.parse in classifier, WR-02 fragile isMain, WR-03 empty text accepted, IN-01 fence-stripping, IN-02 misleading best-F1 on all-errored run) are warnings and info items that do not block goal achievement.

---

_Verified: 2026-06-14T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
