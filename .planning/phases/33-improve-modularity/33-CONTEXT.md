# Phase 33: Improve Modularity - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Finish the skill/tool modularity migration that Phases 29–32 (and the post-32 refactor commits) started, so that every detection skill, tool, and UX surface is genuinely self-contained. This phase relocates and regroups existing code; it does **not** add detection capabilities, change scoring, or alter behavior.

**In scope:**
- Pull skill/tool-owned logic out of `src/content/detector/` and `src/content/selector/` into its owning skill/tool folder.
- Finish the `dom-selector-registry` tool migration (naming + co-located internals).
- Unify the registry codegen mechanism (keep two runtime registries).
- Reorganize `src/shared/` into concern-based subfolders.
- Split the bundled `src/dashboard/` (dashboard + evals) and `src/popup/` into self-contained `src/modules/` modules.

**Out of scope (new capabilities — belong elsewhere):**
- Any change to detection logic, signals, thresholds, or scoring.
- New profile/engagement scraping or new UX surfaces.
- Eval-driven tuning / regression gate (already deferred from v10.0).

**Locked guardrail:** **Zero behavior change.** The full test suite stays green (433 tests at phase start) and detection outcomes are byte-identical — same posts excluded/flagged, same scores. This mirrors the guardrail on every refactor since Phase 29 and was treated as a given, not re-discussed.
</domain>

<decisions>
## Implementation Decisions

### Detector migration (`src/content/detector/`)
- **D-01:** Principle = **owned logic moves, infra stays.** Skill-owned logic (`heuristic.ts`, `llm.ts`, `signals/profile.ts`) moves into its owning skill folder under `src/skills/library/`; tool-owned logic (`rederiver.ts`) moves to the `dom-selector-rederive` tool; genuinely cross-cutting DOM/content pipeline utilities (`comment-expand.ts`, `language.ts`, `tombstone.ts`) stay in `src/content/` as shared infrastructure.
- **D-02:** Planner/researcher must verify true ownership before moving each file (some `content/detector/*` files may already be thin re-exports of the skill folder versions, or shared by the content pipeline). When a file is genuinely shared, it stays in `content/` — do not force awkward single-ownership.

### Tool migration (`dom-selector-registry`)
- **D-03:** Bring `dom-selector-registry` to the same convention as `dom-selector-rederive`: rename `SKILL.md` → `TOOL.md` and `.skill.ts` → `.tool.ts`.
- **D-04:** Selector internals currently in `src/content/selector/` (`heal`, `sanitizer`, `validator`, `heuristic` + their tests and `__fixtures__`) **co-locate into the tool folders** so each tool is self-contained, matching the skill convention. Researcher to determine which internals belong to `rederive` vs `registry` vs are shared between both (if genuinely shared, pick the owning tool and import, rather than duplicate).

### Registry + codegen
- **D-05:** **Unify the codegen, keep the registries distinct.** One shared generator/codegen mechanism produces both the skill and tool generated modules (replacing the duplicated generation logic across `generate-skill-registry` and the tool-registry equivalent). `SkillRegistry` and `ToolRegistry` remain separate runtime contracts — the Phase 32 skill/tool distinction is preserved, not collapsed.

### `src/shared/` reorganization
- **D-06:** **Group by concern** into subfolders. Naming is locked:
  - **`memory/`** — the storage cluster (`postStore`, `queue`, `storage`, `traceStore`, and their tests). *(User explicitly chose "Memory" over "storage" as the folder name.)*
  - **`llm/`** — LLM-cost/usage concerns (`pricing`, `signals`, and related).
  - **`eval/`** — existing eval core (already a folder).
  - **`skills/`** — existing skill/tool contracts (already a folder: `pattern-runner`, `types`, `tool-contract`).
  - `types.ts` stays at the `src/shared/` root (neutral, cross-cutting).
  - Researcher to finalize exact file→folder assignment; the four folder names above are fixed.

### UX modules (`src/modules/`)
- **D-07:** Introduce a top-level **`src/modules/`** folder with **all three** UX surfaces as peer modules: `src/modules/dashboard/`, `src/modules/evals/`, `src/modules/popup/`. The currently-bundled `src/dashboard/` (which holds both the dashboard and the evals app) splits into `dashboard` and `evals` modules; `src/popup/` also moves under `modules/` for consistency.
- **D-08:** **Each module owns its own internals** — no shared/common UX folder. `dashboard` gets `index.{html,tsx}` + `SelectorView.tsx` + `dataManagement.ts`; `evals` gets `evals.{html,tsx}` + `evalsLabeling.ts` + `evalsRunEngine.ts`; `popup` gets its existing files. Nothing is actually shared between them today, so each module is self-contained like the skills.
- **D-09:** Build config (vite + vite-plugin-web-extension) and `manifest.json` HTML entry points must be repointed for all three modules. This is the main non-mechanical risk in the UX split — verify the built extension loads all three pages.

