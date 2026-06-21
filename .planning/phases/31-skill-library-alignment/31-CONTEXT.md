# Phase 31: Skill Library Alignment - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure the detector, exclusion, and selector skills into the **Anthropic Agent Skills folder convention** — each a self-contained `skills/library/<name>/` folder containing a `SKILL.md` manifest (name/description/metadata frontmatter) **alongside its bundled TypeScript implementation as a script file** — and have `SkillRegistry` hydrate skill **metadata** from those bundled manifests at build time. **Zero behavior change.** Built **tracer-bullet style**: one exclusion skill is spiked end-to-end as wave 1, then the detector and selector skills follow.

By the end, every DetectorSkill (heuristic, llm), every ExclusionSkill (sponsored, company-page, non-english, open-to-work), and the selector registry has a `skills/library/<name>/SKILL.md` + bundled impl, with **no skill definition remaining outside `skills/library/`**.

**Out of scope:** the LLM skill-authoring mechanism (generation/validation/write-to-storage — future fast-follow); threshold/weight tuning (Phase 32/33); any change to detection output; reviving the dropped LLM-primary / scored-URN cache / optimistic pre-hide direction.

</domain>

<decisions>
## Implementation Decisions

### Manifest Authority & Hydration
- **D-01:** **`SKILL.md` frontmatter is the source-of-truth for DESCRIPTIVE metadata only** (`name`, `description`, `metadata.kind`). The executable contract — `run()` / `check()`, `weightKey`, `inputs`, `sync`, `flavor` — **stays in the TypeScript impl**. "Hydrate metadata from manifests" is taken literally for descriptive fields, but runtime behavior remains in code. This is the lowest-risk path to zero-behavior-change. (Rejected: fully-authoritative manifest carrying runtime wiring — too much surface to keep in sync against the golden snapshot; rejected documentation-only — that would make hydration cosmetic.)
- **D-02:** **The implementation code MOVES into per-folder script files** inside each `skills/library/<name>/` folder (true Anthropic Agent Skills shape: `SKILL.md` + bundled impl script), rather than staying in `src/content/detector/signals/` or `src/content/exclusions/`. Each folder is self-contained: manifest + impl. No skill definition remains outside `skills/library/`.

