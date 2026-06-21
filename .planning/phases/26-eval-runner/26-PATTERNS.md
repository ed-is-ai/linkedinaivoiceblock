# Phase 26: Eval Runner — Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 6 (3 new, 2 modified, 1 new test group)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/classifier.ts` (NEW) | shared utility / service | request-response | `src/background/index.ts` §`scorePost` + `SYSTEM_PROMPT` (L93–222) | exact — extract-in-place |
| `src/background/index.ts` (MODIFIED) | service worker entry | request-response | itself — import replaces inline | exact — behavior-preserving refactor |
| `scripts/eval.ts` (NEW) | CLI script | batch / transform | `scripts/trace-summary.ts` | exact — same argv/file-I/O/exit pattern |
| `src/shared/classifier.test.ts` (NEW) | unit test | — | `src/shared/pricing.test.ts` | exact — same vitest describe/it structure |
| `scripts/eval.test.ts` (NEW) | unit test | — | `src/background/trace.test.ts` | role-match — CLI exit/fs output tests |
| `package.json` (MODIFIED) | config | — | itself §`trace-summary` script entry | exact — add one `scripts` key |

---

## Pattern Assignments

### `src/shared/classifier.ts` (NEW — shared utility, request-response)

**Analog:** `src/background/index.ts` (extract these sections; leave the rest in place)

**Exports this module must provide:**
- `SYSTEM_PROMPT` — the multi-line string constant
- `AnthropicUsage` interface — exported so the SW and CLI can type `usage` from responses
- `ClassifyResult` type — `{ result: DetectionResult; usage?: AnthropicUsage }`
- `classifyPost(postText: string, apiKey: string): Promise<ClassifyResult>` — the single public function

**`AnthropicUsage` interface pattern** (`src/background/index.ts` L21–26):
```typescript
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
```

**`SYSTEM_PROMPT` constant** (`src/background/index.ts` L93–165):
```typescript
// Full multi-line string — extract verbatim, no changes
export const SYSTEM_PROMPT = `You are an AI content detector for LinkedIn posts. ...`;
```
(The string runs L93–165; extract in full with `export` prefix added.)

**`classifyPost` fetch block** (`src/background/index.ts` L172–187):
```typescript
// Key changes vs. current inline version:
//   • apiKey becomes a parameter (not read from chrome.storage)
//   • anthropic-dangerous-direct-browser-access header is KEPT (harmless in Node)
//   • recordTrace() call is REMOVED (stays in SW caller)
export async function classifyPost(postText: string, apiKey: string): Promise<ClassifyResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: [{ type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: postText }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    content: Array<{ text: string }>;
    usage?: AnthropicUsage;
  };
  const raw = data.content[0]?.text ?? '';
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(jsonStr) as { score: number; signals: Record<string, number> };

  const score = Math.min(100, Math.max(0, Math.round(parsed.score)));
  const breakdown: Record<string, number> = parsed.signals ?? {};

  return {
    result: {
      score,
      signals: Object.keys(breakdown),
      signalBreakdown: breakdown,
      confidence: score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low',
      engineUsed: 'llm',
    },
    usage: data.usage,
  };
}
```

**Imports pattern for `src/shared/classifier.ts`:**
```typescript
import type { DetectionResult } from './types';
// No chrome.* imports — this file is transport-agnostic
// No pricing.ts import — cost calculation is the caller's responsibility
```

---

### `src/background/index.ts` (MODIFIED — behavior-preserving refactor)

**Analog:** itself — replace the `AnthropicUsage` interface, `SYSTEM_PROMPT`, and inline `scorePost` body with imports

**Import block change** (current L3–6, extend with classifier import):
```typescript
// Before (current L3–6):
import type { DetectionResult, TraceEntry } from '../shared/types';
import { MODEL_PRICING, computeCostUsd } from '../shared/pricing';
import { appendTrace } from '../shared/traceStore';
import { storageSet } from '../shared/storage';

// After (add one import line; remove AnthropicUsage interface at L21–26):
import type { DetectionResult, TraceEntry } from '../shared/types';
import { MODEL_PRICING, computeCostUsd } from '../shared/pricing';
import { appendTrace } from '../shared/traceStore';
import { storageSet } from '../shared/storage';
import { SYSTEM_PROMPT, classifyPost, type AnthropicUsage } from '../shared/classifier';
```

