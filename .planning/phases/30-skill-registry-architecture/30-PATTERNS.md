# Phase 30: Skill Registry Architecture - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 17 (new + modified)
**Analogs found:** 17 / 17

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/skills/types.ts` | model/contract | transform | `src/shared/types.ts` | role-match (same file role: shared contracts + discriminated unions) |
| `src/shared/skills/pattern-runner.ts` | utility | transform | `src/content/detector/signals/buzzwords.ts` (regex compilation at module scope) | partial-match |
| `src/content/skill-registry.ts` | service/registry | request-response | `src/content/selector-registry.ts` | exact |
| `src/content/detector/signals/listicle-cta.skill.ts` | utility/skill | transform | `src/content/detector/signals/em-dash.ts` (pure function wrapper) | role-match |
| `src/content/detector/signals/buzzword.skill.ts` | utility/skill | transform | `src/content/detector/signals/em-dash.ts` | role-match |
| `src/content/detector/signals/em-dash.skill.ts` | utility/skill | transform | `src/content/detector/signals/em-dash.ts` | exact |
| `src/content/detector/signals/ai-vocab.skill.ts` | utility/skill | transform | `src/content/detector/signals/em-dash.ts` | role-match |
| `src/content/detector/signals/hook-story.skill.ts` | utility/skill | transform | `src/content/detector/signals/hook-story.ts` | role-match |
| `src/content/detector/signals/motivational.skill.ts` | utility/skill | transform | `src/content/detector/signals/em-dash.ts` | role-match |
| `src/content/detector/signals/impersonal.skill.ts` | utility/skill | transform | `src/content/detector/signals/em-dash.ts` | role-match |
| `src/content/detector/signals/generic-comments.skill.ts` | utility/skill | async/transform | `src/content/detector/signals/comments.ts` | role-match |
| `src/content/exclusions/sponsored.skill.ts` | utility/skill | request-response | `src/content/exclusions.ts` (sponsored branch) | exact |
| `src/content/exclusions/company-page.skill.ts` | utility/skill | request-response | `src/content/exclusions.ts` (company-page branch) | exact |
| `src/content/exclusions/non-english.skill.ts` | utility/skill | request-response | `src/content/exclusions.ts` + `src/content/detector/language.ts` | exact |
| `src/content/exclusions/open-to-work.skill.ts` | utility/skill | request-response | `src/content/exclusions.ts` (openToWork branch) | exact |
| `src/content/detector/heuristic.ts` (modify) | service | transform | itself (refactor of existing hand-wired pipeline) | exact |
| `src/content/detector/llm.ts` (modify) | service | request-response | itself (minimal change: `implements DetectorSkill`) | exact |
| `src/content/index.ts` (modify) | controller | event-driven | itself (add registry init + exclusion runner loop) | exact |
| `src/shared/types.ts` (modify) | model | — | itself (add `skillRegistry?: SkillRegistrySchema` to `StorageSchema`) | exact |
| `src/content/exclusions/exclusions.test.ts` (new) | test | — | `src/content/detector/heuristic.test.ts` | role-match |

---

## Pattern Assignments

### `src/shared/skills/types.ts` (model/contract, transform)

**Analog:** `src/shared/types.ts`

**Imports pattern** (types.ts lines 1-10 — no imports needed; pure interface declarations):
```typescript
// Host-agnostic: NO imports from chrome.*, DOM APIs, or content-only modules.
// Import PostData and DetectionResult where needed by consumers.
import type { PostData, DetectionResult } from '../types';
```

**Core pattern — discriminated union + `as const` version** (types.ts lines 33-58):

The project convention for shared schemas uses `as const` literals and interface stacking. Mirror `SelectorRegistrySchema`'s version string + typed shape:

```typescript
// src/shared/types.ts (lines 398-405) — template for SkillRegistrySchema shape
export interface SelectorRegistrySchema {
  version: string;
  targets: Record<SelectorTarget, TargetEntry>;
  lastAdaptedAt: string | null;
}