### Manifest → Bundle Binding (Codegen)
- **D-03:** **Build-time codegen** binds manifests to impls (MV3-safe, no runtime FS, no dynamic `import`, no `eval`). A prebuild script scans `skills/library/**/SKILL.md`, parses + validates frontmatter, and emits a **generated registry module**. (Rejected: `?raw` import + parse-at-init, and hand-written co-located TS manifest mirroring the `.md` — codegen was the user's choice.)
- **D-04:** **The generated module carries full wiring** — static imports of each folder's impl script AND its parsed metadata, assembled into a ready, ordered skill array the registry consumes directly. **One generated file is the single registration point.** "Add a skill" = drop a `skills/library/<name>/` folder (SKILL.md + impl) + rerun codegen (regenerates the entry).
- **D-05:** **The generated module is committed to git.** Diffs are reviewable in PRs, the build does not depend on a guaranteed prebuild ordering, and a CI check can fail if it is stale (regenerate-and-diff). Matches how the repo treats other derived artifacts.
- **D-06:** **Execution order is driven by an explicit ordered list in the codegen config** — codegen follows a named, ordered list of skill folders (pipeline step-order). A test asserts the generated signal-skill order equals the Phase 30 `CODE_SIGNAL_SKILLS` order (and exclusion order matches `CODE_EXCLUSION_SKILLS`). (Rejected: an `order:` field per-frontmatter, and numeric folder-name prefixes.) **Critical:** `signalBreakdown` key order and the golden-score snapshot both depend on this exact order — codegen MUST preserve it.

### Frontmatter Schema
- **D-07:** Frontmatter = **Anthropic standard `name` + `description`, plus a `metadata:` block carrying `kind`** (`detector` | `signal` | `exclusion`) so codegen buckets each skill into the correct registry array. Runtime fields (`flavor`, `inputs`, `sync`, `weightKey`) stay in TS. A test asserts frontmatter `kind` matches the TS skill's `kind` (drift guard). (Rejected: pure-standard-only with folder-location-inferred bucketing; rejected rich metadata — more to maintain now with no current consumer.)
- **D-08:** **Codegen validates the frontmatter schema and fails the build on violation** — required fields present, `kind` in the allowed set, `name`/`description` non-empty. Codegen already parses the manifest, so validation is cheap and prevents a malformed manifest from silently producing a broken registry.

### Behavior Posture (Strict Preserve — carried from Phase 30)
- **D-09:** **Zero behavior change.** The Phase 29 golden-score snapshot (`heuristic.test.ts`) must stay byte-identical, and exclusion parity must hold on the representative fixture set (same posts excluded/flagged, same scores). This is the operational definition of done for the migration.

### Claude's Discretion
- **Exact folder location** under the repo for `skills/library/` — repo-root `skills/library/` vs `src/skills/library/`. The constraint: Vite uses `root: 'src'` and `publicDir`; the planner/researcher must pick a location that keeps impl scripts inside the TypeScript/Vite build graph and bundled via static import (NOT copied as static assets, NOT runtime-loaded). `SKILL.md` files are dev/build-time inputs — they must not need to ship in the production bundle.
- **How the selector registry becomes a library skill** — it is not currently a "skill" (it's `SelectorRegistry`, a separate registry). Whether it gets a full move into `skills/library/<name>/` or a thin manifest + impl that points at / wraps the existing selector code, while preserving CLAUDE.md constraint #1 (only `SelectorRegistry` writes selector strings to storage). Keep behavior identical either way.
- **Which exclusion skill to spike first** as the wave-1 tracer bullet (`sponsored` is the simplest candidate). The tracer must prove the full path end-to-end: folder + SKILL.md + impl script → codegen → committed generated module → `SkillRegistry` resolves it → content-script exclusion run byte-identical on the fixture set.
- The precise codegen script location/name, the frontmatter parser used (tiny YAML/frontmatter parse — no heavy dep), the generated module's name/path, and the stale-check CI wiring.
- Module layout details and the `SkillRegistry` API changes needed to consume the generated full-wiring array (must keep the Phase 30 sync getters `getSignalSkills()` / `getExclusionSkills()` semantics and the declarative-skill storage merge intact).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — **SKILL-05** (skills as self-contained `skills/library/<name>/` folders following the Anthropic Agent Skills convention; SKILL.md manifest + bundled TS; `SkillRegistry` hydrates metadata at build time, static imports only, MV3-CSP-safe, zero behavior change; tracer-bullet delivery).
- `.planning/ROADMAP.md` §"Phase 31: Skill Library Alignment" — goal + 5 success criteria (wave-1 tracer, full build-out, MV3-CSP-safe static bundling, zero behavior change, "drop a folder + one registry entry" authoring note).

### Standard to follow (MANDATORY)
- **Anthropic Agent Skills `SKILL.md` convention** — frontmatter `name` + `description` (+ optional `metadata`). Reference example on this machine: `~/.claude/skills/graphify/SKILL.md`. Also mirrored by the project's own memory/skill format. The library folders must conform to this manifest shape.

### Pattern to mirror & single-writer rule (MANDATORY)
- `CLAUDE.md` — constraint #1 (selectors live only in `selectors.ts`; `SelectorRegistry` is the single writer to selector storage), constraint #2 (no `element.remove()`), constraint #5 (hard exclusions before detection), and the "Pluggable Detector Interface" section.
- `src/content/selector-registry.ts` + `src/content/selector/` — the seed-with-code-fallback + single-writer pattern `SkillRegistry` already mirrors.

### Code to refactor / move into the library
- `src/content/skill-registry.ts` — the Phase 30 `SkillRegistry`: static-import block (L44-58), `CODE_SIGNAL_SKILLS` order (L75-84), `CODE_EXCLUSION_SKILLS` order (L90-95), sync getters (L185-200). The static-import + ordered-array section is what the **committed generated full-wiring module** replaces; getter/storage-merge semantics must be preserved.
- `src/shared/skills/types.ts` — skill type contracts (`SignalSkillBase`, `CodeSkill`, `PatternSkill`, `ExclusionSkill`, `DetectorSkill`, `kind` discriminants). The `kind` values are the allowed set for frontmatter `metadata.kind`.
- `src/content/detector/signals/*.skill.ts` — the signal skill modules → move into `skills/library/<name>/` with a SKILL.md each.
- `src/content/exclusions/*.skill.ts` — sponsored / company-page / non-english / open-to-work → move into the library; one is the wave-1 tracer.
- `src/content/detector/heuristic.ts`, `src/content/detector/llm.ts` — `HeuristicDetector` / `LLMDetector` (DetectorSkills) → library folders.

### Single-source dependency & zero-change guard (do not duplicate)
- `src/shared/detectionConfig.ts` (Phase 29) — signal skills read weights via `weightKey`; no weight literal returns to a skill module.
- `src/content/detector/heuristic.test.ts` (Phase 29 golden-score snapshot) — byte-identical guard for D-09 / SKILL-05 zero-behavior-change. Plus the existing exclusion parity fixtures.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SkillRegistry` (`src/content/skill-registry.ts`, Phase 30) — already does static-import + ordered-array + sync getters + storage-hydration of declarative skills. This phase swaps the hand-wired static-import/ordered-array section for the committed generated full-wiring module; the rest is preserved.
- The 10 signals + 4 exclusions already live as focused `.skill.ts` modules — moving them into `skills/library/<name>/` is relocation + adding a SKILL.md, not a rewrite.
- `SKILL_REGISTRY_VERSION` + additive `migrate()` already handle version bumps without destroying declarative skills.
- `~/.claude/skills/graphify/SKILL.md` — a concrete on-machine example of the target manifest frontmatter shape.

### Established Patterns
- Static-imports-only, no dynamic `import`, MV3-CSP-safe (Phase 30 D-07) — the generated module must keep this: it emits explicit `import` statements, never `import.meta.glob` or runtime FS.
- `as const` config + single-source weights (Phase 29) — skills reference, never re-declare, weights.
- Registry seed-with-code-fallback + single-writer-to-storage (SelectorRegistry / SkillRegistry).

### Integration Points
- `SkillRegistry` consumes the committed generated full-wiring array; `getSignalSkills()` / `getExclusionSkills()` keep their semantics (code seeds + declarative storage merge).
- `src/content/index.ts` — registry init (alongside `SelectorRegistry` seed/load) and the per-post exclusion-then-detector flow are unchanged in behavior.
- Build pipeline (Vite, `root: 'src'`, `vite-plugin-web-extension`) — codegen runs as a prebuild step producing a committed module; `skills/library/` impl scripts must be inside the static-import graph, SKILL.md files must not need to ship in the production bundle.

</code_context>

<specifics>
## Specific Ideas

- "Hydrate metadata from manifests" is taken literally but **scoped to descriptive fields** (name/description/kind); behavior stays in TS. This is what keeps the migration zero-behavior-change while still making the manifest meaningful.
- The committed generated full-wiring module is the **single registration point** — the user explicitly wants "code turned into script files" inside each skill folder, with codegen assembling them.
- Ordering is the sharpest landmine: the explicit ordered list in codegen config must reproduce `CODE_SIGNAL_SKILLS` order exactly, pinned by a test, because the golden snapshot and `signalBreakdown` key order depend on it.
- This aligns the extension's own skills with the Anthropic Agent Skills format the user already uses (graphify, project memory) — the descriptive, LLM-readable `SKILL.md` is the clean seam the deferred LLM-skill-authoring fast-follow will write into.

</specifics>

<deferred>
## Deferred Ideas

- **LLM skill-authoring mechanism** — generation/validation/write-to-storage so an LLM can author new `PatternSkill`s (and eventually library folders) at runtime. Future fast-follow; this phase only aligns the existing skills to the folder convention and makes the manifest seam clean.
- **Manifest as fully-authoritative runtime source** (frontmatter carrying `weightKey`/`inputs`/`sync` and the registry deriving wiring from it) — rejected for this phase as too risky against the golden snapshot; could be revisited once the codegen+manifest plumbing is proven.
- **Richer frontmatter metadata** (categories, long authoring notes) — add only when the LLM-authoring fast-follow has a concrete consumer for it.

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 31-skill-library-alignment*
*Context gathered: 2026-06-16*
