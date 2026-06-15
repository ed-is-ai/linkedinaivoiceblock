# Phase 23: Self-Healing Selector Adapter — Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/content/selector/heuristic.ts` | utility | transform (DOM → candidates) | `src/content/detector/heuristic.ts` | role-match (named-export function file, pure logic) |
| `src/content/selector/sanitizer.ts` | utility | transform (DOM → string) | `src/content/detector/language.ts` | exact (pure function, no side-effects, no DOM writes) |
| `src/content/selector/validator.ts` | utility | request-response (predicate) | `src/content/exclusions.ts` | exact (pure predicate returning typed result, no DOM writes) |
| `src/content/detector/rederiver.ts` | service | request-response (message) | `src/content/detector/llm.ts` | exact (content-script message sender, async Promise wrapper) |
| `src/content/selector/__fixtures__/*.html` | test-fixture | — | `src/content/exclusions.test.ts` (fixture pattern) | partial (same Vitest+jsdom test harness) |
| `src/content/observer.ts` (modify) | middleware | event-driven | self (existing observer pattern) | self-modification |
| `src/background/index.ts` (modify) | service | request-response (Anthropic fetch) | self (`scorePost` + `SCORE_POST` handler pattern) | self-modification |
| `src/content/selector-registry.ts` (modify) | service | CRUD | self (`updateCandidate` pattern) | self-modification |
| `src/shared/types.ts` (modify) | model | — | self (`StorageSchema` extension pattern) | self-modification |

---

## Pattern Assignments

### `src/content/selector/heuristic.ts` (utility, DOM-to-candidates transform)

**Analog:** `src/content/detector/heuristic.ts`

**Imports pattern** (`src/content/detector/heuristic.ts` lines 13–21):
```typescript
import type { PostData, DetectionResult, Detector } from '../../shared/types';
import { checkListicle } from './signals/listicle';
// ... other named imports from sibling signal modules
```
For `heuristic.ts`, the pattern is similar but imports come from `../../shared/types` and `../selector-registry`:
```typescript
import { resolve } from '../selector-registry';
```

**File structure pattern** (`src/content/detector/heuristic.ts` lines 1–12 header + lines 25–50 class):
The existing `heuristic.ts` uses a class. The RESEARCH.md specifies this new file uses named-export functions (not a class), following the `selector-registry.ts` export pattern instead:
```typescript
// Named-export function file — no class, no constructor
export interface HeuristicCandidate {
  selector: string;
  confidence: number;
  source: 'heuristic';
}

export function deriveHeuristicCandidates(
  target: 'POST_CARD' | 'POST_BODY_TEXT',
  container: Element,
): HeuristicCandidate[] {
  // ... implementation
}
```

**Core DOM-walking pattern** (from RESEARCH.md Section "Heuristic Re-derivation Algorithm"):
```typescript
const children = Array.from(container.children);
const attrGroups = new Map<string, Element[]>();
for (const child of children) {
  for (const attr of Array.from(child.attributes)) {
    if (attr.name.startsWith('data-') || attr.name === 'componentkey') {
      const key = `${child.tagName.toLowerCase()}[${attr.name}]`;
      if (!attrGroups.has(key)) attrGroups.set(key, []);
      attrGroups.get(key)!.push(child);
    }
  }
}
// Filter to plausible post-card counts
for (const [selector, elements] of attrGroups) {
  if (elements.length < 2 || elements.length > 50) continue;
  // ... build candidate with confidence score
}
```

**No error handling needed:** Pure function — DOM walks only read, never throw. Wrap `container.children` iteration in a null-check on `container`.

