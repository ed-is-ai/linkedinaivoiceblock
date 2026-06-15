# Phase 22: Externalize Selectors to Storage — Pattern Map

**Mapped:** 2026-06-07
**Files analyzed:** 10 (2 new, 8 modified)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/content/selector-registry.ts` | service (singleton) | CRUD + event-driven | `src/shared/storage.ts` + `src/content/index.ts` onChanged block | role-match |
| `src/shared/types.ts` | model | — | itself (additive extension) | exact |
| `src/content/index.ts` | bootstrap/orchestrator | request-response | itself (additive insertion) | exact |
| `src/content/observer.ts` | observer/consumer | event-driven | itself (import swap) | exact |
| `src/content/exclusions.ts` | utility/consumer | request-response | itself (import swap) | exact |
| `src/content/detector/comment-expand.ts` | utility/consumer | event-driven | itself (import swap) | exact |
| `src/content/detector/signals/profile.ts` | utility/consumer | request-response | itself (import swap) | exact |
| `src/dashboard/SelectorView.tsx` | component | request-response | `src/popup/BatchBlockBar.tsx` + `src/dashboard/index.tsx` | role-match |
| `src/dashboard/index.tsx` | component/orchestrator | request-response | itself (additive extension) | exact |
| `CLAUDE.md` + `src/content/selectors.ts` header | config/doc | — | existing comment blocks in each file | exact |

---

## Pattern Assignments

### `src/content/selector-registry.ts` (NEW — service singleton, CRUD + event-driven)

**Primary analogs:** `src/shared/storage.ts` (storage wrapper pattern), `src/content/index.ts` lines 125–180 (onChanged listener pattern)

**Imports pattern** — copy from `src/shared/storage.ts` lines 16 and `src/content/index.ts` line 9:
```typescript
import type { StorageSchema, SelectorRegistrySchema, SelectorTarget } from '../shared/types';
import { storageGet, storageSet } from '../shared/storage';
import { SELECTORS_VERSION, FEED_CONTAINER, FEED_CONTAINER_FALLBACK, POST_CARD,
         POST_URN_ATTR, POST_URN_ATTR_FALLBACK, POST_BODY_TEXT, POST_AUTHOR_NAME,
         POST_AUTHOR_LINK, SPONSORED_MARKER, COMPANY_PAGE_MARKER, RESHARE_INDICATOR,
         COMMENT_EXPAND_BUTTON, OPEN_TO_WORK_MARKER, COMMENT_TEXT,
         AUTHOR_HEADLINE, CONNECTION_DEGREE } from './selectors';
```

**In-memory cache + module-scope state** — copy pattern from `src/content/index.ts` lines 47–77 (module-scope const/let declarations):
```typescript
// src/content/index.ts lines 47–48 — module-scope singleton pattern
const dismissedSet = new Set<string>();
const blockedAuthors = new Map<string, { postScore: number; profileScore: number }>();

// Apply the same pattern for the registry cache:
let _cache: SelectorRegistrySchema | null = null;
```

**onChanged listener at module top level** — copy verbatim structure from `src/content/index.ts` lines 125–180:
```typescript
// src/content/index.ts lines 125–130 — module-top-level listener registration
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes['dismissedAccounts']) {
    // ... handler body
  }
});

// Apply same pattern for selectorRegistry cache refresh:
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes['selectorRegistry']) {
    _cache = (changes['selectorRegistry'].newValue as SelectorRegistrySchema) ?? null;
  }
  if (changes['selectorSessionMisses']) {
    // optional: update module-scope miss set if needed
  }
});
```

**storageGet / storageSet usage** — copy from `src/content/index.ts` lines 209–210 and `src/shared/storage.ts`:
```typescript
// src/content/index.ts line 209-210 — typed destructuring from storageGet
const { anthropicApiKey, dismissedAccounts = [], flaggedAccounts = {}, settings } =
  await storageGet(['anthropicApiKey', 'dismissedAccounts', 'flaggedAccounts', 'settings']);

