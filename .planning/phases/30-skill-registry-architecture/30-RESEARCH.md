# Phase 30: Skill Registry Architecture - Research

**Researched:** 2026-06-16
**Domain:** TypeScript refactor — detection pipeline reorganization into a two-level skill registry
**Confidence:** HIGH (grounded entirely in the actual codebase; no external libraries required)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two-level model. `DetectorSkill` (heuristic, llm) is the top-level strategy; `SignalSkill` is the per-signal unit the `HeuristicDetector` composes. `LLMDetector` stays a `DetectorSkill` that does not consume `SignalSkill`s. The pluggable `Detector` call site in `content/index.ts` (detector selection at L233-235) is preserved.
- **D-02:** Signal skills have two flavors. `CodeSkill` = a TS module with arbitrary `run()` logic — the 10 existing signals migrate here unchanged. `PatternSkill` = declarative data (id + inputs + pattern/keyword/numeric rule + `weightKey`) executed by a generic runner — MV3 CSP forbids `eval`/`new Function`. All 10 existing signals migrate as `CodeSkill`s in this phase; `PatternSkill` ships as a supported-but-unused type.
- **D-03:** Exclusions become a third skill kind (`ExclusionSkill`) — sponsored, company, non-English/language.
- **D-04:** Each skill is self-describing: `id` (matches its `detectionConfig` weight key AND its `signalBreakdown` key for signal skills), declared `inputs` (`text` | `profile` | `comments`), and a `sync` flag (true = no `await`).
- **D-05:** Signal skills read their weight from `detectionConfig` via `weightKey` — no weight literal is reintroduced into a skill module.
- **D-06:** `SkillRegistry` mirrors `SelectorRegistry` (per CLAUDE.md constraint #1): code seed = built-in skills; `chrome.storage.local` may carry additional declarative defs. Only `SkillRegistry` writes skill defs to storage. Seeded with zero declarative skills at launch.
- **D-07:** Registration is static/explicit for built-ins (an array/map of imported skill modules — tree-shakeable, MV3-CSP-safe, no dynamic `import`), plus the storage-hydration layer for declarative skills.
- **D-08:** Zero behavior change. Migrating the 10 signals into `CodeSkill`s must keep the Phase 29 golden-score snapshot byte-identical (`heuristic.test.ts`).
- **D-09:** Exclusion parity — modeling exclusions as `ExclusionSkill`s must not change which posts are excluded, and must preserve hard-exclusions-before-detection ordering (CLAUDE.md constraint #5).

### Claude's Discretion

- Exact module layout (e.g., `src/shared/skills/` for the host-agnostic registry + types, signal skill modules co-located vs under `detector/signals/`).
- How `HeuristicDetector` becomes a registry runner while preserving D-08.
- The `PatternSkill` declarative schema details (which rule kinds ship first).
- Where exclusion logic physically moves from the inline `checkExclusions` in `content/index.ts` into exclusion skill modules.

### Deferred Ideas (OUT OF SCOPE)

- LLM skill-authoring mechanism (generation/validation/write-to-storage).
- LLM-primary promotion (old LLM-01/02/03: always-primary, scored-URN cache, optimistic pre-hide) — dropped from roadmap.
- Richer `PatternSkill` rule kinds (beyond keyword/regex/numeric).
- Migrating complex signals (comments, profile, hook-story) to declarative.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SKILL-01 | Detection logic is organized as a two-level skill registry — DetectorSkill, SignalSkill, ExclusionSkill — replacing the hand-wired signal pipeline in `heuristic.ts` and the inline exclusion checks in the content script. | §Signal Pipeline Anatomy, §Skill Type System Design, §HeuristicDetector as Registry Runner |
| SKILL-02 | A `SkillRegistry` seeds built-in skills in code and hydrates additional declarative skills from `chrome.storage.local` with a code-seed fallback (mirroring `SelectorRegistry`); seeded with zero declarative skills so behavior is unchanged; only `SkillRegistry` writes skill definitions to storage. | §SkillRegistry API Design, §SelectorRegistry Pattern Analysis |
| SKILL-03 | Hard-exclusion ordering is preserved — ExclusionSkills run and can short-circuit before any DetectorSkill/SignalSkill runs. | §ExclusionSkill Design, §Exclusion Short-Circuit Ordering |
| SKILL-04 | Zero behavior change — same posts excluded and flagged, same scores and breakdown; Phase 29 golden-score snapshot stays byte-identical; exclusion parity verified on a representative fixture set. | §Golden-Score Snapshot Analysis, §Migration Landmines |
</phase_requirements>

---

## Summary

Phase 30 is a pure TypeScript refactor — no new runtime behavior, no new npm packages, no new external dependencies. The existing detection pipeline in `heuristic.ts` is hand-wired (10 import + call pairs, one composite listicle-cta rule). The existing exclusion logic is inline in `content/index.ts` via `checkExclusions()` in `exclusions.ts`. This phase reorganizes both into a typed registry pattern that mirrors `SelectorRegistry` so that a future phase can add declarative (LLM-authored) skills without touching the registry API.

The central structural challenge is replacing the hand-wired signal pipeline with a registry runner while producing byte-identical output — specifically preserving the listicle-cta composite logic (two signals summed into one `signalBreakdown` key), the comments gate (only invoked when `score > 20`), and the `profile` signal's special position (merged OUTSIDE `HeuristicDetector.detect()` in the content script). The golden-score snapshot in `heuristic.test.ts` is the operational guard.

The `SelectorRegistry` in `src/content/selector-registry.ts` is the proven architectural template. `SkillRegistry` should follow its `seedIfNeeded() / load() / resolve()` pattern with a module-scope in-memory cache, `chrome.storage.onChanged` listener for cross-tab refresh, and a code-seed fallback for pre-load calls. At launch, zero declarative skills are seeded — the registry's storage slot will exist but its declarative skill list is empty, leaving behavior unchanged.

**Primary recommendation:** Host the registry types and `SkillRegistry` singleton in `src/shared/skills/` (host-agnostic, importable by both content script and future eval tooling). Keep signal skill modules co-located with their existing signal files under `src/content/detector/signals/` as thin `CodeSkill` wrappers. Exclusion skills live in a new `src/content/exclusions/` directory.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SkillRegistry types + schema | `src/shared/skills/` | — | Host-agnostic; importable by both content script and Node.js eval CLI without chrome.* access |
| SkillRegistry singleton (storage hydration) | `src/content/skill-registry.ts` | — | Needs `chrome.storage.local`; mirrors `selector-registry.ts` location |
| CodeSkill wrappers for 10 signals | `src/content/detector/signals/` | — | Co-located with the signal logic they wrap; no duplication |
| PatternSkill type definition | `src/shared/skills/` | — | Declarative schema is host-agnostic data; no runtime chrome.* |
| ExclusionSkill modules | `src/content/exclusions/` (new) | — | Needs DOM access (`postNode`) for sponsored/open-to-work checks |
| HeuristicDetector (registry runner) | `src/content/detector/heuristic.ts` | — | Same file, refactored body; still implements `Detector` interface |
| DetectorSkill / LLMDetector | `src/content/detector/llm.ts` | — | Minimal rename: `implements DetectorSkill` instead of `Detector` |
| Registry init | `src/content/index.ts` | — | Alongside existing `seedIfNeeded() / load()` calls at L208-209 |

---

## Standard Stack

No new packages. This phase is pure TypeScript refactor of existing code.

**Confirmed existing dependencies (all already in package.json):**
- TypeScript (`as const`, discriminated unions, interface extension) — used throughout
- `fast-levenshtein` — already imported in `signals/comments.ts`; no change
- `chrome.storage.local` — already used by `SelectorRegistry`; `SkillRegistry` follows the same pattern

### Package Legitimacy Audit

No new packages are installed in this phase. This section is not applicable.

---

## Signal Pipeline Anatomy (VERIFIED from `heuristic.ts`)

This is the exact data flow `HeuristicDetector.detect()` currently executes. The registry runner MUST reproduce this byte-identically.

### Step-by-step pipeline

```
Input: PostData { urn, authorId, authorName, authorProfileUrl, postText }

let breakdown: Record<string, number> = {}
let score = 0

Step 1 — Listicle-CTA Composite (single breakdown key 'listicle-cta')
  listicleScore = checkListicle(post.postText)     // returns 0|6|8|12
  ctaScore      = checkCta(post.postText)           // returns 0|4|6|10
  if (listicleScore > 0 && ctaScore > 0):
    breakdown['listicle-cta'] = 25                  // detectionConfig.weights.listicleCta.both
    score += 25
  elif (listicleScore > 0):
    breakdown['listicle-cta'] = 12                  // detectionConfig.weights.listicleCta.listicleOnly
    score += 12
  elif (ctaScore > 0):
    breakdown['listicle-cta'] = 8                   // detectionConfig.weights.listicleCta.ctaOnly
    score += 8

Step 2 — Buzzwords (breakdown key 'buzzword')
  buzzScore = checkBuzzwords(post.postText)          // returns 0|8|15
  if (buzzScore > 0): breakdown['buzzword'] = buzzScore; score += buzzScore

Step 3 — Em-dash (breakdown key 'em-dash')
  emDashScore = checkEmDash(post.postText)           // returns 0|5|10
  if (emDashScore > 0): breakdown['em-dash'] = emDashScore; score += emDashScore

Step 3b — AI-vocab (breakdown key 'ai-vocab')
  aiVocabScore = checkAiVocab(post.postText)         // returns 0|6|12
  if (aiVocabScore > 0): breakdown['ai-vocab'] = aiVocabScore; score += aiVocabScore

Step 3c — Hook-story (breakdown key 'hook-story')
  hookScore = checkHookStory(post.postText)          // returns 0|15|20
  if (hookScore > 0): breakdown['hook-story'] = hookScore; score += hookScore

Step 3d — Motivational (breakdown key 'motivational')
  motivationalScore = checkMotivational(post.postText) // returns 0|12|20
  if (motivationalScore > 0): breakdown['motivational'] = motivationalScore; score += motivationalScore

Step 3e — Impersonal (breakdown key 'impersonal')
  impersonalScore = checkImpersonalVoice(post.postText) // returns 0|8|15
  if (impersonalScore > 0): breakdown['impersonal'] = impersonalScore; score += impersonalScore

Step 4 — Generic-Comments (ASYNC, GATED, breakdown key 'generic-comments')
  GATE: only if (score > 20 && this.options.fetchComments !== undefined)
  comments = await this.options.fetchComments(post)
  commentScore = checkGenericComments(comments)      // returns 0|10|15
  if (commentScore > 0): breakdown['generic-comments'] = commentScore; score += commentScore

finalScore = Math.min(score, 100)

Return: {
  score: finalScore,
  signals: Object.keys(breakdown),          // insertion-order of breakdown object
  signalBreakdown: { ...breakdown },
  confidence: finalScore >= 60 ? 'high' : finalScore >= 35 ? 'medium' : 'low',
  engineUsed: 'heuristic',
}
```

### Critical invariants the runner MUST preserve

1. **`listicle-cta` is a composite key** — `checkListicle` and `checkCta` each run ONCE. Their combined outcome maps to one `breakdown` key with a weight from `detectionConfig.weights.listicleCta.{both|listicleOnly|ctaOnly}`. If the runner naively calls each signal independently and sums, it will produce TWO breakdown keys (`listicle-cta` for listicle and another for cta) or duplicate count — both break the snapshot.

2. **`generic-comments` is async and gated** — it uses `fetchComments` (injected via constructor options), is gated behind `score > 20`, and the `sync: false` flag signals this. The runner MUST check the gate before awaiting.

3. **`profile` signals are NOT run inside `HeuristicDetector`** — they are extracted in `content/index.ts` via `extractProfileSignals(postNode)` and merged into `result.signalBreakdown` after `detector.detect()` returns (lines 309-311 of `content/index.ts`). Profile is not a `SignalSkill` fed through the registry runner — it remains a separate extraction path in the content script.

4. **Breakdown key insertion order === `signals[]`** — the test asserts `result.signals === Object.keys(result.signalBreakdown)`. The runner must build `breakdown` in step-order (listicle-cta → buzzword → em-dash → ai-vocab → hook-story → motivational → impersonal → generic-comments).

5. **`score > 20` gate uses the running score BEFORE adding comments**, not the final score.

---

## Golden-Score Snapshot Analysis (VERIFIED from `heuristic.test.ts`)

The Phase 29 golden-score snapshot pins these exact values. Any change to these is a bug:

| Fixture | Expected score | Expected breakdown |
|---------|---------------|-------------------|
| clean-prose post | 0 | `{}` |
| listicle+CTA post | 25 | `{ 'listicle-cta': 25 }` |
| heavy-buzzword post | 15 | `{ buzzword: 15 }` |
| em-dash post | 10 | `{ 'em-dash': 10 }` |
| AI-voice post | 63 | `{ 'listicle-cta': 8, 'hook-story': 20, motivational: 20, impersonal: 15 }` |
| genuine-human post | 0 | `{}` |

The AI-voice post breakdown is the most revealing: `listicle-cta: 8` (CTA-only tier) confirms that `checkCta` fires (CTA closer "Drop a comment below") but `checkListicle` does NOT fire on that fixture. This is the case where `ctaScore > 0 && listicleScore === 0`, so the `ctaOnly` branch applies.

The test also asserts `result.signals === Object.keys(result.signalBreakdown)` which pins breakdown key order.

---

## Skill Type System Design

### `DetectorSkill` interface

`DetectorSkill` generalizes the existing `Detector` interface from `src/shared/types.ts` (L66-71). Minimal change: add `kind: 'detector'` discriminant.

```typescript
// src/shared/skills/types.ts
export interface DetectorSkill {
  kind: 'detector';
  name: string;  // 'heuristic' | 'llm' — matches existing DetectionResult.engineUsed
  detect(post: PostData): Promise<DetectionResult>;
}
```

The existing `Detector` interface can be kept as a type alias (`export type Detector = DetectorSkill`) or `DetectorSkill` can extend `Detector`. Either approach keeps the existing `content/index.ts` call site unchanged. [ASSUMED — precise alias strategy is Claude's discretion per CONTEXT.md]

### `SignalSkillBase` — shared contract

```typescript
// src/shared/skills/types.ts
export type SignalInput = 'text' | 'profile' | 'comments';

export interface SignalSkillBase {
  kind: 'signal';
  id: string;           // matches signalBreakdown key AND detectionConfig weight key
  inputs: SignalInput[];
  sync: boolean;        // true = no await needed; false = async (e.g. generic-comments)
}
```

### `CodeSkill` — wraps existing signal module

```typescript
export interface CodeSkill extends SignalSkillBase {
  flavor: 'code';
  // Receives only the inputs it declared in `inputs[]`
  run(ctx: SignalContext): number | Promise<number>;
}
```

### `PatternSkill` — declarative, LLM-authorable, MV3-CSP-safe

```typescript
export type PatternRule =
  | { kind: 'keyword-set'; keywords: string[]; matchMode: 'any' | 'density'; densityThreshold?: number; }
  | { kind: 'regex'; patterns: string[]; minHits: number; }           // stored as strings — no eval
  | { kind: 'numeric-threshold'; extractFn: 'em-dash-density' | 'word-count'; operator: '>'; value: number; };

export interface PatternSkill extends SignalSkillBase {
  flavor: 'pattern';
  weightKey: string;    // key path into detectionConfig.weights (e.g. 'emDash.max')
  rule: PatternRule;
  // NO run() — executed by the generic PatternSkillRunner, not the skill itself
}
```

**MV3-CSP safety:** `regex` patterns are stored as strings and compiled at runner startup with `new RegExp(...)` from known, validated sources — NOT eval. This is the same pattern used by `SelectorRegistry` (selectors are strings compiled to `querySelector` calls). [VERIFIED: MV3 CSP forbids `eval`/`new Function` at runtime — confirmed in CONTEXT.md D-02 and CLAUDE.md specifics section]

### `ExclusionSkill`

```typescript
export interface ExclusionSkill {
  kind: 'exclusion';
  id: string;           // 'sponsored' | 'company-page' | 'non-english' | 'open-to-work'
  // Returns ExclusionResult — same interface as current checkExclusions() result type
  check(postData: PostData, postNode: Element): ExclusionResult;
}
```

**Note on `open-to-work`:** The current `checkExclusions()` returns `{ excluded: false, openToWork: true }` for Open-to-Work posts — it is NOT an exclusion but a metadata passthrough. The runner must propagate this flag unchanged to the caller (content script), which applies the `+20` threshold penalty. This can be modeled as a fourth `ExclusionSkill` with `id: 'open-to-work'` that always returns `excluded: false` but sets `openToWork: true`. [ASSUMED — exact ExclusionSkill count is Claude's discretion]

### Union type

```typescript
export type SignalSkill = CodeSkill | PatternSkill;
export type AnySkill = DetectorSkill | SignalSkill | ExclusionSkill;
```

### `SignalContext` — what the runner passes to `run()`

```typescript
export interface SignalContext {
  postData: PostData;
  fetchComments?: (post: PostData) => Promise<string[]>;
}
```

---

## SelectorRegistry Pattern Analysis (VERIFIED from `src/content/selector-registry.ts`)

The `SkillRegistry` MUST follow this exact pattern:

| SelectorRegistry concept | SkillRegistry equivalent |
|--------------------------|-------------------------|
| `let _cache: SelectorRegistrySchema \| null = null` | `let _cache: SkillRegistrySchema \| null = null` |
| `SEED_MAP: Record<SelectorTarget, string>` | Built-in code skills: imported array, never from storage |
| `seedIfNeeded()` — write storage if absent or version-bumped | `seedIfNeeded()` — write storage slot if absent (stores declarative skills only) |
| `load()` — warm cache from storage | `load()` — merge code seeds with stored declarative skills into cache |
| `resolve(target)` — sync, falls back to seed if `_cache` is null | `getSignalSkills()` / `getExclusionSkills()` — return merged list from cache |
| `registerOnChangedListener()` — cross-tab cache refresh | Same: refresh `_cache` when `skillRegistry` storage key changes |
| `buildSeedRegistry()` — full seed schema | `buildSeedRegistry()` — schema with code skills listed but declarative list empty `[]` |
| `migrate(stored)` — additive migration preserving adapted candidates | `migrate(stored)` — additive: code seeds always present, stored declarative skills merged in |
| Only `SelectorRegistry` writes `selectorRegistry` to storage | Only `SkillRegistry` writes `skillRegistry` to storage |

**Key difference:** The code-seed skills are NEVER written to storage — only declarative (`PatternSkill` / declarative `ExclusionSkill`) skills live in storage. The code seeds are always freshly loaded from imports on every extension load. This is safer than `SelectorRegistry` (which does write seed candidates to storage) because skills have executable logic, not just strings.

### Proposed `SkillRegistrySchema` (storage shape)

```typescript
// src/shared/skills/types.ts
export const SKILL_REGISTRY_VERSION = '1.0.0';

export interface SkillRegistrySchema {
  version: string;
  declarativeSignalSkills: PatternSkill[];     // seeded with [] at launch
  declarativeExclusionSkills: ExclusionSkill[]; // seeded with [] at launch (future)
  lastModifiedAt: string | null;
}
```

### `StorageSchema` addition

```typescript
// src/shared/types.ts — add one field
skillRegistry?: SkillRegistrySchema;
```

### SkillRegistry API surface

```typescript
// src/content/skill-registry.ts
export async function seedIfNeeded(): Promise<void>
export async function load(): Promise<void>
export function getSignalSkills(): SignalSkill[]       // code skills + declarative, in order
export function getExclusionSkills(): ExclusionSkill[] // same
export async function addDeclarativeSkill(skill: PatternSkill): Promise<void>  // single writer
```

---

## HeuristicDetector as Registry Runner

### Current: hand-wired (explicit calls)

```typescript
const listicleScore = checkListicle(post.postText);
const ctaScore = checkCta(post.postText);
// ... composite rule ...
const buzzScore = checkBuzzwords(post.postText);
// ... etc
```

### After: registry runner loop

The composite `listicle-cta` logic cannot be expressed as two independent `SignalSkill`s — it is inherently a joined rule that must evaluate both and select a single weight tier. The cleanest solution is to keep it as a SINGLE `CodeSkill` with `id: 'listicle-cta'` that internally calls both `checkListicle` and `checkCta`:

```typescript
// src/content/detector/signals/listicle-cta.ts  (NEW combined skill)
export const listicleCtaSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'listicle-cta',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    const listicleScore = checkListicle(postData.postText);
    const ctaScore = checkCta(postData.postText);
    if (listicleScore > 0 && ctaScore > 0) return detectionConfig.weights.listicleCta.both;
    if (listicleScore > 0) return detectionConfig.weights.listicleCta.listicleOnly;
    if (ctaScore > 0) return detectionConfig.weights.listicleCta.ctaOnly;
    return 0;
  },
};
```

This preserves the composite key and the weight-tier lookup while fitting the `CodeSkill` contract. `listicle.ts` and `cta.ts` remain unchanged as internal helpers.

### Runner loop in `HeuristicDetector.detect()`

```typescript
async detect(post: PostData): Promise<DetectionResult> {
  const breakdown: Record<string, number> = {};
  let score = 0;

  const skills = getSignalSkills(); // from skill-registry; returns [listicle-cta, buzzword, em-dash, ...]

  // Sync pass first (all sync skills)
  for (const skill of skills) {
    if (!skill.sync) continue;
    const result = (skill as CodeSkill).run({ postData: post });
    // result is number (sync path)
    if ((result as number) > 0) {
      breakdown[skill.id] = result as number;
      score += result as number;
    }
  }

  // Async gated pass (generic-comments only, gated behind score > gate threshold)
  for (const skill of skills) {
    if (skill.sync) continue;
    if (skill.id === 'generic-comments') {
      if (score > detectionConfig.weights.genericComments.gate && this.options.fetchComments) {
        const comments = await this.options.fetchComments(post);
        const commentScore = checkGenericComments(comments);
        if (commentScore > 0) {
          breakdown['generic-comments'] = commentScore;
          score += commentScore;
        }
      }
      continue;
    }
    // future async skills handled here
  }

  const finalScore = Math.min(score, 100);
  return {
    score: finalScore,
    signals: Object.keys(breakdown),
    signalBreakdown: { ...breakdown },
    confidence: finalScore >= 60 ? 'high' : finalScore >= 35 ? 'medium' : 'low',
    engineUsed: 'heuristic',
  };
}
```

**Ordering constraint:** The `getSignalSkills()` return order MUST match the current pipeline step order (listicle-cta → buzzword → em-dash → ai-vocab → hook-story → motivational → impersonal → generic-comments), because `Object.keys(breakdown)` is insertion-order and the test pins `signals[]` order.

---

## CodeSkill Wrappers: Signal-by-Signal Map

All 10 existing signal modules stay unchanged. Each gets a thin `CodeSkill` wrapper that calls its existing function.

| Skill `id` | Current function | Input | Sync | Weight key in `detectionConfig` | Notes |
|------------|-----------------|-------|------|--------------------------------|-------|
| `listicle-cta` | `checkListicle` + `checkCta` (combined) | `text` | `true` | `listicleCta.{both\|listicleOnly\|ctaOnly}` | Single composite skill — see §HeuristicDetector as Registry Runner |
| `buzzword` | `checkBuzzwords` | `text` | `true` | `buzzword.max` | Returns 0/8/15 directly (not bounded by max in signal; max is a documentation cap) |
| `em-dash` | `checkEmDash` | `text` | `true` | `emDash.max` | Returns 0/5/10 |
| `ai-vocab` | `checkAiVocab` | `text` | `true` | `aiVocab.max` | Returns 0/6/12 |
| `hook-story` | `checkHookStory` | `text` | `true` | `hookStory.max` | Returns 0/15/20 |
| `motivational` | `checkMotivational` | `text` | `true` | `motivational.max` | Returns 0/12/20 |
| `impersonal` | `checkImpersonalVoice` | `text` | `true` | `impersonal.max` | Returns 0/8/15 |
| `generic-comments` | `checkGenericComments` | `comments` | `false` | `genericComments.{gate\|max}` | Async; gated by running score > 20; `fetchComments` injected via options |

**Profile signals (`headline-formula`, `degree-3`) are NOT signal skills in this phase.** They remain in `extractProfileSignals()` in `src/content/detector/signals/profile.ts`, called from `content/index.ts` and merged into the breakdown after `detector.detect()`. This is NOT inside `HeuristicDetector` and should NOT be moved in this phase (it requires `postNode` which is not a `SignalContext` input). [VERIFIED: `content/index.ts` lines 302-311 show this clearly]

---

## ExclusionSkill Design

### Current exclusion flow (VERIFIED from `exclusions.ts` and `language.ts`)

Four checks in strict priority order:

1. **Sponsored** — `postNode.querySelector(resolve('SPONSORED_MARKER'))` — DOM check, sync
2. **Company page** — `postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))` — string check, sync
3. **Non-English** — `isNonEnglish(postNode, postData.postText)` — DOM + text check, sync
4. **Open-to-Work** — `postNode.querySelector(resolve('OPEN_TO_WORK_MARKER'))` — metadata passthrough, not an exclusion

Each becomes a separate `ExclusionSkill`. The runner calls them in registration order and short-circuits on the first `excluded: true` result.

### ExclusionSkill modules

```typescript
// src/content/exclusions/sponsored.skill.ts
export const sponsoredExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'sponsored',
  check(postData, postNode) {
    return postNode.querySelector(resolve('SPONSORED_MARKER'))
      ? { excluded: true, reason: 'sponsored' }
      : { excluded: false };
  },
};

// src/content/exclusions/company-page.skill.ts
export const companyPageExclusionSkill: ExclusionSkill = { ... };

// src/content/exclusions/non-english.skill.ts
export const nonEnglishExclusionSkill: ExclusionSkill = { ... };

// src/content/exclusions/open-to-work.skill.ts
export const openToWorkExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'open-to-work',
  check(postData, postNode) {
    return {
      excluded: false,
      openToWork: !!postNode.querySelector(resolve('OPEN_TO_WORK_MARKER')),
    };
  },
};
```

### Exclusion Short-Circuit Ordering

The runner in `content/index.ts` replaces the current `checkExclusions()` call:

```typescript
// Before (current):
const exclusion = checkExclusions(postData, postNode);
if (exclusion.excluded) return;

// After:
let exclusionResult: ExclusionResult = { excluded: false };
for (const skill of getExclusionSkills()) {  // from skill-registry
  const result = skill.check(postData, postNode);
  if (result.excluded) { exclusionResult = result; break; }
  if (result.openToWork) exclusionResult = { ...exclusionResult, openToWork: true };
}
if (exclusionResult.excluded) return;
```

This preserves CLAUDE.md constraint #5 (hard exclusions before detection) and D-09 (parity) because:
- The registration order of exclusion skills matches the current priority order
- The short-circuit `break` matches the current early-return behavior

### `checkExclusions()` fate

The existing `src/content/exclusions.ts` function `checkExclusions()` can either:
- Be kept as a thin wrapper over the runner (for backwards compatibility during the transition), OR
- Be deleted and its callers updated to use the runner directly

Given zero behavior change is required, the wrapper approach is safer for the Wave 1 → Wave 2 transition.

---

## PatternSkill Declarative Schema

The schema ships in this phase but is used by zero seeded skills. Its design only needs to be expressive enough to cover the simplest existing signals as a proof.

**Em-dash** is the cleanest proof signal:

```typescript
// EXAMPLE — not seeded in this phase, but this is what a PatternSkill for em-dash would look like
const emDashPatternSkill: PatternSkill = {
  kind: 'signal',
  flavor: 'pattern',
  id: 'em-dash',
  inputs: ['text'],
  sync: true,
  weightKey: 'emDash.max',
  rule: {
    kind: 'numeric-threshold',
    extractFn: 'em-dash-density',
    operator: '>',
    value: 1,    // > 1 per 100 words triggers
  },
};
```

**Buzzword keyword-set** is the next simplest:

```typescript
const buzzwordPatternSkill: PatternSkill = {
  kind: 'signal',
  flavor: 'pattern',
  id: 'buzzword',
  inputs: ['text'],
  sync: true,
  weightKey: 'buzzword.max',
  rule: {
    kind: 'keyword-set',
    keywords: ['synergy', 'leverage', ...],
    matchMode: 'density',
    densityThreshold: 1.5,
  },
};
```

**Rule kinds to implement in this phase** (minimum viable for proof):
- `keyword-set` — covers buzzwords, ai-vocab (simplified)
- `regex` — covers hook-story, motivational, impersonal, cta patterns
- `numeric-threshold` — covers em-dash

The `PatternSkillRunner` executes these without `eval`/`new Function`. For `regex` rules, patterns are stored as strings and compiled once at runner startup: `patterns.map(p => new RegExp(p, 'gi'))`. This is fully MV3-CSP-safe.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── shared/
│   └── skills/
│       ├── types.ts           # All skill interfaces + schema types (host-agnostic)
│       └── pattern-runner.ts  # PatternSkillRunner (pure, no chrome.* — usable in eval)
├── content/
│   ├── skill-registry.ts      # Singleton: seedIfNeeded / load / get* / addDeclarativeSkill
│   ├── exclusions/            # (new directory)
│   │   ├── sponsored.skill.ts
│   │   ├── company-page.skill.ts
│   │   ├── non-english.skill.ts
│   │   └── open-to-work.skill.ts
│   └── detector/
│       ├── heuristic.ts       # Refactored: registry runner replaces hand-wired pipeline
│       └── signals/
│           ├── listicle-cta.skill.ts   # NEW combined skill wrapping listicle.ts + cta.ts
│           ├── buzzword.skill.ts
│           ├── em-dash.skill.ts
│           ├── ai-vocab.skill.ts
│           ├── hook-story.skill.ts
│           ├── motivational.skill.ts
│           ├── impersonal.skill.ts
│           ├── generic-comments.skill.ts
│           ├── listicle.ts     # unchanged (still the pure function)
│           ├── cta.ts          # unchanged
│           ├── buzzwords.ts    # unchanged
│           └── ...             # all other unchanged
└── content/
    └── index.ts               # Updated: skillRegistry init + exclusion runner loop
```

### Registration: static/explicit (D-07)

```typescript
// src/content/skill-registry.ts — built-in signal skill array (imported at module top)
import { listicleCtaSkill } from './detector/signals/listicle-cta.skill';
import { buzzwordSkill } from './detector/signals/buzzword.skill';
// ... etc

const CODE_SIGNAL_SKILLS: SignalSkill[] = [
  listicleCtaSkill,
  buzzwordSkill,
  emDashSkill,
  aiVocabSkill,
  hookStorySkill,
  motivationalSkill,
  impersonalSkill,
  genericCommentsSkill,
];

const CODE_EXCLUSION_SKILLS: ExclusionSkill[] = [
  sponsoredExclusionSkill,
  companyPageExclusionSkill,
  nonEnglishExclusionSkill,
  openToWorkExclusionSkill,
];
```

### `getSignalSkills()` merges code seeds + declarative

```typescript
export function getSignalSkills(): SignalSkill[] {
  if (!_cache) return CODE_SIGNAL_SKILLS;  // pre-load fallback
  return [...CODE_SIGNAL_SKILLS, ..._cache.declarativeSignalSkills];
}
```

At launch, `_cache.declarativeSignalSkills === []`, so this returns exactly `CODE_SIGNAL_SKILLS` — preserving zero behavior change.

### `content/index.ts` init additions

```typescript
// At init(), alongside existing seedIfNeeded() / load() at L208-209:
await skillRegistrySeedIfNeeded();
await skillRegistryLoad();
```

---

## Exclusion Parity Check Approach (D-09)

The test file `heuristic.test.ts` tests the scoring path but NOT exclusions. The plan must add an exclusion parity fixture test covering all four outcomes:

| Fixture | Expected `ExclusionResult` |
|---------|--------------------------|
| Post with sponsored marker present | `{ excluded: true, reason: 'sponsored' }` |
| Post with `/company/` in authorProfileUrl | `{ excluded: true, reason: 'company-page' }` |
| Post with CJK text > 30% non-Latin | `{ excluded: true, reason: 'non-english' }` |
| Post with Open-to-Work marker | `{ excluded: false, openToWork: true }` |
| Normal English post | `{ excluded: false }` |

These tests should use the same JSDOM + `resolve()` mock approach already established in the codebase (the selector test files use vitest). The exclusion parity check lives in a new `src/content/exclusions/exclusions.test.ts`.

**The test must exercise the NEW runner path** (iterating `ExclusionSkill`s), not the old `checkExclusions()` directly. This is what proves parity.

---

## Migration Landmines

These are the specific risks that could break the golden-score snapshot or exclusion parity:

### Landmine 1: Listicle-CTA split
**Risk:** If the refactor creates two separate `SignalSkill` objects — one for `listicle` and one for `cta` — and calls them independently, the runner will produce separate breakdown keys (`listicle` and `cta`) or duplicate the composite weight. The golden-score snapshot will fail because it expects `{ 'listicle-cta': 25 }`, not two keys.
**Prevention:** The combined `listicle-cta.skill.ts` must remain a single `CodeSkill` that invokes both underlying functions and applies the composite weight tier. See §HeuristicDetector as Registry Runner above.

### Landmine 2: Breakdown key insertion order
**Risk:** If the runner processes signals in a different order than the current pipeline (e.g., by iterating an unordered `Map` or processing async skills first), `Object.keys(breakdown)` will have a different order and the `signals[]` array will fail the snapshot assertion.
**Prevention:** Use an ordered array (not a `Map`) as the skill registry's data structure. `CODE_SIGNAL_SKILLS` is declared as a `SignalSkill[]` array in step-order. `getSignalSkills()` preserves that order.

### Landmine 3: Generic-comments gate uses pre-gate score
**Risk:** If the runner tallies all sync scores AND declarative scores before checking the gate, and a declarative skill adds points, the gate threshold could be crossed by declarative skills alone (future risk, not this phase). More immediately: the gate check `score > 20` must be checked AFTER all sync skills have run but BEFORE the async skills await.
**Prevention:** The runner loop separates sync and async passes explicitly (see code sketch above). Since this phase seeds zero declarative skills, the gate value is identical to current behavior.

### Landmine 4: Profile signals accidentally absorbed into HeuristicDetector
**Risk:** If the refactor moves `extractProfileSignals()` into the `SignalSkill` registry (adding `headline-formula` and `degree-3` as signal skills), the `HeuristicDetector` would produce them in its breakdown. The content script ALSO merges them after `detect()` returns, causing double-counting.
**Prevention:** Profile signals are explicitly NOT signal skills. They require `postNode: Element` (not in `PostData`), which makes them structurally incompatible with `SignalContext`. Leave them in `content/index.ts`.

### Landmine 5: `sync` flag incorrectly set
**Risk:** If `generic-comments.skill.ts` has `sync: true`, the runner may not gate it correctly. If any actually-synchronous skill is marked `sync: false`, it incurs unnecessary await overhead (non-breaking but wasteful).
**Prevention:** `generic-comments` is the only `sync: false` skill among the 10. All others are pure functions with no async operations. Verify against the signal module source before setting the flag.

### Landmine 6: Weight literals reintroduced
**Risk:** A `CodeSkill.run()` implementation hard-codes `return 15` instead of reading from `detectionConfig`. This violates D-05 and will break future tuning in Phase 33.
**Prevention:** Signal skill `run()` methods MUST call `detectionConfig.weights.<key>` for any bounded return value, OR they call the underlying signal function (which returns the raw score already bounded internally). For the current 10 signals, all the underlying functions (`checkBuzzwords`, etc.) already encode their weights internally as literals — these are unchanged. The composite `listicle-cta` skill is the only one that MUST read from `detectionConfig.weights.listicleCta.*` because the composite tier is defined there.

### Landmine 7: `chrome.storage.local` key collision
**Risk:** Using a storage key that already exists in `StorageSchema` (e.g., accidentally reusing `selectorRegistry`).
**Prevention:** Add `skillRegistry?: SkillRegistrySchema` as a NEW key in `StorageSchema`. The storage key string should be `'skillRegistry'` (camelCase, matching `selectorRegistry` convention). Ensure `storageGet` and `storageSet` calls use this typed key.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill execution ordering | Custom DAG/dependency resolution | Ordered `SignalSkill[]` array in registration order | No signal has interdependencies; linear order suffices and is simpler |
| PatternSkill regex compilation | Compile patterns on every `run()` call | Compile once at registry `load()` time, cache in runner | Avoids repeated `new RegExp(...)` allocations per post |
| Declarative skill serialization | Custom JSON serializer | Plain `JSON.stringify/parse` — `PatternSkill` is already a pure data object | No circular refs, no functions |
| Cross-tab sync | Custom broadcast channel | `chrome.storage.onChanged` listener (already used by `SelectorRegistry`) | Proven existing pattern |

---

## Anti-Patterns to Avoid

- **Auto-discovery via `import.meta.glob`** — forbidden by D-07. No filesystem scanning. Registration is explicit imports.
- **Dynamic `import()` for skills** — forbidden by MV3 CSP and D-07. All skill modules are statically imported.
- **Storing code skills (CodeSkill) in `chrome.storage.local`** — only declarative (`PatternSkill`) skills live in storage. Code skills are always fresh from imports.
- **Running profile signals inside `HeuristicDetector`** — profile requires `postNode`, which is not part of `PostData` or `SignalContext`. Keep them in `content/index.ts`.
- **Two separate skills for listicle and CTA** — the composite rule MUST be one `CodeSkill` with one `id: 'listicle-cta'`.

---

## Runtime State Inventory

This is a refactor phase, not a rename phase. No stored data keys are changing names. The `skillRegistry` key is NEW (not renaming an existing key). No migration of existing stored data is required. [VERIFIED: no existing storage key named `skillRegistry` in `StorageSchema`]

---

## Environment Availability

Step 2.6: SKIPPED — this phase is a pure TypeScript refactor. No external tools, services, CLIs, runtimes, or databases beyond the existing project build chain (`npm test`, `npm run type-check`) are required.

Existing build infrastructure confirmed available:
- `npm test` (vitest) — used for golden-score snapshot
- `npm run type-check` (tsc) — enforces interface compliance

---

## Common Pitfalls

### Pitfall 1: Composite key fragmentation
**What goes wrong:** The `listicle-cta` composite is split into two skills; golden-score snapshot fails with unexpected breakdown keys.
**Why it happens:** Natural instinct is one skill = one signal function. But the composite rule was designed specifically to share one breakdown key.
**How to avoid:** Create `listicle-cta.skill.ts` as a single `CodeSkill` that internally calls both `checkListicle` and `checkCta`.
**Warning signs:** Test output shows `{ listicle: 12, cta: 6 }` instead of `{ 'listicle-cta': 25 }`.

### Pitfall 2: Profile signals double-counted
**What goes wrong:** `headline-formula` and `degree-3` appear both inside `HeuristicDetector` (from a `SignalSkill`) AND in the post-`detect()` merge in `content/index.ts`.
**Why it happens:** Profile signals look like other signals, so they seem natural candidates for `SignalSkill` migration.
**How to avoid:** Profile signals need `postNode: Element`. Verify `SignalContext` does not include `postNode`. Any signal that needs DOM access (not just text/profile/comments) must remain outside the registry.
**Warning signs:** Score for any post with a headline-formula match is 2× the expected value.

### Pitfall 3: Storage key already taken
**What goes wrong:** `skillRegistry` key collides with existing storage schema, corrupting another feature's data.
**Why it happens:** Not checking the full `StorageSchema` before choosing a key name.
**How to avoid:** Verify `StorageSchema` in `src/shared/types.ts` — confirm `skillRegistry` is absent before using it.
**Warning signs:** `selectorRegistry` data corrupted, or TypeScript error on `StorageSchema` extension.

### Pitfall 4: `signals[]` order non-deterministic
**What goes wrong:** `result.signals` order differs from the golden-score snapshot's expected breakdown key order.
**Why it happens:** Using a `Map<string, number>` or `Set` for breakdown accumulation (both are insertion-ordered in V8, but Map and object may diverge if populated via spread or Object.assign in wrong order).
**How to avoid:** Use a plain `Record<string, number>` object populated by property assignment in step-order (same as current code). The runner loop must iterate `CODE_SIGNAL_SKILLS` in the declared array order, and only THEN iterate async skills.
**Warning signs:** `expect(result.signals).toEqual(Object.keys(result.signalBreakdown))` test still passes but snapshot for AI-voice post fails because the order of keys is wrong.

---

## Code Examples

### CodeSkill wrapper pattern (em-dash as canonical simple example)

```typescript
// src/content/detector/signals/em-dash.skill.ts
import { checkEmDash } from './em-dash';
import type { CodeSkill } from '../../../shared/skills/types';

export const emDashSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'em-dash',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkEmDash(postData.postText);
  },
};
```

Note: `detectionConfig.weights.emDash.max` is documentation — `checkEmDash` already returns 0/5/10 from its own internal logic. The `weightKey` field is present on `CodeSkill` as metadata (`id` serves this role for lookups) but is not required to call `detectionConfig` unless the skill needs to read a configurable threshold.

### SkillRegistry init pattern (mirrors SelectorRegistry)

```typescript
// src/content/skill-registry.ts (key excerpts)
import { storageGet, storageSet } from '../shared/storage';

const SKILL_REGISTRY_VERSION = '1.0.0';
let _cache: SkillRegistrySchema | null = null;

export async function seedIfNeeded(): Promise<void> {
  registerOnChangedListener();
  const { skillRegistry } = await storageGet(['skillRegistry']);
  if (!skillRegistry || skillRegistry.version !== SKILL_REGISTRY_VERSION) {
    await storageSet({ skillRegistry: buildSeedRegistry() });
  }
}

export async function load(): Promise<void> {
  registerOnChangedListener();
  const { skillRegistry } = await storageGet(['skillRegistry']);
  _cache = skillRegistry ?? buildSeedRegistry();
}

function buildSeedRegistry(): SkillRegistrySchema {
  return {
    version: SKILL_REGISTRY_VERSION,
    declarativeSignalSkills: [],    // empty at launch
    declarativeExclusionSkills: [], // empty at launch
    lastModifiedAt: null,
  };
}
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `DetectorSkill` is best implemented by adding `kind: 'detector'` discriminant and keeping `Detector` as a type alias | Skill Type System Design | Low — the existing `Detector` interface call sites in content/index.ts only need `detect()` + `name`; the discriminant is additive |
| A2 | `open-to-work` is modeled as a fourth `ExclusionSkill` that always returns `excluded: false` with `openToWork` metadata | ExclusionSkill Design | Low — alternatively it could remain as special-case logic in the runner; either preserves parity |
| A3 | The registry runner handles the `generic-comments` gate inline (not via a property on the skill) | HeuristicDetector as Registry Runner | Medium — an alternative is adding a `gate?: (currentScore: number) => boolean` property to `CodeSkill`; the inline approach is simpler for this phase |
| A4 | `CodeSkill` wrappers live as `*.skill.ts` files alongside the unchanged signal `.ts` files | Recommended Project Structure | Low — alternative is co-locating in a new `skills/` subdirectory; either compiles correctly |

**No high-risk assumptions.** All critical structural claims are verified from the actual source files.

---

## Open Questions

1. **`Detector` interface backward compatibility**
   - What we know: `Detector` interface is used in `content/index.ts` at the `detector: Detector` variable declaration and in test stubs.
   - What's unclear: Whether `DetectorSkill` replaces `Detector` entirely (updating all call sites) or `Detector` remains as a type alias.
   - Recommendation: Safest is `export type Detector = DetectorSkill` in `types.ts` — zero call-site changes needed, the alias is transparent to TypeScript.

2. **`checkExclusions()` in `exclusions.ts` — keep or delete?**
   - What we know: The function is imported in `content/index.ts` and tested nowhere directly.
   - What's unclear: Whether to keep it as a wrapper (calling the exclusion runner) for a graceful transition, or replace the import site directly.
   - Recommendation: Replace the import site in `content/index.ts` directly (one change, simpler, no dead code). The old `exclusions.ts` file can be deleted or converted to re-export the individual skills.

3. **`storageGet`/`storageSet` typing for the new `skillRegistry` key**
   - What we know: `storageGet` uses the typed `StorageSchema` keys.
   - What's unclear: Whether adding `skillRegistry?: SkillRegistrySchema` to `StorageSchema` in `types.ts` is the only change needed.
   - Recommendation: Yes — this is the only change needed to `types.ts` for storage typing. The `SkillRegistrySchema` type lives in `src/shared/skills/types.ts` and is imported into `types.ts`.

---

## Sources

### Primary (HIGH confidence — verified from actual source files)

- `src/content/detector/heuristic.ts` — exact pipeline, weights, gate, breakdown keys
- `src/content/detector/heuristic.test.ts` — golden-score snapshot values
- `src/content/selector-registry.ts` — `SkillRegistry` template pattern
- `src/content/exclusions.ts` — exclusion priority order and `ExclusionResult` shape
- `src/content/detector/language.ts` — non-English detection logic
- `src/shared/detectionConfig.ts` — weight key names and values
- `src/shared/types.ts` — `Detector` interface, `StorageSchema`, `PostData`, `DetectionResult`
- All 10 signal modules in `src/content/detector/signals/` — inputs, sync status, return ranges
- `src/content/index.ts` — detector selection (L233-235), init (L208-209), exclusion call (L291-292), profile merge (L309-311)
- `.planning/phases/30-skill-registry-architecture/30-CONTEXT.md` — all locked decisions D-01..D-09

### Secondary (MEDIUM confidence)

- CLAUDE.md — constraint #1 (single-writer-to-storage), constraint #5 (hard exclusions before detection), Pluggable Detector Interface section

### Tertiary (LOW confidence)

None — all claims are grounded in source file reads.

---

## Metadata

**Confidence breakdown:**
- Signal pipeline anatomy: HIGH — read directly from `heuristic.ts`
- Golden-score snapshot values: HIGH — read directly from `heuristic.test.ts`
- SelectorRegistry pattern: HIGH — read directly from `selector-registry.ts`
- Skill type system design: MEDIUM — structure is logical extrapolation from decisions; exact naming is Claude's discretion per CONTEXT.md
- PatternSkill schema: MEDIUM — schema design follows D-02 constraints; exact `extractFn` enum values are discretionary

**Research date:** 2026-06-16
**Valid until:** Stable (this is pure codebase research; validity tied to source file state, not external world state)
**Nyquist validation:** SKIPPED — `workflow.nyquist_validation: false` in `.planning/config.json`
