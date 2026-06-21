---
phase: 26-eval-runner
verified: 2026-06-14T23:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "The script exits non-zero with a clear stderr message when the input file is missing/unparseable, when no post carries a label, or when ANTHROPIC_API_KEY is unset (CR-01 null-JSON path now handled in loadExport)"
    - "EVAL-05 exit-code paths have unit test coverage (loadExport + main guard tests added in eval.test.ts)"
  gaps_remaining: []
  regressions: []
---

# Phase 26: Eval Runner Verification Report

**Phase Goal:** Provide a repeatable eval harness — (1) extract the LLM classifier into a transport-agnostic shared module so it can be exercised outside the extension, and (2) an `npm run eval` CLI that re-scores a labeled Export JSON through that shared classifier, sweeps detection thresholds, reports classification metrics and LLM cost, and persists results.
**Verified:** 2026-06-14T23:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commits 8a0cc52, f962be0)

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | A shared classifier module exists that scores post text via the Anthropic API with the API key supplied as a parameter (no chrome.storage dependency) | VERIFIED | `src/shared/classifier.ts` exports `classifyPost(postText, apiKey)`. Zero `chrome.*` references. |
| 2  | The shared module returns both the DetectionResult and the Anthropic usage object so callers can record cost | VERIFIED | `ClassifyResult = { result: DetectionResult; usage?: AnthropicUsage }`. `classifyPost` returns `{ result, usage: data.usage }`. |
| 3  | The service worker still scores posts and records a usage-bearing trace identically to before the refactor (test suite green) | VERIFIED | `src/background/index.ts` imports `SYSTEM_PROMPT, classifyPost, type AnthropicUsage` from `../shared/classifier`. 296 tests pass. |
| 4  | SYSTEM_PROMPT and the Anthropic request build live in exactly one place (the shared module) | VERIFIED | `src/shared/classifier.ts` is the sole location; `src/background/index.ts` imports both and has no inline copy. |
| 5  | Running `npm run eval <labeled-posts.json>` reads the live Export JSON, walks top-level flaggedPosts[] and unflaggedPosts[], and skips+counts unlabeled entries | VERIFIED | `package.json` line 15: `"eval": "tsx scripts/eval.ts"`. `collectLabeled(flaggedPosts, unflaggedPosts)` iterates both arrays, increments `skipped` on missing/invalid labels. |
| 6  | Each labeled post is scored ONCE through the real LLM via classifyPost; the stored score is ignored and re-derived fresh | VERIFIED | `scripts/eval.ts` line 221 calls `classifyPost(post.text, apiKey)` and uses `result.score`. The Export's stored `score` field is read nowhere in the scoring loop. |
| 7  | The script prints precision, recall, F1, accuracy at each threshold 35–90 step 5, highlights best-F1, and prints total LLM cost, avg cost/post, and total posts evaluated | VERIFIED | `THRESHOLDS = Array.from({ length: 12 }, (_, i) => 35 + i * 5)` at line 23. `computeMetrics` returns all four metrics. Best-F1 marker appended. Compact summary line includes all required fields. |
| 8  | Results are written to eval/results-YYYY-MM-DD.json (directory auto-created) and a compact one-line summary is printed | VERIFIED | Line 295: `mkdirSync(EVAL_DIR, { recursive: true })`. Line 296: `writeFileSync(join(EVAL_DIR, results-${today}.json), ...)`. Compact summary at lines 318–323. |
| 9  | No metric ever renders NaN; divide-by-zero cases render 0 or null; the API key never appears in the results file or stdout | VERIFIED | `computeMetrics`: `precision = (tp+fp)>0 ? tp/(tp+fp) : null`; `recall = (tp+fn)>0 ? tp/(tp+fn) : null`; `f1 = null` when either is null. `accuracy = ... : 0`. Results object has no `apiKey` field. 5 NaN-guard tests pass. |
| 10 | The script exits non-zero with a clear stderr message when the input file is missing/unparseable, when no post carries a label, or when ANTHROPIC_API_KEY is unset | VERIFIED | `loadExport()` (lines 144–166) handles: unreadable file (try/catch → exit 1), unparseable JSON (same catch), valid-but-non-object JSON including `null` and arrays (shape check at line 154 → exit 1), missing flaggedPosts/unflaggedPosts arrays (line 160 → exit 1). `main()` guards: missing argv (line 182–185), missing API key (line 192–195), zero labeled posts (line 201–207). All 9 guard paths covered by passing tests. |

**Score:** 10/10 truths verified

---

### Re-verification: Gaps Closed

#### Gap 1 (CR-01 BLOCKER — CLOSED)

**Was:** `scripts/eval.ts` crashed with an unhandled `TypeError` when the input file contained valid JSON that was not an object (e.g. the literal `null`). `JSON.parse("null")` succeeded and did not trigger the try/catch; execution reached `parsed.flaggedPosts` and threw on null.