// src/shared/types.ts (lines 66-71) — Detector interface to generalize into DetectorSkill
export interface Detector {
  name: string;
  detect(post: PostData): Promise<DetectionResult>;
}
```

**Skill type interfaces to define** (per RESEARCH.md §Skill Type System Design):
```typescript
export const SKILL_REGISTRY_VERSION = '1.0.0';

export type SignalInput = 'text' | 'profile' | 'comments';

export interface SignalSkillBase {
  kind: 'signal';
  id: string;        // matches signalBreakdown key AND detectionConfig weight key
  inputs: SignalInput[];
  sync: boolean;     // true = no await; false = async (generic-comments only)
}

export interface CodeSkill extends SignalSkillBase {
  flavor: 'code';
  run(ctx: SignalContext): number | Promise<number>;
}

export interface PatternSkill extends SignalSkillBase {
  flavor: 'pattern';
  weightKey: string; // path into detectionConfig.weights (e.g. 'emDash.max')
  rule: PatternRule;
  // NO run() — executed by PatternSkillRunner, not the skill itself
}

export type PatternRule =
  | { kind: 'keyword-set'; keywords: string[]; matchMode: 'any' | 'density'; densityThreshold?: number }
  | { kind: 'regex'; patterns: string[]; minHits: number }  // strings only — no eval
  | { kind: 'numeric-threshold'; extractFn: 'em-dash-density' | 'word-count'; operator: '>'; value: number };

export interface ExclusionSkill {
  kind: 'exclusion';
  id: string;  // 'sponsored' | 'company-page' | 'non-english' | 'open-to-work'
  check(postData: PostData, postNode: Element): ExclusionResult;
}

export interface DetectorSkill {
  kind: 'detector';
  name: string;  // 'heuristic' | 'llm'
  detect(post: PostData): Promise<DetectionResult>;
}

export interface SignalContext {
  postData: PostData;
  fetchComments?: (post: PostData) => Promise<string[]>;
}

export type SignalSkill = CodeSkill | PatternSkill;
export type AnySkill = DetectorSkill | SignalSkill | ExclusionSkill;

export interface SkillRegistrySchema {
  version: string;
  declarativeSignalSkills: PatternSkill[];      // seeded with [] at launch
  declarativeExclusionSkills: ExclusionSkill[]; // seeded with [] at launch
  lastModifiedAt: string | null;
}
```

**`StorageSchema` addition** (`src/shared/types.ts` lines 417-465 — add one field after `evalRuns`):
```typescript
// Add to StorageSchema in src/shared/types.ts:
skillRegistry?: SkillRegistrySchema;
```

---

### `src/content/skill-registry.ts` (service/registry, request-response)

**Analog:** `src/content/selector-registry.ts` (EXACT mirror — copy structure, change types)

**Imports pattern** (selector-registry.ts lines 17-43):
```typescript
import type {
  SelectorRegistrySchema,
  SelectorTarget,
  // ...
} from '../shared/types';
import { storageGet, storageSet } from '../shared/storage';
import { /* seed constants */ } from './selectors';
```

Copy to skill-registry:
```typescript
import type {
  SkillRegistrySchema,
  SignalSkill,
  ExclusionSkill,
  PatternSkill,
} from '../shared/skills/types';
import { storageGet, storageSet } from '../shared/storage';
// Static imports of all built-in CodeSkill modules (D-07 — no dynamic import):
import { listicleCtaSkill } from './detector/signals/listicle-cta.skill';
import { buzzwordSkill } from './detector/signals/buzzword.skill';
import { emDashSkill } from './detector/signals/em-dash.skill';
import { aiVocabSkill } from './detector/signals/ai-vocab.skill';
import { hookStorySkill } from './detector/signals/hook-story.skill';
import { motivationalSkill } from './detector/signals/motivational.skill';
import { impersonalSkill } from './detector/signals/impersonal.skill';
import { genericCommentsSkill } from './detector/signals/generic-comments.skill';
import { sponsoredExclusionSkill } from './exclusions/sponsored.skill';
import { companyPageExclusionSkill } from './exclusions/company-page.skill';
import { nonEnglishExclusionSkill } from './exclusions/non-english.skill';
import { openToWorkExclusionSkill } from './exclusions/open-to-work.skill';
```

**Module-scope cache + seed arrays** (selector-registry.ts lines 49-78):
```typescript
// selector-registry.ts template:
let _cache: SelectorRegistrySchema | null = null;
const SEED_MAP: Record<SelectorTarget, string> = { /* ... */ };
```

Copy to skill-registry:
```typescript
let _cache: SkillRegistrySchema | null = null;

