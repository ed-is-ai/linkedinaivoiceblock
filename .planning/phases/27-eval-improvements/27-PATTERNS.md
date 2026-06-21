# Phase 27: Eval Improvements - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 6 (2 modified, 4 new)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/eval.ts` | utility/CLI | batch + request-response | `scripts/eval.ts` itself (extend in-place) | exact (self) |
| `scripts/eval.test.ts` | test | batch | `scripts/eval.test.ts` itself (extend in-place) | exact (self) |
| `scripts/eval-label.ts` | utility/CLI | file-I/O + event-driven (keypress) | `scripts/trace-summary.ts` | role-match |
| `scripts/eval-label.test.ts` | test | batch | `scripts/eval.test.ts` | role-match |
| `scripts/eval-compare.ts` | utility/CLI | batch + transform | `scripts/trace-summary.ts` | role-match |
| `scripts/eval-compare.test.ts` | test | batch | `scripts/eval.test.ts` | role-match |
| `eval-instructions.md` | doc | n/a | `eval-instructions.md` itself (in-place update) | exact (self) |

---

## Pattern Assignments

---

### `scripts/eval.ts` — MODIFIED (utility/CLI, batch)

**Analog:** `scripts/eval.ts` (self) — extend in-place; this file is the primary source of all patterns below.

**Current imports pattern** (lines 1-13):
```typescript
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { computeCostUsd } from '../src/shared/pricing.js';
import { classifyPost } from '../src/shared/classifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
```

**Phase 27 new imports to add** (after existing imports, ESM `.js` extension required):
```typescript
import { HeuristicDetector } from '../src/content/detector/heuristic.js';
import type { PostData } from '../src/shared/types.js';
```

**Engine-selection arg-parsing pattern** — replaces the current `process.argv[2]` read in `main()` (line 213):
```typescript
// Source: 27-RESEARCH.md §Engine Selection Mechanism
const args = process.argv.slice(2);
const engineFlagIdx = args.indexOf('--engine');
const engine: 'heuristic' | 'llm' =
  engineFlagIdx !== -1 && args[engineFlagIdx + 1] === 'heuristic'
    ? 'heuristic'
    : 'llm';  // default: llm — preserves Phase 26 backward-compatibility
const filePath = args.find(a => !a.startsWith('--') && a !== args[engineFlagIdx + 1]);
```

**Usage guard update** (currently line 214-216 — expand to show both usages):
```typescript
if (!filePath) {
  process.stderr.write('Usage: npm run eval -- <labeled-posts.json> [--engine heuristic|llm]\n');
  process.exit(1);
}
```

**API key guard — conditionalize on engine** (currently lines 223-227 — unconditional):
```typescript
// Current (Phase 26) — unconditional:
const apiKey = process.env['ANTHROPIC_API_KEY'];
if (!apiKey) {
  process.stderr.write('Error: ANTHROPIC_API_KEY environment variable is not set.\n');
  process.exit(1);
}

// Phase 27 replacement — only required for LLM engine:
const apiKey = process.env['ANTHROPIC_API_KEY'];
if (engine === 'llm' && !apiKey) {
  process.stderr.write('Error: ANTHROPIC_API_KEY environment variable is not set.\n');
  process.exit(1);
}
```

**New exported `buildPostData` helper** — extract from walker for testability (add alongside existing exports):
```typescript
// Source: 27-RESEARCH.md §PostData Fields vs Export Entry Fields
export function buildPostData(entry: Record<string, unknown>): PostData {
  return {
    urn: typeof entry['urn'] === 'string' ? entry['urn'] : '',
    authorId: typeof entry['authorId'] === 'string' ? entry['authorId'] : '',
    authorName: typeof entry['authorName'] === 'string' ? entry['authorName'] : '',
    authorProfileUrl: `https://www.linkedin.com/in/${typeof entry['authorId'] === 'string' ? entry['authorId'] : 'unknown'}/`,
    postText: typeof entry['text'] === 'string' ? entry['text'] : '',
  };
}
```

**Scoring loop — engine branch** — replaces the current `classifyPost` call at line 254 inside `for (let i = 0; ...)`:
```typescript
// Current (Phase 26) scoring call — lines 254-265:
const { result, usage } = await classifyPost(post.text, apiKey);
if (usage) {
  const { costUsd } = computeCostUsd(MODEL, { ... });
  totalCostUsd += safe(costUsd);
}