// Apply same pattern for registry:
const { selectorRegistry } = await storageGet(['selectorRegistry']);
await storageSet({ selectorRegistry: buildSeedRegistry() });
```

**Core singleton export shape** — matches `src/shared/storage.ts` lines 25–50 (named export functions, no class):
```typescript
// src/shared/storage.ts lines 25–28 — named async function exports pattern
export async function storageGet<K extends keyof StorageSchema>(
  keys: K[]
): Promise<Pick<StorageSchema, K>> {
  return chrome.storage.local.get(keys) as Promise<Pick<StorageSchema, K>>;
}

// Apply same pattern (named exports, no class):
export async function seedIfNeeded(): Promise<void> { ... }
export async function load(): Promise<void> { ... }
export function resolve(target: SelectorTarget): string { ... }
export async function updateCandidate(target: SelectorTarget, winnerValue: string): Promise<void> { ... }
export function recordMiss(target: SelectorTarget): void { ... }
```

**Error handling** — copy from `src/content/index.ts` lines 170–179 (fire-and-forget `.catch(() => {})`):
```typescript
// src/content/index.ts lines 170–179 — fire-and-forget pattern for non-critical async
storageGet(['flaggedAccounts']).then(({ flaggedAccounts = {} }) => {
  thresholdAuthors.clear();
  // ...
}).catch(() => {});

// Apply same pattern for updateCandidate (fire-and-forget from observer hot path):
storageSet({ selectorRegistry: _cache }).catch(() => {});
```

---

### `src/shared/types.ts` (MODIFIED — additive type extensions)

**Analog:** itself — additive extension following the exact established block pattern.

**Existing StorageSchema extension pattern** (lines 189–209) — add new keys following the same optional-field pattern:
```typescript
// src/shared/types.ts lines 189–209 — existing StorageSchema; extend by adding fields
export interface StorageSchema {
  flaggedAccounts?: Record<string, FlaggedAccount>;
  dismissedAccounts?: string[];
  anthropicApiKey?: string;
  settings?: Settings;
  dailyStats?: DailyStats[];
  storedPosts?: StoredPost[];
  // ADD (Phase 22):
  selectorRegistry?: SelectorRegistrySchema;
  selectorSessionMisses?: SelectorTarget[];
}
```

**New interface block pattern** — copy the JSDoc + interface style from lines 79–112 (`FlaggedAccount`):
```typescript
// src/shared/types.ts lines 79–83 — JSDoc + interface pattern to replicate
/**
 * Full account record for a flagged LinkedIn account stored in chrome.storage.local.
 * ...
 */
export interface FlaggedAccount {
  authorId: string;
  // ...
}

// New interfaces follow identical structure:
export type SelectorTarget = 'FEED_CONTAINER' | 'FEED_CONTAINER_FALLBACK' | ...;
export type CandidateSource = 'seed' | 'heuristic' | 'llm' | 'user';
export interface SelectorCandidate { ... }
export interface TargetEntry { ... }
export interface SelectorRegistrySchema { ... }
```

---

### `src/content/index.ts` (MODIFIED — bootstrap sequence insertion)

**Analog:** itself — two `await` calls inserted at the precise location identified in RESEARCH.md.

**Insertion point** (lines 208–213) — insert immediately after the existing `storageGet` await, before `startObserving`:
```typescript
// src/content/index.ts lines 208–213 — existing async init() start
async function init(): Promise<void> {
  const { anthropicApiKey, dismissedAccounts = [], flaggedAccounts = {}, settings } =
    await storageGet(['anthropicApiKey', 'dismissedAccounts', 'flaggedAccounts', 'settings']);
  // INSERT HERE (Phase 22):
  await seedIfNeeded();
  await load();
  // ... existing setup continues ...
  startObserving(...);   // line 260 — observer starts only AFTER cache is warm
}
```

**Import addition** — follows the existing import block pattern (lines 1–13):
```typescript
// src/content/index.ts lines 1–13 — existing import block style
import { SELECTORS_VERSION } from './selectors';
import { startObserving } from './observer';
// ADD:
import { seedIfNeeded, load } from './selector-registry';
```

**Note:** `SELECTORS_VERSION` import on line 1 stays as-is — it is version metadata used in the console log on line 118, not a DOM selector.

---

### `src/content/observer.ts` (MODIFIED — import swap, 4 consumer call sites)

**Analog:** itself — replace named constant imports with `resolve()` calls.

**Current import block** (lines 13–22) — replace selector constants (keep `SELECTORS_VERSION`):
```typescript
// src/content/observer.ts lines 13–22 — CURRENT (to be replaced)
import {
  FEED_CONTAINER,
  FEED_CONTAINER_FALLBACK,
  POST_URN_ATTR,
  POST_AUTHOR_NAME,
  POST_BODY_TEXT,
  POST_AUTHOR_LINK,
  RESHARE_INDICATOR,
  SELECTORS_VERSION,
} from './selectors';