// Ordered array — insertion order = breakdown key order (RESEARCH.md Landmine 2)
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

// Priority order matches current checkExclusions() priority (RESEARCH.md §ExclusionSkill Design)
const CODE_EXCLUSION_SKILLS: ExclusionSkill[] = [
  sponsoredExclusionSkill,
  companyPageExclusionSkill,
  nonEnglishExclusionSkill,
  openToWorkExclusionSkill,
];
```

**`buildSeedRegistry()`** (selector-registry.ts lines 84-114):
```typescript
// selector-registry.ts (lines 84-114) — template:
export function buildSeedRegistry(): SelectorRegistrySchema {
  // ... builds full schema with seed candidates
  return { version: SELECTORS_VERSION, targets, lastAdaptedAt: null };
}
```

Copy to skill-registry (simpler — no per-target candidate structure):
```typescript
function buildSeedRegistry(): SkillRegistrySchema {
  return {
    version: SKILL_REGISTRY_VERSION,
    declarativeSignalSkills: [],    // zero declarative skills at launch (D-06)
    declarativeExclusionSkills: [],
    lastModifiedAt: null,
  };
}
```

**`seedIfNeeded()` and `load()`** (selector-registry.ts lines 167-204):
```typescript
// selector-registry.ts (lines 167-174) — exact pattern:
export async function seedIfNeeded(): Promise<void> {
  registerOnChangedListener();
  const { selectorRegistry } = await storageGet(['selectorRegistry']);
  if (!selectorRegistry || selectorRegistry.version !== SELECTORS_VERSION) {
    await storageSet({ selectorRegistry: migrate(selectorRegistry) });
  }
}

// selector-registry.ts (lines 186-204) — exact pattern:
export async function load(): Promise<void> {
  registerOnChangedListener();
  const { selectorRegistry } = await storageGet(['selectorRegistry']);
  const registry = selectorRegistry ?? buildSeedRegistry();
  // ... TTL eviction (skill-registry skips this — no TTL on skill defs)
  _cache = registry;
}
```

Copy to skill-registry:
```typescript
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
```

**Public getters — pre-load fallback to code seeds** (selector-registry.ts lines 215-223):
```typescript
// selector-registry.ts (lines 215-223):
export function resolve(target: SelectorTarget): string {
  if (!_cache) {
    return SEED_MAP[target];  // pre-load fallback
  }
  const entry = _cache.targets[target];
  return entry?.candidates[0]?.value ?? SEED_MAP[target];
}
```

Copy to skill-registry:
```typescript
export function getSignalSkills(): SignalSkill[] {
  if (!_cache) return CODE_SIGNAL_SKILLS;  // pre-load fallback (D-06)
  return [...CODE_SIGNAL_SKILLS, ..._cache.declarativeSignalSkills];
}

export function getExclusionSkills(): ExclusionSkill[] {
  if (!_cache) return CODE_EXCLUSION_SKILLS;
  return [...CODE_EXCLUSION_SKILLS, ..._cache.declarativeExclusionSkills];
}

// Single writer — only SkillRegistry writes skill defs to storage (CLAUDE.md constraint #1)
export async function addDeclarativeSkill(skill: PatternSkill): Promise<void> {
  if (!_cache) return;
  _cache.declarativeSignalSkills.push(skill);
  _cache.lastModifiedAt = new Date().toISOString();
  await storageSet({ skillRegistry: _cache }).catch(() => {});
}
```

**`registerOnChangedListener()`** (selector-registry.ts lines 408-439):
```typescript
// selector-registry.ts (lines 408-439) — exact pattern:
let _onChangedListenerRegistered = false;