// Phase 27 replacement — engine-branched:
let result: DetectionResult;
let usage: AnthropicUsage | undefined;

if (engine === 'heuristic') {
  const postData = buildPostData(post as unknown as Record<string, unknown>);
  result = await heuristicDetector.detect(postData);
  // no usage — heuristic is free
} else {
  const classified = await classifyPost(post.text, apiKey!);
  result = classified.result;
  usage = classified.usage;
  if (usage) {
    const { costUsd } = computeCostUsd(MODEL, {
      input_tokens: safe(usage.input_tokens),
      output_tokens: safe(usage.output_tokens),
      cache_creation_input_tokens: safe(usage.cache_creation_input_tokens ?? 0),
      cache_read_input_tokens: safe(usage.cache_read_input_tokens ?? 0),
    });
    totalCostUsd += safe(costUsd);
  }
}
```

**`heuristicDetector` instantiation** — add before the scoring loop (no `fetchComments`; see pitfall 5 in RESEARCH.md):
```typescript
const heuristicDetector = new HeuristicDetector();  // no fetchComments — eval has no DOM
```

**New exported `filterErrors` helper** — add alongside existing exports for testability:
```typescript
// Source: 27-RESEARCH.md §Error Analysis
export function filterErrors(
  details: PostDetail[],
  threshold: number,
  label: 'ai' | 'human',
): PostDetail[] {
  if (label === 'human') {
    return details.filter(d => d.label === 'human' && d.score >= threshold);
  }
  return details.filter(d => d.label === 'ai' && d.score < threshold);
}
```

**FP/FN error-analysis section** — add after the threshold sweep (after line 305), before the results object:
```typescript
// Source: 27-RESEARCH.md §Error Analysis
const falsePositives = filterErrors(details, bestF1Threshold, 'human');
const falseNegatives = filterErrors(details, bestF1Threshold, 'ai');
```

**Results object extension** — add `engine` and `errorAnalysis` fields to the existing results object (lines 316-334):
```typescript
const results = {
  runAt: new Date().toISOString(),
  inputFile: filePath,
  engine,                              // NEW: 'heuristic' | 'llm'
  model: engine === 'heuristic' ? 'heuristic' : MODEL,  // NEW: 'heuristic' for free runs
  counts: { total, labeled, skipped, errored, scored: scoredCount },
  cost: engine === 'heuristic'
    ? null                             // NEW: null for free heuristic runs
    : { totalUsd: safe(totalCostUsd), avgUsdPerPost },
  thresholds: thresholdRows,
  bestF1Threshold,
  posts: details,
  errorAnalysis: {                     // NEW
    threshold: bestF1Threshold,
    falsePositives,
    falseNegatives,
  },
};
```

**Summary line — conditionalize cost display** (currently line 367):
```typescript
// Current (Phase 26):
`cost $${safe(totalCostUsd).toFixed(6)} total ($${avgUsdPerPost.toFixed(6)}/post)`

// Phase 27 replacement:
engine === 'heuristic'
  ? 'cost: free'
  : `cost $${safe(totalCostUsd).toFixed(6)} total ($${avgUsdPerPost.toFixed(6)}/post)`
```

**FP/FN terminal output** — add after the threshold table, before result-file write; copy the `formatSignalBreakdown` pattern already used at line 284:
```typescript
// Cap at top-5 by score proximity to threshold (per RESEARCH.md open question 4)
const topFP = falsePositives.slice(0, 5);
const topFN = falseNegatives.slice(0, 5);

