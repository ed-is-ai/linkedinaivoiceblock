# Phase 25: Dashboard Export + README Script - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 5 (new/modified)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/dashboard/dataManagement.ts` | utility / pure builder | transform | same file — `buildJsonExport` / `buildCsvExport` (lines 14–59) | exact |
| `src/dashboard/index.tsx` | component | request-response (storage read + DOM download) | same file — `handleExportJson` + `triggerDownload` + `chrome.storage.local.get` (lines 85–138, 259–264) | exact |
| `scripts/trace-summary.ts` | CLI utility (Node) | file-I/O + transform + batch | `scripts/generate-icons.js` (full file) + `scripts/package-zip.js` (full file) | role-match |
| `package.json` | config | — | same file — `scripts` block + `devDependencies` (lines 8–39) | exact |
| `README.md` | documentation | file-I/O (idempotent section management) | no existing README — create-if-missing (see No Analog Found) | none |

---

## Pattern Assignments

### `src/dashboard/dataManagement.ts` — add `buildTracesExport`

**Analog:** `src/dashboard/dataManagement.ts` (same file)

**Imports pattern** (lines 1):
```typescript
import type { FlaggedAccount, StoredPost } from '../shared/types';
```
Add `TraceEntry` to this import:
```typescript
import type { FlaggedAccount, StoredPost, TraceEntry } from '../shared/types';
```

**Core builder pattern — `buildJsonExport`** (lines 14–36):
```typescript
export function buildJsonExport(accounts: FlaggedAccount[], posts: StoredPost[]): string {
  // ... data aggregation ...
  const payload = {
    exportedAt: new Date().toISOString(),
    flaggedAccounts: accounts.map(a => ({ ... })),
  };
  return JSON.stringify(payload, null, 2);
}
```
`buildTracesExport` follows the same shape — envelope with `exportedAt` + data array, `JSON.stringify(..., null, 2)`:
```typescript
export function buildTracesExport(traces: TraceEntry[]): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    traces,
  };
  return JSON.stringify(payload, null, 2);
}
```
Key points:
- Pure function — no side effects, no DOM, no chrome API (matches all existing builders).
- Returns `string` (the builders never return `Blob` or `void`).
- `exportedAt` is always `new Date().toISOString()` — same as `buildJsonExport` line 21.
- Do NOT embed a pricing snapshot in the envelope (D-02; the script imports current code prices).

**Test pattern** (`src/dashboard/dataManagement.test.ts` lines 1–11, 73–121):
```typescript
import { describe, it, expect } from 'vitest';
import { buildTracesExport } from './dataManagement';
import type { TraceEntry } from '../shared/types';

function makeTrace(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    model: 'claude-sonnet-4-6',
    systemPrompt: 'sys',
    userPrompt: 'user',
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0.001,
    timestamp: new Date(1748600000000).toISOString(),
    source: 'detector',
    ...overrides,
  };
}

describe('buildTracesExport', () => {
  it('returns valid JSON with exportedAt and traces keys', () => {
    const parsed = JSON.parse(buildTracesExport([]));
    expect(parsed).toHaveProperty('exportedAt');
    expect(parsed).toHaveProperty('traces');
  });
  it('preserves trace entries verbatim', () => {
    const trace = makeTrace();
    const parsed = JSON.parse(buildTracesExport([trace]));
    expect(parsed.traces[0].model).toBe('claude-sonnet-4-6');
  });
  // ...
});
```

---

### `src/dashboard/index.tsx` — add `handleExportTraces` + "Export Traces" button + `llbTraces` in storage load

**Analog:** `src/dashboard/index.tsx` (same file)

**Storage load pattern** (lines 85–99 — the `useEffect` that reads storage):
```typescript
useEffect(() => {
  chrome.storage.local.get(['flaggedAccounts', 'dailyStats', 'storedPosts', 'dismissedAccounts', 'selectorRegistry', 'selectorSessionMisses']).then((result: Record<string, any>) => {
    const accts = Object.values(
      (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>
    );
    setAccounts(accts);
    setStats((result.dailyStats ?? []) as DailyStats[]);
    setPosts((result.storedPosts ?? []) as StoredPost[]);
    setDismissed((result.dismissedAccounts ?? []) as string[]);
    setSelectorRegistry((result.selectorRegistry as SelectorRegistrySchema) ?? null);
    setSessionMisses(new Set((result.selectorSessionMisses ?? []) as SelectorTarget[]));
  }).catch(() => {
    setLoadError('Could not load data. Try reopening the dashboard.');
  });
}, []);
```
Add `'llbTraces'` to the key array and wire a new `useState` + setter:
- Add `const [traces, setTraces] = useState<TraceEntry[]>([]);` alongside line 77's `const [posts, setPosts] = useState<StoredPost[]>([]);`
- Add `'llbTraces'` to the `chrome.storage.local.get([...])` call
- Add `setTraces((result.llbTraces ?? []) as TraceEntry[]);` inside the `.then` body