function registerOnChangedListener() {
  if (_onChangedListenerRegistered) return;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes['selectorRegistry']) {
          _cache = (changes['selectorRegistry'].newValue as SelectorRegistrySchema) ?? null;
        }
      });
      _onChangedListenerRegistered = true;
    }
  } catch {
    // chrome.storage not available (e.g., in tests) — silent fail
  }
}
```

Copy to skill-registry, changing `'selectorRegistry'` to `'skillRegistry'` and the cast type.

---

### `src/shared/skills/pattern-runner.ts` (utility, transform)

**Analog:** `src/content/detector/signals/buzzwords.ts` (regex compilation at module scope — lines 39-42)

**Regex compile-once pattern** (buzzwords.ts lines 39-42):
```typescript
// buzzwords.ts — compiled at module scope, never reallocated per call:
const BUZZ_RE = new RegExp(
  `\\b(${BUZZWORDS.map(w => w.replace(/ /g, '\\s+')).join('|')})\\b`,
  'gi',
);
```

`PatternSkillRunner` follows the same compile-once approach. For `regex` rules, patterns are compiled from strings at runner creation (not eval — `new RegExp(str)` from validated sources):

```typescript
// src/shared/skills/pattern-runner.ts — host-agnostic (no chrome.*, no DOM)
import type { PatternSkill, SignalContext } from './types';

// Compiled RegExp cache keyed by skill id — built once, reused per post
const _compiledPatterns = new Map<string, RegExp[]>();

export function runPatternSkill(skill: PatternSkill, ctx: SignalContext): number {
  if (skill.rule.kind === 'keyword-set') { /* ... */ }
  if (skill.rule.kind === 'regex') {
    let compiled = _compiledPatterns.get(skill.id);
    if (!compiled) {
      compiled = skill.rule.patterns.map(p => new RegExp(p, 'gi'));
      _compiledPatterns.set(skill.id, compiled);
    }
    const hits = compiled.filter(re => re.test(ctx.postData.postText)).length;
    return hits >= skill.rule.minHits ? /* read from detectionConfig via weightKey */ 0 : 0;
  }
  // numeric-threshold: em-dash-density extractor
  return 0;
}
```

---

### `src/content/detector/signals/em-dash.skill.ts` (utility/skill, transform) — canonical CodeSkill example

**Analog:** `src/content/detector/signals/em-dash.ts` (lines 1-26)

**Imports pattern**:
```typescript
import { checkEmDash } from './em-dash';
import type { CodeSkill } from '../../../shared/skills/types';
```

**Core CodeSkill wrapper pattern** (full file — thin wrapper):
```typescript
// src/content/detector/signals/em-dash.ts (lines 16-26) — the underlying function:
export function checkEmDash(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words < 30) return 0;
  const emDashes = (text.match(/—/g) ?? []).length;
  const density = (emDashes / words) * 100;
  if (density > 2) return 10;
  if (density > 1) return 5;
  return 0;
}
```

Wrapper (new file):
```typescript
export const emDashSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'em-dash',         // matches signalBreakdown key and detectionConfig key
  inputs: ['text'],
  sync: true,            // pure sync function — no await needed
  run({ postData }) {
    return checkEmDash(postData.postText);
  },
};
```

**Same wrapper pattern applies to:** `buzzword.skill.ts`, `ai-vocab.skill.ts`, `hook-story.skill.ts`, `motivational.skill.ts`, `impersonal.skill.ts` — import the existing function, expose as `CodeSkill`.

---

### `src/content/detector/signals/listicle-cta.skill.ts` (utility/skill, transform) — composite skill

**Analog:** `src/content/detector/heuristic.ts` lines 81-96 (the composite listicle-CTA logic)

**Core pattern** (heuristic.ts lines 78-96 — the combined rule that must stay single):
```typescript
// heuristic.ts (lines 78-96) — exact logic to preserve in the combined skill:
const listicleScore = checkListicle(post.postText);
const ctaScore = checkCta(post.postText);