// AFTER (Phase 22):
import { SELECTORS_VERSION } from './selectors';
import { resolve } from './selector-registry';
```

**Call site migration map** (replace at each usage location):

| Line range | Current constant | Replacement |
|---|---|---|
| line 48–49 | `FEED_CONTAINER` | `resolve('FEED_CONTAINER')` |
| line 48–49 | `FEED_CONTAINER_FALLBACK` | `resolve('FEED_CONTAINER_FALLBACK')` |
| line 67 | `RESHARE_INDICATOR` | `resolve('RESHARE_INDICATOR')` |
| line 70 | `POST_AUTHOR_LINK` | `resolve('POST_AUTHOR_LINK')` |
| line 83 | `POST_BODY_TEXT` | `resolve('POST_BODY_TEXT')` |
| line 116 | `POST_URN_ATTR` | `resolve('POST_URN_ATTR')` |
| line 129 | `POST_BODY_TEXT` | `resolve('POST_BODY_TEXT')` |
| line 132 | `POST_BODY_TEXT` | `resolve('POST_BODY_TEXT')` |
| line 161 | `POST_BODY_TEXT` | `resolve('POST_BODY_TEXT')` |

**Note on `POST_AUTHOR_NAME`:** imported on line 19 of the current file but not found used in the function bodies visible in lines 66–86 (`extractPostData` uses `POST_AUTHOR_LINK` + `querySelector('strong')` directly). Grep for actual usage before migrating — the import may be unused already.

**Note on `POST_URN_ATTR`:** used as `card.getAttribute(POST_URN_ATTR)` (line 116), not `querySelector`. `resolve('POST_URN_ATTR')` returns the attribute name string `'componentkey'` — semantically correct, same call pattern.

---

### `src/content/exclusions.ts` (MODIFIED — import swap, 3 consumer call sites)

**Analog:** itself — replace 3 named constant imports with `resolve()` calls.

**Current import block** (lines 20–24) — full replacement:
```typescript
// src/content/exclusions.ts lines 20–24 — CURRENT
import {
  SPONSORED_MARKER,
  COMPANY_PAGE_MARKER,
  OPEN_TO_WORK_MARKER,
} from './selectors';

// AFTER (Phase 22):
import { resolve } from './selector-registry';
```

**Call site migration map:**

| Line | Current | Replacement |
|---|---|---|
| line 68 | `postNode.querySelector(SPONSORED_MARKER)` | `postNode.querySelector(resolve('SPONSORED_MARKER'))` |
| line 74 | `postData.authorProfileUrl.includes(COMPANY_PAGE_MARKER)` | `postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))` |
| line 86 | `postNode.querySelector(OPEN_TO_WORK_MARKER)` | `postNode.querySelector(resolve('OPEN_TO_WORK_MARKER'))` |

**Note on `COMPANY_PAGE_MARKER`:** used with `String.includes()` (line 74), not `querySelector`. `resolve('COMPANY_PAGE_MARKER')` returns the URL-pattern string `'/company/'` — same semantics.

---

### `src/content/detector/comment-expand.ts` (MODIFIED — import swap, 2 consumer call sites)

**Analog:** itself — replace 2 named constant imports with `resolve()` calls.

**Current import** (line 25) — full replacement:
```typescript
// src/content/detector/comment-expand.ts line 25 — CURRENT
import { COMMENT_EXPAND_BUTTON, COMMENT_TEXT } from '../selectors';

