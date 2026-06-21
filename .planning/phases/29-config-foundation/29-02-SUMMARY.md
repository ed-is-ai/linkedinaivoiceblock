---
phase: 29-config-foundation
plan: "02"
subsystem: shared/config
tags: [single-source, detection-config, as-const, zero-behavior-change, no-drift, refactor]
dependency_graph:
  requires: [D-06-golden-score-baseline]
  provides: [detection-config-module, CFG-01]
  affects:
    - src/shared/detectionConfig.ts
    - src/content/index.ts
    - src/content/detector/heuristic.ts
    - scripts/eval.ts
tech_stack:
  added: []
  patterns: [single-nested-as-const-config, provenance-comments, host-agnostic-module]
key_files:
  created:
    - src/shared/detectionConfig.ts
  modified:
    - src/content/index.ts
    - src/content/detector/heuristic.ts
    - scripts/eval.ts
decisions:
  - "Single nested `detectionConfig` object declared `as const` (D-01) — not flat named exports — literal-narrowed readonly types"
  - "detectionConfig owns autoHideDefault (60); the user-configurable autoHideThreshold read from chrome.storage.local is unchanged, only the `?? 60` default literal moved (D-02)"
  - "THRESHOLDS sweep array stays in src/shared/eval/metrics.ts (D-03); only the single operating-point flag (35) is sourced from detectionConfig in eval.ts"
  - "Per-signal `max` keys are documentation for Phase 32 tuning, NOT behavior — no Math.min cap was added that did not exist before"
  - "background/index.ts left unchanged — holds only REDERIVE_* scraper constants, no detection literal (CONTEXT.md Claude's Discretion confirmed)"
metrics:
  duration: "~30 minutes (executor truncated mid-Task-3; orchestrator completed)"
  completed: "2026-06-15"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
---

# Phase 29 Plan 02: Detection Config Foundation (CFG-01) Summary

**One-liner:** Created `src/shared/detectionConfig.ts` as the single source of truth for all detection thresholds/weights and rewired all three consumers (content script + eval CLI) to import from it — zero behavior change, proven by the Plan 01 golden-score snapshot staying byte-identical.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/shared/detectionConfig.ts (single nested as-const config) | eb3b91d | src/shared/detectionConfig.ts |
| 2 | Refactor content/index.ts + heuristic.ts to import from detectionConfig | 91cb52a | src/content/index.ts, src/content/detector/heuristic.ts |
| 3 | Wire detectionConfig.thresholds.flag into scripts/eval.ts (no-drift tie-in) | 41c466b | scripts/eval.ts |

## What Was Built

**`src/shared/detectionConfig.ts` (new, 57 lines)** — a host-agnostic module (no `chrome.*`, `document.*`, `fs`, `process`; zero runtime imports) exporting a single nested object `export const detectionConfig = { … } as const`:
- `thresholds`: `flag: 35`, `openToWorkPenalty: 20`, `autoHideDefault: 60`
- `weights.listicleCta`: `{ both: 25, listicleOnly: 12, ctaOnly: 8 }` (D-05 semantic tier keys)
- `weights`: per-signal cap keys (`buzzword.max 15`, `emDash.max 10`, `aiVocab.max 12`, `hookStory.max 20`, `motivational.max 20`, `impersonal.max 15`) + `genericComments: { gate: 20, max: 15 }`
- `maxPostsPerSession: 50` (seeded now for Phase 31; no consumer yet — no-op for behavior)

Every key carries a provenance comment mapping it to its original source line so rationale is not lost.

**Consumers rewired:**
- `src/content/index.ts` — deleted `FLAG_THRESHOLD`/`OPEN_TO_WORK_PENALTY` constants; call sites now use `detectionConfig.thresholds.flag`/`.openToWorkPenalty`; the three `?? 60` defaults now use `detectionConfig.thresholds.autoHideDefault`. The chrome.storage.local user-override read is untouched (D-02).
- `src/content/detector/heuristic.ts` — listicle-cta composite (25/12/8) now references `detectionConfig.weights.listicleCta.*`; the generic-comments gate (`score > 20`) uses `detectionConfig.weights.genericComments.gate`. Confidence-band literals (60/35 on L159) left untouched (heuristic-internal, out of D-04 scope).
- `scripts/eval.ts` — imports `detectionConfig` (`.js` ESM extension); `bestF1Threshold` seed now sources from `detectionConfig.thresholds.flag` instead of `THRESHOLDS[0]`, so the eval operating point and the runtime flag can never drift (criterion #4). THRESHOLDS sweep array left in metrics.ts (D-03).

## Acceptance Criteria Verification

- `npm run type-check` exits 0 — `as const` narrows correctly at all consumer call sites
- `npm test` exits 0: **411/411 tests pass; Plan 01 golden-score snapshot byte-identical** (zero behavior change)
- `detectionConfig.ts` exports exactly one `as const` symbol with all required keys (thresholds.flag=35, openToWorkPenalty=20, autoHideDefault=60, listicleCta tiers, genericComments.gate=20, maxPostsPerSession=50)
- No `chrome.`/`document.`/`fs`/`process.` token in detectionConfig.ts
- `FLAG_THRESHOLD`/`OPEN_TO_WORK_PENALTY` tokens and `?? 60` no longer appear in content/index.ts
- `THRESHOLDS` still exported from metrics.ts (D-03): confirmed (1 occurrence)
- eval.ts and runtime flag both resolve to `detectionConfig.thresholds.flag` — no manual sync (criterion #4)

## Deviations from Plan

**1. [Process] Executor truncated mid-Task-3; orchestrator completed the plan**
- **Found during:** Task 3. The executor subagent's return was truncated by a Windows stdio hang (return ended mid-sentence at "Now replace the `bestF1Threshold` seed:"), with no `## PLAN COMPLETE` marker.
- **State at truncation:** Tasks 1 (eb3b91d) and 2 (91cb52a) were committed on the worktree branch. Task 3's eval.ts edits (import + seed) were already applied in the worktree working tree but uncommitted; SUMMARY.md was not written.
- **Fix:** Orchestrator filesystem-fallback (execute-phase step 9a) — verified via git/disk that Tasks 1–2 were committed and Task 3's edit was present and exactly matched the plan spec. Merged Tasks 1–2 to master, re-applied the identical Task 3 edit on master, ran the full verification gate (type-check + 411 tests green, snapshot byte-identical), committed Task 3 (41c466b), and authored this SUMMARY.
- **Net effect:** All three tasks landed exactly as planned; no value changed; zero behavior change preserved.

## Known Stubs

`maxPostsPerSession: 50` is intentionally seeded but not yet consumed by any code path (Phase 31 Cost Guardrail will read it). This is a no-op for Phase 29 behavior, per CONTEXT.md Claude's Discretion.

## Threat Flags

None. Phase 29 is a pure internal relocation of compile-time numeric constants. `detectionConfig.ts` is host-agnostic with no I/O, network, storage-write, or DOM/host API. No new trust boundary introduced (threat IDs T-29-02/T-29-03 mitigated: snapshot acts as fail-closed gate against value drift).

## Self-Check: PASSED

- File exists: `src/shared/detectionConfig.ts` — FOUND (57 lines)
- Commits eb3b91d, 91cb52a, 41c466b — all present on master
- `npm run type-check` green; `npm test` green: 411/411 passed
- Golden-score snapshot byte-identical (zero behavior change confirmed)
- THRESHOLDS sweep array still in metrics.ts (D-03 honored)
