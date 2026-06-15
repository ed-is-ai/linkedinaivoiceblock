---
phase: 29-config-foundation
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/shared/detectionConfig.ts
  - src/content/index.ts
  - src/content/detector/heuristic.ts
  - scripts/eval.ts
  - src/content/detector/heuristic.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 29: Code Review Report

**Reviewed:** 2026-06-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 29 is a pure relocation refactor: detection threshold/weight literals move into a new host-agnostic `src/shared/detectionConfig.ts`, and three consumers (`content/index.ts`, `heuristic.ts`, `scripts/eval.ts`) rewire to import from it. The hard constraint is zero behavior change.

**The numeric-equivalence constraint holds.** I traced every replaced literal against the pre-refactor base (`d4cc08a^`):

- `flag: 35` ← `FLAG_THRESHOLD = 35` (index.ts L318, L321) — identical
- `openToWorkPenalty: 20` ← `OPEN_TO_WORK_PENALTY = 20` (index.ts L298) — identical
- `autoHideDefault: 60` ← three `?? 60` fallbacks (index.ts L72, L164, L211) — identical
- `listicleCta.both/listicleOnly/ctaOnly: 25/12/8` (heuristic.ts L86–95) — identical
- `genericComments.gate: 20` ← `score > 20` (heuristic.ts L145) — identical
- `eval.ts` `bestF1Threshold` changed from `THRESHOLDS[0]!` to `detectionConfig.thresholds.flag`. `THRESHOLDS` is `Array.from({length:12},(_,i)=>35+i*5)`, so `THRESHOLDS[0] === 35 === detectionConfig.thresholds.flag`. Numerically identical, no behavior change.

The host-agnostic contract is honored: `detectionConfig.ts` is a pure `as const` literal object with zero imports — no `fs`, `process`, `chrome.*`, or DOM. The golden-score snapshot tests pin the exact post-merge scores.

**However**, the module's central promise — "single source of truth ... they can never drift apart" — is only partially fulfilled. Roughly half the declared fields are dead config that no module reads, and the actual values still live hard-coded inside the signal modules. This recreates exactly the drift risk the module claims to eliminate. Details below.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Half of `detectionConfig.weights` is dead config — the per-signal cap values it claims to own still live hard-coded in the signal modules

**File:** `src/shared/detectionConfig.ts:45-54`
**Issue:** The module header (L4–7, L25–28) states it is the "single source of truth for all detection thresholds and heuristic weights" and that consumers "MUST import from this module so they can never drift apart." But the following declared fields are **never imported anywhere** in the codebase:

- `weights.buzzword.max` (15)
- `weights.emDash.max` (10)
- `weights.aiVocab.max` (12)
- `weights.hookStory.max` (20)
- `weights.motivational.max` (20)
- `weights.impersonal.max` (15)
- `weights.genericComments.max` (15)

A grep for `detectionConfig` across `src/` and `scripts/` shows only `thresholds.*`, `weights.listicleCta.*`, and `weights.genericComments.gate` are consumed (in `heuristic.ts` and `index.ts`). The actual cap values still live hard-coded inside each signal module:

- `signals/buzzwords.ts:57` → `return 15`
- `signals/em-dash.ts:23` → `return 10`
- `signals/ai-vocab.ts:95` → `return 12`
- `signals/hook-story.ts:45` → `return 20`
- `signals/motivational.ts:41` → `return 20`
- `signals/impersonal.ts:38` → `return 15`
- `signals/comments.ts:59` → `return 15`

This is the precise drift hazard the module's own JSDoc warns against: a Phase 32/33 tuner who edits `detectionConfig.weights.buzzword.max` from 15 to 18 expecting a behavior change will see **no effect**, because `checkBuzzwords` ignores the config and returns its own literal `15`. The "single source of truth" is a duplicated source of truth, silently out of the wiring loop.

For Phase 29 specifically this is zero-behavior-change (correct), but it ships a config surface that is actively misleading about what it controls.
**Fix:** Either (a) wire the signal modules to consume these caps so the claim becomes true, e.g.:

```typescript
// signals/buzzwords.ts
import { detectionConfig } from '../../../shared/detectionConfig';
const { max } = detectionConfig.weights.buzzword;
// ...
if (density > 3) return max;          // was: return 15
```

(deferring the lower-tier `8`/`12` sub-weights to Phase 32 if needed), or (b) if wiring signal internals is explicitly out of Phase 29 scope, demote the unconsumed `max` fields to a documented "reserved for Phase 32 wiring — NOT yet authoritative" comment block so no one mistakes them for live config. Do not leave a field that looks authoritative but is inert.

### WR-02: `genericComments.max` documents a "cap" the signal does not actually impose

