---
phase: 32-tool-abstraction-layer
plan: "03"
subsystem: tool-abstraction
tags: [migration, tool-registry, background, cr-01, authoring, zero-behavior-change]
dependency_graph:
  requires: ["32-01", "32-02"]
  provides:
    - background/index.ts REDERIVE_SELECTOR handler rewired to ToolRegistry
    - rederiveSelector + helpers removed from background (single source of truth in the tool)
    - success trace hoisted to the background call site (D-07)
    - RederiveCandidate deduped (rederiver.ts imports + re-exports from the tool)
    - dom-selector-registry kind corrected exclusion -> tool (CR-01)
    - AUTHORING.md skill-vs-tool decision rule + tool authoring workflow
  affects:
    - src/background/index.ts (handler rewired; relocated code removed; trace hoisted)
    - src/content/detector/rederiver.ts (RederiveCandidate dedup; LLMRederiver unchanged)
    - src/skills/library/dom-selector-registry/SKILL.md (kind: tool, metadata-only)
    - src/skills/library/AUTHORING.md (skill-vs-tool rule + tool workflow)
tech_stack:
  added: []
  patterns:
    - Tool resolved via ToolRegistry.get(name).execute(input) at the call site
    - Fire-and-forget success trace recorded in background from returned usage (D-07)
    - Re-export type pattern requires local import to satisfy local references (import type + export type)
    - Metadata-only kind reclassification (no execute(), not added to skill-order.json tools)
key_files:
  created: []
  modified:
    - src/background/index.ts
    - src/content/detector/rederiver.ts
    - src/skills/library/dom-selector-registry/SKILL.md
    - src/skills/library/AUTHORING.md
decisions:
  - "rederiver.ts uses `import type { RederiveCandidate }` AND `export type { RederiveCandidate }` — a bare re-export (`export type { X } from`) does not bring the name into local scope, so the local references at L24/L43 require the import form too"
  - "dom-selector-registry CR-01 is metadata-only: SKILL.md kind exclusion -> tool; skill.ts unchanged; NOT added to skill-order.json tools array (no execute())"
  - "Success trace hoisted to the background call site from the tool's returned usage (D-07); rate-limit machinery + latch + pre-latch key check + handler stay in background (D-06)"
  - "Composite detectors (detect-llm, detect-generic-comments) documented in AUTHORING.md as skill+tool composites; actual decomposition recorded as a follow-up, NOT done this phase (D-03)"
metrics:
  duration: "~10m (executor stall + orchestrator recovery)"
  completed_date: "2026-06-16"
  tasks_completed: 2
  files_changed: 4
---

# Phase 32 Plan 03: Migration Close-Out + Zero-Behavior-Change Guard Sweep

**One-liner:** `background/index.ts` now resolves `dom-selector-rederive` through `ToolRegistry` and calls `.execute({ target, domSkeleton })` with the success trace hoisted to the call site; the relocated code is gone, `RederiveCandidate` is deduped, the `dom-selector-registry` kind mislabel is corrected (CR-01), and `AUTHORING.md` documents the skill-vs-tool rule — with the full byte-identical guard suite green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewire background handler to ToolRegistry, remove relocated code, dedup rederiver import | 21de0c7 | src/background/index.ts, src/content/detector/rederiver.ts |
| 2 | CR-01 kind fix + AUTHORING.md skill-vs-tool rule + zero-behavior-change guard sweep | 4e25bc8 | src/skills/library/dom-selector-registry/SKILL.md, src/skills/library/AUTHORING.md |

## What Was Built

### Task 1: Background rewire + RederiveCandidate dedup

`src/background/index.ts`:
- Added `import { get as getTool } from '../shared/tool-registry'`, plus `import type { RederiveCandidate }` and `import { REDERIVE_SYSTEM_PROMPT }` from `../skills/library/dom-selector-rederive/dom-selector-rederive.tool`.
- Removed the now-relocated `REDERIVE_SYSTEM_PROMPT` const, `interface RederiveCandidate`, `interface RederiveModelOutput`, `function isRederiveModelOutput`, and `async function rederiveSelector`.
- Rewired the `REDERIVE_SELECTOR` handler try-block to resolve `getTool<{target, domSkeleton}, {candidates, usage}>('dom-selector-rederive')`, `await tool.execute({ target, domSkeleton })`, destructure `{ candidates, usage }`, record the **success** trace at the call site (hoisted from `execute()` per D-07), then `sendResponse({ result: candidates })`.
- Kept unchanged (D-06): `REDERIVE_COOLOFF_MS`, `REDERIVE_DAILY_CAP`, `checkRateLimit`, `acquireRateLimitLatch`, `releaseRateLimitLatch`, the pre-latch API-key check, the handler structure, and the two error-trace `recordTrace` calls (which still reference the now-imported `REDERIVE_SYSTEM_PROMPT`).

