# Phase 29: Config Foundation - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 5 (1 new, 3 modified, 1 verified-no-change)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shared/detectionConfig.ts` | config / shared constant | transform (compile-time literal → typed const) | `src/shared/eval/metrics.ts` | exact (same role: shared single-source constant, same pattern: `export const … as const`, same "no drift" rationale) |
| `src/content/index.ts` | content-script entrypoint | request-response + event-driven | self (existing file, modify only) | self |
| `src/content/detector/heuristic.ts` | detector / service | transform (text → score) | self (existing file, modify only) | self |
| `scripts/eval.ts` | CLI utility | batch / transform | self (existing file, modify only) | self |
| `src/background/index.ts` | service worker | event-driven | — | verified no-change (no detection literals present) |

---

## Pattern Assignments

### `src/shared/detectionConfig.ts` — NEW (config, compile-time const)

**Analog:** `src/shared/eval/metrics.ts`

**Imports pattern** — metrics.ts lines 1–18 (module-level JSDoc + single import):
```typescript
/**
 * LinkedIn Blocker — Pure Eval Core (host-agnostic)
 *
 * HOST-AGNOSTIC CONTRACT: This file MUST NOT import `fs`, `process`, `chrome.*`,
 * or any DOM API. Only `import type` from `../types` is permitted at runtime.
 */

import type { PostData } from '../types.js';
```
`detectionConfig.ts` has the same constraint: no `chrome.*`, no DOM, no `fs`. It is purely a literal object — zero runtime imports needed.

**Single-source export pattern** — metrics.ts lines 21–31:
```typescript
// ---------------------------------------------------------------------------
// Shared threshold sweep constant (D-03 — one constant, no drift)
// ---------------------------------------------------------------------------

/**
 * The canonical threshold sweep set for the eval harness.
 * Both the CLI (scripts/eval.ts) and the Phase 28 Evals dashboard import this
 * constant from the shared eval core — they can never drift apart (D-03).
 */
export const THRESHOLDS: number[] = Array.from({ length: 12 }, (_, i) => 35 + i * 5);
```
Mirror exactly this pattern: section divider comment, JSDoc explaining "one constant, no drift" rationale, then `export const … =`.

**Core `as const` pattern to produce** (new — planner writes this):
```typescript
// ---------------------------------------------------------------------------
// Detection configuration — single source of truth (D-04 / D-05)
// ---------------------------------------------------------------------------

/**
 * Canonical detection constants consumed by the runtime (content script) and the
 * eval CLI (scripts/eval.ts). Neither may hard-code a threshold or weight literal —
 * they MUST import from this module so they can never drift apart.
 *
 * Phase 29 constraint: zero behavior change. All values replicate existing literals
 * exactly. Tuning is Phase 32/33.
 */
export const detectionConfig = {
  thresholds: {
    flag: 35,               // src/content/index.ts L26 — FLAG_THRESHOLD
    openToWorkPenalty: 20,  // src/content/index.ts L27 — OPEN_TO_WORK_PENALTY
    autoHideDefault: 60,    // src/content/index.ts L78, L170, L217 — ?? 60 fallbacks
  },
  weights: {
    listicleCta: {
      both: 25,             // heuristic.ts L85 — both listicle + CTA present
      listicleOnly: 12,     // heuristic.ts L89 — listicle only
      ctaOnly: 8,           // heuristic.ts L92 — CTA only
    },
    buzzword: { max: 15 },  // heuristic.ts L98 — checkBuzzwords cap
    emDash: { max: 10 },    // heuristic.ts L103 — checkEmDash cap
    aiVocab: { max: 12 },   // heuristic.ts L113 — checkAiVocab cap (comment: "up to 12 pts")
    hookStory: { max: 20 }, // heuristic.ts L121 — checkHookStory cap (comment: "up to 20 pts")
    motivational: { max: 20 }, // heuristic.ts L127 — checkMotivational cap (comment: "up to 20 pts")
    impersonal: { max: 15 }, // heuristic.ts L134 — checkImpersonalVoice cap (comment: "up to 15 pts")
    genericComments: {
      gate: 20,             // heuristic.ts L144 — content score > 20 gate
      max: 15,              // heuristic.ts L58 comment — "up to 15 pts"
    },
  },
  maxPostsPerSession: 50,   // seeded now for Phase 31 (Cost Guardrail); not yet consumed
} as const;
```

**Note on signal max values:** Several signals (`buzzword`, `emDash`, `aiVocab`, `hookStory`, `motivational`, `impersonal`, `genericComments`) return values produced entirely inside their own signal module — `heuristic.ts` receives them and adds them verbatim to the score. The `max` keys represent the stated caps in heuristic.ts JSDoc comments, not a cap applied inside heuristic.ts itself. The planner must decide whether Phase 29 should also thread the max through (e.g. `Math.min(buzzScore, detectionConfig.weights.buzzword.max)`) or simply document the existing cap for Phase 32. The zero-behavior-change constraint means the Phase 29 executor should NOT introduce a `Math.min` call that didn't exist before — just name the cap in the config object for Phase 32 readiness.