// AFTER (Phase 22):
import { resolve } from '../selector-registry';
```

**Call site migration map:**

| Line | Current | Replacement |
|---|---|---|
| line 63 | `postNode.querySelector(COMMENT_EXPAND_BUTTON)` | `postNode.querySelector(resolve('COMMENT_EXPAND_BUTTON'))` |
| line 77 | `postNode.querySelectorAll(COMMENT_TEXT)` | `postNode.querySelectorAll(resolve('COMMENT_TEXT'))` |

---

### `src/content/detector/signals/profile.ts` (MODIFIED — import swap, 2 consumer call sites)

**Analog:** itself — replace 2 named constant imports with `resolve()` calls.

**Current import** (line 16) — full replacement:
```typescript
// src/content/detector/signals/profile.ts line 16 — CURRENT
import { AUTHOR_HEADLINE, CONNECTION_DEGREE } from '../../selectors';

// AFTER (Phase 22):
import { resolve } from '../../selector-registry';
```

**Call site migration map:**

| Line | Current | Replacement |
|---|---|---|
| line 139 | `postNode.querySelector(AUTHOR_HEADLINE)` | `postNode.querySelector(resolve('AUTHOR_HEADLINE'))` |
| line 144 | `postNode.querySelector(CONNECTION_DEGREE)` | `postNode.querySelector(resolve('CONNECTION_DEGREE'))` |

---

### `src/dashboard/SelectorView.tsx` (NEW — Preact component, request-response)

**Primary analog:** `src/popup/BatchBlockBar.tsx` (inline confirm-step state machine)
**Secondary analog:** `src/dashboard/index.tsx` (style record `s`, card layout, JSX structure)

**Props interface pattern** — copy from `BatchBlockBar.tsx` lines 4–7:
```typescript
// src/popup/BatchBlockBar.tsx lines 4–7 — props interface pattern
interface BatchBlockBarProps {
  count: number;
  onBatchBlock: () => Promise<void>;
}

// SelectorView equivalent:
interface SelectorViewProps {
  registry: SelectorRegistrySchema | null;
  sessionMisses: Set<SelectorTarget>;
  onReset: () => Promise<void>;
  error: string | null;
}
```

**Style record pattern** — copy from `src/dashboard/index.tsx` lines 263–313 (the `s` record):
```typescript
// src/dashboard/index.tsx lines 263–313 — inline style record pattern
const s: Record<string, import('preact').JSX.CSSProperties> = {
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '20px 24px', marginBottom: 16,
  },
  cardHeading: { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 },
  errorMsg: { fontSize: 12, color: '#dc2626', marginBottom: 8 },
  actionBtn: {
    padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: 6,
    background: '#fff', cursor: 'pointer', fontSize: 13,
  },
  metricLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  statSub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
};

// SelectorView uses the SAME values (reuse from parent via prop or duplicate locally).
// The sv (SelectorView styles) record adds only SelectorView-specific entries.
```

**Confirm-strip state machine** — copy verbatim from `src/popup/BatchBlockBar.tsx` lines 77–130:
```typescript
// src/popup/BatchBlockBar.tsx lines 77–90 — state machine + handleConfirm
export default function BatchBlockBar({ count, onBatchBlock }: Readonly<BatchBlockBarProps>): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [writing, setWriting] = useState(false);

  async function handleConfirm() {
    setWriting(true);
    try {
      await onBatchBlock();
    } catch (err) {
      console.error('[LLB popup] batch block failed:', err);
      setConfirming(false);
    } finally {
      setWriting(false);
    }
  }
  // ...
}

// SelectorView reset control reuses IDENTICAL state machine:
const [confirming, setConfirming] = useState(false);
const [writing, setWriting] = useState(false);
const [resetError, setResetError] = useState<string | null>(null);