**Fix (commit 8a0cc52):** Read/parse/shape/array validation extracted into exported `loadExport(filePath)` (lines 144–166). After `JSON.parse`, line 154 has the explicit guard: `if (typeof json !== 'object' || json === null || Array.isArray(json))` — writes the error message to stderr and calls `process.exit(1)`. The null/array/primitive path now exits cleanly with the same `"Error: Could not read or parse file: {path}"` message. `main()` delegates to `loadExport()` at line 188.

**Verified:** Shape check exists at line 154. Test `"exits 1 on valid JSON that is null (CR-01 regression)"` at eval.test.ts line 290 PASSES.

#### Gap 2 (WR-04 WARNING — CLOSED)

**Was:** `scripts/eval.test.ts` covered only the three pure exported functions (`collectLabeled`, `computeMetrics`, `safe`). None of the `process.exit(1)` branches in `main()` had test coverage despite being an explicit plan acceptance criterion.

**Fix (commit f962be0):** `scripts/eval.test.ts` now contains two new `describe` blocks:
- `loadExport (EVAL-05 — file/parse/shape guards)` — 6 tests: unreadable file, unparseable JSON, null-JSON CR-01 regression, array-JSON shape, missing arrays, well-formed export.
- `main (EVAL-05 — argv / api-key / no-label guards)` — 3 tests: missing argv, missing ANTHROPIC_API_KEY, zero labeled posts.

All 9 new tests use real temp files (not fs mocks) and stub `process.exit` to throw a sentinel so execution halts at each guard exactly as in the real CLI. All 9 PASS.