---

### `src/content/index.ts` — MODIFY (content-script, event-driven)

**Current literals to replace** (exact locations):

Line 26:
```typescript
const FLAG_THRESHOLD = 35;
```
→ Delete this line; replace all 3 uses of `FLAG_THRESHOLD` with `detectionConfig.thresholds.flag`.

Line 27:
```typescript
const OPEN_TO_WORK_PENALTY = 20;
```
→ Delete this line; replace the single use of `OPEN_TO_WORK_PENALTY` (line 304) with `detectionConfig.thresholds.openToWorkPenalty`.

Line 78 (current `let currentThreshold = 60;`):
```typescript
let currentThreshold = 60;
```
→ Change to `let currentThreshold = detectionConfig.thresholds.autoHideDefault;`

Line 170 (inside `chrome.storage.onChanged`):
```typescript
const newThreshold = (changes['settings'].newValue as { autoHideThreshold?: number } | undefined)?.autoHideThreshold ?? 60;
```
→ Replace `?? 60` with `?? detectionConfig.thresholds.autoHideDefault`

Line 217 (inside `init()`):
```typescript
const autoHideThreshold = settings?.autoHideThreshold ?? 60;
```
→ Replace `?? 60` with `?? detectionConfig.thresholds.autoHideDefault`

**Import to add** (insert after existing imports, before the DEBUG constant):
```typescript
import { detectionConfig } from '../shared/detectionConfig';
```

**FLAG_THRESHOLD uses** (lines 324 and 327 — confirm both):
```typescript
// line 324
if (captureUnflaggedPosts && mergedScore < FLAG_THRESHOLD) {
// line 327
if (mergedScore < FLAG_THRESHOLD) return;
```
Both become `detectionConfig.thresholds.flag`.

---

### `src/content/detector/heuristic.ts` — MODIFY (detector/service, transform)

**Current weight literals to replace** — all in `detect()` method (lines 73–163):

Lines 83–95 (listicle-cta composite):
```typescript
if (listicleScore > 0 && ctaScore > 0) {
  breakdown['listicle-cta'] = 25;
  score += 25;
} else if (listicleScore > 0) {
  breakdown['listicle-cta'] = 12;
  score += 12;
} else if (ctaScore > 0) {
  breakdown['listicle-cta'] = 8;
  score += 8;
}
```
→ Replace `25`, `25`, `12`, `12`, `8`, `8` with `detectionConfig.weights.listicleCta.both` (×2), `detectionConfig.weights.listicleCta.listicleOnly` (×2), `detectionConfig.weights.listicleCta.ctaOnly` (×2).

Line 144 (generic-comments gate):
```typescript
if (score > 20 && this.options.fetchComments !== undefined) {
```
→ Replace `20` with `detectionConfig.weights.genericComments.gate`

Lines 159 (confidence thresholds):
```typescript
confidence: finalScore >= 60 ? 'high' : finalScore >= 35 ? 'medium' : 'low',
```
The `60` and `35` here are confidence band thresholds, NOT `autoHideDefault` or `FLAG_THRESHOLD`. They are intrinsic to the heuristic's 3-band confidence output. CONTEXT.md D-04 scopes extraction to "heuristic weight literals" — these confidence thresholds are distinct from detection thresholds/weights. Confirm with planner whether to include them in `detectionConfig.thresholds` (e.g. `confidenceHigh: 60`, `confidenceMedium: 35`) or treat them as heuristic-internal. Phase 29's strict zero-behavior-change goal is satisfied either way; inclusion is safer for Phase 32 completeness.

**Import to add** (insert after existing imports, before the `HeuristicDetectorOptions` interface):
```typescript
import { detectionConfig } from '../../shared/detectionConfig';
```

**Signals for which no literal appears in heuristic.ts** (buzzword/em-dash/ai-vocab/hook-story/motivational/impersonal max values): The `checkXxx()` functions return their own computed values; heuristic.ts does not apply a `Math.min` cap — it uses the returned value directly. No literals to replace in heuristic.ts for these signals. The `max` keys in `detectionConfig.weights` document the design intent from the JSDoc comments but require no code change in Phase 29.

---

### `scripts/eval.ts` — MODIFY (CLI utility, batch)

**Current threshold usage** — eval.ts imports `THRESHOLDS` from `src/shared/eval/index.js` (line 16–26). This is the sweep array and per D-03 it STAYS in `metrics.ts` — do not move it to `detectionConfig`.

**What eval.ts needs from detectionConfig:** The operating-point threshold (`detectionConfig.thresholds.flag = 35`) for any place in the CLI that currently hard-codes the operating threshold. Scanning the file: eval.ts does NOT currently hard-code `35` or `60` as literals — it uses `THRESHOLDS` (the sweep array) for the metric sweep and `bestF1Threshold` (computed post-sweep) for error analysis. No literal `35` or `60` appears in eval.ts outside the `THRESHOLDS` derivation already in metrics.ts.

