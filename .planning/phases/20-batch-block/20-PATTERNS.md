# Phase 20: Batch Block - Pattern Map

**Mapped:** 2026-06-06
**Files analyzed:** 2 (1 modified, 1 new)
**Analogs found:** 2 / 2

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/popup/index.tsx` | component (App) | CRUD + event-driven | `src/popup/index.tsx` itself — existing `handleBlock` + `pending` filter patterns | exact |
| `src/popup/BatchBlockBar.tsx` | component | request-response (user-initiated write) | `src/popup/AccountRow.tsx` — inline-style Preact component with button actions and local state | role-match |

---

## Pattern Assignments

### `src/popup/index.tsx` (modified — insert BatchBlockBar, add handleBatchBlock)

**Analog:** `src/popup/index.tsx` — single-account `handleBlock` and `pending` derivation.

**Imports pattern** (lines 1–5 — no new imports needed; FlaggedAccount already imported):
```typescript
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import type { FlaggedAccount, DailyStats, StoredPost } from '../shared/types';
import AccountRow from './AccountRow';
```
New file import to add (one line, after AccountRow import):
```typescript
import BatchBlockBar from './BatchBlockBar';
```

**Qualifying-set pattern** (lines 112–114 — the `pending` array this phase filters further):
```typescript
const pending = accounts
  .filter(a => a.status === 'pending')
  .sort((a, b) => b.peakScore - a.peakScore);