**`triggerDownload` helper** (lines 115–123 — copy verbatim; do NOT duplicate it):
```typescript
function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**`handleExportJson` pattern** (lines 125–128 — direct template for `handleExportTraces`):
```typescript
function handleExportJson(): void {
  const today = new Date().toISOString().slice(0, 10);
  triggerDownload(buildJsonExport(accounts, posts), `linkedin-blocker-${today}.json`, 'application/json');
}
```
`handleExportTraces` mirrors this exactly:
```typescript
function handleExportTraces(): void {
  const today = new Date().toISOString().slice(0, 10);
  triggerDownload(buildTracesExport(traces), `linkedin-blocker-traces-${today}.json`, 'application/json');
}
```

**Export buttons JSX pattern** (lines 259–264 — where the new button is added):
```tsx
<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
  <button style={s.actionBtn} onClick={handleExportJson}>Export JSON</button>
  <button style={s.actionBtn} onClick={handleExportCsv}>Export CSV</button>
  <button style={s.actionBtn} onClick={handleExportPostsCsv}>Export Posts CSV</button>
</div>
```
Add the new button to this `flex` row:
```tsx
<button style={s.actionBtn} onClick={handleExportTraces}>Export Traces</button>
```
The "Export Traces" button should render regardless of whether `traces.length > 0` (an empty trace store is still a valid export, matching D-07 "empty traces: [] is valid"). If you need to guard it, mirror the `accounts.length === 0` null-state pattern (line 256–258) but for `traces`.

**Import addition** — add `buildTracesExport` to the existing import from `'./dataManagement'` (line 4):
```typescript
import { buildJsonExport, buildCsvExport, buildPostsCsvExport, buildTracesExport, deriveCleanseCount, filterCleansed } from './dataManagement';
```
Add `TraceEntry` to the shared types import (line 3):
```typescript
import type { FlaggedAccount, DailyStats, StoredPost, TraceEntry, SelectorRegistrySchema, SelectorTarget } from '../shared/types';
```

---

### `scripts/trace-summary.ts` — NEW Node CLI script

**Analog:** `scripts/generate-icons.js` (full file) + `scripts/package-zip.js` (full file)

**Shebang + ESM header pattern** (`scripts/generate-icons.js` lines 1–9):
```javascript
#!/usr/bin/env node
// One-line description of what this does.
// Run via: npm run trace-summary <file>
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
```
`trace-summary.ts` follows the same header pattern, with TypeScript imports:
```typescript
#!/usr/bin/env node
// Reads a linkedin-blocker-traces-YYYY-MM-DD.json export, prints a per-source/model
// cost breakdown table to stdout, and writes/updates ## LLM Cost Reference in README.md.
// Run via: npm run trace-summary <file>
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { computeCostUsd, MODEL_PRICING } from '../src/shared/pricing.js';
import type { TraceEntry } from '../src/shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
```
Note: `tsx` resolves `.ts` imports, but the `fileURLToPath`/`__dirname` pattern is identical to the JS scripts.

**Error handling + `process.exit` pattern** (`scripts/package-zip.js` lines 25, 33):
```javascript
archive.on('error', (err) => { throw err; });
```
For `trace-summary.ts` use `process.exit(1)` with stderr for validation errors (D-07):
```typescript
const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: npm run trace-summary <traces-export.json>\n');
  process.exit(1);
}

let parsed: { exportedAt: string; traces: TraceEntry[] };
try {
  const raw = readFileSync(resolve(filePath), 'utf8');
  parsed = JSON.parse(raw);
} catch {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}

if (!Array.isArray(parsed.traces)) {
  process.stderr.write('Error: JSON does not contain a "traces" array.\n');
  process.exit(1);
}
```

**Cost recompute pattern** (from `src/shared/pricing.ts` lines 62–93):
```typescript
// Map TraceEntry camelCase fields to Anthropic usage shape, then call computeCostUsd
const usage = {
  input_tokens: entry.inputTokens,
  output_tokens: entry.outputTokens,
  cache_creation_input_tokens: entry.cacheCreationTokens,
  cache_read_input_tokens: entry.cacheReadTokens,
};
const { costUsd } = computeCostUsd(entry.model, usage);
```
This is D-01a — reuse `computeCostUsd` verbatim; do NOT re-implement the formula.

**README section management pattern** (no existing analog — implement per D-06):
```typescript
const README_PATH = join(__dirname, '../README.md');
const SECTION_HEADING = '## LLM Cost Reference';

