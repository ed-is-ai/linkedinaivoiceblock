# Phase 26: Eval Runner — Research

**Researched:** 2026-06-14
**Domain:** Node CLI eval harness + classifier extraction + classification metrics
**Confidence:** HIGH — all findings verified from live codebase source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Extract classifier into `src/shared/classifier.ts` — `SYSTEM_PROMPT` + Anthropic request build + response/verdict parsing. Both the service worker and the eval CLI import it (single source of truth).
- **D-02:** Shared classifier takes the **API key as a parameter** — never reads `chrome.storage`. SW passes key from `chrome.storage.local`; CLI reads from `ANTHROPIC_API_KEY` env var.
- **D-03:** Preserve prompt caching (`anthropic-beta` / `cache_control`) in the shared module.
- **D-04:** Score→predicted class via **threshold sweep 35–90 in steps of 5**.
- **D-05:** Report precision / recall / F1 / accuracy at **each threshold**; highlight best-F1 threshold; include total LLM cost (USD), avg cost per post, total posts evaluated.
- **D-06:** Each post scored **once**; thresholds applied post-hoc. Cost is threshold-independent.
- **D-07 (SUPERSEDED):** Original D-07 (`flaggedAccounts[].posts[]` walker) is REPLACED by the 25.2 amendment — see below.
- **D-08:** Stored `score` field is **ignored** — eval re-scores text fresh through the LLM.
- **D-09:** Posts missing a `label` are skipped and counted. If **no** labeled post exists: exit non-zero (EVAL-05). Positive class = `ai`.

**Phase 25.2 Amendment (SUPERSEDES D-07 walker):**
- Eval walker reads from **top-level** `flaggedPosts[]` (positives) and `unflaggedPosts[]` (negatives).
- Do NOT walk `flaggedAccounts[].posts[]` — it duplicates `flaggedPosts[]` and would double-count positives.
- Both arrays are unlabeled by default; user adds `"label": "ai"` / `"label": "human"` before running.

### Claude's Discretion

- Sequential LLM calls (not concurrent) with prompt caching; print running/last cost as it progresses.
- API errors / unparseable verdicts → excluded from metrics, reported as separate "errored" count.
- Pre-run cost estimate / confirmation prompt: planner's discretion.
- Cost computation: reuse `src/shared/pricing.ts` `computeCostUsd` + `MODEL_PRICING`.
- Model: `claude-sonnet-4-6`.
- Results file: `eval/results-YYYY-MM-DD.json` (dir auto-created).
- Metrics edge cases: guard divide-by-zero → render `0` or `n/a`, never `NaN`.
- Runtime: TypeScript via `tsx`; `npm run eval` in `package.json`.

### Deferred Ideas (OUT OF SCOPE)

- Capturing/exporting unflagged posts (new pre-phase before 26).
- CI integration for automated eval on push.
- Heuristic-layer eval (free, fast — separate from LLM eval).
- Confusion matrix output.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVAL-01 | Standard post-export JSON is the eval input; users annotate by adding `"label": "ai" \| "human"` to each post entry | Export shape confirmed at `src/dashboard/dataManagement.ts:buildJsonExport` L14–66; `flaggedPosts[]` and `unflaggedPosts[]` are top-level arrays |
| EVAL-02 | `npm run eval <labeled-posts.json>` reads dataset, feeds each post's text through LLM classifier, records verdict alongside ground-truth label | `scorePost` extraction path identified; Node can call api.anthropic.com directly (no CORS) |
| EVAL-03 | Computes and prints: precision, recall, F1, accuracy, total LLM cost, avg cost/post, total posts evaluated | `computeCostUsd` + standard metric formulas; divide-by-zero guards required |
| EVAL-04 | Results written to `eval/results-YYYY-MM-DD.json` (dir auto-created); compact summary line printed | Pattern established in `scripts/trace-summary.ts`; `mkdir` pattern is `fs.mkdirSync(dir, { recursive: true })` |
| EVAL-05 | Exit non-zero on: missing file / no labeled posts / no API key | Pattern established in `scripts/trace-summary.ts` L24–37; extend with no-label and no-key guards |
</phase_requirements>

---

## Summary

