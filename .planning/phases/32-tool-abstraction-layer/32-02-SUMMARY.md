---
phase: 32-tool-abstraction-layer
plan: "02"
subsystem: tool-abstraction
tags: [tool-registry, codegen, generated-tool-registry, stale-check, tdd]
dependency_graph:
  requires: ["32-01"]
  provides:
    - scripts/generate-skill-registry.ts extended with tools bucket
    - src/shared/generated-tool-registry.ts (codegen output, committed)
    - src/shared/tool-registry.ts (synchronous ToolRegistry.get())
    - src/shared/generated-tool-registry.test.ts (order-pinning + execute drift-guard)
    - check-tool-registry npm script + CI step
  affects:
    - scripts/generate-skill-registry.ts (tools bucket + second writeFileSync)
    - scripts/skill-order.json (tools array added)
    - src/shared/generated-tool-registry.ts (new codegen output)
    - src/shared/tool-registry.ts (new registry module)
    - src/shared/generated-tool-registry.test.ts (new test file)
    - package.json (check-tool-registry script)
    - .github/workflows/ci.yml (TOOL-01 CI step)
tech_stack:
  added: []
  patterns:
    - Codegen dual-output: single script emits both generated-skill-registry.ts (src/content/) and generated-tool-registry.ts (src/shared/)
    - Synchronous code-seeded ToolRegistry (no chrome.storage, no migrate, no onChanged)
    - DO-NOT-EDIT header + git diff --exit-code stale-check pattern
    - importVarName tool branch: full folder camelCase + Tool suffix (no prefix strip)
    - importPath parameterized on kind: tool → ../skills/library/<n>/<n>.tool (from src/shared/)
key_files:
  created:
    - src/shared/generated-tool-registry.ts
    - src/shared/tool-registry.ts
    - src/shared/generated-tool-registry.test.ts
  modified:
    - scripts/generate-skill-registry.ts
    - scripts/skill-order.json
    - package.json
    - .github/workflows/ci.yml
decisions:
  - "importPath parameterized on kind: tools use ../skills/library/<n>/<n>.tool (relative from src/shared/); skills keep ../skills/library/<n>/<n>.skill (from src/content/)"
  - "importVarName tool branch uses FULL folder camelCase + Tool suffix (no detect-/exclude-/dom-selector- prefix strip) — dom-selector-rederive → domSelectorRederiveTool (RESEARCH §ToolRegistry Design)"
  - "Two separate writeFileSync calls in main(): skills → src/content/generated-skill-registry.ts (unchanged); tools → src/shared/generated-tool-registry.ts (new)"
  - "ToolRegistry has no chrome.storage hydration, no migrate(), no onChanged — code-seeded only (D-05)"
  - "check-tool-registry mirrors check-skill-registry exactly: npm run generate-skill-registry && git diff --exit-code src/shared/generated-tool-registry.ts"
metrics:
  duration: "~12m"
  completed_date: "2026-06-16"
  tasks_completed: 2
  files_changed: 7
---

# Phase 32 Plan 02: ToolRegistry Codegen + Runtime Registry Summary

**One-liner:** Codegen extended with a `tools` bucket that emits a committed `src/shared/generated-tool-registry.ts`; synchronous `ToolRegistry.get()` backed by GENERATED_TOOLS with order-pinning/drift tests and a green `check-tool-registry` stale-check wired into npm + CI.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend codegen to emit generated-tool-registry.ts + add tools bucket | 9458fae | scripts/generate-skill-registry.ts, scripts/skill-order.json, src/shared/generated-tool-registry.ts |
| 2 (test) | Add order-pinning + execute drift-guard tests for GENERATED_TOOLS | d069bf5 | src/shared/generated-tool-registry.test.ts |
| 2 (impl) | Create ToolRegistry + check-tool-registry script + CI step | 80bc4e0 | src/shared/tool-registry.ts, package.json, .github/workflows/ci.yml |

## What Was Built

### Task 1: Codegen Extension

Extended `scripts/generate-skill-registry.ts` (Option A — single multi-output script) with:

- `tools?: string[]` added to `SkillOrder` interface.
- Kind unions in `SkillFrontmatter`/`SkillEntry` extended to include `'tool'`.
- `validateFrontmatter` allowed-kinds extended to `['signal', 'exclusion', 'detector', 'tool']`.
- `importVarName` gains a `tool` branch: full folder camelCase + `Tool` suffix (no prefix strip) — `dom-selector-rederive` → `domSelectorRederiveTool`.
- `importPath` parameterized on kind: `tool` → `../skills/library/${folder}/${folder}.tool` (relative from `src/shared/`); other kinds keep existing `.skill` path (from `src/content/`).
- `main()` parses `toolEntries` from `order.tools ?? []`, builds a separate `toolLines` array, writes a second `fs.writeFileSync` to `src/shared/generated-tool-registry.ts`.
- Existing skill `writeFileSync` to `src/content/generated-skill-registry.ts` is **not touched** — `git diff --exit-code` exits 0 (RESEARCH Pitfall 1 guard).