`src/content/detector/rederiver.ts`:
- Removed the local `interface RederiveCandidate` and replaced it with `import type { RederiveCandidate } from '../../skills/library/dom-selector-rederive/dom-selector-rederive.tool'` plus `export type { RederiveCandidate }`. The `LLMRederiver` class is untouched (D-08).

### Task 2: CR-01 kind fix + AUTHORING.md

`src/skills/library/dom-selector-registry/SKILL.md`: `metadata.kind` corrected `exclusion` → `tool` (CR-01). Metadata-only — `dom-selector-registry.skill.ts` unchanged (single-writer invariant, CLAUDE.md #1) and the folder is NOT added to `scripts/skill-order.json` `tools` (it has no `execute()`).

`src/skills/library/AUTHORING.md` (additive):
- `metadata.kind` allowed-values line now lists `signal`, `exclusion`, `detector`, `tool`.
- Added a `dom-selector-` → `tool` prefix-table row noting `dom-selector-rederive` (runtime tool) and `dom-selector-registry` (reclassified via CR-01, metadata-only).
- Added a "Skill-vs-Tool Decision Rule (D-01/D-02)" section: the I/O boundary is the discriminator; composite detectors (`detect-generic-comments`, `detect-llm`) are skill+tool composites, citing the injected `fetchComments` as the canonical "already decomposed" example and the `SCORE_POST` fetch in `detect-llm`; composite decomposition recorded as a DOCUMENTED FOLLOW-UP, not done this phase (D-03).
- Added a "Tool authoring workflow" section mirroring the skill workflow with `metadata.kind: tool`, `<name>.tool.ts`, `execute(input): Promise<O>`, `Tool<I, O>` import, the `tools` array step, and the `npm test && npm run check-tool-registry` close.

## Verification

- `npm run type-check` — exits 0 (REDERIVE_SYSTEM_PROMPT + RederiveCandidate resolve from the tool at every call site; no dangling references)
- `npx vitest run src/background/ratelimit.test.ts` — 9/9 pass; `git diff --exit-code src/background/ratelimit.test.ts` clean (UNMODIFIED)
- `npm run check-skill-registry` — exits 0
- `npm run check-tool-registry` — exits 0
- `npm test` — 31 files / 433 tests pass (golden-score snapshot + exclusion parity byte-identical; ratelimit + generated-registry tests green)
- `git diff --exit-code src/skills/library/dom-selector-registry/dom-selector-registry.skill.ts` — clean (single-writer invariant preserved)
- `scripts/skill-order.json` does NOT contain `dom-selector-registry`

## Deviations from Plan

**Executor stall + orchestrator recovery.** The spawned worktree executor completed Task 1's edits (background rewire + rederiver) but its return was truncated (Windows stdio hang pattern) before it committed anything or wrote SUMMARY.md — and before it could fix a type error it had introduced. The orchestrator recovered the uncommitted partial work from the worktree (applied as a patch onto the same base), fixed the latent bug, and completed both tasks inline:
- **Latent bug fixed:** the executor had written `export type { RederiveCandidate } from '...'` in `rederiver.ts`, which does not bring the name into local scope, so the local references at L24/L43 failed type-check (`TS2304: Cannot find name 'RederiveCandidate'`). Corrected to `import type { RederiveCandidate }` + `export type { RederiveCandidate }`.

Plan content otherwise executed exactly as written.

## Known Stubs

None.

## Threat Flags

None new. T-32-07 (API key across the tool boundary — key read stays in `execute()`, no new logging, success trace records only usage + prompts), T-32-08 (rate-limit/latch/key-check stay in background, D-06), T-32-09 (`isRederiveModelOutput` validation runs in the tool, unchanged), T-32-10 (CR-01 is SKILL.md-only; no `execute()` introduced; not registered in `tools`) all mitigated as planned. Full suite green confirms the observable contract is unchanged.

## Self-Check: PASSED

Files verified:
- src/background/index.ts — `getTool` import + `'dom-selector-rederive').execute(`; no `async function rederiveSelector`; no `function isRederiveModelOutput`; `checkRateLimit`/`acquireRateLimitLatch`/`releaseRateLimitLatch` present; success `recordTrace` after `tool.execute(`
- src/content/detector/rederiver.ts — imports + re-exports `RederiveCandidate` from the tool; `LLMRederiver` unchanged
- src/skills/library/dom-selector-registry/SKILL.md — `kind: tool`; skill.ts unchanged
- src/skills/library/AUTHORING.md — Skill-vs-Tool decision rule citing `fetchComments`; tool authoring workflow with `.tool.ts` + `metadata.kind: tool`; composites documented as follow-ups

Commits verified:
- 21de0c7 — feat(32-03): rewire background to ToolRegistry, dedup RederiveCandidate
- 4e25bc8 — feat(32-03): fix dom-selector-registry kind (CR-01) + document skill-vs-tool rule
