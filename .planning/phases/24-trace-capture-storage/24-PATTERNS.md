# Phase 24: Trace Capture & Storage - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 4 new/modified files
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/background/index.ts` | service (SW handler) | request-response + storage write | `src/background/index.ts` itself (`scorePost`, `rederiveSelector`) | exact — modify in place |
| `src/shared/types.ts` | model / schema | — | `src/shared/types.ts` itself (`StoredPost`, `StorageSchema`) | exact — extend in place |
| `src/shared/traceStore.ts` (new) | service / store | CRUD + FIFO cap | `src/shared/postStore.ts` | exact role-and-data-flow match |
| `src/shared/pricing.ts` (new) | utility / config | transform | `src/shared/postStore.ts` (constants block) | partial — constant + refresh-on-load pattern |

---

## Pattern Assignments

### `src/background/index.ts` — extend `scorePost()` and `rederiveSelector()`

**Analog:** same file (lines 97–139 for `scorePost`, lines 294–357 for `rederiveSelector`)

**Current `data` parse — scorePost** (lines 124–127):
```typescript
const data = await response.json() as { content: Array<{ text: string }> };
const raw = data.content[0]?.text ?? '';
```
Phase 24 must widen the cast to also capture `usage`:
```typescript
const data = await response.json() as {
  content: Array<{ text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};
// then read data.usage alongside data.content[0].text
```

**Current `data` parse — rederiveSelector** (lines 340–341):
```typescript
const data = (await response.json()) as { content: Array<{ text: string }> };
const raw = data.content[0]?.text ?? '';
```
Same widening applies; both functions are structurally identical at this point.

**Success-path trace write site — scorePost** (lines 119–138, annotated):
```typescript
if (!response.ok) {
  const body = await response.text();
  throw new Error(`API ${response.status}: ${body}`);
}
// ← insert: read data.usage, compute costUsd, call appendTrace({ source: 'detector', ... })
const data = await response.json() as { content: Array<{ text: string }> };
// ... parse and return DetectionResult
```

**Failure-path trace write site — SCORE_POST handler** (lines 365–369):
```typescript
scorePost(message.postText as string)
  .then(result => sendResponse({ result }))
  .catch(err => sendResponse({ error: (err as Error).message }));
```
D-03 requires an error trace on catch. Pattern to follow: wrap in try/catch or chain `.catch` to both `sendResponse` AND `appendTrace({ ..., inputTokens: 0, costUsd: 0, error: err.message })`.

**Failure-path trace write site — REDERIVE_SELECTOR handler** (lines 393–403):
```typescript
try {
  const { candidates } = await rederiveSelector(...);
  sendResponse({ result: candidates });
} catch (err) {
  sendResponse({ error: (err as Error).message });
  // ← insert error trace here
} finally {
  await releaseRateLimitLatch();
}
```

**`chrome.runtime.onInstalled` hook** (lines 5–8) — use this same hook (plus `onStartup`) to seed `MODEL_PRICING` into storage on every load (D-06):
```typescript
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LLB] extension installed');
  chrome.action.setBadgeBackgroundColor({ color: '#0077B5' });
  // ← insert: chrome.storage.local.set({ llbModelPricing: MODEL_PRICING })
});
// Also add: chrome.runtime.onStartup.addListener(() => { ... same price seed ... })
```

---

### `src/shared/types.ts` — add `TraceEntry` interface + `llbTraces` / `llbModelPricing` keys

**Analog:** `StoredPost` interface (lines 166–179) and `StorageSchema` (lines 275–307)

**`StoredPost` shape** (lines 166–179) — direct structural analog for `TraceEntry`:
```typescript
export interface StoredPost {
  urn: string;
  authorId: string;
  authorName: string;
  score: number;
  text: string;
  hiddenAt: number;  // ← analog of TraceEntry.timestamp
}
```
`TraceEntry` follows the same flat-field pattern with no nested objects except the optional `error` string.

**`StorageSchema` key pattern** (lines 293–306) — add two new optional keys using the same JSDoc + optional-key style:
```typescript
/** Newest-first array of hidden posts saved for review. Capped at 200 entries; ... */
storedPosts?: StoredPost[];
// ↓ follow this exact pattern for:
/** Newest-first array of LLM call traces. Capped at 500 entries (TRACE-03). SW writes; Phase 25 dashboard reads. */
llbTraces?: TraceEntry[];
/** Cache-aware model pricing table. SW overwrites from MODEL_PRICING constant on every load (D-06). */
llbModelPricing?: ModelPricing;
```

**Rate-limit key pattern** (lines 299–306) — Phase 23's scalar keys show the naming convention to follow:
```typescript
llbRederiveLastCallMs?: number;
llbRederiveCallsToday?: number;
llbRederiveDateKey?: string;
llbRederiveInFlight?: boolean;
```
New Phase 24 keys use the same `llb` prefix: `llbTraces`, `llbModelPricing`.

---

### `src/shared/traceStore.ts` (new) — FIFO-capped append

**Analog:** `src/shared/postStore.ts` (lines 1–64) — exact role + data-flow match

**Full analog — read → dedup/mutate → cap → write idiom** (`postStore.ts` lines 37–63):
```typescript
export async function persistStoredPost(opts: { ... }): Promise<void> {
  const { storedPosts = [] } = await storageGet(['storedPosts']);

  // Dedup: skip if this URN is already stored
  if (storedPosts.some((p: StoredPost) => p.urn === urn)) return;

  const entry: StoredPost = { urn, authorId, authorName, score,
    text: text.trim().slice(0, POST_TEXT_MAX_CHARS),
    hiddenAt: Date.now(),
  };

  // Prepend (newest first), then evict oldest if over cap
  const updated = [entry, ...(storedPosts as StoredPost[])];
  if (updated.length > POST_STORE_CAP) updated.pop();

  await storageSet({ storedPosts: updated });
}
```
`traceStore.ts` copies this structure verbatim, substituting:
- `storedPosts` → `llbTraces`
- `StoredPost` → `TraceEntry`
- `POST_STORE_CAP = 200` → `TRACE_STORE_CAP = 500`
- No dedup (every call gets a trace entry, including duplicates; D-03)
- No text truncation at this layer (userPrompt is truncated at the call site in `index.ts` per D-04)

**Imports block to copy from `postStore.ts`** (lines 12–13):
```typescript
import { storageGet, storageSet } from './storage';
import type { StoredPost } from './types';
// → change StoredPost to TraceEntry
```

---

### `src/shared/pricing.ts` (new) — `MODEL_PRICING` constant + cost computation

**Analog:** constants block in `src/shared/postStore.ts` (lines 19–23) for the pattern of exporting named constants; cost arithmetic is new but straightforward.

**Constants block pattern** (`postStore.ts` lines 19–23):
```typescript
/** Maximum number of stored posts before oldest is evicted. */
const POST_STORE_CAP = 200;

