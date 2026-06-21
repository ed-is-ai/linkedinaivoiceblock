---
phase: 27-eval-improvements
verified: 2026-06-15T09:07:00Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 27: Eval Improvements Verification Report

**Phase Goal:** Make the eval harness measure *shipped* detection and turn results into actionable insight. Four deliverables: (1) Engine alignment — score posts through HeuristicDetector (heuristic vs LLM selectable) instead of raw classifyPost; (2) Error analysis — at best-F1 threshold surface FP/FN with score + signals + reasoning; (3) Labeling workflow — reduce manual JSON-editing burden of labeling posts ai/human; (4) Results viewer / run comparison — read results beyond raw JSON and diff runs over time. The pure eval core must live in src/shared/eval/ (no fs/process/chrome/DOM) so the deferred Phase 28 dashboard reuses one implementation, and eval/results-*.json must conform to the EvalRun record (DATA-MODEL.md forward-compat).
**Verified:** 2026-06-15T09:07:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `--engine heuristic` scores through HeuristicDetector (no API key required), exits 0 | ✓ VERIFIED | `scripts/eval.ts:29` imports `HeuristicDetector`; API-key guard conditioned on `engine === 'llm'` at line 170; 89/89 tests pass |
| 2 | Default (no `--engine` flag) preserves LLM path via classifyPost — Phase 26 behavior | ✓ VERIFIED | `engine` defaults to `'llm'` (line 156); `classifyPost` used in else-branch (line 214); test coverage in eval.test.ts |
| 3 | Heuristic signalBreakdown uses heuristic vocabulary (`listicle-cta`, `buzzword`, `em-dash`, `ai-vocab`, `hook-story`, `motivational`, `impersonal`) matching flaggedAccounts.signals shape | ✓ VERIFIED | Heuristic path calls `heuristicDetector.detect(buildPostData(...))` which returns `DetectionResult.signalBreakdown` from HeuristicDetector — same object stored to flaggedAccounts; documented in eval-instructions.md lines 165-168 |
| 4 | At best-F1 threshold, terminal prints False Positives (true human, predicted AI) and False Negatives (true AI, predicted human) with score + signalBreakdown + textPreview | ✓ VERIFIED | `scripts/eval.ts` lines 353-372: FP/FN sections printed with `d.score`, `d.textPreview`, `formatSignalBreakdown(d.signalBreakdown, ...)`, capped at top-5, full counts shown |
| 5 | Results JSON carries `engine`, `model` (='heuristic' for heuristic runs), `cost` (=null for heuristic), and `errorAnalysis` object with `threshold + falsePositives + falseNegatives` | ✓ VERIFIED | `const results: EvalRun` at line 289: `model: engine === 'heuristic' ? 'heuristic' : MODEL`, `cost: engine === 'heuristic' ? null : {...}`, `errorAnalysis: { threshold: bestF1Threshold, falsePositives, falseNegatives }` |
| 6 | Pure eval core (buildPostData, filterErrors, computeMetrics, formatSignalBreakdown, PostDetail) lives in src/shared/eval/ — consumable without Node fs/process/chrome/DOM | ✓ VERIFIED | `src/shared/eval/metrics.ts` only has `import type { PostData } from '../types.js'`; `runs.ts` only has `import type { ThresholdRow, PostDetail } from './metrics.js'` — zero runtime I/O imports |
| 7 | eval/results-*.json conforms to the EvalRun record shape (id, source, dataset, engine, errorAnalysis) — dashboard ingests without transformation | ✓ VERIFIED | `const results: EvalRun = { ... }` TypeScript annotation at line 289 enforces compile-time conformance; all required fields populated |
| 8 | `npm run eval-label -- <export.json> --auto` bulk-labels flaggedPosts as 'ai' and unflaggedPosts as 'human', writes back, exits 0; already-labeled entries untouched | ✓ VERIFIED | `scripts/eval-label.ts` lines 88-107: `--auto` mode checks `!('label' in entry)` for idempotency; `writeFileSync` after labeling; 12/12 tests pass |
| 9 | Interactive `eval-label` prompts per unlabeled post and writes back after each decision | ✓ VERIFIED | `scripts/eval-label.ts` lines 118-195: TTY guard, `setRawMode`, per-entry `readKey()`, `applyLabel` + `writeFileSync` after each `a`/`h` keypress |
| 10 | Labels written into existing export shape (flaggedPosts[i].label / unflaggedPosts[i].label) — all other fields preserved | ✓ VERIFIED | `applyLabel` only mutates `(entry as Record<string,unknown>)['label'] = label` — never reconstructs the entry object (line 38); test coverage for field preservation |
| 11 | `npm run eval-compare -- <A.json> <B.json>` prints side-by-side comparison of engine, posts scored, best-F1 threshold, precision/recall/F1/accuracy, cost | ✓ VERIFIED | `scripts/eval-compare.ts` lines 49-72: `buildRows` produces all required rows; `renderTerminal` and `renderMarkdown` exported and tested; null-cost renders as 'free' (fmtCost, line 32) |
| 12 | `--format markdown` emits GFM table | ✓ VERIFIED | `renderMarkdown` at line 96-102 produces `| Metric | Current | Baseline |` header with `|` separators; test coverage in eval-compare.test.ts |
| 13 | Diff computed by shared pure `compareRuns()` — terminal diff and future dashboard diff call ONE implementation | ✓ VERIFIED | `eval-compare.ts` line 158: `const comparison = compareRuns(runA, runB)` — no local diff arithmetic; `compareRuns` lives in `src/shared/eval/runs.ts` (pure, no I/O) |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/eval/metrics.ts` | Pure host-agnostic eval core: buildPostData, filterErrors, computeMetrics, formatSignalBreakdown, safe | ✓ VERIFIED | File exists, 158 lines, exports all functions, zero fs/process/chrome/DOM imports |
| `src/shared/eval/runs.ts` | Canonical EvalRun record types + summarize + compareRuns; no EvalRunStore/EVAL_RUNS_KEY/MAX_EVAL_RUNS | ✓ VERIFIED | File exists, 201 lines; all required types + functions present; forbidden storage symbols absent |
| `src/shared/eval/index.ts` | Barrel re-exporting pure core AND EvalRun record types | ✓ VERIFIED | File exports: safe, computeMetrics, formatSignalBreakdown, buildPostData, filterErrors, summarize, compareRuns, and all type exports |
| `src/shared/eval/metrics.test.ts` | Unit tests for buildPostData, filterErrors, computeMetrics | ✓ VERIFIED | Contains `describe('buildPostData'`, `describe('computeMetrics'`, `describe('filterErrors'`; all pass |
| `src/shared/eval/runs.test.ts` | Unit tests for summarize() and compareRuns() | ✓ VERIFIED | Contains `describe('summarize'` and `describe('compareRuns'`; 15 tests including null-cost cases; all pass |
| `scripts/eval.ts` | CLI-only shell with engine flag, HeuristicDetector import, EvalRun-conformant results | ✓ VERIFIED | Imports from `../src/shared/eval/index.js` and `../src/content/detector/heuristic.js`; `const results: EvalRun`; no llm.ts or content/index.ts imports |
| `scripts/eval-label.ts` | Interactive + --auto labeling CLI with exported applyLabel | ✓ VERIFIED | Exports `applyLabel` (line 29) and `async function main` (line 57); no imports from content |
| `scripts/eval-label.test.ts` | Unit tests for applyLabel + main() guard exit codes | ✓ VERIFIED | Contains `describe('applyLabel'`; 12 tests pass |
| `scripts/eval-compare.ts` | Thin comparison CLI calling shared compareRuns | ✓ VERIFIED | Imports `compareRuns` from `../src/shared/eval/index.js`; no local ResultsFile or compareResults; exports main |
| `scripts/eval-compare.test.ts` | CLI tests: render output, null-cost 'free', main() guards | ✓ VERIFIED | Contains `describe('main'` blocks; 14 tests pass; 'free' null-cost case covered |
| `package.json` | eval-label + eval-compare npm script entries | ✓ VERIFIED | `eval-label: "tsx scripts/eval-label.ts"` and `eval-compare: "tsx scripts/eval-compare.ts"` present |
| `eval-instructions.md` | Updated docs covering --engine, error analysis, heuristic signal names | ✓ VERIFIED | Contains '--engine', 'Error analysis', 'generic-comments never fires', API-key conditional note |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/eval.ts` | `src/shared/eval/index.ts` | `from '../src/shared/eval/index.js'` | ✓ WIRED | Line 15-25: imports safe, computeMetrics, formatSignalBreakdown, buildPostData, filterErrors, PostDetail, ScoredEntry, ThresholdRow, EvalRun |
| `scripts/eval.ts` | `src/content/detector/heuristic.ts` | `from '../src/content/detector/heuristic.js'` | ✓ WIRED | Line 29; used in scoring loop at line 207 |
| `src/shared/eval/runs.ts` | `src/shared/eval/metrics.ts` | `import type { ThresholdRow, PostDetail } from './metrics.js'` | ✓ WIRED | Line 20; types used throughout EvalRun/ErrorAnalysis/compareRuns |
| `scripts/eval-compare.ts` | `src/shared/eval/index.ts` | `from '../src/shared/eval/index.js'` | ✓ WIRED | Lines 13-19; compareRuns called at line 158 |
| `filterErrors` | `bestF1Threshold` | called with `bestF1Threshold` (post-sweep, never hardcoded) | ✓ WIRED | Lines 279-280: `filterErrors(details, bestF1Threshold, 'human')` and `'ai'` |
| `scripts/eval-label.ts` | export JSON file | `writeFileSync(resolve(filePath), ...)` | ✓ WIRED | Lines 104 (--auto mode) and 183/190 (interactive mode after each label) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `scripts/eval.ts` | `results` (EvalRun) | `filterErrors`, `computeMetrics`, `heuristicDetector.detect` / `classifyPost` | Yes — computed from real per-post scoring | ✓ FLOWING |
| `scripts/eval-compare.ts` | `comparison` (EvalRunComparison) | `compareRuns(runA, runB)` from shared pure function | Yes — derived from parsed EvalRun JSON files | ✓ FLOWING |
| `scripts/eval-label.ts` | `data` (ExportData) | `readFileSync` + `JSON.parse` | Yes — reads real export file, mutates, writes back | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 5 test files pass | `npx vitest run src/shared/eval/metrics.test.ts src/shared/eval/runs.test.ts scripts/eval.test.ts scripts/eval-label.test.ts scripts/eval-compare.test.ts` | 89/89 tests pass in 2.88s | ✓ PASS |
| eval-compare imports compareRuns from shared, not locally defined | grep for 'compareRuns' in scripts/eval-compare.ts | imported from index.js, called once at line 158 — no local definition | ✓ PASS |
| src/shared/eval has no fs/process/chrome/DOM imports | grep for runtime imports in eval/ | Only `import type { PostData }` in metrics.ts and `import type { ThresholdRow, PostDetail }` in runs.ts | ✓ PASS |
| package.json eval-label + eval-compare scripts registered | node -e check | both keys present with correct tsx invocation | ✓ PASS |
| EvalRun type annotation enforces conformance at compile time | grep in eval.ts | `const results: EvalRun = {` at line 289 | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EVAL-06 | 27-01 | Score through HeuristicDetector or classifyPost selectable by --engine flag; heuristic signalBreakdown matches deployed vocabulary | ✓ SATISFIED | HeuristicDetector imported and used in scoring loop; engine flag parsed; API-key guard conditioned on engine |
| EVAL-07 | 27-01 | At best-F1 threshold surface FP/FN with score + signalBreakdown + textPreview in terminal and results.errorAnalysis | ✓ SATISFIED | filterErrors called with bestF1Threshold post-sweep; FP/FN sections printed; errorAnalysis in EvalRun |
| EVAL-08 | 27-02 | eval-label CLI with --auto bulk mode and interactive per-post mode; idempotent; exits non-zero on bad input | ✓ SATISFIED | scripts/eval-label.ts fully implements both modes; applyLabel exported; 12 tests pass |
| EVAL-09 | 27-03 | eval-compare CLI reads two results files, prints side-by-side comparison; --format markdown; handles cost:null as 'free' | ✓ SATISFIED | scripts/eval-compare.ts thin wrapper over shared compareRuns; markdown mode; 'free' null-cost rendering; 14 tests pass |

**Note on REQUIREMENTS.md traceability:** EVAL-06 through EVAL-09 appear in the v9.0 section with status "Planned" (not yet marked complete with [x]). This is a documentation-only lag — the code unambiguously delivers all four requirements. The traceability table update is an editorial task, not a gap in implementation.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No `TBD`, `FIXME`, `XXX`, `PLACEHOLDER`, or empty-implementation patterns found in any Phase 27 modified files. The `void readline;` in eval-label.ts (line 202) is an intentional unused-import suppression, not a stub.

---

### Human Verification Required

None. All observable behaviors of this phase are verifiable through source inspection and passing tests:
- Engine selection is pure control-flow (no runtime LinkedIn DOM needed)
- Error analysis is pure post-processing (filterErrors is tested directly)
- Labeling helper file I/O is covered by integration tests using temp dirs
- Comparison rendering is covered by unit tests asserting output strings
- The Phase 28 dashboard reuse seam (host-agnostic shared eval core) is structurally guaranteed by the absence of fs/process/chrome/DOM imports in src/shared/eval/

---

### Gaps Summary

No gaps. All four phase deliverables are implemented, substantive, wired, and tested:

1. **Engine alignment (EVAL-06):** HeuristicDetector imported directly in scripts/eval.ts; engine flag selects between heuristic and LLM paths; API-key guard conditioned on engine; heuristic signalBreakdown flows from the deployed detector.

2. **Error analysis (EVAL-07):** filterErrors in the shared pure core; called post-sweep with bestF1Threshold; FP/FN listed in terminal (capped at 5) and persisted in EvalRun.errorAnalysis.

3. **Labeling workflow (EVAL-08):** scripts/eval-label.ts implements --auto bulk mode (idempotent) and interactive per-post TTY mode; applyLabel only mutates the label key; shape guard before any write; npm run eval-label registered.

4. **Results viewer / run comparison (EVAL-09):** scripts/eval-compare.ts is a thin wrapper over shared compareRuns(); supports --format markdown; null-cost renders as 'free'; npm run eval-compare registered.

**Host-agnostic seam:** src/shared/eval/ (metrics.ts, runs.ts, index.ts) contains zero runtime I/O imports. The Phase 28 dashboard can import the barrel unchanged.

**Forward-compatibility:** eval/results-*.json is typed `const results: EvalRun` — TypeScript enforces schema conformance at compile time. The EvalRun record shape matches DATA-MODEL.md.

---

_Verified: 2026-06-15T09:07:00Z_
_Verifier: Claude (gsd-verifier)_