if (topFP.length > 0 || topFN.length > 0) {
  process.stdout.write(`\nError analysis @T=${bestF1Threshold}:\n`);
  if (topFP.length > 0) {
    process.stdout.write(`\nFalse positives (${falsePositives.length} total — true human, predicted AI):\n`);
    for (const d of topFP) {
      process.stdout.write(`  [${d.index}] score=${d.score} "${d.textPreview}"\n`);
      process.stdout.write(formatSignalBreakdown(d.signalBreakdown, d.reasoning) + '\n');
    }
  }
  if (topFN.length > 0) {
    process.stdout.write(`\nFalse negatives (${falseNegatives.length} total — true AI, predicted human):\n`);
    for (const d of topFN) {
      process.stdout.write(`  [${d.index}] score=${d.score} "${d.textPreview}"\n`);
      process.stdout.write(formatSignalBreakdown(d.signalBreakdown, d.reasoning) + '\n');
    }
  }
}
```

---

### `scripts/eval.test.ts` — MODIFIED (test, batch)

**Analog:** `scripts/eval.test.ts` (self) — extend in-place.

**Existing test structure to copy** (lines 1-38 — imports, stub setup, describe blocks):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectLabeled, computeMetrics, safe, loadExport, main, formatSignalBreakdown } from './eval';
// Phase 27: extend the named import list:
// import { ..., buildPostData, filterErrors } from './eval';
```

**`stubExitAndStreams` helper pattern** (lines 273-294) — reuse unchanged for new `main()` guard tests:
```typescript
function stubExitAndStreams(streams: { stdout?: boolean } = {}) {
  const spies = { exit: undefined as never, stderr: undefined as never };
  beforeEach(() => {
    spies.exit = vi.spyOn(process, 'exit').mockImplementation((code?: number): never => {
      throw new Error(`${EXIT}${code}`);
    });
    spies.stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    if (streams.stdout) spies.stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { spies.exit.mockRestore(); spies.stderr.mockRestore(); spies.stdout?.mockRestore(); });
  return spies;
}
```

**`useTempDir` helper pattern** (lines 257-266) — reuse unchanged for fixture files:
```typescript
function useTempDir() {
  const ctx = { dir: '' };
  beforeEach(() => { ctx.dir = mkdtempSync(join(tmpdir(), 'llb-eval-')); });
  afterEach(() => { rmSync(ctx.dir, { recursive: true, force: true }); });
  return ctx;
}
```

**New test blocks to add** (follow the existing `describe()` pattern):
```typescript
describe('buildPostData', () => {
  it('maps text → postText and stubs authorProfileUrl', () => {
    const entry = { urn: 'urn:li:activity:1', authorId: 'alice', authorName: 'Alice', text: 'Hello' };
    const pd = buildPostData(entry);
    expect(pd.postText).toBe('Hello');
    expect(pd.authorProfileUrl).toContain('alice');
    expect(pd.urn).toBe('urn:li:activity:1');
  });
  it('defaults missing fields to empty string', () => {
    const pd = buildPostData({});
    expect(pd.postText).toBe('');
    expect(pd.authorId).toBe('');
  });
});

describe('filterErrors', () => {
  const details = [
    { index: 1, label: 'human', score: 70, confidence: 'high', signalBreakdown: {}, textPreview: '' },
    { index: 2, label: 'ai',    score: 30, confidence: 'low',  signalBreakdown: {}, textPreview: '' },
    { index: 3, label: 'ai',    score: 80, confidence: 'high', signalBreakdown: {}, textPreview: '' },
  ] as PostDetail[];

  it('returns false positives: label=human && score >= threshold', () => {
    const fp = filterErrors(details, 60, 'human');
    expect(fp).toHaveLength(1);
    expect(fp[0]!.index).toBe(1);
  });

  it('returns false negatives: label=ai && score < threshold', () => {
    const fn = filterErrors(details, 60, 'ai');
    expect(fn).toHaveLength(1);
    expect(fn[0]!.index).toBe(2);
  });
});

// In the existing 'main (EVAL-05 ...)' describe, add:
it('does NOT exit 1 for missing API key when --engine heuristic is set', async () => {
  const p = writeFixture({ flaggedPosts: [{ text: 'post', label: 'ai' }], unflaggedPosts: [] });
  process.argv = ['node', 'eval.ts', p, '--engine', 'heuristic'];
  delete process.env['ANTHROPIC_API_KEY'];
  // Should NOT throw EXIT1 at the key guard; may throw at a later point or complete
  // — just verify the API key error message is NOT emitted
  try { await main(); } catch { /* may exit for other reasons */ }
  expect(spies.stderr).not.toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'));
});
```