/** Maximum characters of post text to store. */
const POST_TEXT_MAX_CHARS = 1000;
```
`pricing.ts` follows the same documentation style for `MODEL_PRICING` and `computeCostUsd`.

**Pricing table shape (from CONTEXT.md D-05 / D-06 / D-08):**
```typescript
export interface ModelPricing {
  [model: string]: { inputPerMTok: number; outputPerMTok: number } | undefined;
}

export const MODEL_PRICING: ModelPricing = {
  'claude-sonnet-4-6':        { inputPerMTok: 3.00,  outputPerMTok: 15.00 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1.00,  outputPerMTok:  5.00 },
};
```

**Cost formula (D-05) — cache-aware:**
```typescript
// Cache multipliers (Anthropic): cache-write = 1.25× input, cache-read = 0.10× input
export function computeCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number;
           cache_creation_input_tokens?: number; cache_read_input_tokens?: number },
): { costUsd: number; unpriced: boolean } {
  const rates = MODEL_PRICING[model];
  if (!rates) return { costUsd: 0, unpriced: true };   // D-08: unknown model → 0 + flag

  const { inputPerMTok, outputPerMTok } = rates;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheRead   = usage.cache_read_input_tokens    ?? 0;
  const plainInput  = usage.input_tokens;
  const output      = usage.output_tokens;

  const costUsd =
    (plainInput    * inputPerMTok
   + cacheCreate   * inputPerMTok * 1.25
   + cacheRead     * inputPerMTok * 0.10
   + output        * outputPerMTok) / 1_000_000;

  return { costUsd, unpriced: false };
}
```

---

## Shared Patterns

### Storage I/O — always via typed wrappers
**Source:** `src/shared/storage.ts` (lines 25–39)
**Apply to:** `traceStore.ts`, `pricing.ts` (seed write in `index.ts`)
```typescript
export async function storageGet<K extends keyof StorageSchema>(keys: K[]): Promise<Pick<StorageSchema, K>> {
  return chrome.storage.local.get(keys) as Promise<Pick<StorageSchema, K>>;
}
export async function storageSet(values: Partial<StorageSchema>): Promise<void> {
  return chrome.storage.local.set(values);
}
```
Never call `chrome.storage.local.get/set` directly — always import from `./storage`.

### FIFO cap — prepend + pop
**Source:** `src/shared/postStore.ts` (lines 59–62)
**Apply to:** `src/shared/traceStore.ts` (`appendTrace`)
```typescript
const updated = [entry, ...(storedPosts as StoredPost[])];
if (updated.length > POST_STORE_CAP) updated.pop();
await storageSet({ storedPosts: updated });
```
`traceStore.ts` uses `updated.length > TRACE_STORE_CAP` with cap 500; the `pop()` evicts the oldest (index 500) after the newest was prepended at index 0. This is the **only** FIFO cap idiom in the codebase — do not use `slice`.

### SW stateless — read/write state every invocation
**Source:** `src/background/index.ts` (lines 98–99, 227–231)
**Apply to:** trace write in `scorePost()` and `rederiveSelector()`, pricing seed in `onInstalled`/`onStartup`
```typescript
// Read fresh from storage every call — SW may have restarted
const result = await chrome.storage.local.get(['anthropicApiKey']);
```
All per-call state (including `llbTraces`) must be written to `chrome.storage.local` before the function returns; nothing survives across SW restarts.

### Refresh-on-load pricing seed — overwrite, not merge
**Source:** `src/background/index.ts` (lines 5–8, `onInstalled` hook)
**Apply to:** `MODEL_PRICING` seed in `onInstalled` + `onStartup`

This is explicitly **different** from Phase 22's `SelectorRegistry` seed semantics: pricing **overwrites** storage on every load; selector values **preserve** stored/adapted values. The plan must not copy SelectorRegistry's "preserve stored" guard here.

```typescript
// Phase 22 SelectorRegistry — PRESERVE stored (do NOT copy this for pricing):
//   if (stored && stored.version === SELECTORS_VERSION) return; // skip seed
// Phase 24 MODEL_PRICING — OVERWRITE always:
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({ llbModelPricing: MODEL_PRICING });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.storage.local.set({ llbModelPricing: MODEL_PRICING });
});
```

### Error trace pattern (D-03) — all attempts produce a trace entry
**Source:** `src/background/index.ts` (lines 393–403, REDERIVE_SELECTOR handler)
**Apply to:** both SCORE_POST and REDERIVE_SELECTOR handlers
```typescript
try {
  const { candidates } = await rederiveSelector(...);
  sendResponse({ result: candidates });
  // ← success trace: full tokens + costUsd, no error field
} catch (err) {
  sendResponse({ error: (err as Error).message });
  // ← error trace: tokens 0, costUsd 0, error: (err as Error).message
} finally {
  await releaseRateLimitLatch();
}
```
A single `appendTrace(...)` call in each branch (not a shared finally) keeps the two code paths explicit and avoids needing a mutable accumulator variable.

---

## No Analog Found

All Phase 24 files have close codebase analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `src/background/`, `src/shared/`, `src/dashboard/`
**Files read:** 5 (`index.ts`, `types.ts`, `storage.ts`, `postStore.ts`, `dataManagement.ts`)
**Pattern extraction date:** 2026-06-13
