---
phase: 32-tool-abstraction-layer
verified: 2026-06-16T21:04:13Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 32: Tool Abstraction Layer — Verification Report

**Phase Goal:** A first-class `Tool` abstraction exists, separate from host-agnostic detection skills. Tools are imperative capabilities with a typed `name`/`description`/`execute(input)` contract; they live under `skills/library/` with a SKILL.md manifest (`metadata.kind: tool`). `rederiveSelector` is migrated from `background/index.ts` into the library as the first tool (`dom-selector-rederive`), the `dom-selector-registry` mislabel is corrected, and existing "skills" that are really imperative/I/O capabilities are audited and reclassified — with zero behavior change.

**Verified:** 2026-06-16T21:04:13Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|-------------|------|-------------|--------|----------|
| TOOL-01 | 32-01, 32-02 | Tool<I,O> contract + ToolRegistry + tools folder convention | SATISFIED | `export interface Tool<I` in types.ts; ToolRegistry.get() in tool-registry.ts; SKILL.md kind:tool in dom-selector-rederive |
| TOOL-02 | 32-01, 32-03 | rederiveSelector migrated; dom-selector-registry kind fixed; audit documented; zero behavior change | SATISFIED | dom-selector-rederive.tool.ts exists with full execute() body; background rewired; AUTHORING.md documents skill-vs-tool rule; `npm test` 433/433 |

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `Tool<I, O>` contract in shared types, distinct from `SignalSkill`/`ExclusionSkill`/`DetectorSkill`, NOT in `AnySkill` | VERIFIED | `src/shared/skills/types.ts` L168: `export interface Tool<I, O>`. `AnySkill` at L153 is `DetectorSkill \| SignalSkill \| ExclusionSkill` — Tool is absent. Doc comment at L164 states "Tools are NOT part of AnySkill". |
| 2 | tools folder convention under `src/skills/library/` with SKILL.md `metadata.kind: tool` | VERIFIED | `src/skills/library/dom-selector-rederive/SKILL.md` frontmatter: `kind: tool`. `src/skills/library/dom-selector-registry/SKILL.md` frontmatter: `kind: tool`. |
| 3 | `rederiveSelector` + helpers migrated to `dom-selector-rederive`; background imports from new location; byte-identical behavior | VERIFIED | `dom-selector-rederive.tool.ts` exports `domSelectorRederiveTool`, `RederiveCandidate`, `REDERIVE_SYSTEM_PROMPT`, contains `isRederiveModelOutput` verbatim. `background/index.ts` imports `getTool` from `../shared/tool-registry` and `REDERIVE_SYSTEM_PROMPT`/`RederiveCandidate` from the tool. `async function rederiveSelector` and `function isRederiveModelOutput` are absent from `background/index.ts`. `npm test` 31 files / 433 tests pass. |
| 4 | `dom-selector-registry` `metadata.kind` mislabel corrected `exclusion` → `tool` | VERIFIED | `src/skills/library/dom-selector-registry/SKILL.md` frontmatter: `kind: tool`. `dom-selector-registry.skill.ts` is unchanged (`git diff --exit-code` clean). Folder NOT in `skill-order.json` `tools` array. |
| 5 | Skills audited against documented skill-vs-tool decision rule; composite detectors documented as follow-ups; `detect-llm` and `detect-generic-comments` NOT refactored | VERIFIED | `src/skills/library/AUTHORING.md` has a "Skill-vs-Tool Decision Rule (D-01/D-02)" section citing the I/O boundary as discriminator and `fetchComments` as the canonical composite-decomposed example. Composite decomposition explicitly documented as "DOCUMENTED FOLLOW-UP, not done in Phase 32 (D-03)". `detect-llm.skill.ts` and `detect-generic-comments.skill.ts` have no `execute()` — neither was refactored. |
| 6 | Zero behavior change: `npm test`, `check-skill-registry`, `check-tool-registry`, `type-check` all pass; golden-score snapshot + exclusion parity byte-identical; `ratelimit.test.ts` unmodified | VERIFIED | `npm run type-check` exits 0. `npm run check-skill-registry` exits 0 (generated-skill-registry.ts byte-identical). `npm run check-tool-registry` exits 0 (generated-tool-registry.ts byte-identical). `npm test` 31 files / 433 tests pass. `git diff --exit-code src/background/ratelimit.test.ts` clean. |