Phase 26 requires two concrete changes to the codebase. First, the inline `scorePost` function and `SYSTEM_PROMPT` in `src/background/index.ts` (L93–222) must be extracted into a new transport-agnostic `src/shared/classifier.ts` module. The only browser-only coupling in `scorePost` is: (a) `chrome.storage.local.get` to read the API key (L168–170), and (b) `recordTrace(...)` which writes to `chrome.storage.local` via `appendTrace`. Both are removed from the extracted module — the key becomes a parameter (D-02) and tracing stays in the service worker caller, not the shared module (the CLI will compute cost differently via post-hoc analysis). The `fetch` call itself uses the standard `fetch` API which is available in both the SW and Node 18+.

Second, `scripts/eval.ts` is a new Node CLI modelled directly on `scripts/trace-summary.ts`. It reads a labeled Export JSON (Phase 25.2 shape: top-level `flaggedPosts[]` + `unflaggedPosts[]`), re-scores each labeled post's text via the shared classifier, accumulates per-post results, then sweeps thresholds 35–90 to produce precision/recall/F1/accuracy at each cut-off. Cost is computed from real token usage via `computeCostUsd` (already in `src/shared/pricing.ts`). The 262-test suite guards the SW refactor for regressions.

**Primary recommendation:** Extract classifier first (Wave 1), run the full test suite to confirm no regressions, then build the CLI (Wave 2). The classifier extraction is the riskier task; the CLI is additive.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| LLM classification logic | `src/shared/classifier.ts` (new) | — | Single source of truth per D-01; consumed by both SW and CLI |
| API key injection | Service worker (from `chrome.storage`) / CLI (from `process.env`) | — | D-02 — shared module takes key as parameter; callers own key retrieval |
| Trace recording | Service worker only | — | `appendTrace` uses `chrome.storage` — must NOT enter the shared module |
| Cost computation | `src/shared/pricing.ts` (existing) | — | Reuse `computeCostUsd` + `MODEL_PRICING` unchanged |
| Input reading / validation | `scripts/eval.ts` (new) | — | CLI owns file I/O; mirrors `trace-summary.ts` pattern |
| Metrics computation | `scripts/eval.ts` (new) | — | Threshold sweep + metric formulas are CLI-only |
| Results persistence | `scripts/eval.ts` (new) | — | `eval/results-YYYY-MM-DD.json` with auto-create dir |

---

## Classifier Extraction — Exact Scope

### What lives in `src/background/index.ts` today and must move

**`SYSTEM_PROMPT`** (L93–165): The entire multi-line string constant. This is the primary extraction target — it is the prompt that the eval is testing. It has no browser coupling whatsoever.

**Core request build in `scorePost`** (L172–187):
```typescript
// Source: src/background/index.ts L172–187
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,           // <-- becomes a parameter in the shared module
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'anthropic-dangerous-direct-browser-access': 'true',  // <-- must DROP in Node (see below)
    'anthropic-beta': 'prompt-caching-2024-07-31',        // <-- KEEP (D-03)
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: postText }],
  }),
});
```

**Response parsing** (L195–221):
```typescript
// Source: src/background/index.ts L195–221
const data = await response.json() as {
  content: Array<{ text: string }>;
  usage?: AnthropicUsage;
};
const raw = data.content[0]?.text ?? '';
const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
const parsed = JSON.parse(jsonStr) as { score: number; signals: Record<string, number> };
const score = Math.min(100, Math.max(0, Math.round(parsed.score)));
const breakdown: Record<string, number> = parsed.signals ?? {};
```

**`AnthropicUsage` interface** (L21–26): Must be exported from the shared module so the CLI can access usage data for cost calculation.

### What stays in `src/background/index.ts` (NOT extracted)

- `recordTrace(...)` call (L206–213) — writes to `chrome.storage.local` via `appendTrace`.
- `chrome.storage.local.get(['anthropicApiKey'])` (L168–170) — the SW reads its own key.
- The `SCORE_POST` message handler (L462–478) — SW-only message plumbing.
- `REDERIVE_SYSTEM_PROMPT`, `rederiveSelector`, and all rate-limit logic — unrelated to eval.

