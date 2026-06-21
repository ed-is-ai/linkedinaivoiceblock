# Phase 27: Eval Improvements - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve the Phase 26 eval harness (`npm run eval` / `scripts/eval.ts`) so it measures
**shipped** detection behavior and produces **actionable** output. Four deliverables, all in
this phase, with engine alignment as the foundation the others build on:

1. **Engine alignment (foundational, sequence first)** — score posts through the same detector
   engine the extension actually runs, not the raw LLM `classifyPost`.
2. **Error analysis (FP/FN)** — surface misclassified posts at the best-F1 threshold.
3. **Labeling workflow** — reduce the manual JSON-editing burden of labeling posts `ai`/`human`.
4. **Results viewer / run comparison** — read results beyond raw JSON and diff runs over time.

**In scope:** changes to the eval CLI and any shared scoring/detector code it needs to consume.
**Out of scope:** changing the detector's scoring *logic* or thresholds (the eval measures the
existing detector, it does not retune it); building new extension UI surfaces beyond what a
labeling/results workflow strictly needs.
</domain>

<decisions>
## Implementation Decisions

### Engine alignment (the core change)
- **D-01:** The eval currently calls the raw `classifyPost` (LLM prompt) directly, which
  **bypasses** the detector pipeline the extension ships. The extension selects its engine at
  `src/content/index.ts:239-243`: with an API key it runs `LLMDetector(heuristic)`; without one it
  runs `HeuristicDetector`. Phase 27 re-points the eval at the real detector(s) so metrics reflect
  deployed behavior.
- **D-02:** Engine must be **selectable** in the eval (heuristic vs LLM) so the two can be compared
  on the same labeled dataset. The exact mechanism (e.g. a `--engine heuristic|llm` CLI flag) and
  the default are a planning decision.
- **D-03:** This directly resolves the signal-name mismatch the user observed: the LLM path emits
  its own signal vocabulary, while the stored `flaggedAccounts.signals` (and the heuristic engine)
  use names like `listicle`, `buzzwords`, `em-dash`, `cta`, `hook-story`, `motivational`,
  `impersonal`, `ai-vocab`, `comments`. Running the eval through `HeuristicDetector` makes the
  per-post `signalBreakdown` match the stored shape.
- **D-04:** `HeuristicDetector` is **already DOM-free by design** (its header forbids `document.`/
  `chrome.`/selector literals; comment-fetching is an injectable optional). It takes plain
  `PostData` (strings only). So the Node eval can build `PostData` from each export entry and call
  `detector.detect(postData)` with a `fetchComments` stub returning `[]`. Whether to import it
  directly from `src/content/detector/` or re-home it to `src/shared/` (mirroring the Phase 26
  classifier extraction) is a planning/research decision — direct import is plausible since it is
  already pure.

### Error analysis (FP/FN)
- **D-05:** At the best-F1 threshold, list false positives (true `human`, predicted AI) and false
  negatives (true `ai`, predicted human) with each post's score, `signalBreakdown`, and (LLM path)
  reasoning, plus the `textPreview`. Persist alongside the existing per-post `posts[]` detail and/or
  the terminal output. Exact presentation is a planning decision.

### Labeling workflow
- **D-06:** Reduce the manual JSON-editing burden of adding `"label": "ai"|"human"` to export
  entries. The mechanism (CLI helper vs dashboard affordance) is open — but a constraint is fixed:
  whatever is built must write labels back into the existing export shape
  (`flaggedPosts[]` / `unflaggedPosts[]` entries gain a `label` field). A full dashboard labeling UI
  is likely heavier than this phase needs; lean CLI-first is the working assumption unless planning
  finds the dashboard path cheap.

### Results viewer / run comparison
- **D-07:** Provide a way to read results beyond raw `results-YYYY-MM-DD.json`, and to diff runs over
  time (e.g. compare best-F1 / precision / recall / cost across two result files as prompts or models
  change). Output format (terminal table, markdown report, etc.) is a planning decision. Consistent
  with Phase 26, this stays a developer/terminal tool — no charting UI required.

### Claude's Discretion
- Engine-selection flag naming/defaults, FP/FN output formatting, results-viewer rendering format,
  and the labeling-helper UX are left to research + planning, within the constraints above.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior phase context (the harness being extended)
- `.planning/phases/26-eval-runner/26-CONTEXT.md` — Phase 26 decisions; esp. D-02 (API key as a
  parameter, not storage) and D-08 (fresh re-score per post, never the stored score).
