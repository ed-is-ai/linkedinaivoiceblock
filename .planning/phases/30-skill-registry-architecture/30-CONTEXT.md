# Phase 30: Skill Registry Architecture - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

> **Re-scope note:** This phase was originally "LLM-Primary Promotion" (requirements LLM-01/02/03). It was re-scoped on 2026-06-16 to a **skill registry architecture** refactor. The LLM-primary direction (always-primary, scored-URN cache, optimistic pre-hide) was **dropped**; the LLM remains one `DetectorSkill`. Requirements are now SKILL-01..04 and the v10.0 milestone was retitled "Skill-Based Detection & Eval-Driven Tuning".

<domain>
## Phase Boundary

Reorganize detection logic into a **two-level skill registry** with **zero behavior change**:

1. **`DetectorSkill`** — the top-level scoring strategy: `heuristic`, `llm`. (Generalizes the existing `Detector` interface.)
2. **`SignalSkill`** — the individual scoring signals that the heuristic composes (buzzwords, em-dash, listicle, cta, ai-vocab, hook-story, motivational, impersonal, comments, profile). Two flavors: `CodeSkill` (a TS module with full logic — the 10 existing signals migrate here byte-identical) and `PatternSkill` (declarative data-only — the LLM-authorable flavor).
3. **`ExclusionSkill`** — the hard exclusions (sponsored / company / non-English) modeled as a third skill kind that runs **before** any scoring.

A **`SkillRegistry`** seeds built-in skills from code and is wired to hydrate additional **declarative** skills from `chrome.storage.local` with a code-seed fallback — mirroring the existing **`SelectorRegistry`** pattern (per CLAUDE.md, only `SelectorRegistry` writes selector strings to storage; `SkillRegistry` follows the same single-writer rule for skill defs). At launch it is seeded with **zero** declarative skills, so detection behavior is identical while the LLM-extension surface exists and is ready.

**This phase ships the architecture + the empty extension surface.** The mechanism that actually lets an LLM *propose/author* declarative skills (generation, validation, write-to-storage UX) is a **fast-follow phase**, not this one.

**Out of scope:** the LLM-skill-authoring mechanism (future phase); LLM-primary promotion / optimistic pre-hide / scored-URN cache (dropped); threshold/weight tuning (Phase 32/33); any change to detection output.

</domain>

<decisions>
## Implementation Decisions

### Skill Model & Granularity
- **D-01:** **Two-level model.** `DetectorSkill` (heuristic, llm) is the top-level strategy; `SignalSkill` is the per-signal unit the `HeuristicDetector` composes. `LLMDetector` stays a `DetectorSkill` that does not consume `SignalSkill`s (it calls the background classifier). The pluggable `Detector` call site in `content/index.ts` (detector selection at L233-235) is preserved.
- **D-02:** **Signal skills have two flavors.** `CodeSkill` = a TS module with arbitrary `run()` logic — the 10 existing signals migrate here unchanged. `PatternSkill` = declarative data (id + inputs + pattern/keyword/numeric rule + `weightKey`) executed by a generic runner — this is the **only** flavor an LLM can author, because MV3 CSP forbids `eval`/`new Function` (no runtime code). All 10 existing signals migrate as `CodeSkill`s in this phase (strict preserve); `PatternSkill` ships as a supported-but-unused type.
- **D-03:** **Exclusions become a third skill kind (`ExclusionSkill`)** — sponsored, company, non-English/language. Per the user's choice to unify exclusions into the registry.

### Skill Contract
- **D-04:** Each skill is self-describing: `id` (matches its `detectionConfig` weight key AND its `signalBreakdown` key for signal skills), declared `inputs` (`text` | `profile` | `comments`), and a `sync` flag (true = no `await`, e.g. em-dash; false = async, e.g. comments which needs `fetchComments`). The `sync` flag is forward-useful but this phase does not build an optimistic pre-pass on top of it.
- **D-05:** Signal skills read their weight from `detectionConfig` (the Phase 29 single source) via `weightKey` — no weight literal is reintroduced into a skill module. Reuse Phase 29's `detectionConfig.weights.*` keys exactly.