**Score:** 6/6 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/skills/types.ts` | `Tool<I, O>` interface, not in `AnySkill` | VERIFIED | L168 `export interface Tool<I, O>` with `name`, `description`, `execute(input: I): Promise<O>`. AnySkill unchanged. |
| `src/skills/library/dom-selector-rederive/SKILL.md` | `metadata.kind: tool` | VERIFIED | Frontmatter contains `kind: tool`. |
| `src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts` | `domSelectorRederiveTool`, `RederiveCandidate`, `REDERIVE_SYSTEM_PROMPT`, `isRederiveModelOutput`, no `recordTrace` | VERIFIED | All four exports present. No `recordTrace` reference. No `chrome.runtime.onMessage`. Schema validation `isRederiveModelOutput` present. Returns `{ candidates, usage }`. |
| `src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts` | `execute()` unit test | VERIFIED | 9 tests covering happy path, no-API-key, schema-validation failure, isolation invariants. All pass. |
| `src/shared/generated-tool-registry.ts` | `GENERATED_TOOLS`, static import of `domSelectorRederiveTool` | VERIFIED | Static import present. `export const GENERATED_TOOLS: readonly Tool<unknown, unknown>[] = [domSelectorRederiveTool]`. No `import(` dynamic import or `import.meta.glob`. |
| `src/shared/tool-registry.ts` | `export function get<I, O>`, no `chrome.*` at init | VERIFIED | Synchronous Map built from `GENERATED_TOOLS`. `get()` throws `[ToolRegistry] Unknown tool:` on miss. No runtime `chrome.*` calls. |
| `src/shared/generated-tool-registry.test.ts` | Order-pinning + drift-guard tests | VERIFIED | `GENERATED_TOOLS.map(t => t.name)` toStrictEqual `['dom-selector-rederive']`. `typeof t.execute === 'function'` for every tool. |
| `src/background/index.ts` | Rewired to ToolRegistry; relocated code removed; rate-limit stays | VERIFIED | `getTool('dom-selector-rederive').execute(...)` present. `checkRateLimit`, `acquireRateLimitLatch`, `releaseRateLimitLatch` present. No `async function rederiveSelector` or `function isRederiveModelOutput`. Success `recordTrace` follows `tool.execute(`. |
| `src/content/detector/rederiver.ts` | `RederiveCandidate` imported from tool, not locally defined | VERIFIED | `import type { RederiveCandidate }` from `dom-selector-rederive.tool`. `export type { RederiveCandidate }`. Local interface removed. `LLMRederiver` class unchanged. |
| `src/skills/library/dom-selector-registry/SKILL.md` | `kind: tool` (CR-01 fix) | VERIFIED | Frontmatter `kind: tool`. Folder absent from `skill-order.json` `tools` array. `dom-selector-registry.skill.ts` unmodified. |
| `src/skills/library/AUTHORING.md` | Skill-vs-Tool decision rule + tool authoring workflow + composite seams as follow-ups | VERIFIED | Contains "Skill-vs-Tool Decision Rule (D-01/D-02)" section with I/O boundary discriminator, `fetchComments` citation, and explicit "DOCUMENTED FOLLOW-UP" statement. Contains "Tool authoring workflow" section with `.tool.ts`, `metadata.kind: tool`, `execute(input): Promise<O>`. |
| `scripts/skill-order.json` | `tools: ["dom-selector-rederive"]`, `dom-selector-registry` absent | VERIFIED | `"tools": ["dom-selector-rederive"]` present. `dom-selector-registry` not in tools array. |
| `package.json` | `check-tool-registry` script | VERIFIED | `"check-tool-registry": "npm run generate-skill-registry && git diff --exit-code src/shared/generated-tool-registry.ts"` |
| `.github/workflows/ci.yml` | `npm run check-tool-registry` CI step | VERIFIED | "Stale-check generated tool registry (TOOL-01)" step present, immediately after existing skill stale-check step. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dom-selector-rederive.tool.ts` | `src/shared/skills/types.ts` | `import type { Tool }` | WIRED | L20: `import type { Tool } from '../../../shared/skills/types'` |
| `dom-selector-rederive.tool.ts` | `src/shared/classifier.ts` | `import type { AnthropicUsage }` | WIRED | L21: `import type { AnthropicUsage } from '../../../shared/classifier'` |
| `src/shared/tool-registry.ts` | `src/shared/generated-tool-registry.ts` | `import { GENERATED_TOOLS }` | WIRED | L30: `import { GENERATED_TOOLS } from './generated-tool-registry'` |
| `src/shared/generated-tool-registry.ts` | `dom-selector-rederive.tool` | static import `domSelectorRederiveTool` | WIRED | L10: `import { domSelectorRederiveTool } from '../skills/library/dom-selector-rederive/dom-selector-rederive.tool'` |
| `src/background/index.ts` | `src/shared/tool-registry.ts` | `import { get as getTool }` + `.execute(` | WIRED | L8: `import { get as getTool } from '../shared/tool-registry'`. L254-261: `getTool(...'dom-selector-rederive')` then `await tool.execute(...)` |
| `src/background/index.ts` | `dom-selector-rederive.tool` | `import REDERIVE_SYSTEM_PROMPT + RederiveCandidate` | WIRED | L9-10: both imports from `../skills/library/dom-selector-rederive/dom-selector-rederive.tool` |
| `src/content/detector/rederiver.ts` | `dom-selector-rederive.tool` | `import type RederiveCandidate` | WIRED | L16: `import type { RederiveCandidate } from '../../skills/library/dom-selector-rederive/dom-selector-rederive.tool'` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `dom-selector-rederive.tool.ts` `execute()` | `data.content[0].text` | `fetch('https://api.anthropic.com/v1/messages', ...)` with API key from `chrome.storage.local` | Yes — live Anthropic API call with isRederiveModelOutput schema guard; returns `{ candidates, usage }` | FLOWING |
| `background/index.ts` REDERIVE_SELECTOR handler | `{ candidates, usage }` from `tool.execute()` | `getTool('dom-selector-rederive').execute({ target, domSkeleton })` | Yes — delegates to the tool's fetch pipeline; success trace receives real `usage` tokens | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Tool contract compiles; AnySkill unchanged | `npm run type-check` | exit 0 | PASS |
| dom-selector-rederive unit tests pass | `npx vitest run src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts` (via `npm test`) | 9/9 pass | PASS |
| ToolRegistry order-pinning + drift-guard | `npx vitest run src/shared/generated-tool-registry.test.ts` (via `npm test`) | 2/2 pass | PASS |
| ratelimit.test.ts unmodified and green | `npx vitest run src/background/ratelimit.test.ts` (via `npm test`) | 9/9 pass, file diff clean | PASS |
| Full test suite (all 31 files) | `npm test` | 433/433 pass | PASS |
| Skill registry unchanged | `npm run check-skill-registry` | exit 0 | PASS |
| Tool registry stale-check | `npm run check-tool-registry` | exit 0 | PASS |

---

## Anti-Patterns Found

No blockers found. Scanned files modified in this phase:
- `src/shared/skills/types.ts` — no TBD/FIXME/XXX/TODO/placeholder
- `src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts` — no TBD/FIXME/XXX; no `recordTrace` or `chrome.runtime.onMessage`
- `src/background/index.ts` — no TBD/FIXME/XXX; `rederiveSelector` and `isRederiveModelOutput` removed
- `src/shared/tool-registry.ts` — no TBD/FIXME/XXX; no runtime `chrome.*`
- `src/shared/generated-tool-registry.ts` — no dynamic imports, no `import.meta.glob`
- `src/skills/library/dom-selector-registry/SKILL.md` — single-field change, no regressions
- `src/skills/library/AUTHORING.md` — additive only; no stub markers
- `src/content/detector/rederiver.ts` — `LLMRederiver` class unchanged; `RederiveCandidate` deduped correctly

### Out-of-scope items confirmed NOT done

- `detect-llm.skill.ts` — no `execute()` method; not refactored as a tool
- `detect-generic-comments.skill.ts` — no `execute()` method; not refactored as a tool
- `dom-selector-registry` — NOT in `skill-order.json` `tools` array; `.skill.ts` unmodified (`git diff --exit-code` clean)

---

## Human Verification Required

None. All truths verifiable programmatically. The phase goal is a refactor (zero behavior change) confirmed by the full test suite.

---

## Gaps Summary

No gaps. All 6 roadmap success criteria verified against the actual codebase with guard commands executed and confirmed.

---

_Verified: 2026-06-16T21:04:13Z_
_Verifier: Claude (gsd-verifier)_