**New `scorePost` wrapper** (replaces L167–222):
```typescript
async function scorePost(postText: string): Promise<DetectionResult> {
  const result = await chrome.storage.local.get(['anthropicApiKey']);
  const apiKey = result.anthropicApiKey as string | undefined;
  if (!apiKey) throw new Error('No API key configured');

  const { result: detectionResult, usage } = await classifyPost(postText, apiKey);

  // TRACE-01: record success trace (fire-and-forget)
  recordTrace({
    source: 'detector',
    model: 'claude-sonnet-4-6',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: postText,
    usage,
  });

  return detectionResult;
}
```

**`recordTrace` signature** (unchanged — `src/background/index.ts` L38–43):
```typescript
function recordTrace(opts: {
  source: 'detector' | 'rederiver';
  model: string;
  systemPrompt: string;
  userPrompt: string;
  usage?: AnthropicUsage;
  error?: string;
}): void
```
The `AnthropicUsage` type now comes from the import above rather than the local interface definition.

---

### `scripts/eval.ts` (NEW — CLI script, batch/transform)

**Analog:** `scripts/trace-summary.ts` (mirror this structure exactly)

**Imports pattern** (`scripts/trace-summary.ts` L5–11):
```typescript
// ESM — .js extensions required under tsx (trace-summary.ts L8 pattern)
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { computeCostUsd } from '../src/shared/pricing.js';
import { classifyPost, SYSTEM_PROMPT } from '../src/shared/classifier.js';
import type { AnthropicUsage } from '../src/shared/classifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
```

**Constants block** (mirror `trace-summary.ts` L15–18 pattern):
```typescript
const MODEL = 'claude-sonnet-4-6';
const EVAL_DIR = join(__dirname, '../eval');
// 12 thresholds: 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90
const THRESHOLDS = Array.from({ length: 12 }, (_, i) => 35 + i * 5);
```

**Argv validation** (`scripts/trace-summary.ts` L24–28 — copy exactly, change usage text):
```typescript
const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: npm run eval <labeled-posts.json>\n');
  process.exit(1);
}
```

**File read + JSON parse** (`scripts/trace-summary.ts` L30–37 — copy exactly, change type):
```typescript
let parsed: { exportedAt: string; flaggedPosts: unknown[]; unflaggedPosts: unknown[] };
try {
  const raw = readFileSync(resolve(filePath), 'utf8');
  parsed = JSON.parse(raw) as typeof parsed;
} catch {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}
```

**API key guard** (new exit-non-zero case — adds to the pattern from trace-summary):
```typescript
const apiKey = process.env['ANTHROPIC_API_KEY'];
if (!apiKey) {
  process.stderr.write('Error: ANTHROPIC_API_KEY environment variable is not set.\n');
  process.exit(1);
}
```

**Array guard + null guard** (`scripts/trace-summary.ts` L39–42 + L62–67 — apply to both arrays):
```typescript
if (!Array.isArray(parsed.flaggedPosts) || !Array.isArray(parsed.unflaggedPosts)) {
  process.stderr.write('Error: JSON must contain "flaggedPosts" and "unflaggedPosts" arrays.\n');
  process.exit(1);
}

for (const rawEntry of [...parsed.flaggedPosts, ...parsed.unflaggedPosts]) {
  if (rawEntry === null || typeof rawEntry !== 'object') {
    process.stderr.write(`Warning: skipping non-object entry: ${JSON.stringify(rawEntry as unknown)}\n`);
    continue;
  }
  // ... collect labeled entries
}
```

**Non-finite / NaN guard** (`scripts/trace-summary.ts` L92 — WR-01 pattern):
```typescript
const safe = (n: number): number => (Number.isFinite(n) ? n : 0);
```
Apply to every numeric field from untrusted JSON AND to every metric computation.

**No-label exit** (new — EVAL-05):
```typescript
if (labeledPosts.length === 0) {
  process.stderr.write(`Error: No labeled posts found (${skippedCount} unlabeled entries skipped). Add "label": "ai" or "label": "human" to each post.\n`);
  process.exit(1);
}
```