async function handleConfirmReset() {
  setWriting(true);
  setResetError(null);
  try {
    await onReset();
    setConfirming(false);
  } catch {
    setResetError('Reset failed. Try again.');
    setConfirming(false);
  } finally {
    setWriting(false);
  }
}
```

**Confirm-strip JSX** — copy from `BatchBlockBar.tsx` lines 105–129 (the `confirmStrip` div):
```typescript
// src/popup/BatchBlockBar.tsx lines 9–75 — barStyles record (copy values verbatim)
confirmStrip: {
  background: '#f3f4f6',
  borderRadius: 4,
  padding: '8px',
  marginBottom: 8,
},
message: { fontSize: 12, color: '#374151', margin: 0 },
buttonRow: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 },
keepBtn: { padding: '6px 12px', background: '#f3f4f6', color: '#374151',
           border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
blockAllBtn: { flex: 1, padding: '6px 0', background: '#0a66c2', color: '#fff',
               border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
blockAllBtnDisabled: { ...same + opacity: 0.7, cursor: 'not-allowed' },
```

**Idle button** — copy `s.actionBtn` from `dashboard/index.tsx` line 301–304:
```typescript
// src/dashboard/index.tsx lines 301–304
actionBtn: {
  padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontSize: 13,
},
// Label: "Reset to defaults"
```

**Error message** — copy `s.errorMsg` from `dashboard/index.tsx` line 300:
```typescript
// src/dashboard/index.tsx line 300
errorMsg: { fontSize: 12, color: '#dc2626', marginBottom: 8 },
```

**Loading state** — copy pattern from `dashboard/index.tsx` line 23:
```typescript
// src/dashboard/index.tsx line 23
<div style={{ fontSize: 12, color: '#9ca3af', padding: '24px 0' }}>No feed data yet…</div>
// Apply: "Loading selector health…" with same style
```

**HR divider** — copy from `dashboard/index.tsx` line 234:
```typescript
// src/dashboard/index.tsx line 234
<hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
```

**Feed-essential targets hard-coded constant (in SelectorView.tsx):**
```typescript
const FEED_ESSENTIAL: ReadonlySet<SelectorTarget> = new Set([
  'FEED_CONTAINER', 'POST_CARD', 'POST_AUTHOR_LINK', 'POST_BODY_TEXT',
]);
```

---

### `src/dashboard/index.tsx` (MODIFIED — state extension + SelectorView wiring)

**Analog:** itself — additive extension following the established state + useEffect + handler pattern.

**State addition pattern** (lines 70–78) — add new state slices following existing `useState` block:
```typescript
// src/dashboard/index.tsx lines 70–78 — existing state declarations
const [timeWindow, setTimeWindow] = useState<7 | 30>(7);
const [accounts, setAccounts] = useState<FlaggedAccount[]>([]);
const [stats, setStats] = useState<DailyStats[]>([]);
const [posts, setPosts] = useState<StoredPost[]>([]);
const [dismissed, setDismissed] = useState<string[]>([]);
const [loadError, setLoadError] = useState<string | null>(null);

// ADD (Phase 22):
const [selectorRegistry, setSelectorRegistry] = useState<SelectorRegistrySchema | null>(null);
const [sessionMisses, setSessionMisses] = useState<Set<SelectorTarget>>(new Set());
```

**useEffect storage read pattern** (lines 80–92) — extend the existing `.get()` call:
```typescript
// src/dashboard/index.tsx lines 80–92 — existing useEffect
useEffect(() => {
  chrome.storage.local.get(['flaggedAccounts', 'dailyStats', 'storedPosts', 'dismissedAccounts']).then((result) => {
    // ... existing setState calls
  }).catch(() => {
    setLoadError('Could not load data. Try reopening the dashboard.');
  });
}, []);

// AFTER (Phase 22) — extend the get() key array:
chrome.storage.local.get([
  'flaggedAccounts', 'dailyStats', 'storedPosts', 'dismissedAccounts',
  'selectorRegistry', 'selectorSessionMisses'   // ADD
]).then((result) => {
  // existing setState calls...
  setSelectorRegistry((result.selectorRegistry ?? null) as SelectorRegistrySchema | null);
  setSessionMisses(new Set((result.selectorSessionMisses ?? []) as SelectorTarget[]));
})
```

**onChanged listener** — add inside `useEffect` following the same pattern as onChanged block in `index.ts` lines 125–130:
```typescript
// Pattern: chrome.storage.onChanged.addListener inside useEffect with cleanup
useEffect(() => {
  function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area !== 'local') return;
    if (changes['selectorRegistry']) {
      setSelectorRegistry(changes['selectorRegistry'].newValue ?? null);
    }
    if (changes['selectorSessionMisses']) {
      setSessionMisses(new Set(changes['selectorSessionMisses'].newValue ?? []));
    }
  }
  chrome.storage.onChanged.addListener(handleStorageChange);
  return () => chrome.storage.onChanged.removeListener(handleStorageChange);
}, []);
```

**handleResetSelectors function** — copy pattern from `handleClean` (lines 119–133) for async handler shape, but using `storageSet`:
```typescript
// src/dashboard/index.tsx lines 119–133 — async handler pattern
async function handleClean(): Promise<void> {
  // ...
  await chrome.storage.local.set({ ... });
  setAccounts(...);
}

