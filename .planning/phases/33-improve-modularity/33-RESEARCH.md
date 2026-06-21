# Phase 33: Improve Modularity — Research

**Researched:** 2026-06-17
**Domain:** TypeScript refactor — file relocation, rename, codegen unification, Vite build config
**Confidence:** HIGH (all findings verified by direct codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Skill-owned logic moves, infra stays. `heuristic.ts` + `llm.ts` + `signals/profile.ts` → owning skill folder; `rederiver.ts` → `dom-selector-rederive` tool; `comment-expand.ts` + `language.ts` + `tombstone.ts` stay in `src/content/` as shared infrastructure.
- **D-02:** Verify true ownership before moving each file. Thin re-exports become direct imports at call sites (do not keep barrels). Genuinely shared files stay in `content/`.
- **D-03:** `dom-selector-registry`: rename `SKILL.md` → `TOOL.md` and `.skill.ts` → `.tool.ts`.
- **D-04:** Selector internals in `src/content/selector/` (`heal`, `sanitizer`, `validator`, `heuristic` + tests + `__fixtures__`) co-locate into the owning tool folder. Researcher determines `rederive` vs `registry` vs shared.
- **D-05:** Unify codegen — one `generate-skill-registry.ts` produces both generated files; `SkillRegistry` and `ToolRegistry` remain distinct runtime contracts.
- **D-06:** `src/shared/` grouped by concern. Locked folder names: `memory/` (postStore/queue/storage/traceStore + tests), `llm/` (pricing, signals, related), `eval/` (existing folder), `skills/` (existing folder). `types.ts` stays at root.
- **D-07:** Introduce `src/modules/` with `dashboard/`, `evals/`, `popup/` as peer modules.
- **D-08:** Each module owns its internals. `dashboard`: `index.{html,tsx}` + `SelectorView.tsx` + `dataManagement.ts`; `evals`: `evals.{html,tsx}` + `evalsLabeling.ts` + `evalsRunEngine.ts`; `popup`: existing files.
- **D-09:** Build config (vite + vite-plugin-web-extension) and `manifest.json` must be repointed. Highest-risk integration point.

### Claude's Discretion

- Exact per-file ownership determinations (D-02, D-04, D-06) within locked principles and folder names.
- Sequencing/wave breakdown across the five tracks (planner decides).
- Whether to land each track as its own atomic commit (recommended).

### Deferred Ideas (OUT OF SCOPE)

- Full registry unification (one abstraction for skills + tools) — explicitly rejected for this phase.
- `modules/common/` shared UX folder — rejected (nothing shared today).
- Eval-driven tuning / regression gate — deferred from v10.0.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOD-01 | Skill/tool-owned logic moves out of `src/content/`; only cross-cutting utilities remain | Track 1 file inventory + importer list |
| MOD-02 | `dom-selector-registry` follows tool convention (TOOL.md + .tool.ts); selector internals co-located | Track 2 rename map + ownership table |
| MOD-03 | One shared codegen produces both generated modules; SkillRegistry/ToolRegistry stay distinct | Track 3 — codegen already unified; D-05 is satisfied |
| MOD-04 | `src/shared/` grouped into `memory/`, `llm/`, `eval/`, `skills/` subfolders | Track 4 file-to-folder table + importer repoint list |
| MOD-05 | `src/modules/{dashboard,evals,popup}/` exist; build config resolves all three | Track 5 file inventory + vite/manifest repoint map |
</phase_requirements>

---

## Summary

Phase 33 is a pure mechanical refactor across five independent tracks. All logic already exists; nothing new is written. The primary risk is broken import paths and the Vite build config for the UX module split.

**Track independence:** Tracks 1, 2, 4, and 5 are fully independent and can be sequenced in any order or parallelized. Track 3 (codegen unification) is already done — `generate-skill-registry.ts` currently produces both `generated-skill-registry.ts` and `generated-tool-registry.ts` in a single run. D-05 is trivially satisfied and requires no code change.

**Key finding for Track 1 (detector migration):** `heuristic.ts` and `llm.ts` are already thin re-export barrels pointing to their skill folders. The D-01 move for these two files is: delete the barrel, update the 3 import sites to use the skill folder path directly. `signals/profile.ts` is a genuine content-pipeline file (imports `resolve()` from selector-registry and is called directly by `content/index.ts`) — true ownership: this is a profile-signal extractor that uses the SelectorRegistry single-writer, making it shared infra. See Track 1 analysis.

**Key finding for Track 2 (D-03/D-04):** The `dom-selector-registry` rename is a 2-file operation. The selector internals (`heal`, `sanitizer`, `validator`, `heuristic`) belong to `dom-selector-rederive` because `heal.ts` is the orchestrator that calls all four; `dom-selector-registry` (the runtime registry singleton) has no dependency on them.

**Key finding for Track 5 (UX):** The highest-risk change. `vite-plugin-web-extension` discovers entry points from `manifest.json` plus `additionalInputs`. Three repoints required: `manifest.json` `options_ui.page`, `web_accessible_resources[0].resources`, and `vite.config.ts` `additionalInputs`. The HTML files themselves contain relative script paths that must match the new locations.

**Primary recommendation:** Execute tracks in order: T2 (smallest, de-risks D-03/D-04) → T1 (delete barrels) → T4 (shared/ regroup) → T3 (verify D-05 is no-op) → T5 (UX split, most risk).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Heuristic detection orchestration | Skills library (`detect-aiwriting-heuristic`) | — | Already there; barrel in `content/detector/heuristic.ts` is the only artifact left |
| LLM detection relay | Skills library (`detect-aiwriting-llm`) | Service worker (fetch) | Same; barrel in `content/detector/llm.ts` is the only artifact left |
| Profile signal extraction | `src/content/` (shared infra) | — | Calls `resolve()` from SelectorRegistry; used by `content/index.ts`; cannot move without violating CLAUDE.md #1 |
| Comment expansion | `src/content/` (shared infra) | — | DOM I/O + page-scope state; used by `content/index.ts` directly |
| Language detection | `src/content/` (shared infra) | — | Used by `content/exclusions.ts` AND `exclude-non-english` skill; genuinely shared |
| Tombstone injection | `src/content/` (shared infra) | — | Pure DOM write; used only by `content/index.ts`; cross-cutting content pipeline |
| Self-healing orchestration | `dom-selector-rederive` tool | — | `heal.ts` depends on rederiver; co-locate with it |
| DOM sanitizer / validator / heuristic re-deriver | `dom-selector-rederive` tool | — | Only called from `heal.ts`; owned by rederive not registry |
| Selector runtime singleton | `src/content/selector-registry.ts` | — | CLAUDE.md #1 single-writer; MUST NOT move |
| Storage cluster (postStore/queue/storage/traceStore) | `src/shared/memory/` | — | D-06 locked |
| LLM cost / pricing | `src/shared/llm/` | — | D-06 locked |
| Eval core | `src/shared/eval/` | — | Already a folder; stays |
| Skill/tool contracts | `src/shared/skills/` | — | Already a folder; stays |
| Dashboard UX | `src/modules/dashboard/` | — | D-07/D-08 locked |
| Evals UX | `src/modules/evals/` | — | D-07/D-08 locked |
| Popup UX | `src/modules/popup/` | — | D-07/D-08 locked |

---

## Track 1: Detector Migration (D-01 / D-02)

### Ownership Analysis

| File | Current Location | True Owner | Decision | Rationale |
|------|-----------------|------------|----------|-----------|
| `heuristic.ts` | `src/content/detector/heuristic.ts` | `detect-aiwriting-heuristic` skill | **Delete barrel; repoint importers** | Already a thin re-export of `../../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill` |
| `llm.ts` | `src/content/detector/llm.ts` | `detect-aiwriting-llm` skill | **Delete barrel; repoint importers** | Already a thin re-export of `../../skills/library/detect-aiwriting-llm/detect-aiwriting-llm.skill` |
| `signals/profile.ts` | `src/content/detector/signals/profile.ts` | Shared infra | **Stays in `src/content/`** | Imports `resolve()` from `selector-registry`; called directly by `content/index.ts`; cannot be in a skill folder without importing content/selector-registry from a skill (that import path is valid, but the file is genuinely shared by the content pipeline, not skill-owned). D-02 "genuinely shared → stays in content/". |
| `rederiver.ts` | `src/content/detector/rederiver.ts` | `dom-selector-rederive` tool | **Move to tool folder** | Pure message-relay to the service worker; `LLMRederiver` class. `heal.ts` imports from it already via `'../detector/rederiver'`. Co-locate it in the tool folder. |
| `comment-expand.ts` | `src/content/detector/comment-expand.ts` | Shared infra | **Stays in `src/content/`** | DOM I/O + page-scope mutable counter; used by `content/index.ts`; cross-cutting content pipeline utility |
| `language.ts` | `src/content/detector/language.ts` | Shared infra | **Stays in `src/content/`** | Used by `content/exclusions.ts` (legacy) AND by `exclude-non-english` skill (`import { isNonEnglish } from '../../../content/detector/language'`); genuinely shared |
| `tombstone.ts` | `src/content/detector/tombstone.ts` | Shared infra | **Stays in `src/content/`** | DOM injection; used only by `content/index.ts`; cross-cutting content pipeline utility |

**After Track 1:** The `src/content/detector/` folder retains: `signals/profile.ts`, `comment-expand.ts`, `language.ts`, `tombstone.ts`, and their tests (`heuristic.test.ts`, `language.test.ts`, `tombstone.test.ts`). The `heuristic.ts` and `llm.ts` barrels are deleted; their tests (`heuristic.test.ts` at current path) import the barrel — after deletion that test must be repointed or co-located with the skill.

**Note on `heuristic.test.ts`:** Located at `src/content/detector/heuristic.test.ts`. It imports from `./heuristic` (the barrel). After barrel deletion, two options: (a) move test to skill folder and update import, or (b) keep test at current path and update import to full skill path. Option (b) is simpler and preserves test discovery (vitest scans `src/**/*.test.ts`).

### Broken Importers After Barrel Deletion

**`heuristic.ts` barrel — 3 importers:**

| Importer | Current import | New import |
|----------|---------------|------------|
| `src/content/index.ts` L5 | `import { HeuristicDetector } from './detector/heuristic'` | `import { HeuristicDetector } from '../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill'` |
| `src/dashboard/evals.tsx` L18 | `import { HeuristicDetector } from '../content/detector/heuristic'` | `import { HeuristicDetector } from '../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill'` |
| `scripts/eval.ts` L30 | `import { HeuristicDetector } from '../src/content/detector/heuristic.js'` | `import { HeuristicDetector } from '../src/skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill.js'` |
| `src/content/detector/heuristic.test.ts` (implicit) | imports `./heuristic` | update to skill folder path |

**`llm.ts` barrel — 1 importer:**

| Importer | Current import | New import |
|----------|---------------|------------|
| `src/content/index.ts` L6 | `import { LLMDetector } from './detector/llm'` | `import { LLMDetector } from '../skills/library/detect-aiwriting-llm/detect-aiwriting-llm.skill'` |

**`rederiver.ts` move — importers:**

| Importer | Current import | New import after move to `src/tools/library/dom-selector-rederive/rederiver.ts` |
|----------|---------------|-----------|
| `src/content/selector/heal.ts` L29 | `import { LLMRederiver } from '../detector/rederiver'` | `import { LLMRederiver } from '../../tools/library/dom-selector-rederive/rederiver'` |
| `src/content/detector/rederiver.ts` also re-exports `RederiveCandidate` from the tool; after move, the `RederiveCandidate` type stays in `dom-selector-rederive.tool.ts` |

**Note on `rederiver.ts` destination:** The `dom-selector-rederive` tool folder already contains `dom-selector-rederive.tool.ts`. `rederiver.ts` (the `LLMRederiver` message-relay class) is a separate file. It co-locates as `src/tools/library/dom-selector-rederive/rederiver.ts`. `heal.ts` already imports `LLMRederiver` from it indirectly; the import path just changes.

**`signals/profile.ts` — no move; no import path changes needed.**

---

## Track 2: Selector Internals + dom-selector-registry Rename (D-03 / D-04)

### D-03: dom-selector-registry File Rename

**Current files:**

| Current path | Rename to |
|-------------|-----------|
| `src/tools/library/dom-selector-registry/SKILL.md` | `src/tools/library/dom-selector-registry/TOOL.md` |
| `src/tools/library/dom-selector-registry/dom-selector-registry.skill.ts` | `src/tools/library/dom-selector-registry/dom-selector-registry.tool.ts` |

**TOOL.md content:** The new TOOL.md must preserve the existing frontmatter content (name, description, metadata.kind: tool). The current SKILL.md already has `metadata.kind: tool` — only the filename changes.

**Importers of `dom-selector-registry.skill.ts`:**
The current `.skill.ts` file is a thin re-export and is NOT imported anywhere at runtime (confirmed: it exists "for tool-library convention completeness only — NOT wired into any tool array and NOT imported anywhere at runtime"). Renaming to `.tool.ts` breaks no import.

**Codegen impact:** `generate-skill-registry.ts` reads `TOOL.md` for the tools bucket. The `dom-selector-registry` folder is NOT in `skill-order.json` tools array (it is metadata-only, no execute()). The codegen only processes `TOOL.md` for folders in `skill-order.json`; the rename of this file does not affect codegen output. Verify by running `npm run check-skill-registry` after rename — output should be identical.

### D-04: Selector Internals Ownership

**Ownership determination:**

| File | Dependency chain | Owner | Decision |
|------|-----------------|-------|----------|
| `src/content/selector/heuristic.ts` | Called by `heal.ts` only | `dom-selector-rederive` | Move into tool folder |
| `src/content/selector/sanitizer.ts` | Called by `heal.ts` only | `dom-selector-rederive` | Move into tool folder |
| `src/content/selector/validator.ts` | Called by `heal.ts` only | `dom-selector-rederive` | Move into tool folder |
| `src/content/selector/heal.ts` | Called by `content/observer.ts` only; orchestrates rederive flow | `dom-selector-rederive` | Move into tool folder |
| `__fixtures__/*.html` | Test fixtures used by `heal.test.ts`, `heuristic.test.ts`, `sanitizer.test.ts`, `validator.test.ts` | `dom-selector-rederive` | Move into tool folder `__fixtures__/` |

**Rationale:** `heal.ts` depends on `heuristic.ts`, `sanitizer.ts`, `validator.ts`, and `rederiver.ts` (Track 1). `dom-selector-registry` (the runtime singleton at `content/selector-registry.ts`) has zero dependency on any of these files. They are all part of the rederive capability, not the registry capability.

**CRITICAL:** `dom-selector-registry` is the **runtime singleton** at `src/content/selector-registry.ts` — that file MUST NOT MOVE (CLAUDE.md #1). The `src/tools/library/dom-selector-registry/` tool folder is a thin re-export wrapper. The selector internals do NOT belong to the registry tool folder; they belong to rederive.

**Destination after move:**

```
src/tools/library/dom-selector-rederive/
  TOOL.md
  dom-selector-rederive.tool.ts      (existing)
  dom-selector-rederive.test.ts      (existing)
  rederiver.ts                       (moved from content/detector/ — Track 1)
  heal.ts                            (moved from content/selector/)
  heuristic.ts                       (moved from content/selector/)
  sanitizer.ts                       (moved from content/selector/)
  validator.ts                       (moved from content/selector/)
  heal.test.ts                       (moved from content/selector/)
  heuristic.test.ts                  (moved from content/selector/)
  sanitizer.test.ts                  (moved from content/selector/)
  validator.test.ts                  (moved from content/selector/)
  __fixtures__/
    feed-abvariant-a.html
    feed-abvariant-b.html
    feed-broken-classrot.html
    feed-empty.html
    feed-healthy.html
    feed-jobcards.html
    feed-loggedout.html
    feed-pii-rich.html
    feed-promoted.html
    feed-skeleton.html
```

**Internal import updates after move (relative paths change):**

| File | Old import | New import |
|------|-----------|-----------|
| `heal.ts` | `import { resolve, insertCandidate } from '../selector-registry'` | `import { resolve, insertCandidate } from '../../../content/selector-registry'` |
| `heal.ts` | `import { deriveHeuristicCandidates } from './heuristic'` | unchanged (same folder) |
| `heal.ts` | `import { validateCandidate } from './validator'` | unchanged |
| `heal.ts` | `import { buildDomSkeleton } from './sanitizer'` | unchanged |
| `heal.ts` | `import { LLMRederiver } from '../detector/rederiver'` | `import { LLMRederiver } from './rederiver'` (after Track 1 moves rederiver here) |
| `heal.ts` | `import { storageGet } from '../../shared/storage'` | `import { storageGet } from '../../../shared/storage'` (or `../../../shared/memory/storage` after Track 4) |
| `heuristic.ts` | `import { resolve } from '../selector-registry'` | `import { resolve } from '../../../content/selector-registry'` |
| `heal.test.ts` | `import { storageGet } from '../../shared/storage'` | update to new path |
| `__fixtures__/` | relative refs from test files | update `'../__fixtures__/...'` in tests |

**Importer of heal.ts after move:**

| Importer | Old import | New import |
|----------|-----------|-----------|
| `src/content/observer.ts` L15 | `import { triggerHeal, isFeedUrl, hasFeedContainer } from './selector/heal'` | `import { triggerHeal, isFeedUrl, hasFeedContainer } from '../tools/library/dom-selector-rederive/heal'` |

**Track 2 MUST be sequenced with Track 1** (or treated as a single atomic commit) because `heal.ts` imports `LLMRederiver` from `'../detector/rederiver'` which Track 1 moves.

---

## Track 3: Registry Codegen Unification (D-05)

### Status: Already Done

`scripts/generate-skill-registry.ts` already produces BOTH output files in a single run:
- Line 268: `fs.writeFileSync(outputPath, output)` → `src/content/generated-skill-registry.ts`
- Line 327: `fs.writeFileSync(toolOutputPath, toolLines.join('\n'))` → `src/shared/generated-tool-registry.ts`

This is a single script, a single `tsx scripts/generate-skill-registry.ts` invocation. D-05 is satisfied by the current codebase. There is no "tool-registry generation path" separate from the skill registry script.

**What the planner should do for MOD-03:** Verify by running `npm run generate-skill-registry` and confirming both files regenerate. The AUTHORING.md comment at line 19 of tool-registry.ts still reads `src/skills/library/<name>/` (stale — tools moved to `src/tools/library/` in the post-32 refactor). Update that comment as part of this track.

**Stale-check guard verification:** Both `check-skill-registry` and `check-tool-registry` run `npm run generate-skill-registry && git diff --exit-code <file>`. After Tracks 1 and 2 move files around, run both commands to confirm generated files are still clean.

**No code changes required for D-05 itself.** Track 3 is a documentation + stale-check verification step only.

---

## Track 4: src/shared/ Regroup (D-06)

### Current File Inventory

```
src/shared/
  eval/                  (existing folder — stays as-is)
    evalRunStore.test.ts
    evalRunStore.ts
    index.ts
    metrics.test.ts
    metrics.ts
    runs.test.ts
    runs.ts
  skills/                (existing folder — stays as-is)
    pattern-runner.ts
    tool-contract.test-types.ts
    types.ts
  generated-tool-registry.test.ts
  generated-tool-registry.ts
  postStore.test.ts
  postStore.ts
  pricing.test.ts
  pricing.ts
  queue.ts
  signals.ts
  storage.ts
  tool-registry.ts
  traceStore.test.ts
  traceStore.ts
  types.ts
```

### File-to-Folder Assignment

| File | Destination | Rationale |
|------|-------------|-----------|
| `postStore.ts` | `src/shared/memory/postStore.ts` | D-06: storage cluster |
| `postStore.test.ts` | `src/shared/memory/postStore.test.ts` | co-located test |
| `queue.ts` | `src/shared/memory/queue.ts` | D-06: storage cluster |
| `storage.ts` | `src/shared/memory/storage.ts` | D-06: storage cluster |
| `traceStore.ts` | `src/shared/memory/traceStore.ts` | D-06: storage cluster |
| `traceStore.test.ts` | `src/shared/memory/traceStore.test.ts` | co-located test |
| `pricing.ts` | `src/shared/llm/pricing.ts` | D-06: LLM-cost/usage concern |
| `pricing.test.ts` | `src/shared/llm/pricing.test.ts` | co-located test |
| `signals.ts` | `src/shared/llm/signals.ts` | D-06: LLM-related signal classification |
| `types.ts` | `src/shared/types.ts` | D-06: stays at root (neutral, cross-cutting) |
| `generated-tool-registry.ts` | `src/shared/generated-tool-registry.ts` | Stays at root — codegen emits it here (changing output path breaks codegen script; update script if moved) |
| `generated-tool-registry.test.ts` | `src/shared/generated-tool-registry.test.ts` | Stays with generated file |
| `tool-registry.ts` | `src/shared/tool-registry.ts` | Stays at root — consumed by `src/background/index.ts`; low value in moving |
| `eval/` | `src/shared/eval/` | stays — already a folder |
| `skills/` | `src/shared/skills/` | stays — already a folder |

**Note on `generated-tool-registry.ts` and `tool-registry.ts`:** These could optionally move into a `src/shared/tools/` subfolder, but D-06 only locks four folder names (`memory/`, `llm/`, `eval/`, `skills/`). The generated registry and tool-registry singleton are codegen artifacts — keeping them at the root avoids changing the codegen script output path. Leave at root unless there is a specific reason to move.

**Note on `signals.ts`:** Contains `AI_LANGUAGE_SIGNALS` — a `Set` of signal key strings used by `content/index.ts`. It is LLM-signal-classification related. Placing in `llm/` is consistent with D-06.

### Importer Repoint Table

After moving files to subfolders, all importers need updated paths. Full list:

**`storage.ts` → `memory/storage.ts`** (most widely imported):

| Importer | Old import | New import |
|----------|-----------|-----------|
| `src/background/index.ts` L6 | `from '../shared/storage'` | `from '../shared/memory/storage'` |
| `src/content/index.ts` L11 | `from '../shared/storage'` | `from '../shared/memory/storage'` |
| `src/content/selector/heal.ts` | `from '../../shared/storage'` | (changes again in Track 2 — use Track 2 final path) |
| `src/content/selector-registry.ts` | `from '../shared/storage'` | `from '../shared/memory/storage'` |
| `src/content/skill-registry.ts` | `from '../shared/storage'` | `from '../shared/memory/storage'` |
| `src/dashboard/index.tsx` L7 | `from '../shared/storage'` | `from '../shared/memory/storage'` |
| `src/shared/postStore.ts` (before move) | `from './storage'` | `from './storage'` (relative — unchanged if both are in memory/) |
| `src/shared/queue.ts` (before move) | `from './storage'` | `from './storage'` (unchanged if both in memory/) |
| `src/shared/traceStore.ts` (before move) | `from './storage'` | `from './storage'` (unchanged if both in memory/) |

**`postStore.ts` → `memory/postStore.ts`**:

| Importer | Old import | New import |
|----------|-----------|-----------|
| `src/content/index.ts` L13 | `from '../shared/postStore'` | `from '../shared/memory/postStore'` |
| `src/dashboard/evalsLabeling.ts` | `from '../shared/postStore'` | `from '../shared/memory/postStore'` |
| `src/dashboard/evals.test.ts` | `from '../shared/postStore'` | `from '../shared/memory/postStore'` |

**`queue.ts` → `memory/queue.ts`**:

| Importer | Old import | New import |
|----------|-----------|-----------|
| `src/content/index.ts` L12 | `from '../shared/queue'` | `from '../shared/memory/queue'` |

**`traceStore.ts` → `memory/traceStore.ts`**:

| Importer | Old import | New import |
|----------|-----------|-----------|
| `src/background/index.ts` L5 | `from '../shared/traceStore'` | `from '../shared/memory/traceStore'` |

**`pricing.ts` → `llm/pricing.ts`**:

| Importer | Old import | New import |
|----------|-----------|-----------|
| `src/background/index.ts` L4 | `from '../shared/pricing'` | `from '../shared/llm/pricing'` |
| `src/dashboard/evals.tsx` L19 | `from '../shared/pricing'` | `from '../shared/llm/pricing'` |
| `scripts/eval.ts` L13 | `from '../src/shared/pricing.js'` | `from '../src/shared/llm/pricing.js'` |
| `scripts/trace-summary.ts` L8 | `from '../src/shared/pricing.js'` | `from '../src/shared/llm/pricing.js'` |

**`signals.ts` → `llm/signals.ts`**:

| Importer | Old import | New import |
|----------|-----------|-----------|
| `src/content/index.ts` L14 | `from '../shared/signals'` | `from '../shared/llm/signals'` |

**`pattern-runner.ts` imports `detectionConfig`** — verify path after Track 4:
`src/shared/skills/pattern-runner.ts` imports `detectionConfig` from `'../../skills/library/detect-aiwriting-heuristic/detectionConfig'`. This path is relative to `src/shared/skills/` → `src/`. After Track 4, `pattern-runner.ts` stays in `src/shared/skills/` — no change needed.

---

## Track 5: UX Modules Split (D-07 / D-08 / D-09)

### Current File Inventory

```
src/dashboard/
  SelectorView.tsx
  dataManagement.test.ts
  dataManagement.ts
  evals.html
  evals.test.ts
  evals.tsx
  evalsLabeling.ts
  evalsRunEngine.ts
  index.html
  index.tsx

src/popup/
  AccountRow.tsx
  BatchBlockBar.tsx
  index.html
  index.tsx
```

### File-to-Module Mapping

**`src/modules/dashboard/`**:

| Source | Destination |
|--------|-------------|
| `src/dashboard/index.html` | `src/modules/dashboard/index.html` |
| `src/dashboard/index.tsx` | `src/modules/dashboard/index.tsx` |
| `src/dashboard/SelectorView.tsx` | `src/modules/dashboard/SelectorView.tsx` |
| `src/dashboard/dataManagement.ts` | `src/modules/dashboard/dataManagement.ts` |
| `src/dashboard/dataManagement.test.ts` | `src/modules/dashboard/dataManagement.test.ts` |

**`src/modules/evals/`**:

| Source | Destination |
|--------|-------------|
| `src/dashboard/evals.html` | `src/modules/evals/evals.html` |
| `src/dashboard/evals.tsx` | `src/modules/evals/evals.tsx` |
| `src/dashboard/evalsLabeling.ts` | `src/modules/evals/evalsLabeling.ts` |
| `src/dashboard/evalsRunEngine.ts` | `src/modules/evals/evalsRunEngine.ts` |
| `src/dashboard/evals.test.ts` | `src/modules/evals/evals.test.ts` |

**`src/modules/popup/`**:

| Source | Destination |
|--------|-------------|
| `src/popup/index.html` | `src/modules/popup/index.html` |
| `src/popup/index.tsx` | `src/modules/popup/index.tsx` |
| `src/popup/AccountRow.tsx` | `src/modules/popup/AccountRow.tsx` |
| `src/popup/BatchBlockBar.tsx` | `src/modules/popup/BatchBlockBar.tsx` |

### Internal Import Path Updates

All inter-module imports within dashboard files use `'../shared/...'` relative paths. After moving to `src/modules/dashboard/`, the relative depth to `src/shared/` changes from `../shared/` to `../../shared/`. Full update list:

**`src/modules/dashboard/index.tsx`**:
- `from '../shared/types'` → `from '../../shared/types'`
- `from './dataManagement'` → unchanged (same folder)
- `from './SelectorView'` → unchanged
- `from '../content/selector-registry'` → `from '../../content/selector-registry'`
- `from '../shared/storage'` → `from '../../shared/memory/storage'` (combine with Track 4)

**`src/modules/dashboard/dataManagement.ts`**:
- `from '../shared/types'` → `from '../../shared/types'`

**`src/modules/dashboard/SelectorView.tsx`**:
- `from '../shared/types'` → `from '../../shared/types'`

**`src/modules/evals/evals.tsx`**:
- `from '../shared/types'` → `from '../../shared/types'`
- `from '../shared/eval/index'` → `from '../../shared/eval/index'`
- `from '../shared/pricing'` → `from '../../shared/llm/pricing'` (combine with Track 4)
- `from '../content/detector/heuristic'` → `from '../../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill'` (combine with Track 1)

**`src/modules/evals/evalsLabeling.ts`**:
- `from '../shared/postStore'` → `from '../../shared/memory/postStore'` (combine with Track 4)

**`src/modules/evals/evalsRunEngine.ts`**:
- `from '../shared/eval/index'` → `from '../../shared/eval/index'`

**`src/modules/popup/index.tsx`**:
- `from '../shared/types'` → `from '../../shared/types'`
- `from './AccountRow'` → unchanged
- `from './BatchBlockBar'` → unchanged

**`src/modules/popup/AccountRow.tsx`**:
- `from '../shared/types'` → `from '../../shared/types'`

### Vite + vite-plugin-web-extension Repoints (D-09 — Highest Risk)

**Current `vite.config.ts`:**
```typescript
webExtension({
  manifest: 'manifest.json',
  additionalInputs: ['dashboard/evals.html'],
}),
```
The plugin reads `manifest.json` (at `src/manifest.json` because `root: 'src'`) and discovers entry points from it. HTML files declared in `manifest.json` are automatically picked up. `additionalInputs` adds the evals page which is NOT in manifest.

**New `vite.config.ts`:**
```typescript
webExtension({
  manifest: 'manifest.json',
  additionalInputs: ['modules/evals/evals.html'],
}),
```
(`root` stays as `'src'` — paths are relative to root)

**Current `src/manifest.json` — three HTML entry points:**

| Field | Current value | New value |
|-------|-------------|---------|
| `action.default_popup` | `"popup/index.html"` | `"modules/popup/index.html"` |
| `options_ui.page` | `"dashboard/index.html"` | `"modules/dashboard/index.html"` |
| `web_accessible_resources[0].resources[0]` | `"dashboard/evals.html"` | `"modules/evals/evals.html"` |

**HTML file script src attributes:**

Each HTML file contains `<script type="module" src="./index.tsx">` or `<script type="module" src="./evals.tsx">`. After the move, the script src is still relative (`./`) and still correct — the `.tsx` file is co-located in the same new folder. No change to HTML src attributes needed.

**Verification step (critical):** After repointing, run `npm run build` and confirm:
1. `dist/modules/popup/index.html` exists and references the popup bundle
2. `dist/modules/dashboard/index.html` exists and references the dashboard bundle
3. `dist/modules/evals/evals.html` exists and references the evals bundle
4. `dist/manifest.json` has updated HTML paths
5. Load the unpacked extension in Chrome: popup opens, dashboard opens via right-click extension options, evals page is accessible

**vite-plugin-web-extension version:** `^4.5.1` (from package.json). At this version, `additionalInputs` paths are relative to the Vite `root` (i.e., relative to `src/`). [ASSUMED — based on plugin convention; verify against plugin docs if unexpected build errors occur.]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying generated registry stays current | Custom hash check | `npm run check-skill-registry` + `npm run check-tool-registry` | Already wired; runs `git diff --exit-code` on generated files |
| Discovering broken imports after moves | Manual grep | `npm run type-check` (tsc --noEmit) | TypeScript reports every broken import at compile time |
| Confirming zero behavior change | Manual testing | `npm test` (vitest) — 36 files / 433 tests | Existing test suite covers detection, exclusion, selector, storage |

---

## Common Pitfalls

### Pitfall 1: Moving selector-registry.ts or its write surface

**What goes wrong:** Track 2 moves selector internals — it is tempting to also consolidate `selector-registry.ts` into the tool folder.
**Why it happens:** The tool folder is called `dom-selector-registry`, so the singleton seems like it belongs there.
**How to avoid:** CLAUDE.md constraint #1 forbids moving the singleton. The tool folder is a thin re-export for convention completeness only. `src/content/selector-registry.ts` MUST NOT move.
**Warning signs:** Any move involving `src/content/selector-registry.ts` itself.

### Pitfall 2: Updating generated files by hand instead of regenerating

**What goes wrong:** After Track 1 or Track 2 moves, the import path in `generated-skill-registry.ts` or `generated-tool-registry.ts` becomes stale.
**Why it happens:** The generated files are committed; developers may edit them directly.
**How to avoid:** Always run `npm run generate-skill-registry` after any move of a skill/tool file. Commit the regenerated output. Run `npm run check-skill-registry && npm run check-tool-registry` before committing.
**Warning signs:** `check-skill-registry` or `check-tool-registry` exits non-zero.

### Pitfall 3: Vite path resolution with wrong relative paths after UX split

**What goes wrong:** Build succeeds but the extension fails to load a page at runtime because `manifest.json` still points to old paths, or `additionalInputs` in vite.config was not updated.
**Why it happens:** vite-plugin-web-extension resolves HTML entry points from `manifest.json` and `additionalInputs`, both relative to `root: 'src'`. If either is stale, the HTML file is not bundled.
**How to avoid:** Update both `manifest.json` and `vite.config.ts additionalInputs` atomically. Run `npm run build` and verify all three HTML files appear in `dist/`.
**Warning signs:** `dist/` contains old path structure (e.g., `dist/dashboard/`) instead of `dist/modules/`.

### Pitfall 4: Track 2 and Track 1 ordering conflict on rederiver.ts

**What goes wrong:** `heal.ts` imports `LLMRederiver` from `'../detector/rederiver'`. If Track 2 moves `heal.ts` before Track 1 moves `rederiver.ts`, the import path in the moved `heal.ts` will still point to the old location.
**How to avoid:** Execute Track 1 (move/delete detector files) before OR in the same atomic commit as Track 2 (move selector internals). Alternatively, execute as a single combined Track 1+2 commit and update all paths in one pass.
**Warning signs:** Type-check fails with "Cannot find module '../detector/rederiver'" after Track 2.

### Pitfall 5: signals.ts import named collision

**What goes wrong:** `src/content/index.ts` imports `AI_LANGUAGE_SIGNALS` from `'../shared/signals'`. After Track 4 moves signals.ts to `llm/`, the import path becomes `'../shared/llm/signals'`. If Track 4 runs but `content/index.ts` is not updated, tsc will report a missing module.
**Warning signs:** Type-check fails on `content/index.ts` after Track 4.

### Pitfall 6: Test files not discovered after moves

**What goes wrong:** Co-located tests in tool folders or module folders might not be picked up by vitest if the path is outside `src/`.
**How to avoid:** `vitest.config.ts` already includes `src/**/*.test.ts` — all moved test files remain under `src/` so discovery is unchanged. The `scripts/**/*.test.ts` pattern covers script tests. No vitest config change needed.

---

## Track Sequencing Recommendation

**Recommended order (each track = one atomic commit):**

```
T2 (D-03/D-04) → T1 (D-01/D-02) → T4 (D-06) → T3 (D-05 verify) → T5 (D-07/D-08/D-09)
```

**Rationale:**
- T2 before T1: T2 moves `heal.ts` which imports from `content/detector/rederiver`. Do T2's internal import updates to expect `rederiver.ts` in the tool folder, then T1 moves it there. OR combine T1+T2 as a single commit.
- T4 is independent of T1/T2/T5.
- T3 is a verify step only; run after all file moves.
- T5 last because it requires build verification (the most integration-test-heavy step).

**Alternative:** T1+T2 as a single combined commit (avoids the rederiver path sequencing issue entirely). T4 and T5 are fully independent of each other and of T1/T2.

**Independent pairs (can run in any order or in parallel branches):**
- T4 (shared/ regroup) is independent of T1, T2, T5.
- T5 (UX modules) is independent of T1, T2, T4.
- T1+T2 (detector/selector moves) are coupled to each other via `rederiver.ts`.

---

## Per-Track Verification Recipe

Each track must pass this gate before the next track begins:

```bash
# After every track:
npm test && npm run type-check

# After tracks involving skill/tool file moves (T1, T2):
npm run check-skill-registry && npm run check-tool-registry

# After Track 5 (UX split) — additionally:
npm run build
# Then manually: load dist/ as unpacked extension, verify all 3 pages load
```

**What `npm test` covers:**
- `src/**/*.test.ts` — all co-located tests including moved ones (vitest auto-discovers)
- `scripts/**/*.test.ts` — eval/compare/label script tests
- Golden-score snapshot (heuristic.test.ts)
- Exclusion parity test (exclusions.test.ts)
- Order-pinning + kind-drift-guard (generated-skill-registry.test.ts)
- Tool registry tests (generated-tool-registry.test.ts)

**What `npm run type-check` covers:**
- Every broken import path (tsc --noEmit strict mode)
- Type compatibility of moved files

**Detection golden-score gate:** The `heuristic.test.ts` golden-score snapshot (`toStrictEqual` on `signalBreakdown`) is already exercised by `npm test`. Since Tracks 1-4 do not touch any detection logic, this test passing implies byte-identical detection outcomes.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure file-move refactor; all tools are already available in the project's `npm` scripts).

---

## Package Legitimacy Audit

Not applicable — this phase installs no new packages. All dependencies are already in `package.json`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vite-plugin-web-extension@^4.5.1` resolves `additionalInputs` paths relative to `root: 'src'` | Track 5 / Vite repoints | Build may fail or bundle wrong HTML if path convention differs; run `npm run build` to verify |
| A2 | `signals.ts` belongs in `llm/` (contains `AI_LANGUAGE_SIGNALS`, a signal-classification constant) | Track 4 / file assignment | Low risk — D-06 only requires grouping by concern; worst case it stays at root |

---

## Open Questions

1. **`heuristic.test.ts` relocation (Track 1)**
   - What we know: currently at `src/content/detector/heuristic.test.ts`; imports the barrel `./heuristic`.
   - What's unclear: after barrel deletion, should the test stay at `content/detector/` (updating import to skill path) or move to skill folder?
   - Recommendation: keep test at current path, update import. Avoids touching the skill folder and keeps the test discovery path unchanged.

2. **`generated-tool-registry.ts` path after Track 4**
   - What we know: `generate-skill-registry.ts` hardcodes `outputPath = path.join(repoRoot, 'src', 'shared', 'generated-tool-registry.ts')`. If the file is moved to a subfolder, the codegen script must be updated.
   - Recommendation: leave `generated-tool-registry.ts` and `tool-registry.ts` at `src/shared/` root (not in a subfolder) to avoid changing the codegen output path. D-06 does not lock a subfolder for these files.

---

## Sources

### Primary (HIGH confidence — verified by direct file inspection)

All findings verified by reading actual source files in `C:\Git\linkedin.blocker\src\`, `scripts\`, `vite.config.ts`, `vitest.config.ts`, `package.json`, `src/manifest.json`, and `.planning/` documentation during this research session. No external documentation lookup was needed — this is a pure codebase inventory.

- `src/content/detector/heuristic.ts` — confirmed thin re-export
- `src/content/detector/llm.ts` — confirmed thin re-export
- `src/content/selector/heal.ts` — confirmed importer chain (heuristic, sanitizer, validator, rederiver)
- `src/tools/library/dom-selector-registry/dom-selector-registry.skill.ts` — confirmed not imported at runtime
- `scripts/generate-skill-registry.ts` — confirmed single script produces both generated files (D-05 satisfied)
- `vite.config.ts` — confirmed current `additionalInputs` and `root` config
- `src/manifest.json` — confirmed all three HTML entry points
- `vitest.config.ts` — confirmed `include` patterns

---

## Metadata

**Confidence breakdown:**
- Track 1 (detector migration): HIGH — barrel files verified by direct read; importer list from grep
- Track 2 (selector internals + registry rename): HIGH — dependency chain verified by reading heal.ts and all four internals
- Track 3 (codegen unification): HIGH — codegen script verified to produce both outputs in single run; D-05 is already satisfied
- Track 4 (shared/ regroup): HIGH — all files inventoried; importer list from grep
- Track 5 (UX split): HIGH for file moves; MEDIUM for vite-plugin-web-extension path resolution convention [A1]

**Research date:** 2026-06-17
**Valid until:** Stable (no external dependencies; pure codebase fact)