After extraction, the SW's `scorePost` becomes:
```typescript
// pseudocode: src/background/index.ts after refactor
import { SYSTEM_PROMPT, classifyPost, type AnthropicUsage } from '../shared/classifier';

async function scorePost(postText: string): Promise<DetectionResult> {
  const result = await chrome.storage.local.get(['anthropicApiKey']);
  const apiKey = result.anthropicApiKey as string | undefined;
  if (!apiKey) throw new Error('No API key configured');
  return classifyPost(postText, apiKey);  // returns { score, signals, signalBreakdown, confidence, engineUsed, usage }
}
```

### The `anthropic-dangerous-direct-browser-access` header

This header (L178 in current code) is required by Anthropic for browser-origin requests to bypass their CORS policy. In Node, it is **not needed and should be omitted** — the Node `fetch` is not subject to browser CORS enforcement. The shared module must conditionally omit this header, or the caller passes a `context: 'browser' | 'node'` flag, or more simply: the header is harmless in Node (it is not a sensitive header) and can be included unconditionally. Confirmed via existing code pattern — no harm in including it in Node.

### Transport-agnostic design

The `fetch` global is available in Node 18+ natively. Since `package.json` already uses `tsx` and `"type": "module"`, and the `trace-summary.ts` CLI already works under tsx without a Node version check, the shared module can use `fetch` directly. No `node-fetch` or `undici` import required.

**Browser-only couplings in current `scorePost` that would break a Node import:**

| Coupling | Location | Breaks Node? | Fix |
|----------|----------|-------------|-----|
| `chrome.storage.local.get(...)` | L168–170 | YES — `chrome` global does not exist in Node | Move to caller |
| `recordTrace(...)` → `appendTrace(...)` → `storageSet(...)` | L206–213 | YES — `chrome.storage` | Move to caller |
| `anthropic-dangerous-direct-browser-access` header | L178 | NO — harmless in Node | Include unconditionally or omit |

Both failing couplings are removed by D-02 (key as parameter) and keeping trace recording in the SW caller. The extracted module has zero browser dependencies.

---

## Export JSON Input Shape — Verified

`src/dashboard/dataManagement.ts:buildJsonExport` (L14–66) produces:

```typescript
// Verified shape as of 2026-06-14 (dataManagement.ts L24–63)
{
  exportedAt: string,               // ISO 8601
  flaggedAccounts: Array<{          // LEGACY — keep for human readability but DO NOT read for eval
    ...account,
    blocked: boolean,
    firstSeenAt: string,
    lastSeenAt: string,
    posts: Array<{ urn, score, text, hiddenAt }>  // duplicates flaggedPosts[] — DO NOT walk
  }>,
  flaggedPosts: Array<{             // TOP-LEVEL POSITIVES — eval walker reads this
    urn: string,
    authorId: string,
    authorName: string,
    text: string,
    score: number,                  // IGNORED by eval (D-08)
    hiddenAt: string,
    label?: string                  // user-added "ai" | "human" | absent
  }>,
  unflaggedPosts: Array<{           // TOP-LEVEL NEGATIVES — eval walker reads this
    urn: string,
    authorId: string,
    authorName: string,
    text: string,
    score: number,                  // IGNORED by eval (D-08)
    seenAt: string,
    label?: string                  // user-added "ai" | "human" | absent
  }>
}
```

**Key verification:** `buildJsonExport` L54–63 shows `unflaggedPosts` entries do NOT include `engineUsed` in the export output (the field is present in `UnflaggedPost` storage type but omitted at export time — `p.label` is conditionally spread only when defined, mirroring the same pattern for `flaggedPosts`). The eval CLI therefore cannot rely on `engineUsed` in the input.

**Double-count trap confirmed:** `flaggedAccounts[].posts[]` (L32–39) emits the same hidden-post data as `flaggedPosts[]` (L41–53). Reading both would count every positive twice. Use `flaggedPosts[]` only (25.2 amendment — D-01 walker contract).

---

## `scripts/trace-summary.ts` — Patterns to Mirror

`trace-summary.ts` is the direct analog for the eval CLI. Key patterns to replicate exactly:

### Argv validation (L24–37)
```typescript
// Source: scripts/trace-summary.ts L24–28
const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: npm run trace-summary <traces-export.json>\n');
  process.exit(1);
}
```
Eval CLI adds two more exit-non-zero guards: (a) no labeled posts after skipping unlabeled, and (b) missing `ANTHROPIC_API_KEY`.