```
The batch qualifying set is a further filter on `pending`:
```typescript
const batchQualifying = pending.filter(a => a.peakScore >= threshold);
```
This is a pure derived constant — same render-phase derivation as `pending`, reactive to both `accounts` and `threshold` state.

**Single-account block write pattern** (lines 57–66 — the exact async write this phase batches):
```typescript
async function handleBlock(account: FlaggedAccount) {
  // Mark as blocked in storage so the content script applies the blocked overlay
  const result = await chrome.storage.local.get(['flaggedAccounts']);
  const flaggedAccounts = (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>;
  const existing = flaggedAccounts[account.authorId];
  if (existing) {
    flaggedAccounts[account.authorId] = { ...existing, status: 'blocked' as const };
    await chrome.storage.local.set({ flaggedAccounts });
  }
}
```
The batch analog reads once, mutates all qualifying entries in a loop, then calls `set` once:
```typescript
async function handleBatchBlock() {
  const result = await chrome.storage.local.get(['flaggedAccounts']);
  const flaggedAccounts = (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>;
  for (const account of batchQualifying) {
    const existing = flaggedAccounts[account.authorId];
    if (existing) {
      flaggedAccounts[account.authorId] = { ...existing, status: 'blocked' as const };
    }
  }
  await chrome.storage.local.set({ flaggedAccounts });
}
```
One `get`, one loop, one `set` — mirrors the single-account pattern exactly except the loop replaces the single `if (existing)` block.

**`chrome.storage.onChanged` reactivity pattern** (lines 44–54 — drives auto-hide of BatchBlockBar post-write):
```typescript
const listener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string
) => {
  if (area === 'local' && changes['flaggedAccounts']) {
    const raw = (changes['flaggedAccounts'].newValue ?? {}) as Record<string, FlaggedAccount>;
    setAccounts(Object.values(raw));
  }
};
chrome.storage.onChanged.addListener(listener);
return () => chrome.storage.onChanged.removeListener(listener);
```
After the batch write, `flaggedAccounts` fires `onChanged`, `setAccounts` rerenders, `batchQualifying` becomes empty, BatchBlockBar visibility condition (`batchQualifying.length > 0`) becomes false — bar hides automatically. No extra code needed.

**threshold state pattern** (line 14 — drives qualifying count reactivity):
```typescript
const [threshold, setThreshold] = useState(60);
```
`batchQualifying` is derived from `threshold` on every render — D-04 "reactive" requirement is satisfied by this existing state.

**DOM insertion point** (lines 133–176 — BatchBlockBar goes between `listContainer` close tag and the blocked section `div`):
```tsx
      </div>   {/* ← end of listContainer at line 155 */}

      {/* ▶ INSERT BatchBlockBar HERE */}
      {batchQualifying.length > 0 && (
        <BatchBlockBar
          count={batchQualifying.length}
          onBatchBlock={handleBatchBlock}
        />
      )}

      {blocked.length > 0 && (   {/* ← existing blocked section at line 157 */}
```

**`saveBtn` style** (lines 307–318 — "Block all now" button must match this exactly per UI-SPEC):
```typescript
saveBtn: {
  flex: 1,
  padding: '6px 0',
  background: '#0a66c2',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
},
```
Note: UI-SPEC requires `fontWeight: 600` for "Block all now" — override the 500 from `saveBtn` when copying.

**`clearBtn` style** (lines 319–327 — "Keep pending" button must match this exactly per UI-SPEC):
```typescript
clearBtn: {
  padding: '6px 12px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
},
```

---

### `src/popup/BatchBlockBar.tsx` (new component)

**Analog:** `src/popup/AccountRow.tsx` — a self-contained Preact functional component using inline `rowStyles` style objects and `JSX.CSSProperties` typing.

**Component file structure pattern** (lines 1–13 of AccountRow.tsx):
```typescript
import type { FlaggedAccount, StoredPost } from '../shared/types';
import type { JSX } from 'preact';

interface AccountRowProps {
  account: FlaggedAccount;
  onBlock: () => void;
  // ...
}

const rowStyles: Record<string, JSX.CSSProperties> = {
  // all styles declared here
};

export default function AccountRow({ ... }: Readonly<AccountRowProps>): JSX.Element {
```
BatchBlockBar follows the same shape:
- Named `Record<string, JSX.CSSProperties>` style object at module scope
- `interface BatchBlockBarProps` for prop types
- `export default function BatchBlockBar(...)` returning `JSX.Element`
- Use `useState` from `'preact/hooks'` for `confirming` and `writing` local state

**Local state pattern** — `blockedExpanded` toggle in `index.tsx` (line 110) shows the pattern for boolean state local to a feature:
```typescript
const [blockedExpanded, setBlockedExpanded] = useState(false);
```
BatchBlockBar needs two analogous boolean states:
```typescript
const [confirming, setConfirming] = useState(false);
const [writing, setWriting] = useState(false);
```

**`blockBtn` style** (lines 116–125 of AccountRow.tsx — idle-state BatchBlockBar button uses the same outline/accent style):
```typescript
blockBtn: {
  padding: '4px 10px',
  background: '#fff',
  color: '#0a66c2',
  border: '1px solid #0a66c2',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
},
```
UI-SPEC requires `width: '100%'`, `padding: '6px 0'`, `fontSize: 13`, `fontWeight: 600`, `margin: '8px 0'` for the full-width idle button — use `blockBtn` as the visual base, override these properties.

**Button row pattern** (lines 219 of index.tsx — `buttonRow` style for the confirming state):
```typescript
buttonRow: { display: 'flex', gap: 8, marginBottom: 10 },
```
Confirming-state button row extends this with `justifyContent: 'space-between'` and `marginTop: 8` per UI-SPEC.

**`isBlocked` visual state pattern** (AccountRow.tsx lines 139–160 — post-batch-block row appearance requires no new code; existing `isBlocked={true}` prop renders greyed name + Blocked chip automatically):
```tsx
<a
  style={{ ...rowStyles.nameLink, ...(isBlocked ? { color: '#9ca3af' } : {}) }}
>
  {account.authorName}
</a>
{isBlocked && <span style={rowStyles.blockedChip}>Blocked</span>}
```

**Error handling pattern** (D-08 — analogous to the silent-failure convention used throughout; no existing try/catch in popup, so follow this pattern):
```typescript
async function handleBatchBlock() {
  setWriting(true);
  try {
    // ... get/mutate/set
  } catch (err) {
    console.error('[LLB popup] batch block failed:', err);
    setConfirming(false);
  } finally {
    setWriting(false);
  }
}
```
Error leaves `confirming` as false (returns to idle) and logs with the `[LLB popup]` prefix matching `index.tsx` line 99.

---

## Shared Patterns

### Inline Style Objects Only
**Source:** `src/popup/index.tsx` (styles object, lines 243–365) and `src/popup/AccountRow.tsx` (rowStyles object, lines 14–134)
**Apply to:** All new BatchBlockBar styles
**Rule:** No `className` strings, no CSS modules, no external stylesheets. All styles are `Record<string, JSX.CSSProperties>` objects at module scope.

### chrome.storage.local Write Convention
**Source:** `src/popup/index.tsx` lines 57–66 (`handleBlock`)
**Apply to:** `handleBatchBlock` in index.tsx or BatchBlockBar
**Rule:** Always `get` the full `flaggedAccounts` map first, mutate the in-memory object, then `set` the entire map back in one call. Never write partial updates. Use `status: 'blocked' as const` to preserve TypeScript narrowing.

### chrome.storage.onChanged Reactivity
**Source:** `src/popup/index.tsx` lines 44–54
**Apply to:** BatchBlockBar auto-hide (no additional code needed — existing listener already calls `setAccounts`, which causes `batchQualifying` to recompute to empty)
**Rule:** Storage writes trigger the existing listener, which triggers a rerender, which recomputes derived constants. The bar hides because its visibility condition re-evaluates to false. Do not add a second `onChanged` listener for this phase.

### Preact Component Export Convention
**Source:** `src/popup/AccountRow.tsx` line 136
**Apply to:** `src/popup/BatchBlockBar.tsx`
```typescript
export default function BatchBlockBar(...): JSX.Element {
```
Named default export, function declaration form, explicit `JSX.Element` return type.

### `[LLB popup]` Console Prefix
**Source:** `src/popup/index.tsx` line 99
**Apply to:** `console.error` in batch block error handler
```typescript
console.log('[LLB popup] saved key prefix:', ...);
// → use same prefix:
console.error('[LLB popup] batch block failed:', err);
```

---

## No Analog Found

All files in this phase have strong analogs in the existing codebase. No entries.

---

## Metadata

**Analog search scope:** `src/popup/` (index.tsx, AccountRow.tsx), `src/shared/types.ts`
**Files scanned:** 3
**Pattern extraction date:** 2026-06-06