`scripts/skill-order.json` gets a fourth top-level key: `"tools": ["dom-selector-rederive"]`. `dom-selector-registry` is NOT added (metadata-only, CR-01 fix is SKILL.md only — RESEARCH Pitfall 5).

`src/shared/generated-tool-registry.ts` contains:
- DO-NOT-EDIT header citing `check-tool-registry`
- `import type { Tool } from './skills/types'`
- Static import: `import { domSelectorRederiveTool } from '../skills/library/dom-selector-rederive/dom-selector-rederive.tool'`
- `export const GENERATED_TOOLS: readonly Tool<unknown, unknown>[] = [domSelectorRederiveTool]`
- `export const GENERATED_TOOL_METADATA` descriptive object
- NO dynamic import, NO import.meta.glob (MV3-CSP-safe, T-32-06 mitigated)

### Task 2: ToolRegistry + Tests + Stale-Check

`src/shared/tool-registry.ts`:
- Module-level `const _registry: Map<string, Tool<any, any>>` built synchronously from `GENERATED_TOOLS.map(t => [t.name, t])` — no `chrome.*` at module init (RESEARCH Pitfall 2, T-32-05 mitigated).
- Exports `function get<I, O>(name: string): Tool<I, O>` — throws `Error("[ToolRegistry] Unknown tool: '<name>'")` on miss (T-32-05 mitigated).
- No `list()`, `has()`, `register()`, `chrome.storage` hydration, `migrate()`, or `onChanged` listener (D-05).

`src/shared/generated-tool-registry.test.ts`:
- Describe block: order-pinning — `GENERATED_TOOLS.map(t => t.name)` toStrictEqual `['dom-selector-rederive']`.
- Describe block: execute drift-guard — `typeof t.execute === 'function'` for every tool (asserts `execute`, not `kind` — `Tool<I,O>` has no `kind` field).

`package.json`: added `"check-tool-registry": "npm run generate-skill-registry && git diff --exit-code src/shared/generated-tool-registry.ts"`. Existing `check-skill-registry` and `prebuild` unchanged.

`.github/workflows/ci.yml`: added `Stale-check generated tool registry (TOOL-01)` step immediately after existing `Stale-check generated skill registry (D-05)` step.

## Verification

- `npm run generate-skill-registry` — exits 0, emits both files
- `git diff --exit-code src/content/generated-skill-registry.ts` — exits 0 (byte-identical, RESEARCH Pitfall 1 guard)
- `npm run type-check` — exits 0
- `npx vitest run src/shared/generated-tool-registry.test.ts` — 2/2 pass
- `npm run check-tool-registry` — exits 0
- `npm run check-skill-registry` — exits 0
- `src/shared/tool-registry.ts` contains no `chrome.` API calls (comments only)
- `src/shared/generated-tool-registry.ts` contains no `import(` dynamic import or `import.meta.glob`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. T-32-04 (tampering via drift), T-32-05 (registry poisoning), T-32-06 (dynamic import), and T-32-SC (package installs) all mitigated as planned.

## TDD Gate Compliance

| Task | Commit | Type | Compliant |
|------|--------|------|-----------|
| 2 | d069bf5 | test(...) — order-pinning + drift-guard tests | Yes |
| 2 | 80bc4e0 | feat(...) — ToolRegistry + script + CI | Yes |

## Self-Check: PASSED

Files verified:
- src/shared/generated-tool-registry.ts — exists, contains `export const GENERATED_TOOLS`, `domSelectorRederiveTool` static import
- src/shared/tool-registry.ts — exists, contains `export function get<I, O>`, `import { GENERATED_TOOLS }`
- src/shared/generated-tool-registry.test.ts — exists, contains both describe blocks
- package.json — contains `check-tool-registry`
- .github/workflows/ci.yml — contains `npm run check-tool-registry`

Commits verified:
- 9458fae — feat(32-02): extend codegen + emit generated-tool-registry.ts
- d069bf5 — test(32-02): add order-pinning + execute drift-guard tests
- 80bc4e0 — feat(32-02): add ToolRegistry + check-tool-registry script + CI step
