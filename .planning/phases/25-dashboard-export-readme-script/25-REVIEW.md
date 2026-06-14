---
phase: 25-dashboard-export-readme-script
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/dashboard/dataManagement.ts
  - src/dashboard/dataManagement.test.ts
  - src/dashboard/index.tsx
  - scripts/trace-summary.ts
  - package.json
  - README.md
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-06-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 25 adds a `buildTracesExport` builder in `dataManagement.ts`, wires an "Export Traces" button into the dashboard `index.tsx`, and introduces the `scripts/trace-summary.ts` Node CLI. The builder and wiring are essentially correct. The CLI contains one crash-level defect on malformed input (null element in the traces array), two silent-corruption issues from absent numeric field guards, and one README-upsert correctness defect. The `dataManagement.ts` module is clean and well-tested; its tests are thorough and cover edge cases correctly.

---

## Critical Issues

### CR-01: Null / primitive entries in `traces` array crash the CLI

**File:** `scripts/trace-summary.ts:60-91`

**Issue:** The loop `for (const entry of parsed.traces)` treats every element as a `TraceEntry` object. If the export file contains a `traces` array with a `null`, `undefined`, number, or string element — which is possible with any untrusted or manually-edited JSON — accessing `entry.error` (line 75), `entry.source`, `entry.model`, etc. throws `TypeError: Cannot read properties of null (reading 'error')`. The project requirement explicitly states: "The trace-summary CLI treats its input JSON as untrusted (must not crash on malformed/oversized/no-traces input)." A `traces: [null]` input violates that requirement by crashing rather than skipping or warning.

**Fix:**
```typescript
for (const rawEntry of parsed.traces) {
  // Guard against null / non-object elements in untrusted input
  if (rawEntry === null || typeof rawEntry !== 'object') {
    process.stderr.write(`Warning: skipping non-object trace entry: ${JSON.stringify(rawEntry)}\n`);
    continue;
  }
  const entry = rawEntry as TraceEntry;
  // ... rest of loop unchanged
}
```

---

## Warnings

### WR-01: Malformed numeric token fields silently corrupt the table and README with `NaN`

**File:** `scripts/trace-summary.ts:89-91`

**Issue:** For successful entries (no `entry.error`), the accumulator lines:
```typescript
g.inputTokens += entry.inputTokens;
g.outputTokens += entry.outputTokens;
g.totalUsd += costUsd;
```
do not guard against `entry.inputTokens` / `entry.outputTokens` being `undefined`, `null`, or a non-number string in untrusted input. When either field is not a finite number, `g.inputTokens += undefined` propagates `NaN` into the accumulator. Downstream, `NaN.toLocaleString('en-US')` returns the string `"NaN"` and `computeCostUsd` returns `costUsd = NaN` (because `undefined * rate = NaN`). The resulting table written to `README.md` contains literal `NaN` values and `$NaN` USD columns. This is silent corruption: the script exits with code 0 and the README is permanently overwritten with garbage data for that group.

**Fix:** Coerce token fields to safe numbers before accumulating:
```typescript
const inputTok  = Number.isFinite(entry.inputTokens)  ? entry.inputTokens  : 0;
const outputTok = Number.isFinite(entry.outputTokens) ? entry.outputTokens : 0;
const cacheCre  = Number.isFinite(entry.cacheCreationTokens) ? entry.cacheCreationTokens : 0;
const cacheRd   = Number.isFinite(entry.cacheReadTokens)     ? entry.cacheReadTokens     : 0;

const usage = {
  input_tokens: inputTok,
  output_tokens: outputTok,
  cache_creation_input_tokens: cacheCre,
  cache_read_input_tokens: cacheRd,
};
const { costUsd } = computeCostUsd(entry.model, usage);
g.calls += 1;
g.inputTokens += inputTok;
g.outputTokens += outputTok;
g.totalUsd += costUsd;
```

### WR-02: `filterCleansed` silently drops all data when called with an empty or invalid date string

**File:** `src/dashboard/dataManagement.ts:74-92`