### Claude's Discretion
- Exact per-file ownership determinations (D-02, D-04, D-06) within the locked principles and folder names.
- Sequencing/wave breakdown across the five tracks (planner decides; the five tracks are largely independent and can be separate plans).
- Whether to land each track as its own atomic commit (recommended, given zero-behavior-change verification per track).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & success criteria
- `.planning/ROADMAP.md` § "Phase 33: Improve Modularity" — goal, success criteria (6 items), and the v11.0 milestone framing.

### Architecture constraints
- `CLAUDE.md` — project guide; note Critical Constraint #1 (selector strings only in `selectors.ts`, runtime via `SelectorRegistry`) which the selector-internal moves (D-04) must not violate.
- `.planning/PROJECT.md` § Key Decisions — the v7.0 selector seed-vs-runtime split, v9.0 shared classifier/eval core, and the skill/tool architecture decisions this phase extends.

### Skill/tool conventions (the target conventions to mirror)
- `src/skills/library/AUTHORING.md` — skill folder convention + SKILL.md manifest format (the self-contained-skill standard this phase finishes applying). *(Confirm exact path during scout.)*
- `src/tools/library/dom-selector-rederive/TOOL.md` — the reference tool layout (`TOOL.md` + `.tool.ts`) that `dom-selector-registry` must be brought to (D-03).
- `scripts/generate-skill-registry.ts` + `scripts/skill-order.json` — the existing skill codegen; the unified codegen (D-05) generalizes this.

### Prior-phase records (point-in-time; paths may predate post-32 refactors)
- `.planning/phases/31-skill-library-alignment/31-PATTERNS.md` — pattern map for the skill-library restructure (analogs for skill folder moves).
- `.planning/STATE.md` § "Roadmap Evolution" — the post-32 refactor log (self-contained skills, `detect-*` renames, tools relocated to `src/tools/library/`) that this phase continues.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets / patterns to mirror
- **Skill folder convention** — `src/skills/library/<name>/` with co-located impl + unit test + `SKILL.md` (e.g. `detect-aiwriting-heuristic/`, with nested `signals/<name>/`). The detector-migration moves (D-01) should land logic into this exact shape.
- **Tool folder convention** — `src/tools/library/dom-selector-rederive/` = `TOOL.md` + `<name>.tool.ts` + test. This is the target shape for `dom-selector-registry` (D-03) and for selector internals (D-04).
- **Codegen pattern** — `scripts/generate-skill-registry.ts` reads `skill-order.json` and emits `src/content/generated-skill-registry.ts` (committed). The tool side has the parallel `src/shared/generated-tool-registry.ts` + `src/shared/tool-registry.ts`. D-05 unifies the *generation*, not the two registries.

### Integration points / blast radius
- `src/content/index.ts`, `observer.ts` — content pipeline consumers; imports break when `content/detector/*` files move (D-01). Repoint by full path.
- `scripts/eval.ts`, `scripts/trace-summary.ts`, `pattern-runner` — import shared modules; affected by the `src/shared/` regroup (D-06).
- `vite.config` + `vite-plugin-web-extension` + `manifest.json` — HTML/entry resolution; affected by the `src/modules/` split (D-07/D-09). Highest-risk integration point.
- Generated registry files (`generated-skill-registry.ts`, `generated-tool-registry.ts`) are committed — regenerate + verify the stale-check/CI guard after codegen unification (D-05).

### Verification anchors (for the zero-behavior-change guardrail)
- Full suite at phase start: ~36 test files / 433 tests green (per STATE.md). Each track should re-run `npm test && npm run type-check`.
- Detection golden-score snapshot + exclusion parity (the same gates Phases 29–32 used) — must stay byte-identical.

</code_context>

<specifics>
## Specific Ideas

- User-coined naming: the storage subfolder under `src/shared/` is **`memory/`**, not `storage/`. Other shared subfolders: `llm/`, `eval/`, `skills/`. (D-06)
- "Modules" framing for UX came directly from the user: dashboard + evals are currently in one folder and "should be separate modules under a modules folder" — extended to include popup for consistency. (D-07)
- This phase is explicitly the continuation of the recent post-32 refactor thread (self-contained skills, `detect-*` renames, tools moved to their own tree) — same spirit, same zero-behavior-change discipline.

</specifics>

<deferred>
## Deferred Ideas

- **Full registry unification** (one registry abstraction for skills + tools) — considered and explicitly rejected for this phase (D-05); it would collapse the deliberate Phase 32 skill/tool distinction. Revisit only if the two registries demonstrably converge.
- **Shared/common UX module** (`modules/common/`) — considered and rejected (D-08) because nothing is shared across UX surfaces today. Add later if real cross-surface reuse emerges.
- **Eval-driven tuning / regression gate** — out of scope here; remains deferred from v10.0.

</deferred>

---

*Phase: 33-Improve Modularity*
*Context gathered: 2026-06-17*