**Cost accumulation pattern** (`scripts/trace-summary.ts` L103–108):
```typescript
const { costUsd } = computeCostUsd(MODEL, usage);
totalCostUsd += safe(costUsd);
```

**Divide-by-zero guards for metrics** (`scripts/trace-summary.ts` L145 — extend to all four metrics):
```typescript
const precision = (tp + fp) > 0 ? tp / (tp + fp) : null;
const recall    = (tp + fn) > 0 ? tp / (tp + fn) : null;
const f1        = (precision !== null && recall !== null && (precision + recall) > 0)
                  ? 2 * precision * recall / (precision + recall)
                  : null;
const accuracy  = (tp + fp + tn + fn) > 0 ? (tp + tn) / (tp + fp + tn + fn) : 0;
```

**Directory auto-create + file write** (mkdir pattern — referenced in RESEARCH.md, not in trace-summary since it writes README):
```typescript
mkdirSync(EVAL_DIR, { recursive: true });
const outFile = join(EVAL_DIR, `results-${today}.json`);
writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
```

**Stdout output** (`scripts/trace-summary.ts` L166):
```typescript
process.stdout.write(summaryLine + '\n');
process.stdout.write(table + '\n');
```

---

### `src/shared/classifier.test.ts` (NEW — unit test)

**Analog:** `src/shared/pricing.test.ts` (same module-level vitest structure)

**Test file structure** (`src/shared/pricing.test.ts` L1–10):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { classifyPost, SYSTEM_PROMPT } from './classifier';

// Test: SYSTEM_PROMPT is a non-empty string
describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});
```

**Fetch stub pattern** (`src/background/trace.test.ts` L25–43, L127–133 — use vi.stubGlobal for fetch):
```typescript
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
```

**Mock Anthropic response helper** (`src/background/trace.test.ts` L28–42):
```typescript
function okClassifyResponse(score = 75, signals = { 'hook-story': 40, 'em-dash': 35 }) {
  const content = JSON.stringify({ score, signals, reasoning: 'test' });
  return {
    ok: true,
    json: async () => ({
      content: [{ text: content }],
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 50,
      },
    }),
    text: async () => '',
  };
}
```

**Key behaviors to test in `classifier.test.ts`:**
- `classifyPost` returns `{ result: DetectionResult, usage: AnthropicUsage }` on success
- Score is clamped to 0–100 (test with `score: 150` → expect `100`)
- Markdown fences are stripped from response (test with ` ```json\n{...}\n``` `)
- HTTP error (non-ok response) throws `Error('API ${status}: ...')`
- `usage` field from response is passed through to return value
- `confidence` is derived correctly: `>= 60` → `'high'`, `35–59` → `'medium'`, `< 35` → `'low'`

---

### `scripts/eval.test.ts` (NEW — CLI/integration test)

**Analog:** `src/background/trace.test.ts` for fetch stubbing; `scripts/trace-summary.ts` structure for what to test

**Test file imports** (mirror `trace.test.ts` L14–16 import style):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
```

**Key behaviors to test:**
- EVAL-01: Walker reads `flaggedPosts[]` + `unflaggedPosts[]`, skips unlabeled entries
- EVAL-03: Metrics at each threshold correct; divide-by-zero → `null` or `0`, never `NaN`
- EVAL-05 exit codes: no file arg → exit 1, file not found → exit 1, no labels → exit 1, no API key → exit 1

**fs mock pattern** (use `vi.mock('fs')` for file I/O tests rather than real disk writes):
```typescript
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
```

---

### `package.json` (MODIFIED — add `eval` script)

**Analog:** `package.json` L14 — the existing `trace-summary` script entry

**Pattern** (`package.json` L14):
```json
"trace-summary": "tsx scripts/trace-summary.ts"
```

**New entry to add** (immediately after `trace-summary`):
```json
"eval": "tsx scripts/eval.ts"
```