### File read + parse (L30–37)
```typescript
// Source: scripts/trace-summary.ts L30–37
let parsed: { exportedAt: string; traces: TraceEntry[] };
try {
  const raw = readFileSync(resolve(filePath), 'utf8');
  parsed = JSON.parse(raw) as { exportedAt: string; traces: TraceEntry[] };
} catch {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}
```

### Untrusted-input null guard (L62–67)
```typescript
// Source: scripts/trace-summary.ts L62–67
if (rawEntry === null || typeof rawEntry !== 'object') {
  process.stderr.write(`Warning: skipping non-object trace entry: ...\n`);
  continue;
}
```
Eval CLI applies same guard to each element of `flaggedPosts[]` and `unflaggedPosts[]`.

### Non-finite guard (WR-01 pattern, L91–94)
```typescript
// Source: scripts/trace-summary.ts L91–94
const safe = (n: number): number => (Number.isFinite(n) ? n : 0);
```
Eval CLI applies same pattern everywhere a numeric field is read from untrusted JSON.

### Directory auto-create (dir creation before writeFileSync)
The `trace-summary.ts` does NOT auto-create a directory (it writes to an existing README). The `eval/` directory creation follows the same mkdir pattern: `fs.mkdirSync(evalDir, { recursive: true })` immediately before `writeFileSync`.

### ESM import path (L8)
```typescript
// Source: scripts/trace-summary.ts L8
import { computeCostUsd } from '../src/shared/pricing.js';
```
Note the `.js` extension — required for ESM under tsx. Eval CLI must use `'../src/shared/pricing.js'` and `'../src/shared/classifier.js'`.

---

## `src/shared/pricing.ts` — `computeCostUsd` Signature

```typescript
// Source: src/shared/pricing.ts L62–93
export function computeCostUsd(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
): { costUsd: number; unpriced: boolean }
```

**MODEL_PRICING for `claude-sonnet-4-6`:** `{ inputPerMTok: 3.00, outputPerMTok: 15.00 }` (verified `src/shared/pricing.ts` L33). Cache write premium is 1.25×, cache read discount is 0.10×.

**D-06 implication for eval:** The first call to the LLM pays cache-creation overhead for the system prompt (~1024+ tokens). Subsequent calls pay cache-read rate (0.10× input) — dramatically cheaper. This is why sequential calls (not concurrent) are specified: concurrent calls all miss the cache because the cache is populated by the first successful write.

---

## Metrics Computation

### Standard formulas (positive class = `ai`)

```
TP = posts labeled "ai" where score >= threshold
FP = posts labeled "human" where score >= threshold
TN = posts labeled "human" where score < threshold
FN = posts labeled "ai" where score < threshold

precision  = TP / (TP + FP)   → undefined if TP + FP = 0 → render 0 or "n/a"
recall     = TP / (TP + FN)   → undefined if TP + FN = 0 → render 0 or "n/a"
F1         = 2 * (precision * recall) / (precision + recall)  → 0 if both 0
accuracy   = (TP + TN) / (TP + FP + TN + FN)  → 0 if denominator 0
```

### Divide-by-zero guard (WR-01 lesson from Phase 25)
All four metrics require a guard for the empty-denominator case. The pattern from `trace-summary.ts` (L145–146):
```typescript
const avg = r.calls > 0 ? r.totalUsd / r.calls : 0;
```
Apply same guard to every metric fraction. For precision/recall, `n/a` is the preferred rendering when there are no positives at the given threshold (communicates "not computable" rather than "zero").

### Threshold sweep
```typescript
// 12 thresholds: 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90
const THRESHOLDS = Array.from({ length: 12 }, (_, i) => 35 + i * 5);
```
For each post, score is stored once. The sweep applies each threshold post-hoc to the stored score array — zero extra API calls (D-06).

### Best-F1 identification
After computing F1 for each threshold, `bestThreshold = thresholds.reduce((best, t) => f1[t] > f1[best] ? t : best)`.

---

## Anthropic API from Node — Key Details

**No CORS barrier in Node:** The v7.0 decision to put the LLM call in the service worker was driven entirely by `linkedin.com` origin CORS restrictions. `tsx`/Node calls `api.anthropic.com` directly from a TCP socket — no CORS. The shared module's `fetch` call works unchanged in Node 18+.