if (listicleScore > 0 && ctaScore > 0) {
  breakdown['listicle-cta'] = detectionConfig.weights.listicleCta.both;     // 25
  score += detectionConfig.weights.listicleCta.both;
} else if (listicleScore > 0) {
  breakdown['listicle-cta'] = detectionConfig.weights.listicleCta.listicleOnly; // 12
  score += detectionConfig.weights.listicleCta.listicleOnly;
} else if (ctaScore > 0) {
  breakdown['listicle-cta'] = detectionConfig.weights.listicleCta.ctaOnly;  // 8
  score += detectionConfig.weights.listicleCta.ctaOnly;
}
```

The new combined skill keeps this exactly and returns the weight directly:
```typescript
import { checkListicle } from './listicle';
import { checkCta } from './cta';
import { detectionConfig } from '../../../shared/detectionConfig';
import type { CodeSkill } from '../../../shared/skills/types';

export const listicleCtaSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'listicle-cta',   // SINGLE composite key — must NOT split into two skills (Landmine 1)
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

---

### `src/content/detector/signals/generic-comments.skill.ts` (utility/skill, async/transform)

**Analog:** `src/content/detector/signals/comments.ts` (lines 47-75 — the `checkGenericComments` function)

**Imports pattern**:
```typescript
import { checkGenericComments } from './comments';
import type { CodeSkill } from '../../../shared/skills/types';
```

**Core async skill pattern** (only `sync: false` skill among the 10):
```typescript
export const genericCommentsSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'generic-comments',
  inputs: ['comments'],
  sync: false,            // ONLY async skill — gated by score > 20 in the runner (Landmine 3+5)
  async run({ postData, fetchComments }) {
    if (!fetchComments) return 0;
    const comments = await fetchComments(postData);
    return checkGenericComments(comments);
  },
};
```

**NOTE:** The gate (`score > 20`) is enforced by the runner in `heuristic.ts`, NOT inside `run()`. The skill itself does not check the gate — it just fetches and scores.

---

### `src/content/exclusions/sponsored.skill.ts` (utility/skill, request-response)

**Analog:** `src/content/exclusions.ts` lines 60-66 (sponsored branch of `checkExclusions`)

**Imports pattern** (exclusions.ts lines 20-23):
```typescript
import { resolve } from './selector-registry';
import { isNonEnglish } from './detector/language';
import type { PostData } from '../shared/types';
```

Copy to sponsored.skill.ts (adjust paths for `src/content/exclusions/` location):
```typescript
import { resolve } from '../selector-registry';
import type { ExclusionSkill } from '../../shared/skills/types';
import type { PostData } from '../../shared/types';
```

**Core pattern** (exclusions.ts lines 60-66 — exact branch to extract):
```typescript
// exclusions.ts (lines 60-66):
if (postNode.querySelector(resolve('SPONSORED_MARKER'))) {
  return { excluded: true, reason: 'sponsored' };
}
```

As ExclusionSkill:
```typescript
export const sponsoredExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'sponsored',
  check(_postData: PostData, postNode: Element) {
    return postNode.querySelector(resolve('SPONSORED_MARKER'))
      ? { excluded: true, reason: 'sponsored' as const }
      : { excluded: false };
  },
};
```

---

### `src/content/exclusions/company-page.skill.ts` (utility/skill, request-response)

**Analog:** `src/content/exclusions.ts` lines 70-73 (company-page branch)

```typescript
// exclusions.ts (lines 70-73):
if (postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))) {
  return { excluded: true, reason: 'company-page' };
}
```

As ExclusionSkill:
```typescript
export const companyPageExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'company-page',
  check(postData: PostData, _postNode: Element) {
    return postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))
      ? { excluded: true, reason: 'company-page' as const }
      : { excluded: false };
  },
};
```