**Verified:** `npx vitest run scripts/eval.test.ts --reporter=verbose` shows all 22 tests passing including all 9 new EVAL-05 guard tests.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/classifier.ts` | SYSTEM_PROMPT, AnthropicUsage, ClassifyResult, classifyPost — single source of truth | VERIFIED | Exports all 4 declared items. Zero `chrome.*` references. |
| `src/shared/classifier.test.ts` | Unit coverage for classifyPost response parsing, clamping, error propagation, usage passthrough, confidence | VERIFIED | 12 behavioral tests covering all declared behaviors. |
| `src/background/index.ts` | Service worker scorePost wrapper delegating to classifyPost; no inline SYSTEM_PROMPT or AnthropicUsage | VERIFIED | Imports from `../shared/classifier`. No inline copies. |
| `scripts/eval.ts` | Node CLI eval harness: input walk, sequential LLM scoring, post-hoc threshold sweep, cost from real usage, results persistence, exit codes | VERIFIED | 327 lines. All functional behaviors present including clean null-JSON exit (CR-01 fixed). `loadExport()` exported. |
| `scripts/eval.test.ts` | Unit coverage for walker (skip unlabeled), metric divide-by-zero guards, and exit-non-zero cases | VERIFIED | 357 lines. Walker, metric, and all exit-code guard paths covered. 22 tests, all passing. |
| `package.json` | npm run eval script entry | VERIFIED | Line 15: `"eval": "tsx scripts/eval.ts"` — exact match. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/background/index.ts` | `src/shared/classifier.ts` | `import { SYSTEM_PROMPT, classifyPost, type AnthropicUsage }` | VERIFIED | Line 7 of index.ts matches exactly. |
| `src/background/index.ts scorePost` | `recordTrace` | passes usage destructured from classifyPost return | VERIFIED | Line 91: `const { result: detectionResult, usage } = await classifyPost(...)`. Line 97: `usage` passed to `recordTrace`. |
| `scripts/eval.ts` | `src/shared/classifier.js` | `import { classifyPost }` (ESM .js extension) | VERIFIED | Line 12: `import { classifyPost } from '../src/shared/classifier.js'` |
| `scripts/eval.ts` | `src/shared/pricing.js` | `import { computeCostUsd }` (ESM .js extension) | VERIFIED | Line 11: `import { computeCostUsd } from '../src/shared/pricing.js'` |
| `package.json scripts.eval` | `scripts/eval.ts` | `tsx scripts/eval.ts` | VERIFIED | Exact match in package.json line 15. |
| `scripts/eval.test.ts` | `scripts/eval.ts` | `import { collectLabeled, computeMetrics, safe, loadExport, main }` | VERIFIED | Line 38: all five exports imported and exercised by tests. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `scripts/eval.ts` | `scored[]` | `classifyPost(post.text, apiKey)` — real fetch to Anthropic API | Yes (via fetch, mocked in tests) | FLOWING |
| `scripts/eval.ts` | `thresholdRows[]` | `computeMetrics(scored, t)` — pure computation over scored array | Yes — post-hoc, no extra API calls | FLOWING |
| `scripts/eval.ts` | `totalCostUsd` | `computeCostUsd(MODEL, usage)` — real usage object from classifyPost | Yes | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run eval` with no arg exits non-zero | Code inspection lines 181–185: `if (!filePath) { stderr + exit(1) }` | Guard present and unconditional; test "exits 1 when no input file argument is supplied" PASSES | PASS |
| Missing ANTHROPIC_API_KEY exits non-zero | Code inspection lines 191–195: `if (!apiKey) { stderr + exit(1) }` | Guard present; test "exits 1 when ANTHROPIC_API_KEY is not set" PASSES | PASS |
| Zero labeled posts exits non-zero | Code inspection lines 201–207: `if (labeledPosts.length === 0) { stderr + exit(1) }` | Guard present; test "exits 1 when the export contains no labeled posts" PASSES | PASS |
| `null`-JSON input exits non-zero | `loadExport()` line 154: shape check on parsed value | `loadExport` exits 1 with "Could not read or parse file"; test "exits 1 on valid JSON that is null (CR-01 regression)" PASSES | PASS |
| Threshold sweep covers exactly 35–90 step 5 | `THRESHOLDS = Array.from({ length: 12 }, (_, i) => 35 + i * 5)` at line 23 | 12 values: 35,40,45,...,90 | PASS |
| API key never in stdout/results | `apiKey` variable used only at lines 191, 193, 221 (parameter) | No stdout/console write of apiKey found; results object has no `apiKey` field | PASS |

Step 7b: Live execution not run (requires real Anthropic API key). Code-level and test-level spot checks confirm all guard behaviors.

---

### Probe Execution

No probe scripts declared for this phase. Step 7c: SKIPPED (no probe-*.sh files for phase 26).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EVAL-01 | 26-02-PLAN.md | Standard post-export JSON is the eval input; users annotate with `label` | SATISFIED | `collectLabeled(flaggedPosts, unflaggedPosts)` reads the exact buildJsonExport shape; label field is optional+additive |
| EVAL-02 | 26-01-PLAN.md | `npm run eval` feeds each post's text through the LLM classifier and records the verdict | SATISFIED | Scoring loop calls `classifyPost(post.text, apiKey)` once per labeled post; `result.score` from fresh call recorded |
| EVAL-03 | 26-02-PLAN.md | Eval runner computes and prints precision, recall, F1, accuracy, total LLM cost, avg cost/post, total posts evaluated | SATISFIED | All six metrics present in table output; `computeMetrics` verified correct; cost from `computeCostUsd(MODEL, usage)` |
| EVAL-04 | 26-02-PLAN.md | Results written to `eval/results-YYYY-MM-DD.json` (dir auto-created) + compact summary line | SATISFIED | `mkdirSync` + `writeFileSync` confirmed; single-line summary on lines 318–323 with all required fields |
| EVAL-05 (ROADMAP SC#5) | 26-02-PLAN.md | Exit non-zero with clear stderr on missing file, no labels, no API key | SATISFIED | All input-error paths now handled cleanly: unreadable file, unparseable JSON, null-JSON (CR-01), array-JSON, missing arrays, missing argv, missing API key, zero labels. All 9 guard tests pass. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/shared/classifier.ts` | 145 | `JSON.parse(jsonStr)` unguarded — no try/catch | Warning (WR-01) | SyntaxError on malformed LLM response gives no diagnostic context; error still propagates to callers correctly so behavior is not broken |
| `scripts/eval.ts` | 109 | Empty string accepted as valid post text | Warning (WR-03) | Empty-text entries pass label checks and are sent to LLM; wastes API tokens; no data corruption |
| `scripts/eval.ts` | 172–173 | `isMain` guard uses `endsWith('eval.ts')` / `endsWith('eval.js')` | Warning (WR-02) | Fragile under tsx temp-directory rewrites (mitigated by OR of both extensions); warning only |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

All previous BLOCKERs from initial verification are resolved. Remaining items are warnings that do not block goal achievement and were present at initial verification.

---

### Human Verification Required

None. All behaviors are statically and test-verified for this phase. Build confirmed clean (`npx tsc --noEmit` exits 0, `npx vitest run` shows 296 passing — 287 prior + 9 new EVAL-05 guard tests).

---

### Gaps Summary

No gaps remain. Both blockers from the initial verification are closed:

- **CR-01 (BLOCKER — CLOSED):** `loadExport()` now applies a post-parse shape check (`typeof json !== 'object' || json === null || Array.isArray(json)`) that exits 1 cleanly with the expected stderr message. The null-JSON crash is gone. Verified by dedicated regression test.

- **WR-04 (WARNING — CLOSED):** All five categories of CLI guard paths now have unit tests: unreadable file, unparseable JSON, null-JSON (CR-01 regression), array-JSON shape, missing arrays, missing argv, missing ANTHROPIC_API_KEY, and zero labeled posts. 9 new tests, all passing. Total suite: 296 tests across 21 files.

EVAL-01 through EVAL-05 are all satisfied. Phase goal achieved.

---

_Verified: 2026-06-14T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