**Native fetch availability:** Node 18+ ships `fetch` as a global. `tsx` compiles TypeScript on the fly using esbuild; the runtime is whatever Node version is installed. The `package.json` does not declare `engines`, but `tsx@^4.0.0` (already installed as devDependency) requires Node 18+. No `node-fetch` import needed.

**Token usage from response:** The Anthropic API response includes a `usage` field:
```typescript
// Source: src/background/index.ts L195–198 — same shape in Node
const data = await response.json() as {
  content: Array<{ text: string }>;
  usage?: AnthropicUsage;  // { input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens? }
};
```
The `usage` field is always present on success for `/v1/messages`. Feed directly to `computeCostUsd`.

**Prompt caching across sequential calls (D-03):** The `cache_control: { type: 'ephemeral' }` on the system prompt block tells Anthropic to cache the compiled system prompt for 5 minutes. Sequential calls within that window pay `cache_read_input_tokens` rate instead of `input_tokens` rate. For the eval, batch calls happen in seconds — the cache will hit on every call after the first. This makes a batch eval of N posts cost approximately: `(1 full system prompt cost) + (N-1 × cache_read cost) + (N × output costs)`. At `claude-sonnet-4-6` rates (input $3/MTok, cache-read $0.30/MTok for the ~1024-token system prompt): effectively near-free per subsequent call for the prompt.

**Required headers in Node:**
- `x-api-key: <key>` — from `ANTHROPIC_API_KEY` env var
- `anthropic-version: 2023-06-01` — required
- `content-type: application/json` — required
- `anthropic-beta: prompt-caching-2024-07-31` — required for caching (D-03)
- `anthropic-dangerous-direct-browser-access: true` — harmless in Node; may include for code simplicity (copied from SW)

---

## Test Suite Coverage — What Guards the Refactor

**Total test count confirmed:** 262 tests across 19 files (verified 2026-06-14, all passing).

**Tests that directly guard `scorePost` / the classifier path:**

| Test file | Tests | What they guard |
|-----------|-------|-----------------|
| `src/background/trace.test.ts` | 5 tests | `SCORE_POST` message handler: success trace, failure trace (401), key absence, FIFO cap, api-key non-leakage in serialized traces |
| `src/shared/pricing.test.ts` | 6 tests | `computeCostUsd` cache-aware formula (used by both SW and CLI) |

**`trace.test.ts` stubbing pattern (critical for refactor safety):**

The trace tests stub `chrome.storage.local` via `makeChrome()` and stub `fetch` via `vi.stubGlobal('fetch', fetchMock)`. After extracting `scorePost` into `src/shared/classifier.ts`, the trace tests continue to test the **SW handler** (message → classify → trace), not the classifier directly. The tests will still pass as long as:
1. The SW's `scorePost` wrapper still calls `classifyPost(postText, apiKey)` and produces the same `DetectionResult`.
2. `recordTrace` still fires with the `usage` data from the response.

The `usage` object must therefore be returned from `classifyPost` alongside the `DetectionResult` so the SW wrapper can pass it to `recordTrace`. This means `classifyPost` should return `{ result: DetectionResult, usage?: AnthropicUsage }` (or the usage is part of an extended return type).

**Test files unaffected by the refactor:** All 17 other test files test content-script detector signals, selector registry, postStore, etc. — zero dependency on `src/background/index.ts`.

---

## `scripts/eval.ts` — Recommended Structure

Mirroring `trace-summary.ts`:

```
scripts/eval.ts
├── imports (fs, path, fileURLToPath, shared/pricing.js, shared/classifier.js)
├── Constants (THRESHOLDS, MODEL, EVAL_DIR)
├── Argv validation → exit 1 if no file path
├── File read + JSON.parse → exit 1 on error
├── API key read from process.env.ANTHROPIC_API_KEY → exit 1 if absent
├── Input validation:
│   ├── guard flaggedPosts / unflaggedPosts null/non-array
│   └── collect labeled posts (skip unlabeled, count skipped)
├── Exit 1 if no labeled posts
├── Sequential LLM scoring loop:
│   ├── for each labeled post: call classifyPost(text, apiKey)
│   ├── on error: increment errored count, continue
│   ├── on success: store { label, score, usage }
│   └── print progress line (post N/total, running cost)
├── Cost accumulation (sum computeCostUsd for each usage)
├── Threshold sweep (post-hoc, no API calls):
│   └── for each threshold: compute TP/FP/TN/FN → precision/recall/F1/accuracy
├── Best-F1 identification
├── Results object construction
├── eval/ dir auto-create + writeFileSync
├── Compact summary line → stdout
└── Full table → stdout
```