---

### `src/content/exclusions/non-english.skill.ts` (utility/skill, request-response)

**Analog:** `src/content/exclusions.ts` lines 75-78 + `src/content/detector/language.ts` lines 44-71

```typescript
// exclusions.ts (lines 75-78):
if (isNonEnglish(postNode, postData.postText)) {
  return { excluded: true, reason: 'non-english' };
}
```

```typescript
import { resolve } from '../selector-registry';
import { isNonEnglish } from '../detector/language';
import type { ExclusionSkill } from '../../shared/skills/types';
import type { PostData } from '../../shared/types';

export const nonEnglishExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'non-english',
  check(postData: PostData, postNode: Element) {
    return isNonEnglish(postNode, postData.postText)
      ? { excluded: true, reason: 'non-english' as const }
      : { excluded: false };
  },
};
```

---

### `src/content/exclusions/open-to-work.skill.ts` (utility/skill, request-response)

**Analog:** `src/content/exclusions.ts` lines 81-83 (openToWork branch)

```typescript
// exclusions.ts (lines 81-83):
const openToWork = !!postNode.querySelector(resolve('OPEN_TO_WORK_MARKER'));
return { excluded: false, openToWork };
```

As ExclusionSkill (always returns `excluded: false`, passes metadata through):
```typescript
export const openToWorkExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'open-to-work',
  check(_postData: PostData, postNode: Element) {
    return {
      excluded: false,
      openToWork: !!postNode.querySelector(resolve('OPEN_TO_WORK_MARKER')),
    };
  },
};
```

---

### `src/content/detector/heuristic.ts` (modify — registry runner refactor)

**Analog:** itself (lines 1-164) — existing hand-wired pipeline becomes registry runner

**Imports to add** (current imports at lines 13-23):
```typescript
// heuristic.ts (lines 13-23) — current hand-wired imports:
import { checkListicle } from './signals/listicle';
import { checkBuzzwords } from './signals/buzzwords';
// ... 7 more signal imports
```

After refactor — remove individual signal function imports, add registry:
```typescript
import type { PostData, DetectionResult, Detector } from '../../shared/types';
import type { DetectorSkill } from '../../shared/skills/types';
import { detectionConfig } from '../../shared/detectionConfig';
import { getSignalSkills } from '../skill-registry';
import type { CodeSkill } from '../../shared/skills/types';
import { checkGenericComments } from './signals/comments'; // still needed by generic-comments skill
```

**Core runner loop replacing hand-wired pipeline** (replaces heuristic.ts lines 74-163 body):

The runner MUST preserve:
1. Breakdown insertion order (listicle-cta → buzzword → em-dash → ai-vocab → hook-story → motivational → impersonal → generic-comments)
2. Async gate: `score > detectionConfig.weights.genericComments.gate` before awaiting comments
3. `Math.min(score, 100)` cap

```typescript
// heuristic.ts (lines 154-163) — return structure to preserve byte-identically:
const finalScore = Math.min(score, 100);
return {
  score: finalScore,
  signals: Object.keys(breakdown),
  signalBreakdown: { ...breakdown },
  confidence: finalScore >= 60 ? 'high' : finalScore >= 35 ? 'medium' : 'low',
  engineUsed: 'heuristic',
};
```

**Class declaration to update** (heuristic.ts line 42):
```typescript
// Before:
export class HeuristicDetector implements Detector {

// After:
export class HeuristicDetector implements Detector, DetectorSkill {
  readonly kind = 'detector' as const;  // adds DetectorSkill discriminant
```

---

### `src/content/detector/llm.ts` (modify — add `DetectorSkill` discriminant)

**Analog:** itself (lines 1-35) — minimal change

**Current class declaration** (llm.ts lines 11-14):
```typescript
export class LLMDetector implements Detector {
  readonly name = 'llm';
  constructor(private readonly fallback?: Detector) {}
```