---

### `scripts/eval-label.ts` — NEW (utility/CLI, file-I/O + event-driven)

**Primary analog:** `scripts/trace-summary.ts` — same role (standalone Node CLI, reads a JSON file, writes back) and same data flow (file-I/O). `scripts/eval.ts` is a secondary analog for the JSON guard patterns.

**Shebang + imports pattern** (copy from `trace-summary.ts` lines 1-11):
```typescript
#!/usr/bin/env node
// Reads an Export JSON and interactively labels each unlabeled post entry.
// Writes labels back into the export in-place (flaggedPosts[i].label / unflaggedPosts[i].label).
// Run via: npm run eval-label -- <export.json>  [--auto]
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import readline from 'readline';
```

**No `__dirname` / `EVAL_DIR` needed** — this script does not write to a results directory; it rewrites the input file in-place.

**Argv guard pattern** (copy from `trace-summary.ts` lines 24-28 — identical structure):
```typescript
const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: npm run eval-label -- <export.json> [--auto]\n');
  process.exit(1);
}
```

**File read + JSON parse + shape guard** (copy from `eval.ts` `loadExport` lines 176-198 — identical pattern):
```typescript
let data: { flaggedPosts: unknown[]; unflaggedPosts: unknown[]; [k: string]: unknown };
try {
  const raw = readFileSync(resolve(filePath), 'utf8');
  const json = JSON.parse(raw);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
    process.exit(1);
  }
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj['flaggedPosts']) || !Array.isArray(obj['unflaggedPosts'])) {
    process.stderr.write('Error: JSON must contain "flaggedPosts" and "unflaggedPosts" arrays.\n');
    process.exit(1);
  }
  data = obj as typeof data;
} catch {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}
```

**In-place JSON write pattern** (from `trace-summary.ts` `writeFileSync` at line 206 — same call):
```typescript
// Write after every label decision — partial progress preserved on early exit
writeFileSync(resolve(filePath), JSON.stringify(data, null, 2), 'utf8');
```

**`--auto` bulk-label mode** (no analog in codebase — new pattern, simple argv flag):
```typescript
const autoMode = process.argv.includes('--auto');
if (autoMode) {
  let count = 0;
  for (const entry of data.flaggedPosts) {
    if (entry && typeof entry === 'object' && !('label' in (entry as object))) {
      (entry as Record<string, unknown>)['label'] = 'ai';
      count++;
    }
  }
  for (const entry of data.unflaggedPosts) {
    if (entry && typeof entry === 'object' && !('label' in (entry as object))) {
      (entry as Record<string, unknown>)['label'] = 'human';
      count++;
    }
  }
  writeFileSync(resolve(filePath), JSON.stringify(data, null, 2), 'utf8');
  process.stdout.write(`Auto-labeled ${count} entries. Written to: ${filePath}\n`);
  process.exit(0);
}
```