**CONTEXT.md success criterion #4** says "eval CLI imports threshold/weight from detectionConfig so eval and runtime never drift." The correct action is to add the import and use `detectionConfig.thresholds.flag` wherever a single operating-point reference might otherwise be hard-coded in future. For Phase 29, this may be a documentation-only import with no call sites changed — or the planner may identify that the `bestF1Threshold` default fallback (`THRESHOLDS[0]!` on line 262) could reference `detectionConfig.thresholds.flag`. Confirm this is the intended "no drift" tie-in.

**Import to add** (after existing imports):
```typescript
import { detectionConfig } from '../src/shared/detectionConfig.js';
```

---

### `src/background/index.ts` — VERIFY NO CHANGE

**Confirmed:** Background script contains only:
- `REDERIVE_COOLOFF_MS = 5 * 60 * 1000` — scraper rate-limit constant
- `REDERIVE_DAILY_CAP = 5` — scraper rate-limit constant

No detection thresholds, no heuristic weights. Zero changes required. This confirms the CONTEXT.md note: "only REDERIVE_* scraper constants, likely no detection literal."

---

### `src/content/detector/heuristic.test.ts` — MODIFY (test, snapshot)

**Existing test structure** (lines 1–8, import pattern):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { HeuristicDetector } from './heuristic';
import type { PostData } from '../../shared/types';
```

**Existing fixtures** to use as golden-score snapshot baseline (D-06):

| Test | Post URN | Expected score / constraint | Key signals |
|---|---|---|---|
| clean prose | `urn:li:activity:1` | score === 0 | none |
| listicle + CTA | `urn:li:activity:2` | `signalBreakdown['listicle-cta'] === 25` | listicle-cta.both |
| heavy buzzwords | `urn:li:activity:3` | `signalBreakdown['buzzword'] === 15` | buzzword |
| em-dash | `urn:li:activity:4` | `signalBreakdown['em-dash'] >= 5` | em-dash |
| AI voice post | `urn:li:activity:voice001` | `score >= 60` | hook + motivational + impersonal |
| genuine human post | `urn:li:activity:human001` | `score <= 20` | none |

**Golden-score snapshot pattern to add** (new `describe` block, vitest snapshot style):
```typescript
import { describe, it, expect } from 'vitest';
import { HeuristicDetector } from './heuristic';
import type { PostData } from '../../shared/types';

describe('HeuristicDetector — golden-score snapshot (D-06 zero-behavior-change)', () => {
  it('scores all representative fixtures byte-identically before and after config refactor', async () => {
    const detector = new HeuristicDetector();
    // Run all canonical fixture posts and snapshot { score, signalBreakdown }
    // Snapshots are committed pre-refactor; the refactor must keep them identical.
    // If any snapshot diff appears, treat it as a bug, not a tuning decision.
    const fixtureResults = await Promise.all(FIXTURES.map(f => detector.detect(f)));
    expect(fixtureResults.map(r => ({ score: r.score, breakdown: r.signalBreakdown }))).toMatchSnapshot();
  });
});
```

The planner should extract the actual `score` and `signalBreakdown` values by running the existing tests before the refactor, then pin them as `toMatchSnapshot()` or `toStrictEqual({ score: N, breakdown: {...} })`. The toStrictEqual form is preferred since it is explicit and does not require the snapshot file to be committed separately.

---

## Shared Patterns

### `as const` Object Export — Single Source of Truth
**Source:** `src/shared/eval/metrics.ts` lines 21–31
**Apply to:** `src/shared/detectionConfig.ts`

The established codebase convention for "one constant, no drift" is:
1. A section divider comment with the decision reference (`D-03`, `D-04`)
2. A JSDoc block explaining what imports this constant and why it prevents drift
3. `export const NAME = { ... } as const;`

This is the only pattern in `src/shared/` for compile-time config objects. `detectionConfig.ts` must mirror it exactly.

### Host-Agnostic Contract
**Source:** `src/shared/eval/metrics.ts` lines 1–16 (module JSDoc)
**Apply to:** `src/shared/detectionConfig.ts`

All files under `src/shared/` carry the host-agnostic contract: no `chrome.*`, no `document.*`, no `fs`, no `process`. The module-level JSDoc must state this and list which contexts consume the module (content script + eval CLI).

### Import Path Convention
**Source:** `src/shared/eval/metrics.ts` line 18; `scripts/eval.ts` lines 14–30
**Apply to:** all modified files

- Within `src/`: use `'../../shared/detectionConfig'` (no `.js` extension — TypeScript resolves)
- Within `scripts/`: use `'../src/shared/detectionConfig.js'` (`.js` extension required — ESM + Node resolution, matches existing pattern on lines 13–30 of eval.ts)

---

## No Analog Found

None. All files either have a direct analog or are self-referential modifications.

---

## Metadata

**Analog search scope:** `src/shared/`, `src/content/`, `scripts/`
**Files read:** 7 source files (`metrics.ts`, `content/index.ts`, `heuristic.ts`, `eval.ts`, `heuristic.test.ts`, `background/index.ts`, `CLAUDE.md`)
**Pattern extraction date:** 2026-06-15