Change to:
```typescript
export class LLMDetector implements Detector, DetectorSkill {
  readonly kind = 'detector' as const;
  readonly name = 'llm';
  constructor(private readonly fallback?: Detector) {}
```

All other lines (16-35) remain byte-identical.

---

### `src/content/index.ts` (modify — registry init + exclusion runner loop)

**Analog:** itself — two targeted changes

**Registry init** (content/index.ts lines 207-209 — add two calls alongside existing):
```typescript
// content/index.ts (lines 207-209) — current:
await seedIfNeeded();
await load();
```

After (add skill registry init alongside selector registry init):
```typescript
await seedIfNeeded();          // selectorRegistry (existing)
await load();                  // selectorRegistry (existing)
await skillRegistrySeedIfNeeded();   // skillRegistry (new)
await skillRegistryLoad();           // skillRegistry (new)
```

**Exclusion runner loop** (content/index.ts lines 291-292 — replace `checkExclusions` call):
```typescript
// content/index.ts (lines 291-292) — current:
const exclusion = checkExclusions(postData, postNode);
if (exclusion.excluded) return;
```

After:
```typescript
// Replace with registry-driven loop (preserves CLAUDE.md constraint #5 ordering):
let exclusionResult: ExclusionResult = { excluded: false };
for (const skill of getExclusionSkills()) {
  const result = skill.check(postData, postNode);
  if (result.excluded) { exclusionResult = result; break; }      // short-circuit (D-09)
  if (result.openToWork) exclusionResult = { ...exclusionResult, openToWork: true };
}
if (exclusionResult.excluded) return;
// Then use exclusionResult.openToWork below (line 297) instead of exclusion.openToWork
```

---

### `src/content/exclusions/exclusions.test.ts` (new test)

**Analog:** `src/content/detector/heuristic.test.ts` lines 1-8 (vitest setup pattern)

**Test imports pattern** (heuristic.test.ts lines 1-8):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { HeuristicDetector } from './heuristic';
import type { PostData } from '../../shared/types';
```

Copy for exclusions test:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getExclusionSkills } from '../skill-registry';  // exercises the NEW runner path
import type { PostData } from '../../shared/types';
```

**Test structure pattern** (heuristic.test.ts lines 9-28 — describe + it + PostData fixture):
```typescript
describe('HeuristicDetector', () => {
  it('returns score 0 for clean, unambiguous English prose', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect({
      urn: 'urn:li:activity:1',
      authorId: 'user1',
      authorName: 'Alice',
      authorProfileUrl: 'https://linkedin.com/in/alice/',
      postText: 'I went to the shops today and bought milk.',
    });
    expect(result.score).toBe(0);
```

Copy fixture pattern for exclusions test. The test must mock `resolve()` (from selector-registry) to return known strings, and create fake DOM elements via `document.createElement('div')` in JSDOM:

```typescript
// Five fixture cases per RESEARCH.md §Exclusion Parity Check Approach:
// 1. postNode has SPONSORED_MARKER child → { excluded: true, reason: 'sponsored' }
// 2. authorProfileUrl includes '/company/' → { excluded: true, reason: 'company-page' }
// 3. postText is CJK-heavy → { excluded: true, reason: 'non-english' }
// 4. postNode has OPEN_TO_WORK_MARKER child → { excluded: false, openToWork: true }
// 5. Normal English post → { excluded: false }
```

---

## Shared Patterns

### Storage Read/Write (apply to `skill-registry.ts`)

**Source:** `src/shared/storage.ts` (lines 25-39)
```typescript
export async function storageGet<K extends keyof StorageSchema>(
  keys: K[]
): Promise<Pick<StorageSchema, K>> {
  return chrome.storage.local.get(keys) as Promise<Pick<StorageSchema, K>>;
}

export async function storageSet(values: Partial<StorageSchema>): Promise<void> {
  return chrome.storage.local.set(values);
}
```