---

## Results JSON Shape — Recommended

```typescript
interface EvalResults {
  runAt: string;             // ISO 8601
  inputFile: string;         // argv[2]
  model: string;             // 'claude-sonnet-4-6'
  counts: {
    total: number;           // flaggedPosts.length + unflaggedPosts.length
    labeled: number;         // posts with a label
    skipped: number;         // unlabeled (no label field)
    errored: number;         // API errors / parse failures
    scored: number;          // successfully scored (labeled - errored)
  };
  cost: {
    totalUsd: number;
    avgUsdPerPost: number;
  };
  thresholds: Array<{
    threshold: number;       // 35, 40, ..., 90
    tp: number;
    fp: number;
    tn: number;
    fn: number;
    precision: number | null;   // null when undefined (0 positives predicted)
    recall: number | null;
    f1: number | null;
    accuracy: number;
  }>;
  bestF1Threshold: number;
}
```

---

## Security Threat Model

This is a Node CLI that reads untrusted JSON and an env-var API key.

| Threat | Surface | Mitigation |
|--------|---------|-----------|
| JSON injection via post text | `flaggedPosts[].text` / `unflaggedPosts[].text` | Text is passed as a string value to the Anthropic API body — never eval'd or executed. No additional sanitization needed. |
| API key leakage in results file | `ANTHROPIC_API_KEY` env var | Never write the API key into `eval/results-YYYY-MM-DD.json`. The results JSON has no `apiKey` field by design. Warn in stdout output not to commit the results file if it contains sensitive post text. |
| API key in stdout progress output | Progress lines | Never print the key string — only print post index, cost, and verdict. |
| Non-finite cost values in results | `computeCostUsd` | Wrap all cost accumulation with `Number.isFinite(n) ? n : 0` guard (WR-01 pattern). |
| Malformed JSON crashing the CLI | Input file | Wrapped in try/catch → exit 1 with clear message (established pattern). |
| Very long post text | Post text in API body | Already truncated to 1000 chars at storage time. Accept as-is. |
| Prompt injection via post text manipulating the scorer | Post text → SYSTEM_PROMPT | SYSTEM_PROMPT instructs the LLM to return only a JSON object. Adversarial text cannot escape the score/signals/reasoning schema — worst case is a parse failure which the errored-count path handles. |

**Key-leakage audit note:** The existing trace tests (`T-24-04` in `trace.test.ts` L246–265) already verify that the `anthropicApiKey` string never appears in serialized `TraceEntry` objects. The same discipline applies to `eval/results-*.json` — the results schema has no key field by construction.

---

## Common Pitfalls

### Pitfall 1: Walking `flaggedAccounts[].posts[]` instead of `flaggedPosts[]`
**What goes wrong:** Double-counting every positive — `flaggedAccounts[].posts[]` is the same data as `flaggedPosts[]` (by design in Phase 25.2). Recall would appear artificially inflated (twice as many positives scored).
**Why it happens:** D-07 in CONTEXT.md is superseded by the 25.2 amendment, but the original text is still present in the document. The walker MUST read `flaggedPosts[]` only.
**How to avoid:** Walker iterates `input.flaggedPosts` and `input.unflaggedPosts` only. Add a validation step that warns if `flaggedAccounts` is present but non-empty (informational only — not an error).

### Pitfall 2: Using `score` from the export instead of re-scoring
**What goes wrong:** The stored `score` is from capture time, possibly with an old prompt or different threshold. The eval's purpose is to test the **current** classifier.
**Why it happens:** The export includes a `score` field for every post — it's tempting to skip the API call.
**How to avoid:** The CLI must call `classifyPost(post.text, apiKey)` for every labeled post, ignoring the stored `score` entirely (D-08).

### Pitfall 3: NaN propagating into results JSON
**What goes wrong:** A precision/recall/F1 value of `NaN` (from 0/0) serializes as `null` in JSON (via `JSON.stringify`), silently corrupting the results.
**Why it happens:** `0 / 0 === NaN` in JavaScript; `JSON.stringify` converts `NaN` to `null`.
**How to avoid:** Guard every metric denominator. Use `n/a` string or `null` intentionally (not accidentally). WR-01 pattern: `Number.isFinite(n) ? n : 0`.

