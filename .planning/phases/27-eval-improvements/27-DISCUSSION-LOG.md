# Phase 27: Eval Improvements - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 27-eval-improvements
**Areas discussed:** Roadmap mechanism, Phase scope, Phase structure

---

## Roadmap mechanism (phase did not yet exist)

Phase 27 was not on the roadmap — milestone v9.0 was marked complete after Phase 26.

| Option | Description | Selected |
|--------|-------------|----------|
| Append Phase 27 to v9.0 | Add a single phase under the existing milestone (reopens it) | ✓ |
| Start a new milestone | Treat eval improvements as v9.1 with its own requirements/roadmap | |
| Just define the scope first | Talk through scope before choosing a mechanism | |

**User's choice:** Append Phase 27 to v9.0.
**Notes:** Milestone v9.0 reopened; `status` returned to `in_progress`, `total_phases` 11 → 12.

---

## Phase scope (what "Eval improvements" delivers)

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregate signal report | Which signals discriminate AI vs human across the dataset | |
| Error analysis (FP/FN) | List misclassified posts at best-F1 threshold | ✓ |
| Labeling workflow | Reduce manual JSON-editing burden of labeling | ✓ |
| Results viewer / run comparison | Read results beyond raw JSON; diff runs over time | ✓ |
| Engine alignment (free-text add) | Make the eval use the same heuristics engine as the service worker | ✓ |

**User's choice:** Error analysis + Labeling workflow + Results viewer + Engine alignment.
**Notes:** The free-text "use the same heuristics engine as the service worker" reframed the phase.
Investigation confirmed the eval calls the raw `classifyPost` and bypasses the shipped detector
pipeline (`src/content/index.ts:239-243`), and that `HeuristicDetector` is DOM-free and reusable in
Node. Engine alignment was identified as foundational. The aggregate signal report was NOT selected
and is recorded as a deferred idea.

---

## Phase structure (one phase vs split)

| Option | Description | Selected |
|--------|-------------|----------|
| Add all four as Phase 27 | All deliverables in one phase; planner sequences them | ✓ |
| Split: engine align = 27, rest = 28 | Foundational change isolated; reporting/labeling separate | |
| Engine alignment only | Scope to engine alignment; defer the other three | |

**User's choice:** Add all four as Phase 27.
**Notes:** Facilitator flagged this is a large phase and that engine alignment should sequence first;
user accepted all four in one phase, leaving plan/wave breakdown to the planner.

## Claude's Discretion

- Engine-selection flag naming and default, FP/FN output formatting, results-viewer rendering format,
  and the labeling-helper UX — all left to research + planning within the captured constraints.

## Deferred Ideas

- Aggregate signal report (considered, not selected for Phase 27).
- Dashboard labeling UI (lean CLI-first labeling preferred for now).
- Results charting/graphical UI (Phase 27 stays terminal/report-based).