**Issue:** `new Date('').getTime()` returns `NaN`. The filter predicates `a.lastSeenAt >= NaN` and `p.hiddenAt >= NaN` both evaluate to `false` for every entry, so `filterCleansed(accounts, posts, '')` returns `{ keptAccounts: {}, keptPosts: [] }` — silently wiping all data. The dashboard UI guards against this via `if (!cleanseDate || !cleansePreview) return;` in `handleClean`, so the production path is safe today. However, the function has no internal guard, meaning any future caller (or test) that passes an invalid date string would irrecoverably delete all stored data from `chrome.storage.local` with no error or warning.

**Fix:** Add an explicit guard at the top of `filterCleansed` (and symmetrically in `deriveCleanseCount`):
```typescript
export function filterCleansed(
  accounts: FlaggedAccount[],
  posts: StoredPost[],
  beforeDateStr: string,
): { keptAccounts: Record<string, FlaggedAccount>; keptPosts: StoredPost[] } {
  const cutoffMs = new Date(beforeDateStr).getTime();
  if (!Number.isFinite(cutoffMs)) {
    throw new RangeError(`filterCleansed: invalid date string "${beforeDateStr}"`);
  }
  // ... rest unchanged
}
```

### WR-03: "Export Traces" button is always active and produces a download when traces are empty, inconsistent with all other export buttons

**File:** `src/dashboard/index.tsx:273-275`

**Issue:** The "Export JSON", "Export CSV", and "Export Posts CSV" buttons are gated behind `accounts.length === 0` and rendered only when there is data to export. The "Export Traces" button at line 274 is rendered unconditionally, outside the conditional block. When `traces` is empty (the common case for users who have not set an API key), clicking the button triggers a download of a nearly-empty 2-line JSON file (`{"exportedAt":"...","traces":[]}`). This is a confusing user experience: the user sees a download start, opens the file, and finds no data. It is also inconsistent with the established export UI pattern in this file.

**Fix:** Apply the same `traces.length === 0` guard used for the other exports:
```tsx
{traces.length > 0 ? (
  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
    <button style={s.actionBtn} onClick={handleExportTraces}>Export Traces</button>
  </div>
) : (
  <div style={s.statSub}>No traces yet — traces are recorded when the LLM detector runs.</div>
)}
```

---

## Info

### IN-01: `deriveCleanseCount` test for empty-string date relies on implicit `NaN` comparison behavior

**File:** `src/dashboard/dataManagement.test.ts:213-216`

**Issue:** The test `'returns { accountCount: 0, postCount: 0 } for empty date string'` passes because `NaN < NaN` is `false` in JavaScript, making every filter predicate false. The test asserts the correct values, but the behavior is an accidental consequence of IEEE 754 NaN semantics rather than deliberate defensive logic. If the implementation is ever changed to validate input first (as WR-02 recommends), this test would need to change from asserting `{ accountCount: 0, postCount: 0 }` to asserting that a `RangeError` is thrown.

**Fix:** After addressing WR-02, update this test:
```typescript
it('throws RangeError for empty date string', () => {
  expect(() => deriveCleanseCount([makeAccount()], [makePost()], '')).toThrow(RangeError);
});
```

### IN-02: `buildTracesExport` passes the full traces array by reference into `JSON.stringify` without defensive copy

**File:** `src/dashboard/dataManagement.ts:94-100`

**Issue:** `buildTracesExport` embeds the `traces` argument directly as `payload.traces = traces`. `JSON.stringify` on a large traces array (up to 500 entries, each with a full unbounded `systemPrompt` string per TRACE-01) can produce very large strings (potentially tens of MB). This is not a crash but means the function silently accepts and serializes arbitrarily large data. Given that this is a pure builder function called from the dashboard, this is an informational note rather than a bug — the constraint is architectural (TRACE-03 caps at 500 entries in storage) and the cap is applied at write time, not here.

No code change needed in this function; the note is for awareness. If the system prompt ever becomes large (e.g., rederiver system prompt with full DOM), the export file may surprise users with its size.

---

_Reviewed: 2026-06-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