**Interactive keypress pattern** (Node built-in, no analog in codebase — from RESEARCH.md §Labeling Workflow):
```typescript
// Source: 27-RESEARCH.md §Labeling Workflow — Node readline, no new npm package
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

async function readKey(): Promise<string> {
  return new Promise(resolve => {
    process.stdin.once('data', (key: string) => resolve(key));
  });
}
```

**TTY guard** (per RESEARCH.md assumption A2 — add before setRawMode):
```typescript
if (!process.stdin.isTTY) {
  process.stderr.write('Error: eval-label requires an interactive terminal (TTY). Use --auto for non-interactive use.\n');
  process.exit(1);
}
```

**CLI entry guard** (copy from `eval.ts` lines 204-209 — identical isMain pattern):
```typescript
const isMain = process.argv[1] !== undefined &&
  (process.argv[1].endsWith('eval-label.ts') || process.argv[1].endsWith('eval-label.js'));
if (isMain) { await main(); }
export async function main(): Promise<void> { ... }
```

---

### `scripts/eval-label.test.ts` — NEW (test, batch)

**Primary analog:** `scripts/eval.test.ts` — same test structure (vitest, `describe`/`it`/`expect`, temp-dir fixture helpers, `process.exit` stub).

**Test file header + imports pattern** (copy from `eval.test.ts` lines 1-38):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Import the label-write logic (exported pure helpers from eval-label.ts)
import { applyLabel } from './eval-label';
```

**`useTempDir` + `stubExitAndStreams` helpers** — copy verbatim from `eval.test.ts` lines 257-294.

**What to test** (per RESEARCH.md §Test Extension Strategy):
```typescript
describe('applyLabel', () => {
  it('adds label field to a flaggedPosts entry', () => { ... });
  it('is idempotent — re-labeling the same entry writes the new value', () => { ... });
  it('preserves all other fields on the entry', () => { ... });
});

// Exit-code path for main() — use writeFixture + process.argv manipulation
// same as eval.test.ts lines 356-383
describe('main (eval-label guards)', () => {
  it('exits 1 when no file argument is supplied', async () => { ... });
  it('exits 1 when file cannot be read', async () => { ... });
});
```

---

### `scripts/eval-compare.ts` — NEW (utility/CLI, batch + transform)

**Primary analog:** `scripts/trace-summary.ts` — same role (standalone Node CLI that reads one or more JSON files, computes a table, prints to stdout). Secondary analog: `scripts/eval.ts` `fmt2` / table-building pattern.

**Shebang + imports pattern** (copy from `trace-summary.ts` lines 1-11):
```typescript
#!/usr/bin/env node
// Reads two eval results-YYYY-MM-DD.json files and prints a side-by-side comparison.
// Run via: npm run eval-compare -- eval/results-A.json eval/results-B.json [--format markdown]
import { readFileSync } from 'fs';
import { resolve } from 'path';
```

**Argv guard** (two required args — extend `trace-summary.ts` pattern):
```typescript
const [fileA, fileB] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!fileA || !fileB) {
  process.stderr.write('Usage: npm run eval-compare -- <results-A.json> <results-B.json> [--format markdown]\n');
  process.exit(1);
}
const markdownMode = process.argv.includes('--format') &&
  process.argv[process.argv.indexOf('--format') + 1] === 'markdown';