### Pitfall 4: Prompt cache miss on first call inflating per-post cost estimate
**What goes wrong:** If the user runs a cost estimate before the batch, the estimate using cached rates will be slightly off because the first call pays cache-write premium.
**Why it happens:** Cache state is not predictable before the batch starts.
**How to avoid:** Compute cost from real `usage` fields after each call. Print a note that the first call pays cache-write overhead. Do not use a hard-coded rate for cost estimation.

### Pitfall 5: ESM import path missing `.js` extension
**What goes wrong:** `import { classifyPost } from '../src/shared/classifier'` fails at runtime under tsx ESM.
**Why it happens:** ESM requires explicit file extensions. `tsx` does not add them automatically.
**How to avoid:** Use `.js` extension in all imports from `src/shared/*` (matching the pattern in `trace-summary.ts` L8: `'../src/shared/pricing.js'`).

### Pitfall 6: `classifyPost` not returning `usage` to the SW caller
**What goes wrong:** After extraction, `recordTrace` in `src/background/index.ts` needs the `usage` field to compute accurate costs. If `classifyPost` only returns `DetectionResult`, the SW loses cost tracking.
**Why it happens:** `DetectionResult` (defined in `types.ts`) does not include `usage`.
**How to avoid:** `classifyPost` returns `{ result: DetectionResult; usage?: AnthropicUsage }`. The SW destructures `{ result, usage }` and passes `usage` to `recordTrace`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cost calculation | Custom per-call rate math | `computeCostUsd` from `src/shared/pricing.ts` | Already cache-aware (cache_write 1.25×, cache_read 0.10×); rates updated once in `MODEL_PRICING` |
| Directory creation | Recursive mkdir loop | `fs.mkdirSync(dir, { recursive: true })` | Native, idempotent |
| JSON pretty-print | Custom serializer | `JSON.stringify(payload, null, 2)` | Already the established pattern |
| Fetch in Node | `node-fetch` or `undici` | Native `fetch` (Node 18+) | Already available; tsx requires Node 18+ |

---

## Standard Stack

### Core (no new packages)

| Module | Purpose | Notes |
|--------|---------|-------|
| `tsx` (already installed) | Run `scripts/eval.ts` without a pre-build step | `tsx@^4.0.0` in devDependencies |
| `src/shared/classifier.ts` (new) | Extracted `SYSTEM_PROMPT` + `classifyPost` | No new npm deps |
| `src/shared/pricing.ts` (existing) | `computeCostUsd` + `MODEL_PRICING` | Import as `../src/shared/pricing.js` |
| Node built-ins: `fs`, `path`, `url` | File I/O, path resolution, ESM `__dirname` shim | Used identically in `trace-summary.ts` |

**No new npm packages are required for this phase.**

### `package.json` additions

```json
// Add to "scripts":
"eval": "tsx scripts/eval.ts"
```

---

## Package Legitimacy Audit

