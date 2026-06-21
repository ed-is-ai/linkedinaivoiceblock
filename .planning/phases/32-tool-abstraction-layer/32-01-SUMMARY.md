---
phase: 32-tool-abstraction-layer
plan: "01"
subsystem: tool-abstraction
tags: [tool-contract, dom-selector-rederive, types, tdd]
dependency_graph:
  requires: []
  provides:
    - Tool<I,O> interface in src/shared/skills/types.ts
    - dom-selector-rederive tool folder (SKILL.md + .tool.ts + .test.ts)
  affects:
    - src/shared/skills/types.ts (AnySkill unchanged, Tool appended)
    - src/background/index.ts (unchanged in this plan — Plan 03 rewires it)
tech_stack:
  added: []
  patterns:
    - Tool<I,O> contract with name/description/execute(input): Promise<O>
    - Self-contained tool folder convention (SKILL.md metadata.kind: tool)
    - Verbatim relocation: rederiveSelector → execute() with two structural changes
key_files:
  created:
    - src/shared/skills/tool-contract.test-types.ts
    - src/skills/library/dom-selector-rederive/SKILL.md
    - src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts
    - src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts
  modified:
    - src/shared/skills/types.ts
decisions:
  - "Tool<I,O> is NOT added to AnySkill — the I/O boundary is the discriminator (D-01/D-04)"
  - "execute() returns { candidates, usage } — caller (background) records trace (D-07)"
  - "REDERIVE_SYSTEM_PROMPT exported from tool so background can re-import for error traces (D-06)"
  - "RederiveCandidate exported from tool to establish single canonical definition (D-08)"
metrics:
  duration: "276s"
  completed_date: "2026-06-16"
  tasks_completed: 2
  files_changed: 5
---

# Phase 32 Plan 01: Tool Contract Foundation Summary

**One-liner:** `Tool<I, O>` interface added to shared types (distinct from AnySkill) and `dom-selector-rederive` tool folder created with SKILL.md manifest, relocated `rederiveSelector` body as `execute()`, and passing unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Tool<I, O> contract to shared skill types | 22302cd | src/shared/skills/types.ts, tool-contract.test-types.ts |
| 2 | Create dom-selector-rederive tool (SKILL.md + execute() + unit test) | 06bb22b | 3 new files in src/skills/library/dom-selector-rederive/ |

## What Was Built

### Task 1: Tool<I, O> Contract

Appended `Tool<I, O>` interface after the `AnySkill` union at the bottom of `src/shared/skills/types.ts`. Three members: `name: string`, `description: string`, `execute(input: I): Promise<O>`. Includes doc comment stating it MAY perform host I/O and is intentionally NOT part of `AnySkill` (D-01, D-04).

A type-only assertion file (`tool-contract.test-types.ts`) verifies the shape compiles correctly.

### Task 2: dom-selector-rederive Tool Folder

- **SKILL.md**: Three mandatory fields — `name`, `description`, `metadata.kind: tool`.
- **dom-selector-rederive.tool.ts**: Imports `Tool` and `AnthropicUsage` (3-level path from `src/skills/library/<name>/`). Exports `REDERIVE_SYSTEM_PROMPT`, `RederiveCandidate`, and `domSelectorRederiveTool`. The `execute()` body is the `rederiveSelector` function from `background/index.ts` L258–335 relocated verbatim with exactly two structural changes: (a) positional params → destructured `{ target, domSkeleton }`, (b) `recordTrace` call removed — returns `{ candidates, usage }` instead. `isRederiveModelOutput` schema guard preserved verbatim (T-32-01 mitigated). API key never logged or returned (T-32-02 mitigated).
- **dom-selector-rederive.test.ts**: 9 tests covering happy path (candidates + usage shape, model/max_tokens, request body), no-API-key rejection, schema-validation failure path (2-attempt retry then throw), and isolation invariants (name, description, execute type). All pass.

## Verification

- `npm run type-check` exits 0
- `npx vitest run src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts` exits 0 (9/9)
- `background/index.ts` NOT modified (confirmed via `git diff`)
- Tool file contains no `recordTrace` call/import, no `chrome.runtime.onMessage` reference

## Success Criteria

- [x] TOOL-01 SC#1: `Tool<I, O>` contract defined in shared types, distinct from skill types, not in `AnySkill`
- [x] TOOL-01 SC#2: `dom-selector-rederive` tools folder convention established (SKILL.md `metadata.kind: tool` + bundled `.tool.ts`)
- [x] TOOL-02 (migration half): `rederiveSelector` body + `REDERIVE_SYSTEM_PROMPT` + `RederiveCandidate` + `isRederiveModelOutput` relocated; `execute()` returns `{ candidates, usage }`; schema validation preserved

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — this plan relocates an existing fetch boundary; no new trust boundaries introduced. T-32-01 (schema validation) and T-32-02 (API key not logged) both mitigated as planned.

## TDD Gate Compliance

| Task | RED commit | GREEN commit | Compliant |
|------|-----------|-------------|-----------|
| 1 | type-check fails (Tool not exported) | 22302cd (types.ts + test-types.ts) | Yes |
| 2 | vitest fails (tool file missing) | 06bb22b (SKILL.md + .tool.ts + .test.ts) | Yes |

## Self-Check: PASSED

Files verified:
- src/shared/skills/types.ts — contains `export interface Tool<I`
- src/shared/skills/tool-contract.test-types.ts — exists
- src/skills/library/dom-selector-rederive/SKILL.md — contains `kind: tool`
- src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts — contains `export const domSelectorRederiveTool`, `export interface RederiveCandidate`, `export const REDERIVE_SYSTEM_PROMPT`, `isRederiveModelOutput`
- src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts — exists

Commits verified:
- 22302cd — feat(32-01): add Tool<I, O> contract
- 06bb22b — feat(32-01): create dom-selector-rederive tool folder