```

**File read + parse pattern** (copy from `trace-summary.ts` lines 31-37 — identical `try/catch` around `readFileSync` + `JSON.parse`):
```typescript
function loadResults(path: string): ResultsFile {
  try {
    const raw = readFileSync(resolve(path), 'utf8');
    return JSON.parse(raw) as ResultsFile;
  } catch {
    process.stderr.write(`Error: Could not read or parse file: ${path}\n`);
    process.exit(1);
  }
}
const a = loadResults(fileA);
const b = loadResults(fileB);
```

**`ResultsFile` interface** — infer from the extended Phase 27 results schema (RESEARCH.md §Results JSON Schema):
```typescript
interface ResultsFile {
  runAt: string;
  inputFile: string;
  engine: 'heuristic' | 'llm';
  model: string;
  counts: { total: number; labeled: number; skipped: number; errored: number; scored: number };
  cost: { totalUsd: number; avgUsdPerPost: number } | null;
  thresholds: Array<{ threshold: number; precision: number | null; recall: number | null; f1: number | null; accuracy: number }>;
  bestF1Threshold: number;
}
```

**Best-row lookup** (from RESEARCH.md §Results Viewer):
```typescript
const bestA = a.thresholds.find(r => r.threshold === a.bestF1Threshold)!;
const bestB = b.thresholds.find(r => r.threshold === b.bestF1Threshold)!;
```

**Table builder pattern** (copy column-alignment approach from `trace-summary.ts` `buildTable` lines 121-157 + `eval.ts` `fmt2` line 348):
```typescript
const fmt2 = (n: number | null) => (n === null ? ' n/a' : n.toFixed(3));
const fmtCost = (r: ResultsFile) =>
  r.cost === null ? 'free' : `$${r.cost.totalUsd.toFixed(6)}`;

// terminal mode: two-column padEnd/padStart layout
// markdown mode: GitHub-flavored table with | separators
```

**CLI entry guard** — copy from `eval-label.ts` (same isMain pattern, different filename suffixes):
```typescript
const isMain = process.argv[1] !== undefined &&
  (process.argv[1].endsWith('eval-compare.ts') || process.argv[1].endsWith('eval-compare.js'));
if (isMain) { main(); }
export function main(): void { ... }  // sync — no LLM calls
```

---

### `scripts/eval-compare.test.ts` — NEW (test, batch)

**Primary analog:** `scripts/eval.test.ts` — same structure.

**Imports and stub setup** (copy from `eval.test.ts` lines 1-38 minus the `fetch` stub — `eval-compare` makes no network calls):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareResults } from './eval-compare';
```

**What to test** (per RESEARCH.md §Test Extension Strategy):
```typescript
describe('compareResults', () => {
  it('returns correct delta between two results objects', () => { ... });
  it('handles null cost on heuristic run without crashing', () => { ... });
  it('labels the run with the correct engine field', () => { ... });
});
// Exit-code guards for main() — same useTempDir + stubExitAndStreams as eval.test.ts
```

---

### `eval-instructions.md` — MODIFIED (doc)

**Analog:** `eval-instructions.md` (self) — in-place update. No code patterns needed; see RESEARCH.md §`eval-instructions.md` Update Scope for the exact sections to change.

**Sections requiring change** (exact headings from the file to locate update points):
- "What you need" table (line 19) — add `--engine` row
- "Step 3 — Set your API key" (line 83) — qualify: LLM only
- "Step 4 — Run the eval" (line 100) — add `--engine heuristic` example
- "Step 5a. Terminal output" note (lines 147-151) — update signal-name commentary
- "Exit codes" table (line 232) — add heuristic row (no API key needed)
- Add new sections: "Labeling helper", "Comparing runs", "Error analysis output"

---

## Shared Patterns

### Shebang + `__dirname` + `fs` imports
**Source:** `scripts/trace-summary.ts` lines 1-14 / `scripts/eval.ts` lines 1-14
**Apply to:** `eval-label.ts`, `eval-compare.ts`
```typescript
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
```

### ESM `.js` extension on local imports
**Source:** `scripts/trace-summary.ts` lines 8-9; `scripts/eval.ts` lines 11-12; RESEARCH.md §Pitfall 2
**Apply to:** All new scripts and the HeuristicDetector import in `eval.ts`
```typescript
// Correct — tsx ESM requires explicit .js extension
import { HeuristicDetector } from '../src/content/detector/heuristic.js';
import type { PostData } from '../src/shared/types.js';
```