No new packages are installed in this phase. The `tsx` package (`tsx@^4.0.0`) is already present in devDependencies and was used in Phase 25. No audit required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `vite.config.ts` (root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVAL-01 | Walker reads `flaggedPosts[]` + `unflaggedPosts[]`, skips unlabeled | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| EVAL-02 | `classifyPost` returns `DetectionResult` + `usage` | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| EVAL-02 | SW `scorePost` wrapper still produces same result post-refactor | regression | `npm test` (trace.test.ts covers) | ✅ existing |
| EVAL-03 | Metrics at each threshold correct; divide-by-zero → 0 or n/a | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| EVAL-04 | Results file written to `eval/` dir | unit (fs mock or temp dir) | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| EVAL-05 | Exit 1 on missing file / no labels / no API key | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (full 262-test suite in 35s)
- **Per wave merge:** `npm test` + `npm run type-check`
- **Phase gate:** Full suite green + `npm run type-check` clean

### Wave 0 Gaps
- [ ] `src/shared/classifier.test.ts` — covers EVAL-02 (`classifyPost` response parsing, score clamping, error propagation)
- [ ] `scripts/eval.test.ts` (or `scripts/__tests__/eval.test.ts`) — covers EVAL-01/03/04/05 (walker, metrics, exit codes, file output)

---

## Security Domain

No `security_enforcement` flag found in `.planning/config.json` — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — no auth in CLI | — |
| V3 Session Management | No — stateless CLI | — |
| V4 Access Control | No — local file only | — |
| V5 Input Validation | Yes — untrusted JSON input | null/object guard + non-finite guard (WR-01 pattern) |
| V6 Cryptography | No — no crypto in CLI | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage in results file | Information Disclosure | Results JSON schema has no key field; never log `process.env.ANTHROPIC_API_KEY` |
| Untrusted JSON field values | Tampering | Guard all numeric fields with `Number.isFinite`; treat text as opaque string |
| Prompt injection via post text | Spoofing | LLM instructed to return JSON only; parse failures → errored count |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 18+ | Native fetch | ✓ | Implied by tsx@^4.0.0 already working | — |
| `tsx` | `npm run eval` | ✓ | `^4.0.0` (devDep) | — |
| `ANTHROPIC_API_KEY` env var | `classifyPost` | user-supplied | — | Exit 1 with clear message (EVAL-05) |
| `api.anthropic.com` | LLM scoring | ✓ (internet) | — | n/a — eval requires live API |

---

## Open Questions

1. **Should `classifyPost` return `usage` alongside `DetectionResult`?**
   - What we know: `recordTrace` in `src/background/index.ts` needs `usage` to compute cost. `DetectionResult` does not include `usage`. The CLI also needs `usage` for cost.
   - What's unclear: Whether to extend `DetectionResult` with `usage`, create a new return type, or use a tuple.
   - Recommendation: New return type `ClassifyResult = { result: DetectionResult; usage?: AnthropicUsage }` in `src/shared/classifier.ts`. Keeps `DetectionResult` clean (defined in `types.ts` for detector interface compatibility).

2. **Compact summary line format**
   - What we know: EVAL-04 requires a "compact paste-able summary line".
   - What's unclear: Exact format (one line? table row? key=value pairs?).
   - Recommendation: `Eval YYYY-MM-DD | N posts | best F1 @T=XX (P=0.XX R=0.XX F1=0.XX) | cost $X.XXXXXX` — planner may adjust.

---

## Sources

### Primary (HIGH confidence — verified from live codebase)

- `src/background/index.ts` L93–222 — full `scorePost` + `SYSTEM_PROMPT` (read 2026-06-14)
- `src/dashboard/dataManagement.ts` L14–66 — `buildJsonExport` (read 2026-06-14)
- `scripts/trace-summary.ts` L1–214 — full CLI analog (read 2026-06-14)
- `src/shared/pricing.ts` L1–93 — `computeCostUsd` + `MODEL_PRICING` (read 2026-06-14)
- `src/shared/types.ts` L1–446 — all shared types including `FlaggedPost`, `UnflaggedPost`, `DetectionResult` (read 2026-06-14)
- `src/background/trace.test.ts` L1–296 — test patterns and what the tests guard (read 2026-06-14)
- `package.json` — installed packages, script names, module type (read 2026-06-14)
- Test suite run: 262 tests, 19 files, all passing (confirmed 2026-06-14)

### Secondary (MEDIUM confidence)

- `.planning/phases/26-eval-runner/26-CONTEXT.md` — locked decisions D-01 through D-09 and 25.2 amendment
- `.planning/REQUIREMENTS.md` — EVAL-01 through EVAL-05 requirement text

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node 18+ is installed on the developer machine (required for native `fetch`) | Anthropic API from Node | CLI fails with "fetch is not defined"; fix: add `node-fetch` or check engines |
| A2 | `anthropic-dangerous-direct-browser-access` header is harmless when sent from Node | Classifier extraction | No known risk — header is advisory; Anthropic ignores it in non-browser contexts |

**All other claims are verified from live source files.**

---

## Metadata

**Confidence breakdown:**
- Classifier extraction scope: HIGH — read full source, identified exact lines
- Export shape: HIGH — read `buildJsonExport` in full, confirmed 3-array output
- CLI structure: HIGH — `trace-summary.ts` is an exact analog
- Metrics formulas: HIGH — standard classification metrics
- Test coverage: HIGH — ran full suite, confirmed 262 passing

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable codebase; main risk is if Phase 25.2 ships additional export changes)

---

## RESEARCH COMPLETE