`SkillRegistry` calls `storageGet(['skillRegistry'])` and `storageSet({ skillRegistry: ... })` using exactly these typed wrappers. The key `'skillRegistry'` is the new `StorageSchema` field to add.

### chrome.storage.onChanged Listener (apply to `skill-registry.ts`)

**Source:** `src/content/selector-registry.ts` lines 408-439
```typescript
let _onChangedListenerRegistered = false;

function registerOnChangedListener() {
  if (_onChangedListenerRegistered) return;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes['selectorRegistry']) {
          _cache = (changes['selectorRegistry'].newValue as SelectorRegistrySchema) ?? null;
        }
      });
      _onChangedListenerRegistered = true;
    }
  } catch {
    // chrome.storage not available (e.g., in tests) — silent fail
  }
}
```

Copy exactly, change `'selectorRegistry'` → `'skillRegistry'`, cast to `SkillRegistrySchema`.

### Single-Writer Enforcement (apply to `skill-registry.ts` + never write `skillRegistry` elsewhere)

**Source:** `src/content/selector-registry.ts` line 387 (comment + pattern):
```typescript
// Single persist write (only SelectorRegistry writes selectors — CLAUDE.md #1)
await storageSet({ selectorRegistry: _cache }).catch(() => {});
```

Only `skill-registry.ts` may call `storageSet({ skillRegistry: ... })`. No other file writes this key.

### `detectionConfig` Reference (apply to `listicle-cta.skill.ts` only)

**Source:** `src/shared/detectionConfig.ts` lines 40-44
```typescript
listicleCta: {
  both: 25,
  listicleOnly: 12,
  ctaOnly: 8,
},
```

The `listicle-cta.skill.ts` is the ONLY CodeSkill wrapper that must read from `detectionConfig` directly (because the composite weight tier is defined there). All other signal skills return the raw value from their underlying function, which already encodes weights internally.

### JSDoc File Header (apply to all new files)

**Source:** `src/content/selector-registry.ts` lines 1-15 / `src/content/exclusions.ts` lines 1-18

All new files use a block JSDoc header describing:
- What the file is
- What invariants it maintains
- What it deliberately avoids (DOM access, chrome.* access for shared files)

---

## No Analog Found

All files have close analogs in the codebase. No entries.

---

## Critical Landmines (planner must surface in plan actions)

These are the implementation risks from RESEARCH.md that the planner must translate into explicit verification steps:

| Landmine | Risk | Prevention |
|----------|------|------------|
| 1 — Listicle-CTA split | Two separate skills → two breakdown keys → golden-score snapshot fails | `listicle-cta.skill.ts` is ONE `CodeSkill` calling both `checkListicle` + `checkCta` |
| 2 — Breakdown key insertion order | `signals[]` order differs from snapshot expectation | `CODE_SIGNAL_SKILLS` array must be declared in step-order; runner iterates in array order |
| 3 — Comments gate uses pre-gate score | Gate crossed by wrong score value | Sync pass first, then gate check with that score, THEN async pass |
| 4 — Profile signals absorbed | Double-count of `headline-formula` / `degree-3` | `extractProfileSignals()` stays in `content/index.ts`; profile NOT a `SignalSkill` |
| 5 — `sync` flag wrong on comments | Runner may skip the gate or skip the await | Only `generic-comments` has `sync: false`; verify against `comments.ts` |
| 7 — Storage key collision | Corrupting `selectorRegistry` or another key | Add `skillRegistry` as a NEW field in `StorageSchema`; verify it is absent before using |

---

## Metadata

**Analog search scope:** `src/content/`, `src/shared/`
**Files read:** `selector-registry.ts`, `heuristic.ts`, `heuristic.test.ts`, `llm.ts`, `exclusions.ts`, `language.ts`, `detectionConfig.ts`, `types.ts`, `storage.ts`, `signals/em-dash.ts`, `signals/buzzwords.ts`, `signals/comments.ts`, `signals/hook-story.ts`, `content/index.ts` (lines 200-320)
**Pattern extraction date:** 2026-06-16