### CLI entry guard (isMain)
**Source:** `scripts/eval.ts` lines 204-209
**Apply to:** `eval-label.ts`, `eval-compare.ts`
```typescript
const isMain = process.argv[1] !== undefined &&
  (process.argv[1].endsWith('eval-SCRIPTNAME.ts') || process.argv[1].endsWith('eval-SCRIPTNAME.js'));
if (isMain) { await main(); }
export async function main(): Promise<void> { ... }
```

### `safe()` NaN guard
**Source:** `scripts/eval.ts` lines 29-30
**Apply to:** Any numeric accumulation in `eval.ts` modifications; not needed in `eval-label.ts` or `eval-compare.ts` (they do arithmetic on already-safe stored values)
```typescript
export const safe = (n: number): number => (Number.isFinite(n) ? n : 0);
```

### File read + JSON parse + object-shape guard
**Source:** `scripts/eval.ts` `loadExport` lines 176-198; `scripts/trace-summary.ts` lines 31-43
**Apply to:** `eval-label.ts` (export file read), `eval-compare.ts` (results file read)
```typescript
try {
  const raw = readFileSync(resolve(filePath), 'utf8');
  json = JSON.parse(raw);
} catch {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}
if (typeof json !== 'object' || json === null || Array.isArray(json)) {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}
```

### JSON in-place write
**Source:** `scripts/eval.ts` line 342; `scripts/trace-summary.ts` line 206
**Apply to:** `eval-label.ts` (rewrite labeled export)
```typescript
writeFileSync(outFilePath, JSON.stringify(data, null, 2), 'utf8');
```

### `process.exit` stub + temp-dir fixture (test helpers)
**Source:** `scripts/eval.test.ts` lines 257-294 (`useTempDir`, `stubExitAndStreams`)
**Apply to:** `eval-label.test.ts`, `eval-compare.test.ts` — copy verbatim
```typescript
const EXIT = '__exit__';
function useTempDir() { ... }       // lines 257-266
function stubExitAndStreams(...) { ... }  // lines 273-294
```

### `npm run` script entry in `package.json`
**Source:** `package.json` lines 14-15
**Apply to:** Add new entries for `eval-label` and `eval-compare`:
```json
"eval-label":   "tsx scripts/eval-label.ts",
"eval-compare": "tsx scripts/eval-compare.ts"
```

---

## No Analog Found

No files in this phase lack a codebase analog. All new scripts have strong role-match analogs (`trace-summary.ts`, `eval.ts`), and all tests follow the established `eval.test.ts` structure.

---

## Anti-Patterns to Avoid (from RESEARCH.md)

| Anti-pattern | Why / What to Do Instead |
|---|---|
| `import { LLMDetector } from '../src/content/detector/llm.js'` | `chrome.runtime.sendMessage` throws in Node. Use `classifyPost` from `src/shared/classifier.js` for the LLM path. |
| `import { ... } from '../src/content/index.js'` | Pulls in `LLMDetector` transitively; same failure. Never import from `src/content/index.ts` in scripts/. |
| Moving `HeuristicDetector` to `src/shared/` | Architecturally wrong — it belongs to content-script territory. Import directly from `src/content/detector/heuristic.js`. |
| Unconditional API key guard | Must be conditioned on `engine === 'llm'`. Heuristic engine is free. |
| Computing FP/FN inside the scoring loop | Best-F1 threshold only known after the full sweep. Always filter `details[]` post-hoc. |
| `JSON.stringify` without `null, 2` args | All project JSON writes use `JSON.stringify(data, null, 2)` for human-readable output. |
| ESM import without `.js` extension | tsx requires explicit extension: `'../src/content/detector/heuristic.js'`. |

---

## Metadata

**Analog search scope:** `scripts/`, `src/content/detector/`, `src/shared/`
**Files read:** `scripts/eval.ts`, `scripts/eval.test.ts`, `scripts/trace-summary.ts`, `src/content/detector/heuristic.ts`, `src/shared/types.ts`, `eval-instructions.md`
**Pattern extraction date:** 2026-06-14