**File:** `src/shared/detectionConfig.ts:51-54`
**Issue:** The comment for `genericComments.max: 15` cites `heuristic.ts L58 comment — "up to 15 pts"`. But `signals/comments.ts` does not cap at 15 — it returns tiered fixed values: `15` when `genericHits.length >= 2` (L59) and `10` for near-duplicate pairs (L69). There is no `Math.min(..., 15)` cap; 15 is just the largest discrete return value. Encoding this as a `max` field implies a ceiling semantics that does not exist in the code, compounding WR-01: a tuner raising `max` to 20 would not unlock a 20-point return because the signal has no continuous cap to lift.
**Fix:** If kept, rename to reflect reality (e.g. `fullWeight: 15` / `partialWeight: 10`) and seed both tiers, or fold into the WR-01 remediation. At minimum correct the misleading `max` framing in the comment.

### WR-03: Inline `60`, `20`, and `35` literals remain at non-refactored call sites — the no-drift contract is only partially enforced

**File:** `src/content/detector/heuristic.ts:160`
**Issue:** The module claims threshold literals are centralized, but `heuristic.ts:160` still hard-codes the confidence-band cutoffs:

```typescript
confidence: finalScore >= 60 ? 'high' : finalScore >= 35 ? 'medium' : 'low',
```

The `60` here is conceptually the same auto-hide-default boundary now living in `detectionConfig.thresholds.autoHideDefault`, and `35` is the same value as `detectionConfig.thresholds.flag`. These were left as raw literals. Likewise `index.ts:185` (`cutoff.setDate(getDate() - 30)`) and the `score >= 60`/`>= 35` semantics are duplicated knowledge. Because Phase 29's stated goal is "no threshold/weight literal at any call site so they can never drift," a reviewer must flag that the confidence cutoffs were missed: if a future tuner moves `flag` to 30 expecting medium-confidence to start at 30, `heuristic.ts:160` will still gate on a literal `35` and silently disagree with the config.
**Fix:** Route the confidence cutoffs through config too, or add an explicit decision note that confidence bands are intentionally independent of `flag`/`autoHideDefault`. For example:

```typescript
const { flag, autoHideDefault } = detectionConfig.thresholds;
confidence: finalScore >= autoHideDefault ? 'high'
          : finalScore >= flag ? 'medium' : 'low',
```

Verify this keeps the golden snapshot byte-identical (it must, since the numbers match today) before landing.

## Info

### IN-01: Golden-score snapshot tests never reference `detectionConfig`, so they cannot catch a config/runtime drift

**File:** `src/content/detector/heuristic.test.ts:200-345`
**Issue:** The golden-snapshot suite pins literal expected scores (`25`, `15`, `10`, `63`) directly. This correctly proves the runtime output is byte-identical, which is the Phase 29 goal. But because the assertions hard-code `25` rather than asserting against `detectionConfig.weights.listicleCta.both`, the tests would not detect a future divergence between the config object and the runtime — e.g. if someone edited `detectionConfig.listicleCta.both` to 30 but the snapshot stayed 25, the test failing wouldn't tell you *which* of the two is wrong. This is acceptable for a snapshot pin but worth a follow-up assertion like `expect(detectionConfig.weights.listicleCta.both).toBe(25)` to anchor the config surface itself.
**Fix:** Add a small config-pin test (Phase 29 or 32) asserting each `detectionConfig` value equals its expected literal, so config edits are caught independently of behavioral snapshots.

### IN-02: Source-line citations in `detectionConfig.ts` comments are already partially stale and will rot

**File:** `src/shared/detectionConfig.ts:35-53`
**Issue:** Comments cite specific source lines (`src/content/index.ts L26 — FLAG_THRESHOLD`, `heuristic.ts L85`, `L98`, etc.). Several are already off: `FLAG_THRESHOLD` no longer exists at index.ts L26 (it was deleted by this very refactor — see the diff removing L23–28), and the `heuristic.ts` line numbers shifted when the import was added. These line-number references are guaranteed to drift on the next edit and provide a false sense of traceability.
**Fix:** Replace line-number citations with stable symbol references (e.g. "consumed by `HeuristicDetector.detect` listicle branch") or drop the line numbers entirely.

### IN-03: `maxPostsPerSession: 50` is seeded but unconsumed

**File:** `src/shared/detectionConfig.ts:56`
**Issue:** `maxPostsPerSession: 50` is declared for "Phase 31 (Cost Guardrail); not yet consumed." It is dead config today. This is intentional and documented, so it is Info-level only, but it is part of the same pattern as WR-01: the module ships fields that look authoritative but control nothing. Acceptable as a forward-seed provided the "not yet consumed" comment stays accurate.
**Fix:** No action required for Phase 29. Ensure Phase 31 actually wires it, and that no code reads it before then assuming it is enforced.

---

_Reviewed: 2026-06-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