function upsertReadmeSection(table: string, date: string, successCount: number, failCount: number): void {
  const generated = `_Generated by \`npm run trace-summary\` on ${date} from ${successCount} successful + ${failCount} failed traces._`;
  const newSection = `${SECTION_HEADING}\n\n${table}\n\n${generated}\n`;

  if (!existsSync(README_PATH)) {
    writeFileSync(README_PATH, `# LinkedIn Blocker\n\nA Chrome extension that hides AI-generated posts on LinkedIn.\n\n${newSection}`, 'utf8');
    return;
  }

  let content = readFileSync(README_PATH, 'utf8');
  const sectionStart = content.indexOf(SECTION_HEADING);
  if (sectionStart === -1) {
    // Append section to end of file
    content = content.trimEnd() + '\n\n' + newSection;
  } else {
    // Replace from heading to next ## heading or EOF
    const afterHeading = content.indexOf('\n## ', sectionStart + 1);
    const end = afterHeading === -1 ? content.length : afterHeading;
    content = content.slice(0, sectionStart) + newSection + (afterHeading === -1 ? '' : '\n' + content.slice(end + 1));
  }
  writeFileSync(README_PATH, content, 'utf8');
}
```

**Table format** (D-05 — stdout + README, same markdown string):
Columns: source | model | calls | failed | input tokens | output tokens | total USD | avg USD/call
Include a totals row. Group rows by source + model. Print `process.stdout.write(table + '\n')` and pass the same `table` string to `upsertReadmeSection`.

---

### `package.json` — add `trace-summary` script + `tsx` devDependency

**Analog:** `package.json` (same file)

**Scripts block pattern** (lines 8–17):
```json
"scripts": {
  "build": "vite build",
  "dev": "vite build --watch",
  "type-check": "tsc --noEmit",
  "lint": "eslint src",
  "generate-icons": "node scripts/generate-icons.js",
  "package": "npm run build && node scripts/package-zip.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
},
```
Add after `"generate-icons"`:
```json
"trace-summary": "tsx scripts/trace-summary.ts",
```

**devDependencies block pattern** (lines 23–39):
```json
"devDependencies": {
  "@preact/preset-vite": "^2.10.0",
  "archiver": "^7.0.0",
  ...
}
```
Add `tsx` as a devDependency (D-04):
```json
"tsx": "^4.0.0"
```
Place alphabetically within devDependencies.

---

## Shared Patterns

### Pure string-builder pattern
**Source:** `src/dashboard/dataManagement.ts` lines 14–59
**Apply to:** `buildTracesExport` in `dataManagement.ts`

All builders:
- Accept typed arrays as arguments
- Return `string`
- Have no side effects (no DOM, no `chrome.*`, no `console.*`)
- Are pure functions suitable for unit testing without a browser environment
- Use `JSON.stringify(payload, null, 2)` for JSON output

### Blob download trigger pattern
**Source:** `src/dashboard/index.tsx` lines 115–138 (`triggerDownload` + `handleExportJson`)
**Apply to:** `handleExportTraces` in `index.tsx`

```typescript
function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```
Always revoke the object URL immediately after `.click()`.

### Chrome storage load pattern
**Source:** `src/dashboard/index.tsx` lines 85–99
**Apply to:** Adding `llbTraces` to the existing `useEffect` storage load in `index.tsx`

Single `chrome.storage.local.get([...keys])` call in a `useEffect(fn, [])`. All keys are loaded in one call — do NOT add a second `useEffect` or a second `.get(...)` call.

### ESM Node script header pattern
**Source:** `scripts/generate-icons.js` lines 1–9 and `scripts/package-zip.js` lines 1–9
**Apply to:** `scripts/trace-summary.ts`

```javascript
#!/usr/bin/env node
// One-line description.
import { ... } from 'node:fs';       // or named 'fs' — project uses bare specifier
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
```
All scripts use `"type": "module"` (package.json line 7), so `import` not `require`.

### Vitest unit test pattern
**Source:** `src/dashboard/dataManagement.test.ts` lines 1–11
**Apply to:** `buildTracesExport` test block in `dataManagement.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildTracesExport } from './dataManagement';
import type { TraceEntry } from '../shared/types';
```
Test file lives alongside the module (`dataManagement.test.ts`). Tests use maker functions (`function makeTrace(...)`) for fixture construction (lines 14–41 pattern).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `README.md` | documentation | file-I/O (idempotent section management) | No README exists yet; no existing script in the repo manages idempotent markdown section replacement. Use the upsertReadmeSection pattern in Script Assignments above, derived from D-06 decisions. |

---

## Metadata

**Analog search scope:** `src/dashboard/`, `scripts/`, `src/shared/`, `package.json`
**Files scanned:** 7 (dataManagement.ts, dataManagement.test.ts, index.tsx, generate-icons.js, package-zip.js, pricing.ts, types.ts)
**Pattern extraction date:** 2026-06-14