// Apply same shape (but use storageSet wrapper per RESEARCH.md "Don't Hand-Roll" table):
async function handleResetSelectors(): Promise<void> {
  await storageSet({ selectorRegistry: buildSeedRegistry() });
  // onChanged fires → setSelectorRegistry updates automatically
}
```

**SelectorView import + JSX placement** — copy the same import + JSX card pattern, inserting after line 219 (`</div>` closing the second existing card) and before line 220 (`<div style={s.card}>` opening the data management card):
```typescript
// src/dashboard/index.tsx line 220 — data management card (insertion point: BEFORE this)
<div style={s.card}>
  <div style={s.cardHeading}>Data management</div>

// INSERT SelectorView card here:
<SelectorView
  registry={selectorRegistry}
  sessionMisses={sessionMisses}
  onReset={handleResetSelectors}
  error={loadError}
/>
```

---

## Shared Patterns

### Storage Read/Write
**Source:** `src/shared/storage.ts` lines 25–50
**Apply to:** `selector-registry.ts`, `dashboard/index.tsx` (handleResetSelectors)

Never call `chrome.storage.local.get/set` directly. Always use `storageGet`/`storageSet` from `src/shared/storage.ts`. These wrappers are generic over `StorageSchema` — once `selectorRegistry` and `selectorSessionMisses` are added to `StorageSchema`, they type-check automatically.

```typescript
// src/shared/storage.ts lines 25–28
export async function storageGet<K extends keyof StorageSchema>(
  keys: K[]
): Promise<Pick<StorageSchema, K>> {
  return chrome.storage.local.get(keys) as Promise<Pick<StorageSchema, K>>;
}
```

### chrome.storage.onChanged Registration
**Source:** `src/content/index.ts` lines 125–130
**Apply to:** `selector-registry.ts` (module top-level), `dashboard/index.tsx` (useEffect with cleanup)

Register the listener at module scope (content script) or inside useEffect with a cleanup return (dashboard). Never register inside an async function or after the first await — the listener must be active before any tab can write.

```typescript
// src/content/index.ts lines 125–130 — module-top-level pattern (for selector-registry.ts)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // key-guarded handler
});
```

### Inline Confirm State Machine
**Source:** `src/popup/BatchBlockBar.tsx` lines 77–130
**Apply to:** `src/dashboard/SelectorView.tsx` (reset control)

Two boolean states: `confirming` + `writing`. `handleConfirm` sets `writing=true`, awaits, sets `writing=false` in finally. Cancel resets `confirming=false`. Error resets `confirming=false` and sets an error message string.

```typescript
// src/popup/BatchBlockBar.tsx lines 78–91
const [confirming, setConfirming] = useState(false);
const [writing, setWriting] = useState(false);

