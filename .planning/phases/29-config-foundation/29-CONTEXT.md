# Phase 29: Config Foundation - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a single committed `src/shared/detectionConfig.ts` module that is the sole source of detection constants — decision thresholds, the open-to-work penalty, the session cap, and all heuristic-fallback signal weights. The runtime (content script / service worker) and the eval CLI (`scripts/eval.ts`) both import these values from this one module instead of hard-coding literals.

**Hard constraint: zero behavior change.** Same posts flagged, same scores produced, same metrics. This is a refactor that relocates existing literals — it introduces no new tuning.

**Out of scope:** Changing any threshold/weight value (that's Phase 32/33 tuning); making the LLM primary (Phase 30); enforcing the session cap at runtime (Phase 31 — Phase 29 only seeds the constant).

</domain>

<decisions>
## Implementation Decisions

### Module Shape
- **D-01:** Export a **single nested `detectionConfig` object** declared `as const` (readonly, literal-narrowed types). Not flat named exports. Shape sketch:
  ```ts
  export const detectionConfig = {
    thresholds: { autoHideDefault: 60, flag: 35, openToWorkPenalty: 20 },
    weights: { listicleCta: { both: 25, listicleOnly: 12, ctaOnly: 8 }, /* …all signal weights… */ },
    maxPostsPerSession: 50,
  } as const;
  ```
- **D-02:** `detectionConfig` **owns the autoHide default (60)**. The runtime still reads the user-configurable `autoHideThreshold` from `chrome.storage.local`; the `?? 60` fallback at the call site becomes `?? detectionConfig.thresholds.autoHideDefault`. The settings UI / user-override mechanism is unchanged — only the default literal moves into the config.
- **D-03:** The eval CLI sweep array `THRESHOLDS` **stays in `src/shared/eval/metrics.ts`**. It is eval-sweep-specific (12 values, 35–90 step 5), not a single runtime operating-point constant. `detectionConfig` holds only single operating-point values, so the eval pipeline is not disturbed.

### Extraction Depth
- **D-04:** **Full extraction.** Every heuristic weight literal in `src/content/detector/heuristic.ts` (~10 magic numbers across the signal pipeline) moves into `detectionConfig.weights`. No weight literal remains at a heuristic call site. This is the truest single-source and sets up Phase 32/33 weight tuning.
- **D-05:** Composite tiers are named with **semantic nested keys**, preserving the encoded meaning. e.g. the listicle-cta composite (25 / 12 / 8 for both-signals / listicle-only / cta-only) becomes `weights.listicleCta = { both: 25, listicleOnly: 12, ctaOnly: 8 }`. Each signal's MAX cap and per-tier value gets a self-documenting key ready for independent tuning later.
- **D-06:** Zero-behavior-change is guaranteed by a **golden-score snapshot test**: before the refactor, snapshot the exact `score` + `breakdown` produced by the heuristic over a fixed set of representative posts; the refactor must keep the snapshot **byte-identical**. If existing `heuristic.test.ts` fixtures are not representative enough, the planner should broaden them before extracting.

### Claude's Discretion
- **maxPostsPerSession seeding (not separately discussed):** Seed `maxPostsPerSession` in `detectionConfig` **now** as a constant (default `50`), even though no runtime code consumes it yet. Rationale: success criterion #1 names it explicitly, and Phase 31 (Cost Guardrail) expects to read the cap exclusively from this module. Seeding it now is a no-op for behavior (nothing reads it in Phase 29) and avoids a follow-up edit to the config in Phase 31. *Flag for user if deferral preferred.*
- **Exact per-signal weight key names** beyond the listicle-cta tiers — executor picks the cleanest names that preserve values, consistent with the single-nested-object + semantic-keys decisions.
- **background/index.ts scope:** success criterion #2 lists it as an importer, but it currently holds only scraper constants (REDERIVE_*), not detection constants. If no detection literal exists there, no change is required — do not invent an import. Verify during planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — CFG-01 (single detection-config module, imported by runtime + eval CLI). Note CFG-02/CFG-03 are Phase 32, not here.
- `.planning/ROADMAP.md` §"Phase 29: Config Foundation" — goal + 4 success criteria.

### Code to refactor (literals → config)
- `src/content/index.ts` — `FLAG_THRESHOLD = 35` (L26), `OPEN_TO_WORK_PENALTY = 20` (L27), default `autoHideThreshold ?? 60` (L170, L217, L78). User-setting read from storage stays; only defaults/literals move.
- `src/content/detector/heuristic.ts` — full signal pipeline weight literals (listicle-cta 25/12/8, buzzword/em-dash/ai-vocab/hook/motivational caps). Source of `detectionConfig.weights`.
- `scripts/eval.ts` — must import its threshold/weight values from `detectionConfig.ts` so eval and runtime never drift (success criterion #4).
- `src/background/index.ts` — verify whether it holds any detection constant; likely none (only REDERIVE_* scraper constants).

### Single-source patterns already in place (precedent)
- `src/shared/eval/metrics.ts:31` — `THRESHOLDS` sweep array (D-03: stays here, do not relocate). Demonstrates the existing "single shared constant, no drift" convention to mirror.

### Downstream consumers (do not implement, just be aware)
- `.planning/ROADMAP.md` §"Phase 31: Cost Guardrail" — will read `maxPostsPerSession` (default 50) from `detectionConfig.ts`.
- `.planning/ROADMAP.md` §"Phase 32/33" — will tune threshold + weights in `detectionConfig.ts`; full extraction (D-04) enables this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/eval/metrics.ts` `THRESHOLDS` — existing precedent for a shared, single-source detection constant imported across runtime/eval. Mirror its export style and "no drift" rationale comment.
- `src/content/detector/heuristic.test.ts` — existing heuristic unit tests; foundation for the D-06 golden-score snapshot. May need broader fixtures.

### Established Patterns
- `src/shared/` is the home for cross-context shared modules (storage, types, eval, pricing). `detectionConfig.ts` belongs here — both content script and `scripts/eval.ts` can import it.
- `as const` literal typing is the idiom for fixed config objects in this codebase.
- Threshold constants are already documented with `// (D-04)` / `// (D-05)` design-decision references in content/index.ts and heuristic.ts — carry those provenance comments into detectionConfig.ts so the rationale isn't lost.

### Integration Points
- content script (`content/index.ts`, `heuristic.ts`) imports `detectionConfig` for thresholds + weights.
- `scripts/eval.ts` imports `detectionConfig` for the operating-point threshold (criterion #4: no manual sync).
- Settings/storage path: user override read from `chrome.storage.local` still wins; config supplies the default only (D-02).

</code_context>

<specifics>
## Specific Ideas

- The phase is a pure relocation — the success measure is `npm test && npm run type-check` green AND identical detection output. Treat any score diff as a bug, not a tuning decision.
- "No numeric literals remain at call sites" (criterion #2) is the acceptance bar for thoroughness — full extraction (D-04) is what satisfies it.

</specifics>

<deferred>
## Deferred Ideas

- **Tuning threshold/weight values** — Phase 32 (precision-constrained `selectThreshold`, CFG-02/CFG-03). Phase 29 changes no values.
- **Runtime enforcement of `maxPostsPerSession`** — Phase 31 (Cost Guardrail). Phase 29 only seeds the constant.
- **LLM-primary scoring** — Phase 30.

</deferred>

---

*Phase: 29-config-foundation*
*Context gathered: 2026-06-15*
