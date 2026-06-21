# Phase 29: Config Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 29-config-foundation
**Areas discussed:** Module shape, Extraction depth

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Module shape | Single nested object vs. flat named exports | ✓ |
| Extraction depth | Top-level only vs. full weight extraction | ✓ |
| Seed maxPostsPerSession | Seed now vs. defer to Phase 31 | (not selected — defaulted in CONTEXT) |
| Existing constants | THRESHOLDS / autoHide-setting relationship | (not selected — covered via Module-shape follow-ups) |

---

## Module Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single nested object | One `detectionConfig` object (thresholds/weights/maxPostsPerSession) | ✓ |
| Flat named exports | Individual `export const FLAG_THRESHOLD` etc. | |

**User's choice:** Single nested object

### Follow-up: Typing & default ownership

| Option | Description | Selected |
|--------|-------------|----------|
| as const + own default | `as const`; detectionConfig owns autoHide default 60, runtime falls back to it | ✓ |
| as const, leave default in place | `as const` but leave `?? 60` at the settings call site | |

**User's choice:** as const + own default

### Follow-up: Eval sweep array location

| Option | Description | Selected |
|--------|-------------|----------|
| Leave in metrics.ts | THRESHOLDS stays as eval-sweep-specific constant | ✓ |
| Move into detectionConfig | Relocate sweep into the config | |

**User's choice:** Leave in metrics.ts

---

## Extraction Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full extraction | Pull every heuristic weight literal into detectionConfig.weights | ✓ |
| Top-level + caps only | Extract clean consts + per-signal caps, leave composite tiers inline | |
| Top-level only | Extract only flag/autoHide/penalty | |

**User's choice:** Full extraction

### Follow-up: Zero-behavior-change verification

| Option | Description | Selected |
|--------|-------------|----------|
| Golden-score snapshot test | Snapshot exact scores+breakdown pre-refactor; must stay byte-identical | ✓ |
| Existing tests + eval parity | Rely on current suite + before/after eval run | |
| You decide | Planner/researcher chooses | |

**User's choice:** Golden-score snapshot test

### Follow-up: Composite tier naming

| Option | Description | Selected |
|--------|-------------|----------|
| Semantic nested keys | `weights.listicleCta = { both: 25, listicleOnly: 12, ctaOnly: 8 }` | ✓ |
| Flat per-signal keys | listicleCtaBoth / listicleCtaListicle / listicleCtaCta | |
| You decide | Executor picks | |

**User's choice:** Semantic nested keys

---

## Claude's Discretion

- Seed `maxPostsPerSession` (default 50) in the config now (not separately discussed; flagged in CONTEXT for user override).
- Exact per-signal weight key names beyond the listicle-cta tiers.
- Whether `background/index.ts` needs any change (verify — likely no detection literals there).

## Deferred Ideas

- Tuning threshold/weight values — Phase 32.
- Runtime enforcement of `maxPostsPerSession` — Phase 31.
- LLM-primary scoring — Phase 30.