async function handleConfirm() {
  setWriting(true);
  try {
    await onBatchBlock();
  } catch (err) {
    console.error('[LLB popup] batch block failed:', err);
    setConfirming(false);
  } finally {
    setWriting(false);
  }
}
```

### Inline Style Record
**Source:** `src/dashboard/index.tsx` lines 263–313
**Apply to:** `src/dashboard/SelectorView.tsx`

All styling uses a typed `Record<string, JSX.CSSProperties>` constant at the bottom of the file (or at module scope before the component function). No CSS classes, no external stylesheets, no Tailwind. New components define their own local style record using only the approved color tokens and spacing values from UI-SPEC.md.

```typescript
// src/dashboard/index.tsx lines 263–264 — style record declaration pattern
const s: Record<string, import('preact').JSX.CSSProperties> = {
  // ... all style entries
};
```

### Selector Value Rules
**Source:** `src/content/selectors.ts` lines 1–17 (file header)
**Apply to:** `selector-registry.ts` (buildSeedRegistry), all consumer call sites

All selector strings that enter the registry MUST follow the existing `selectors.ts` constraint: `data-*` attributes, `aria-*` attributes, `role` attributes, semantic elements, or URL patterns only. CSS class names are forbidden. The registry schema must validate or at least document this constraint on the `value` field of `SelectorCandidate`.

```typescript
// src/content/selectors.ts lines 13–17
// Selector value rules:
//   - Values MUST use data-* attributes, aria-* attributes, role attributes, or semantic elements.
//   - CSS class names (e.g. .some-class) are FORBIDDEN — LinkedIn rebuilds class names on every deploy.
//   - URL patterns (strings passed to .includes() / .contains()) are allowed for href-based checks.
```

### Fire-and-Forget Async from Sync Callback
**Source:** `src/content/index.ts` lines 170–179 and lines 334–336
**Apply to:** `selector-registry.ts` `updateCandidate()` call from observer hot path

The observer callback is sync; `updateCandidate()` is async. Call it with `.catch(() => {})` and do not await. This pattern is already used for `writeDailyStats` and the `storageGet` rebuild in the settings-change handler.

```typescript
// src/content/index.ts lines 334–336
writeDailyStats().catch(() => {});

// Apply same pattern for winner rotation (fire-and-forget):
updateCandidate(target, winnerValue).catch(() => {});
```

---

## No Analog Found

All files have close analogs in the codebase. No entries.

---

## Special Cases Requiring Planner Decision

| Item | Nature | Recommendation |
|---|---|---|
| `POST_URN_ATTR` / `COMPANY_PAGE_MARKER` in registry | Used with `getAttribute()` / `String.includes()`, not `querySelector` | Include in `SelectorTarget` union for type completeness. `resolve()` returns the string as-is. `updateCandidate()` is never called for these in Phase 22. Document in code. |
| `POST_URN_ATTR_FALLBACK` consumer check | RESEARCH.md A1: assumed not imported by any consumer file | Planner must grep `src/` for `POST_URN_ATTR_FALLBACK` before finalizing migration list. Include in `SelectorTarget` union regardless. |
| `POST_AUTHOR_NAME` in observer.ts | Imported on line 19 but not visibly called in `extractPostData` body | Verify actual usage before migrating. May be dead import; if dead, drop from both import and registry consumers (still include in `SelectorTarget` type). |
| Session-miss Set across SPA navigations | RESEARCH.md Pitfall 5: SPA handler in `index.ts` clears module-scope caches | Do NOT add the session-miss Set to the SPA nav clear list (lines 241–258 in `index.ts`). The Set persists for the content-script lifetime — one set per tab session. |
| `storageSet` in `dashboard/index.tsx` | Dashboard currently uses raw `chrome.storage.local.set` (line 127) | `handleResetSelectors` should use `storageSet` wrapper (consistent with RESEARCH.md "Don't Hand-Roll" table) — requires importing from `../shared/storage`. |

---

## Metadata

**Analog search scope:** `src/content/`, `src/shared/`, `src/dashboard/`, `src/popup/`
**Files read:** 10
**Pattern extraction date:** 2026-06-07
