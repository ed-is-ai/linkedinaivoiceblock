# Phase 28: Evals Dashboard (future) - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring the eval workflow into the extension as a dedicated **"Evals"** surface that
consumes the pure eval core extracted to `src/shared/eval/` in Phase 27. From the UI the
user can:

1. **Run** a heuristic or LLM eval against the labeled dataset already in `chrome.storage.local`.
2. **Label** posts with clicks (AI/Human) instead of hand-editing exported JSON.
3. **Read** metrics, the threshold sweep, and FP/FN error analysis in the page.
4. **Compare** the current run to a previous one (Δ column).

**Locked upstream (do NOT re-decide):**
- **Layout: Option A — single-page console.** Mockup: `.planning/phases/27-eval-improvements/mockups/evals-option-a-console.html`.
- **Data model is fixed and already shipped** in `src/shared/eval/runs.ts` (Phase 27): `EvalRun`,
  `EvalRunSummary`, `summarize`, `EvalRunComparison`, `compareRuns`, `MetricDelta`, plus the
  storage envelope `EvalRunStore` / `EVAL_RUNS_KEY = 'evalRuns'` / `MAX_EVAL_RUNS = 50`.
- **Engines:** heuristic path runs `HeuristicDetector` in-page; LLM path routes each post through
  the existing service-worker `SCORE_POST` relay.

**Phase 28 net-new work (from ROADMAP):** `EvalRunStore` persistence to `chrome.storage.local`
(capped FIFO, mirrors the `llbTraces`/`traceStore` pattern) + the Option A page UI + click-to-label
write-back. **Option C** (run-history sidebar + master/detail) stays a pure UI addition for a later
phase — its types already exist, so no data migration.

**Out of scope:** Option C history sidebar UI; importing CLI `results-*.json` files into the store
(deferred — see Deferred Ideas); changing detector scoring logic or thresholds; charting/graphical
rendering of the sweep.
</domain>

<decisions>
## Implementation Decisions

### Page placement & access
- **D-01:** The Evals console ships as a **standalone `evals.html` page** — its own Vite HTML
  entry + Preact root, NOT a tab or section bolted onto the existing `dashboard.html`. (`dashboard.html`
  today is a single scrolling `App()` with Feed Health + Selector sections; the eval console is large
  enough to warrant its own page.)
- **D-02:** `evals.html` is reachable via **entry links from BOTH the popup and the dashboard**
  (open in a new tab via `chrome.runtime.getURL('evals/index.html')` or equivalent). `options_ui`
  already holds `dashboard/index.html`, so the new page is a build entry surfaced through in-UI links,
  not a second `options_ui` slot.

### Run persistence
- **D-03:** Completed runs persist **to `chrome.storage.local` only** via `EvalRunStore`
  (FIFO cap `MAX_EVAL_RUNS = 50`, newest-first — mirror `traceStore.appendTrace`). **No per-run
  "Download JSON"** in this phase. Stored history powers the in-page "compare to previous" view.
- **D-04:** **CLI `results-*.json` import is deferred.** Phase 28 stores only runs produced in the
  dashboard. The data model already makes CLI files drop-in `EvalRun` records, so a file-picker import
  stays cheap to add later (no migration). See Deferred Ideas.

### LLM run cost guardrail & execution UX
- **D-05:** Before an LLM run, show an **estimated-cost confirm modal** (e.g. "~142 posts · est.
  $0.07 · Run?") computed from post count × avg $/post (use `src/shared/pricing.ts`). User explicitly
  approves. **No artificial post cap, no forced sampling.**
- **D-06:** While running, show **live progress + a Cancel button** (e.g. "47/142 · $0.02 so far").
  A **cancelled or interrupted run still persists what scored so far as a partial `EvalRun`, flagged
  incomplete.** (The current `EvalRun` type has no incomplete marker — planning must add a small
  additive field, e.g. `incomplete?: boolean`, or derive incompleteness from
  `counts.scored < counts.labeled`. Metrics on a partial must be visibly marked partial so they don't
  mislead.)
- **D-07 (relay note for planning):** The service-worker `SCORE_POST` handler
  (`src/background/index.ts:343`) is **NOT rate-limited** — only the `REDERIVE_SELECTOR` path is. So an
  LLM run fires N sequential `SCORE_POST` calls with no daily cap; the estimate+confirm (D-05) and
  cancel (D-06) are the only spend guards. Each call already records a trace via `recordTrace`.

### Labeling write-back
- **D-08:** The Evals page is the **sanctioned writer of post `label` fields** — a deliberate shift
  from today's design (the content script NEVER writes `label`; labels were previously hand-added to
  exported JSON only, per Phase 25.1 D-06). Single click-to-label (AI/Human) writes through to storage.