- `.planning/phases/26-eval-runner/26-RESEARCH.md` — eval toolchain (tsx), patterns, pitfalls.
- `.planning/phases/26-eval-runner/26-PATTERNS.md` — file-to-analog mapping used for the eval CLI.

### The eval CLI to extend
- `scripts/eval.ts` — current eval: `loadExport`, `collectLabeled`, `computeMetrics`,
  threshold sweep, `formatSignalBreakdown`, per-post `posts[]`, results persistence. Calls
  `classifyPost` in the scoring loop (the call site that engine alignment changes).
- `scripts/eval.test.ts` — existing unit tests (walker, metrics, exit codes, signal formatting).

### The detector engines to align with
- `src/content/index.ts` §lines 234-243 — shipped engine selection (`HeuristicDetector` vs
  `LLMDetector(heuristic)`) and the `detector.detect()` call site.
- `src/content/detector/heuristic.ts` — `HeuristicDetector` (DOM-free, takes `PostData`).
- `src/content/detector/llm.ts` — `LLMDetector` (wraps the heuristic; check for content coupling).
- `src/content/detector/signals/` — the pure per-signal scoring modules.
- `src/shared/classifier.ts` — `classifyPost` / `SYSTEM_PROMPT` (the LLM path; `DetectionResult.reasoning` now captured).
- `src/shared/types.ts` — `PostData`, `Detector`, `DetectionResult` (incl. `signalBreakdown`, `engineUsed`, `reasoning`).

### Constraints
- `CLAUDE.md` — project guardrails (no CSS-class selectors, no `element.remove()`, service worker
  stateless, hard exclusions before detection).
- `eval-instructions.md` — current user-facing QA/usage doc; keep in sync with new behavior.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HeuristicDetector` (`src/content/detector/heuristic.ts`): DOM-free, `PostData` in →
  `DetectionResult` out; directly callable from Node with a `fetchComments` stub.
- Pure signal modules under `src/content/detector/signals/`: the scoring primitives behind the
  heuristic engine.
- `classifyPost` (`src/shared/classifier.ts`): the LLM path, already transport-agnostic (key as param).
- In `scripts/eval.ts`: `collectLabeled`, `computeMetrics`, `loadExport`, `safe`,
  `formatSignalBreakdown`, and the `posts[]` detail record — all reusable; only the scoring source
  changes.

### Established Patterns
- **Phase 26 extract-to-shared pattern**: the classifier was lifted into `src/shared/` so both the
  service worker and the eval consume one implementation. The same pattern applies if the heuristic
  engine needs re-homing for the eval.
- **Pluggable `Detector` interface** (`detect(PostData): Promise<DetectionResult>`): the eval can
  depend on this interface and swap engines behind it; `DetectionResult.engineUsed` records which ran.
- **Eval CLI conventions**: run via `tsx`, results to `eval/results-YYYY-MM-DD.json`, non-zero exit
  on bad input, no API key persisted.

### Integration Points
- The eval scoring loop swaps `classifyPost(text, key)` → `detector.detect(postData)`; build
  `PostData` from each export entry (text → `postText`, plus author fields; `fetchComments` → `[]`).
- The per-post `posts[]` record already carries `score` + `signalBreakdown` (+ `reasoning`),
  feeding both the FP/FN error analysis and the results viewer.
- Cost reporting only applies to the LLM engine; the heuristic engine is free (no `usage`).
</code_context>

<specifics>
## Specific Ideas

- The user's motivating observation: the `signals` map stored on `flaggedAccounts` in the export
  (e.g. `{ "buzzword": 5, "generic-cta": 12, "no-specificity": 10, "template": 15 }`) is the shape of
  "detail" they want to see — and it comes from the heuristic engine, which is why aligning the eval
  to that engine matters.
- The export arrays the eval reads (`unflaggedPosts`, `flaggedPosts`) carry `score` + `text` but no
  per-signal breakdown; only `flaggedAccounts` carries `signals`. The eval must compute the breakdown
  itself (now possible via either engine).
</specifics>

<deferred>
## Deferred Ideas

- **Aggregate signal report** — across all posts, which signals discriminate true-AI vs true-human
  (avg contribution + fire rate). Offered earlier and not selected for Phase 27; revisit as a future
  eval improvement once engine alignment + error analysis land.
- **Dashboard labeling UI** — a full in-extension click-to-label surface. Deferred in favor of a
  lean labeling workflow (D-06); promote to its own phase if the CLI workflow proves insufficient.
- **Results charting UI** — graphical rendering of the threshold sweep / run comparison. Deferred;
  Phase 27's results viewer stays terminal/report-based.
</deferred>

---

*Phase: 27-eval-improvements*
*Context gathered: 2026-06-14*