### Registry & Extension Surface
- **D-06:** **`SkillRegistry` mirrors `SelectorRegistry`** (per CLAUDE.md constraint #1): a code seed is the source of built-in skills; `chrome.storage.local` may carry additional **declarative** (`PatternSkill` / declarative `ExclusionSkill`) defs that the registry hydrates at runtime with the code seed as fallback. **Only `SkillRegistry` writes skill defs to storage.** Seeded with **zero** declarative skills at launch → zero behavior change.
- **D-07:** Registration is **static/explicit** for built-ins (an array/map of imported skill modules — tree-shakeable, MV3-CSP-safe, no dynamic `import`), plus the storage-hydration layer for declarative skills. "Add a signal" = add one module + one registry entry. (No filesystem auto-discovery / `import.meta.glob` magic.)

### Behavior Posture (Strict Preserve)
- **D-08:** **Zero behavior change.** Migrating the 10 signals into `CodeSkill`s must keep the **Phase 29 golden-score snapshot byte-identical** (`heuristic.test.ts`). The runner that sums signal skills must produce the same `score` + `signalBreakdown` as the current hand-wired pipeline.
- **D-09:** **Exclusion parity** — modeling exclusions as `ExclusionSkill`s must not change *which* posts are excluded, and must preserve the **hard-exclusions-before-detection ordering** (CLAUDE.md constraint #5): the runner runs exclusion skills first and short-circuits before any detector/signal skill. Add a parity check over a representative fixture set (exclusion outcomes unchanged).

### Claude's Discretion
- Exact module layout (e.g., `src/shared/skills/` for the host-agnostic registry + types, signal skill modules co-located vs under `detector/signals/`), and the precise `SkillRegistry` API shape.
- How `HeuristicDetector` becomes a registry runner (iterate registered signal skills, gate by `inputs`/`sync`, sum results) while preserving D-08.
- The `PatternSkill` declarative schema details (which rule kinds ship first — keyword-set, regex, numeric-threshold) — only needs to be expressive enough to cover the simplest existing signals as a proof, since no declarative skills are seeded this phase.
- Where exclusion logic physically moves (from the inline `checkExclusions` in `content/index.ts` into exclusion skill modules) while keeping the short-circuit ordering.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — SKILL-01 (two-level registry), SKILL-02 (`SkillRegistry` + storage-hydrated declarative skills), SKILL-03 (hard-exclusion ordering preserved), SKILL-04 (zero behavior change).
- `.planning/ROADMAP.md` §"Phase 30: Skill Registry Architecture" — goal + 4 success criteria.

### Pattern to mirror (MANDATORY)
- `src/content/selector/` (`SelectorRegistry`) — the storage-hydration-with-code-seed pattern `SkillRegistry` must follow; also the single-writer-to-storage rule (CLAUDE.md constraint #1). Read this before designing `SkillRegistry`.
- `CLAUDE.md` — constraint #1 (selectors/registry + single-writer), constraint #2 (no `element.remove()`), constraint #5 (hard exclusions before detection), and the "Pluggable Detector Interface" section.

### Code to refactor
- `src/content/detector/heuristic.ts` — the hand-wired signal pipeline that becomes a registry runner.
- `src/content/detector/signals/*.ts` — the 10 signal modules (ai-vocab, buzzwords, comments, cta, em-dash, hook-story, impersonal, listicle, motivational, profile) → migrate to `CodeSkill`s.
- `src/content/detector/llm.ts` — `LLMDetector` → a `DetectorSkill` (minimal change; keep its fallback hook).
- `src/content/index.ts` — inline `checkExclusions` (sponsored/company + open-to-work) → `ExclusionSkill`s; detector selection (L233-235) preserved; exclusion short-circuit (L291-292) becomes the registry-run-exclusions step.
- `src/content/detector/language.ts` — non-English exclusion → an `ExclusionSkill`.

### Single-source dependency (do not duplicate)
- `src/shared/detectionConfig.ts` (Phase 29) — signal skills read weights via `weightKey`; no weight literal returns to a skill module.
- `src/content/detector/heuristic.test.ts` (Phase 29 golden-score snapshot) — the byte-identical guard for SKILL-04/D-08.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SelectorRegistry` (`src/content/selector/`) — direct architectural template for `SkillRegistry` (seed + storage hydrate + single writer).
- `Detector` interface (`src/shared/types.ts:66-71`, `name` + `detect`) — the seed of `DetectorSkill`.
- The 10 signal modules are already separate files with focused logic — migration to `CodeSkill` is mostly wrapping, not rewriting.
- Phase 29 `detectionConfig.weights.*` keys already map 1:1 to signals — reuse as `weightKey`s.
- Phase 29 golden-score snapshot — the ready-made zero-behavior-change proof.

### Established Patterns
- Pluggable `Detector` interface; the call site `detector.detect(postData)` is the single scoring entry point and must not change shape (CLAUDE.md "Pluggable Detector Interface").
- Registry-hydrates-from-storage-with-seed (SelectorRegistry) is the codebase's existing answer to "runtime-extensible, code-fallback" — `SkillRegistry` reuses it.
- `as const` config + single-source weights (Phase 29) — skills reference, never re-declare, weights.

### Integration Points
- `HeuristicDetector.detect()` becomes "run registered signal skills via the registry runner, sum → score + breakdown."
- Content script per-post flow: `ExclusionSkill`s run first (short-circuit) → selected `DetectorSkill` runs → existing persist/hide path unchanged.
- `SkillRegistry` hydrates at init (alongside the existing `SelectorRegistry` `seedIfNeeded()`/`load()` at `content/index.ts:208-209`).

</code_context>

<specifics>
## Specific Ideas

- "Zero declarative skills seeded → behavior identical, surface ready" is the crux that lets *LLM-extensible* and *strict-preserve* coexist in one phase.
- MV3 CSP (no `eval`/`new Function`) is the reason the LLM-authorable flavor must be **declarative data**, not code — this constraint shaped D-02 and should be honored, not worked around.
- The Phase 29 golden-score snapshot is the operational definition of "zero behavior change" for the signal migration; exclusion parity is the analogous guard for the exclusion migration.

</specifics>

<deferred>
## Deferred Ideas

- **LLM skill-authoring mechanism** — generation/validation/write-to-storage so an LLM can actually add `PatternSkill`s at runtime. Fast-follow phase; this phase only ships the empty, ready surface.
- **LLM-primary promotion** (old LLM-01/02/03: always-primary, scored-URN cache, optimistic pre-hide) — **dropped** from the roadmap. The `sync` flag (D-04) leaves a clean seam if any of this is ever revived.
- **Richer `PatternSkill` rule kinds** (beyond keyword/regex/numeric) — add only when a real declarative skill needs them.
- **Migrating complex signals (comments, profile, hook-story) to declarative** — they stay `CodeSkill`s indefinitely unless a future need arises.

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 30-skill-registry-architecture*
*Context gathered: 2026-06-16 (re-scoped from 30-llm-primary-promotion)*