- **D-09:** The bulk button seeds labels `flagged→AI`, `unflagged→Human` and **only fills posts that
  have no label yet** — it **never overwrites a manually-set label** (idempotent; protects
  hand-corrections).
- **D-10 (data-model wrinkle for research/planning):** `unflaggedPosts` (`UnflaggedPost`) already has
  `label?: string` in storage. **The flagged side does NOT:** flagged posts live in `storedPosts`
  (`StoredPost`, `src/shared/types.ts:178`), which has **no `label` field** — `FlaggedPost` (the type
  that carries `label?`) is an export-only projection, never persisted. So persisting flagged-post
  labels needs a small additive change: either add `label?: string` to `StoredPost` (cleanest, mirrors
  `UnflaggedPost`) or keep a separate URN→label map. **Recommendation: add `label?` to `StoredPost`.**
  The eval dataset = labeled posts only; unlabeled posts are skipped (existing eval semantics).

### Claude's Discretion
- Exact `evals.html` build wiring (Vite entry naming, how vite-plugin-web-extension discovers it).
- Confirm-modal copy and progress-indicator presentation.
- Whether `incomplete` is a stored field or a derived flag (within D-06's constraint).
- The precise storage mechanism for flagged-post labels (within D-10's recommendation).
- Heuristic-run UX (it's free + fast — likely no confirm modal needed; planner's call).
- Empty/error/first-run states for the page.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked design contract (read FIRST)
- `.planning/phases/27-eval-improvements/mockups/DATA-MODEL.md` — the canonical type contract;
  `EvalRun`/`EvalRunSummary`/`EvalRunStore`/`compareRuns` and the "who fills what" table.
- `.planning/phases/27-eval-improvements/mockups/evals-option-a-console.html` — the SELECTED layout
  (Option A single-page console) this page renders.
- `src/shared/eval/runs.ts` — the **shipped** implementation of the data model (Phase 27). Phase 28
  imports these types; it does NOT redefine them.

### The eval core to consume (Phase 27 output)
- `src/shared/eval/metrics.ts` — `ThresholdRow`, `PostDetail`, threshold sweep, metric computation.
- `src/shared/eval/index.ts` — the shared eval barrel/seam both CLI and dashboard consume.
- `scripts/eval.ts` — the CLI that emits a conformant `EvalRun` to `eval/results-YYYY-MM-DD.json`
  (reference for run shape; deferred import target).

### Engines & relay
- `src/content/detector/heuristic.ts` — `HeuristicDetector` (DOM-free; callable in-page with a
  `fetchComments` stub returning `[]`).
- `src/background/index.ts` §337-360 — the `SCORE_POST` message handler (LLM path; NOT rate-limited).
- `src/shared/classifier.ts` — `classifyPost` / `SYSTEM_PROMPT` behind `SCORE_POST`.
- `src/shared/pricing.ts` — cost math for the pre-run estimate (D-05).

### Storage patterns & shapes
- `src/shared/traceStore.ts` — the FIFO-cap, newest-first, serialized-write pattern `EvalRunStore`
  must mirror.
- `src/shared/postStore.ts` — `storedPosts` / `unflaggedPosts` read/write (the labeling targets).
- `src/shared/types.ts` §178-251 — `StoredPost` (no `label`), `UnflaggedPost`/`FlaggedPost` (`label?`).

### Existing UI to mirror & wire into
- `src/dashboard/index.tsx` — the existing Preact dashboard `App()`; style conventions and the place
  to add the dashboard→evals link.
- `src/dashboard/index.html`, `src/popup/index.html`, `src/manifest.json` — HTML entry + manifest
  precedent for adding `evals.html` and the popup→evals link.

### Prior context & constraints
- `.planning/phases/27-eval-improvements/27-CONTEXT.md` — engine alignment, signal vocabulary,
  labeling constraint (D-06: labels write back into the export shape).
- `.planning/phases/26-eval-runner/26-CONTEXT.md` — API-key-as-param (not stored), fresh-rescore.
- `CLAUDE.md` — project guardrails (stateless service worker, no CSS-class selectors, local-only
  storage).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/shared/eval/runs.ts`** — all run/summary/comparison types + `summarize`/`compareRuns` already
  ship. Phase 28 adds only the `EvalRunStore` persistence layer over them.
- **`traceStore.appendTrace` pattern** — serialized, non-rejecting, newest-first, `pop()`-on-overflow
  FIFO. Copy this idiom for an `appendEvalRun` (cap 50).
- **`HeuristicDetector`** — DOM-free; the in-page heuristic eval calls `detector.detect(postData)` with
  `fetchComments → []`, identical to how Phase 27's CLI uses it.
- **`SCORE_POST` relay** — the LLM scoring path already exists end-to-end (request → `classifyPost` →
  trace → response). The page loops it per post; no new background code needed for scoring.
- **`src/shared/pricing.ts`** — cost estimation for D-05's confirm modal.
- **`postStore.ts`** (`storedPosts`, `unflaggedPosts`) — the read source for the dataset and the
  write target for labels.

### Established Patterns
- **Extract-to-shared (Phase 26/27):** one implementation consumed by both CLI and extension. The data
  model already follows this; Phase 28 just adds the storage envelope.
- **Capped FIFO storage stores** (`traceStore` cap 500, `postStore` cap 200) — `EvalRunStore` cap 50
  is the same pattern.
- **Preact + direct `chrome.storage.local` reads, stateless pages** — `evals.html` follows the popup/
  dashboard convention (no backend, read storage directly, write via `storageSet`).

### Integration Points
- New `evals.html` Vite entry + Preact root; links added to `src/popup/` and `src/dashboard/index.tsx`.
- New `EvalRunStore` accessor module under `src/shared/eval/` (or `src/shared/`) writing key `evalRuns`.
- Labeling writes `label` onto `unflaggedPosts[]` (field exists) and `storedPosts[]` (field must be
  added per D-10).
- Run loop: heuristic → in-page `HeuristicDetector`; LLM → `chrome.runtime.sendMessage({type:'SCORE_POST'})`
  per post, accumulating progress/cost (D-06).
</code_context>

<specifics>
## Specific Ideas

- Mockup is the visual target: run controls (dataset + engine toggle), 4-metric grid, threshold-sweep
  table with best row highlighted, FP/FN error cards with signal pills, click-to-label rows + bulk
  button, and a "compare to previous run" Δ table. See `evals-option-a-console.html`.
- LLM run cost hint in the engine toggle ("LLM (Claude · ~$0.07)") aligns with D-05's estimate modal.
- Compare view uses `compareRuns` from `runs.ts` — the same function the Phase 27 `eval-compare` CLI
  uses, so terminal and UI diffs can never drift.
</specifics>

<deferred>
## Deferred Ideas

- **CLI `results-*.json` import** (D-04) — file-picker to load historical terminal runs into
  `EvalRunStore` so dashboard + CLI runs share one compare history. Cheap to add later (drop-in
  `EvalRun`, no migration). Promote when cross-surface history is wanted.
- **Option C — run-history sidebar + master/detail view** — all types already exist in `runs.ts`;
  becomes a pure UI addition (history list + Δ column) over the same store. Its own future phase.
- **Per-run "Download JSON"** (rejected in D-03) — portable `EvalRun` export from the page. Revisit if
  sharing runs outside the browser becomes a need.
- **Results charting UI** — graphical sweep/comparison rendering. Carried over from Phase 27's
  deferred list; Phase 28 stays table-based.
- **Aggregate signal report** — which signals discriminate true-AI vs true-human across the dataset.
  Carried from Phase 27 deferred list.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: 28-evals-dashboard-future*
*Context gathered: 2026-06-15*