**Key constraint:** Never import selector string literals directly. Use `resolve('FEED_CONTAINER')` from `../selector-registry` (CLAUDE.md constraint #1, confirmed in existing observer.ts lines 39–48).

---

### `src/content/selector/sanitizer.ts` (utility, DOM-to-string transform)

**Analog:** `src/content/detector/language.ts`

**Imports pattern** (`src/content/detector/language.ts` lines 1–21):
```typescript
/**
 * Language detection utility for non-English exclusion.
 * Pure DOM reads only: reads `lang` attribute and iterates codepoints. No side effects.
 */
// No imports — pure function operating on Element + string inputs
```
The sanitizer follows the same pattern: JSDoc header explaining what is stripped, module-scope constants at the top, one exported function.

**Module-scope constants pattern** (`src/content/detector/language.ts` lines 25–34):
```typescript
// Declared at module scope — computed once, never reallocated per call.
const NON_LATIN_RANGES: Array<[number, number]> = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  // ...
];
```
Sanitizer analog:
```typescript
const PII_ATTRS_TO_REMOVE = ['href', 'src', 'aria-label', 'title', 'alt', 'action', 'data-src'];
const MAX_DEPTH = 6;
const MAX_SIBLINGS = 3;
const MAX_CHARS = 4000;
```

**Core function signature** (follows `language.ts` lines 44–71 function shape):
```typescript
// language.ts — one exported function, inputs: (Element, string) → boolean
export function isNonEnglish(postNode: Element, postText: string): boolean { ... }

// sanitizer.ts — same shape: one exported function, input: Element → string
export function buildDomSkeleton(container: Element): string { ... }
```

**Clone-before-mutate pattern** (from RESEARCH.md):
```typescript
const clone = container.cloneNode(true) as Element;
stripPii(clone, 0);
const raw = serializeElement(clone, 0);
```
This mirrors `language.ts`'s pattern of reading without mutation — the sanitizer extends it by cloning first so the live DOM is never touched.

**Error handling:** `buildDomSkeleton` does not throw. All recursion is bounded by `MAX_DEPTH` and `MAX_SIBLINGS` constants.

---

### `src/content/selector/validator.ts` (utility, predicate/gate)

**Analog:** `src/content/exclusions.ts`

**Imports pattern** (`src/content/exclusions.ts` lines 20–22):
```typescript
import { resolve } from './selector-registry';
import { isNonEnglish } from './detector/language';
import type { PostData } from '../shared/types';
```
Validator analog:
```typescript
// No resolve() needed — validator receives the container Element directly
// Types only from shared/types (SelectorCandidate is not needed here — result is ValidationResult)
```

**Return-type interface pattern** (`src/content/exclusions.ts` lines 29–45):
```typescript
export interface ExclusionResult {
  excluded: boolean;
  reason?: 'sponsored' | 'company-page' | 'non-english';
  openToWork?: boolean;
}
```
Validator analog:
```typescript
export interface ValidationResult {
  pass: boolean;
  reason: string;
  matchCount: number;
}
```

**Sequential gate pattern** (`src/content/exclusions.ts` lines 60–84):
```typescript
export function checkExclusions(postData: PostData, postNode: Element): ExclusionResult {
  // Priority 1: early return on first match
  if (postNode.querySelector(resolve('SPONSORED_MARKER'))) {
    return { excluded: true, reason: 'sponsored' };
  }
  // Priority 2
  if (postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))) {
    return { excluded: true, reason: 'company-page' };
  }
  // Priority 3
  if (isNonEnglish(postNode, postData.postText)) {
    return { excluded: true, reason: 'non-english' };
  }
  // Default pass
  return { excluded: false, openToWork };
}
```
Validator mirrors this exactly — sequential gates with early-return `{ pass: false, reason: '...' }` on first failure, final `{ pass: true, reason: 'all gates passed', matchCount: count }` on success.

**querySelectorAll-in-try/catch pattern** (unique to validator — not in exclusions.ts, but follows browser idiom):
```typescript
let matches: NodeListOf<Element>;
try {
  matches = container.querySelectorAll(selector);
} catch {
  return { pass: false, reason: 'invalid CSS selector syntax', matchCount: 0 };
}
```
ADAPT-06: selector is ONLY ever passed to `querySelectorAll`, never to `eval`/`new Function`/`innerHTML`.

**Advisory-only (non-blocking) log pattern** (mirrors exclusions.ts's D-12.4 passthrough — excluded=false but metadata exposed):
```typescript
// Sponsored contamination — log only, not a write-blocker (CONTEXT.md §Candidate Validation Gate)
const withSponsored = elements.filter(el =>
  el.querySelector('[aria-label*="Promoted"], [aria-label*="Sponsored"]') !== null
);
if (withSponsored.length > 0) {
  console.warn('[LLB] validator: sponsored contamination warning —', withSponsored.length, 'of', count);
}
```

---

### `src/content/detector/rederiver.ts` (service, content-script message sender)

**Analog:** `src/content/detector/llm.ts` — copy structure verbatim

**Imports pattern** (`src/content/detector/llm.ts` lines 9–9):
```typescript
import type { PostData, DetectionResult, Detector } from '../../shared/types';
```
Rederiver analog:
```typescript
// No Detector interface — LLMRederiver does not implement Detector
// No shared/types import needed unless RederiveResult is defined there
```

**Class + sendMessage Promise pattern** (`src/content/detector/llm.ts` lines 11–35 — copy exactly):
```typescript
export class LLMDetector implements Detector {
  readonly name = 'llm';

  constructor(private readonly fallback?: Detector) {}

  async detect(post: PostData): Promise<DetectionResult> {
    try {
      return await this.scoreViaBackground(post.postText);
    } catch (err) {
      console.warn('[LLB] LLMDetector error, falling back:', err);
      if (this.fallback) return this.fallback.detect(post);
      return { score: 0, signals: [], signalBreakdown: {}, confidence: 'low', engineUsed: 'heuristic' };
    }
  }

  private scoreViaBackground(postText: string): Promise<DetectionResult> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SCORE_POST', postText }, (response) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
        if (response?.error) { reject(new Error(response.error as string)); return; }
        resolve(response.result as DetectionResult);
      });
    });
  }
}
```
Rederiver replaces `SCORE_POST` with `REDERIVE_SELECTOR`, `postText` with `{ target, domSkeleton }`, and return type changes to `Array<{ selector: string; rationale: string }>`:
```typescript
export class LLMRederiver {
  async rederive(
    target: string,
    domSkeleton: string,
  ): Promise<Array<{ selector: string; rationale: string }>> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'REDERIVE_SELECTOR', target, domSkeleton },
        (response) => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
          if (response?.error) { reject(new Error(response.error as string)); return; }
          resolve(response.result as Array<{ selector: string; rationale: string }>);
        },
      );
    });
  }
}
```

**Error-propagation pattern:** `LLMDetector` catches errors at the `detect()` level and falls back. `LLMRederiver` propagates errors to the caller (`triggerHeal` in `observer.ts`) which handles them with `.catch(() => { _healLock = false; })`.

---

### `src/content/selector/__fixtures__/*.html` (test fixtures)

**Analog:** `src/content/exclusions.test.ts` and `src/content/detector/heuristic.test.ts`

**Vitest test file header pattern** (`src/content/exclusions.test.ts` lines 1–16):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkExclusions } from './exclusions';
import type { PostData } from '../shared/types';

// Stub for dependency — mock module to control independently
vi.mock('./detector/language', () => ({
  isNonEnglish: vi.fn().mockReturnValue(false),
}));
```
For fixture-based tests, the pattern is:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateCandidate } from './validator';

// Load fixture into jsdom document
function loadFixture(name: string): void {
  const html = readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
  document.body.innerHTML = html;
}
```

**vi.fn() mock pattern** (`src/content/exclusions.test.ts` lines 34–58):
```typescript
function makePostNode(options: { sponsoredMatch?: boolean } = {}): Element {
  return {
    querySelector: vi.fn((selector: string) => {
      if (options.sponsoredMatch && selector.includes('Promoted')) {
        return document.createElement('span');
      }
      return null;
    }),
  } as unknown as Element;
}
```
For rate-limit tests (ADAPT-05), mock `chrome.storage.local` similarly:
```typescript
const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) => Promise.resolve(
        Object.fromEntries(keys.map(k => [k, mockStorage[k]]))
      )),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(mockStorage, values);
        return Promise.resolve();
      }),
    },
  },
});
```

**describe/it/expect structure** (`src/content/exclusions.test.ts` lines 60–119):
```typescript
describe('checkExclusions', () => {
  beforeEach(() => {
    vi.mocked(isNonEnglish).mockReturnValue(false);
  });

  it('returns excluded=true, reason="sponsored" for sponsored posts (DETECT-02)', () => {
    // arrange
    const postNode = makePostNode({ sponsoredMatch: true });
    // act
    const result = checkExclusions(postData, postNode);
    // assert
    expect(result.excluded).toBe(true);
    expect(result.reason).toBe('sponsored');
  });
});
```

**Adversarial string loop pattern** (from RESEARCH.md Section "Test Harness"):
```typescript
const ADVERSARIAL_SELECTORS = ['*', 'body', 'html', ':root', '.feed-shared-update-v2', '#main-content', '");alert(1)//'];

for (const badSelector of ADVERSARIAL_SELECTORS) {
  it(`rejects "${badSelector}"`, () => {
    const result = validateCandidate(badSelector, document.body);
    expect(result.pass).toBe(false);
  });
}
```

---

### `src/content/observer.ts` (modify — add breakage detection)

**Analog:** self — extend existing module-scope state + existing MutationObserver callback patterns

**Module-scope state pattern** (`src/content/observer.ts` lines 21–24 — extend this block):
```typescript
// Existing module-scope state:
let currentObserver: MutationObserver | null = null;
const processedPosts = new Set<string>();
let storedOnPost: ((post: ObservedPost) => void) | null = null;
let lastUrl = location.href;
```
Add alongside:
```typescript
// Phase 23 breakage detection state
let _zeroMatchWindowStart: number | null = null;
let _postsSeenThisSession = 0;
let _healInProgress = false;

const BREAKAGE_DEBOUNCE_MS = 30_000;
const MIN_SESSION_POSTS = 3;
```

**reinit() state-reset pattern** (`src/content/observer.ts` lines 215–226 — extend this function):
```typescript
async function reinit(): Promise<void> {
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
  }
  processedPosts.clear();
  // ... existing code
}
```
Add resets for Phase 23 state inside `reinit()`:
```typescript
_zeroMatchWindowStart = null;
_postsSeenThisSession = 0;
_healInProgress = false;
```

**dispatchFromBox post-count hook** (`src/content/observer.ts` lines 110–141 — add after line 137 `processedPosts.add(urn)`):
```typescript
processedPosts.add(urn);
// Phase 23: track session post count + reset zero-match window
_postsSeenThisSession++;
_zeroMatchWindowStart = null;  // posts are flowing — reset breakage window
// ... existing updateCandidate + onPost calls
```

**MutationObserver callback pattern** (`src/content/observer.ts` lines 163–187 — extend inner loop):
```typescript
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type !== 'childList') continue;
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      processElement(node as Element, onPost);
    }
  }
});
```
After the `for` loop body, add breakage check:
```typescript
// Phase 23: if mutations were structural (childList) but no posts dispatched, track zero-match window
let addedNodeCount = 0;
let postsFoundThisMutation = false;
// ... count addedNodes that are ELEMENT_NODEs
// After processElement calls: if addedNodeCount > 0 && !postsFoundThisMutation:
if (!_zeroMatchWindowStart) _zeroMatchWindowStart = Date.now();
else if (Date.now() - _zeroMatchWindowStart >= BREAKAGE_DEBOUNCE_MS && !_healInProgress) {
  if (isFeedUrl() && hasFeedContainer() && _postsSeenThisSession >= MIN_SESSION_POSTS) {
    _healInProgress = true;
    triggerHeal(container).catch(() => { _healInProgress = false; });
  }
}
```

**fire-and-forget async pattern** (from `src/content/observer.ts` lines 42–48 and 130–131):
```typescript
// Existing fire-and-forget pattern (use for triggerHeal too):
updateCandidate('FEED_CONTAINER', feedContainerSelector).catch(() => {});
// Pattern: async call, discard result, catch silently
triggerHeal(container).catch(() => { _healInProgress = false; });
```

**New imports to add** (following `src/content/observer.ts` lines 13–15 pattern):
```typescript
import { resolve, updateCandidate, insertCandidate } from './selector-registry';
import { deriveHeuristicCandidates } from './selector/heuristic';
import { validateCandidate } from './selector/validator';
import { buildDomSkeleton } from './selector/sanitizer';
import { LLMRederiver } from './detector/rederiver';
import { storageGet } from '../shared/storage';
```

---

### `src/background/index.ts` (modify — add rederiveSelector + REDERIVE_SELECTOR handler)

**Analog:** self — `scorePost()` function (lines 97–139) and `SCORE_POST` onMessage branch (lines 147–152)

**SYSTEM_PROMPT constant pattern** (`src/background/index.ts` lines 23–95 — add a second constant):
```typescript
// Existing:
const SYSTEM_PROMPT = `You are an AI content detector...`;
// Add alongside:
const REDERIVE_SYSTEM_PROMPT = `You are a CSS selector analyst...`;
```

**scorePost() function pattern** (`src/background/index.ts` lines 97–139 — replicate structure verbatim):
```typescript
async function scorePost(postText: string): Promise<DetectionResult> {
  // 1. Load API key from storage (stateless — read each time)
  const result = await chrome.storage.local.get(['anthropicApiKey']);
  const apiKey = result.anthropicApiKey as string | undefined;
  if (!apiKey) throw new Error('No API key configured');

  // 2. Fetch
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, system: [...], messages: [...] }),
  });

  // 3. HTTP error check
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
  }

  // 4. Parse + strip markdown fences
  const data = await response.json() as { content: Array<{ text: string }> };
  const raw = data.content[0]?.text ?? '';
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(jsonStr) as { score: number; signals: Record<string, number> };
  // ...
}
```
`rederiveSelector()` copies this structure exactly — same API key read, same fetch call (different model: `claude-haiku-4-5-20251001`, max_tokens: 256), same markdown-fence strip, different parse target (`parsed.candidates`).

**onMessage handler branch pattern** (`src/background/index.ts` lines 141–155 — add a new branch):
```typescript
// Existing SCORE_POST branch:
if (message?.type === 'SCORE_POST') {
  scorePost(message.postText as string)
    .then(result => sendResponse({ result }))
    .catch(err => sendResponse({ error: (err as Error).message }));
  return true; // keep channel open for async response
}
```
New REDERIVE_SELECTOR branch mirrors this exactly:
```typescript
if (message?.type === 'REDERIVE_SELECTOR') {
  checkRateLimit()
    .then(({ allowed, reason }) => {
      if (!allowed) {
        sendResponse({ error: `rate-limited: ${reason ?? 'unknown'}` });
        return;
      }
      const todayKey = new Date().toISOString().slice(0, 10);
      acquireRateLimitLatch(todayKey, /* callsToday */ 0)
        .then(() => rederiveSelector(message.target as string, message.domSkeleton as string))
        .then(result => sendResponse({ result: result.candidates }))
        .catch(err => sendResponse({ error: (err as Error).message }))
        .finally(() => releaseRateLimitLatch().catch(() => {}));
    })
    .catch(err => sendResponse({ error: (err as Error).message }));
  return true; // REQUIRED — omitting this closes the channel (Pitfall 6 from RESEARCH.md)
}
```

**Rate-limit helper functions** — add before the `onMessage` listener. All use `chrome.storage.local.get/set` directly (not `storageGet`/`storageSet`) because the service worker does not import from `src/shared/storage.ts` currently. Follow the existing pattern in `background/index.ts` which uses `chrome.storage.local.get` on line 98.

---

### `src/content/selector-registry.ts` (modify — add insertCandidate)

**Analog:** self — `updateCandidate()` function (lines 231–286)

**updateCandidate() signature and _cache guard pattern** (`src/content/selector-registry.ts` lines 231–240):
```typescript
export async function updateCandidate(
  target: SelectorTarget,
  winnerValue: string
): Promise<void> {
  if (!_cache) {
    return; // No-op if cache is not warm
  }

  const entry = _cache.targets[target];
  if (!entry) {
    return;
  }
  // ...
}
```
`insertCandidate()` begins identically:
```typescript
export async function insertCandidate(
  target: SelectorTarget,
  value: string,
  source: CandidateSource,
): Promise<void> {
  if (!_cache) return;
  const entry = _cache.targets[target];
  if (!entry) return;
  // ...
}
```

**findIndex + duplicate-check pattern** (`src/content/selector-registry.ts` lines 244–260):
```typescript
const idx = entry.candidates.findIndex((c) => c.value === winnerValue);
if (idx <= 0) {
  // Already at front or not found — just update lastMatchedAt and increment matchCount
  if (idx === 0 && entry.candidates[0]) {
    entry.candidates[0].lastMatchedAt = new Date().toISOString();
    entry.candidates[0].matchCount = (entry.candidates[0].matchCount ?? 0) + 1;
  }
} else {
  // Rotate to front
  const removed = entry.candidates.splice(idx, 1);
  const winner = removed[0];
  if (winner) {
    winner.lastMatchedAt = new Date().toISOString();
    winner.matchCount = (winner.matchCount ?? 0) + 1;
    entry.candidates.unshift(winner);
  }
}
```
`insertCandidate()` uses `findIndex` to check for duplicates (existing value → delegate to `updateCandidate`; brand-new value → `unshift` a new `SelectorCandidate`).

**10-candidate cap + seed-preservation pattern** (`src/content/selector-registry.ts` lines 264–281):
```typescript
if (entry.candidates.length > 10) {
  const seedIdx = entry.candidates.findIndex((c) => c.source === 'seed');
  if (seedIdx >= 0) {
    const truncated = entry.candidates.slice(0, 10);
    if (seedIdx >= 10) {
      const seedCandidate = entry.candidates[seedIdx];
      if (seedCandidate && truncated.length > 0) {
        truncated[truncated.length - 1] = seedCandidate;
      }
    }
    entry.candidates = truncated;
  } else {
    entry.candidates = entry.candidates.slice(0, 10);
  }
}
```
`insertCandidate()` applies the identical cap block after `unshift`.

**storageSet fire-and-forget pattern** (`src/content/selector-registry.ts` line 285):
```typescript
await storageSet({ selectorRegistry: _cache }).catch(() => {});
```
`insertCandidate()` also updates `_cache.lastAdaptedAt` before this call:
```typescript
_cache.lastAdaptedAt = new Date().toISOString();
await storageSet({ selectorRegistry: _cache }).catch(() => {});
```

**New SelectorCandidate construction pattern** (mirrors `buildSeedRegistry()` at lines 94–107):
```typescript
{
  value,
  source: 'seed' as CandidateSource,
  lastMatchedAt: null,
  lastVerifiedAt: null,
  addedAt: now,
  failCount: 0,
  matchCount: 0,
}
```
`insertCandidate()` sets `source` to the passed `source` parameter and `lastVerifiedAt` to `now`.

---

### `src/shared/types.ts` (modify — add RateLimitState keys to StorageSchema)

**Analog:** self — existing `StorageSchema` interface (lines 275–299)

**StorageSchema extension pattern** (`src/shared/types.ts` lines 275–299 — add 4 new optional keys):
```typescript
export interface StorageSchema {
  flaggedAccounts?: Record<string, FlaggedAccount>;
  // ... existing keys ...
  selectorRegistry?: SelectorRegistrySchema;
  selectorSessionMisses?: SelectorTarget[];
  // Phase 23 additions — rate-limit state for LLM rederive calls
  llbRederiveLastCallMs?: number;      // epoch ms of most recent LLM call
  llbRederiveCallsToday?: number;      // count since midnight UTC
  llbRedeiveDateKey?: string;          // 'YYYY-MM-DD' UTC — reset detection
  llbRederiveInFlight?: boolean;       // single-flight latch
}
```
Note: `storageGet`/`storageSet` in `src/shared/storage.ts` are already generic over `StorageSchema` (lines 25–38), so adding these keys automatically type-checks all reads/writes.

However, the service worker (`background/index.ts`) currently uses `chrome.storage.local.get/set` directly (not `storageGet`/`storageSet`). The rate-limit functions may also use direct `chrome.storage.local` calls for consistency with the existing `scorePost` pattern at line 98. Both approaches work — pick one and stay consistent within the rate-limit functions.

---

## Shared Patterns

### Named-export function files (not classes)

**Source:** `src/content/exclusions.ts`, `src/content/detector/language.ts`, `src/content/selector-registry.ts`
**Apply to:** `heuristic.ts`, `sanitizer.ts`, `validator.ts`

```typescript
// Pattern: module-scope constants, then exported function(s). No class, no constructor.
const CONSTANT = ...;

export interface ResultType { ... }

export function doThing(input: InputType): ResultType {
  // pure logic
}
```

### resolve() — no inline selector literals

**Source:** `src/content/observer.ts` lines 39, 45, 67, 74, 92, 149, 153, 182
**Apply to:** `heuristic.ts`, any code in `observer.ts` that reads selectors

```typescript
// CORRECT — always use resolve()
const feedContainerSelector = resolve('FEED_CONTAINER');
document.querySelector(feedContainerSelector);

// WRONG — never inline a selector string (CLAUDE.md constraint #1)
document.querySelector('[data-component-type="LazyColumn"]');
```

### Fire-and-forget async pattern

**Source:** `src/content/observer.ts` lines 42–48, 78, 95, 131, 139
**Apply to:** `insertCandidate()` calls in `observer.ts`, `updateCandidate()` calls in `observer.ts`

```typescript
updateCandidate('POST_CARD', 'div[componentkey]').catch(() => {});
insertCandidate('POST_CARD', candidateValue, 'heuristic').catch(() => {});
```

### chrome.storage.local direct reads in service worker

**Source:** `src/background/index.ts` line 98
**Apply to:** `checkRateLimit()`, `acquireRateLimitLatch()`, `releaseRateLimitLatch()` in `background/index.ts`

```typescript
// Service worker always reads storage fresh — never caches in module-scope variables
const result = await chrome.storage.local.get(['anthropicApiKey']);
const apiKey = result.anthropicApiKey as string | undefined;
```

### Markdown-fence strip pattern

**Source:** `src/background/index.ts` lines 126
**Apply to:** `rederiveSelector()` JSON parsing in `background/index.ts`

```typescript
const raw = data.content[0]?.text ?? '';
const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
const parsed = JSON.parse(jsonStr) as { ... };
```

### return true in async onMessage branch

**Source:** `src/background/index.ts` line 151
**Apply to:** `REDERIVE_SELECTOR` branch in `background/index.ts`

```typescript
if (message?.type === 'SCORE_POST') {
  scorePost(...)
    .then(result => sendResponse({ result }))
    .catch(err => sendResponse({ error: (err as Error).message }));
  return true; // keep channel open for async response — NEVER omit
}
```

### Vitest mock for chrome.storage.local

**Source:** `src/content/exclusions.test.ts` lines 39–57 (vi.fn() mock pattern)
**Apply to:** `src/content/selector/validator.test.ts`, `src/background/ratelimit.test.ts`

```typescript
// For rate-limit tests: mock chrome.storage.local in-memory
const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(Object.fromEntries(keys.map(k => [k, mockStorage[k]])))
      ),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(mockStorage, values);
        return Promise.resolve();
      }),
    },
  },
});
```

### JSDoc file header pattern

**Source:** `src/content/exclusions.ts` lines 1–18, `src/content/detector/language.ts` lines 1–19
**Apply to:** All new files in `src/content/selector/`

```typescript
/**
 * <One-line purpose>.
 *
 * <Why it exists and what it does NOT do.>
 *
 * Requirement: ADAPT-XX
 */
```

---

## No Analog Found

No files in Phase 23 are entirely without analog. The closest "no direct analog" entries are:

| File | Role | Data Flow | Nearest Analog | Gap |
|------|------|-----------|----------------|-----|
| `src/content/selector/__fixtures__/*.html` | test-fixture | — | `src/content/exclusions.test.ts` (uses `vi.fn()` mock DOM, not HTML files) | First real HTML fixture files in the project — load with `fs.readFileSync` + `document.body.innerHTML` pattern |
| Rate-limit functions in `background/index.ts` | utility | CRUD (storage) | `scorePost()` storage-read pattern (line 98) | No existing rate-limit pattern to copy — build from RESEARCH.md spec verbatim |

---

## Metadata

**Analog search scope:** `src/background/`, `src/content/`, `src/content/detector/`, `src/shared/`
**Files scanned:** 12 source files read directly
**Pattern extraction date:** 2026-06-13