Full `scripts` block after change:
```json
"scripts": {
  "build": "vite build",
  "dev": "vite build --watch",
  "type-check": "tsc --noEmit",
  "lint": "eslint src",
  "generate-icons": "node scripts/generate-icons.js",
  "trace-summary": "tsx scripts/trace-summary.ts",
  "eval": "tsx scripts/eval.ts",
  "package": "npm run build && node scripts/package-zip.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

---

## Shared Patterns

### Non-finite / NaN guard (WR-01)
**Source:** `scripts/trace-summary.ts` L92
**Apply to:** All numeric fields read from untrusted JSON in `scripts/eval.ts`; all metric computations
```typescript
const safe = (n: number): number => (Number.isFinite(n) ? n : 0);
```

### Null / non-object entry guard
**Source:** `scripts/trace-summary.ts` L62–67
**Apply to:** Every element of `flaggedPosts[]` and `unflaggedPosts[]` in `scripts/eval.ts`
```typescript
if (rawEntry === null || typeof rawEntry !== 'object') {
  process.stderr.write(`Warning: skipping non-object entry: ${JSON.stringify(rawEntry as unknown)}\n`);
  continue;
}
```

### ESM import extension (`.js` required)
**Source:** `scripts/trace-summary.ts` L8
**Apply to:** All `src/shared/*` imports in `scripts/eval.ts`
```typescript
import { computeCostUsd } from '../src/shared/pricing.js';
import { classifyPost, SYSTEM_PROMPT } from '../src/shared/classifier.js';
```

### `__dirname` shim for ESM scripts
**Source:** `scripts/trace-summary.ts` L11
**Apply to:** `scripts/eval.ts`
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
```

### `computeCostUsd` call pattern
**Source:** `scripts/trace-summary.ts` L103–108 and `src/shared/pricing.ts` L62–70
**Apply to:** Each successfully scored post in `scripts/eval.ts`
```typescript
const { costUsd } = computeCostUsd(MODEL, {
  input_tokens: usage.input_tokens,
  output_tokens: usage.output_tokens,
  cache_creation_input_tokens: usage.cache_creation_input_tokens,
  cache_read_input_tokens: usage.cache_read_input_tokens,
});
totalCostUsd += safe(costUsd);
```

### Fetch stub pattern for Vitest
**Source:** `src/background/trace.test.ts` L25, L127–133
**Apply to:** `src/shared/classifier.test.ts`
```typescript
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
```

### `JSON.stringify(payload, null, 2)` for pretty output
**Source:** established project pattern (multiple files)
**Apply to:** `scripts/eval.ts` results file write
```typescript
writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
```

---

## No Analog Found

All files have close analogs. No entries in this section.

---

## Critical Pitfalls for Planner

These are verified traps from RESEARCH.md that must be reflected in plan task acceptance criteria:

1. **Do NOT walk `flaggedAccounts[].posts[]`** — it duplicates `flaggedPosts[]` (Phase 25.2 amendment). Walker reads `input.flaggedPosts` and `input.unflaggedPosts` only.
2. **Do NOT use `score` from the export** — re-score via `classifyPost(post.text, apiKey)` for every labeled post (D-08).
3. **`classifyPost` must return `usage`** — SW's `recordTrace` needs it. Return type is `{ result: DetectionResult; usage?: AnthropicUsage }`, not just `DetectionResult` (RESEARCH pitfall 6).
4. **`AnthropicUsage` interface moves** — it is currently a local interface in `src/background/index.ts` (L21–26). After extraction it lives in `src/shared/classifier.ts` and is imported by `index.ts`. The `recordTrace` function signature accepts `usage?: AnthropicUsage` — that type must now come from the import.
5. **NaN in results JSON** — `JSON.stringify` silently converts `NaN` to `null`. Use the `safe()` guard and explicit `null` for undefined metrics — never let `NaN` reach the output.

---

## Metadata

**Analog search scope:** `scripts/`, `src/shared/`, `src/background/`
**Files read:** `scripts/trace-summary.ts`, `src/shared/pricing.ts`, `src/shared/pricing.test.ts`, `src/background/index.ts` (L1–230), `src/background/trace.test.ts`, `src/shared/types.ts` (L1–60), `package.json`
**Pattern extraction date:** 2026-06-14
