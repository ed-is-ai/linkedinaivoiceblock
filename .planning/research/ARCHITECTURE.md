# Architecture Research — v10.0 LLM-Primary Detection & Eval-Driven Tuning

**Milestone:** v10.0
**Researched:** 2026-06-15
**Confidence:** HIGH — based on direct code reading of all integration points.

---

## Context: What Already Exists

The code has been read in full. Key facts that constrain every decision below:

- `src/content/index.ts` `init()` picks the detector at startup: `new LLMDetector(heuristic)` when an API key exists, bare `heuristic` otherwise. The detector is captured in closure scope and never re-read.
- `LLMDetector.detect()` sends `SCORE_POST` to the service worker, which calls `classifyPost()` from `src/shared/classifier.ts`, then `sendResponse()`. Falls back to its injected `Detector` on any error/rejection.
- `HeuristicDetector` is already DOM-free (no `document.*`, no `chrome.*`) — importable from Node (confirmed: `scripts/eval.ts` does exactly this).
- The service worker reads the API key fresh from `chrome.storage.local` on every `SCORE_POST` message (stateless pattern already established).
- The rederiver rate-limit in `background/index.ts` is the established pattern for per-session LLM cost state: read-fresh-from-storage on every call, latch + counter written atomically, released in `finally`.
- `src/shared/eval/metrics.ts` exports `THRESHOLDS` (the sweep set), `computeMetrics`, `filterErrors`. `src/shared/eval/runs.ts` exports `EvalRun`, `summarize`, `compareRuns`. `scripts/eval.ts` writes `eval/results-YYYY-MM-DD.json` as an `EvalRun` record.
- `src/shared/types.ts` is the StorageSchema. All new storage keys must be added here.
- The `Settings` interface in `src/shared/types.ts` currently holds `autoHideThreshold` and `captureUnflaggedPosts`. Config additions land here or in a parallel committed JSON.

---

## Question A: Where Does the Heuristic→LLM PRIMARY Decision Live?

### Decision: Inside `LLMDetector`, unchanged in shape

The existing `LLMDetector` already implements LLM-primary with heuristic fallback:

```
LLMDetector.detect(post)
  ├── scoreViaBackground(post.postText)   ← succeeds: return LLM result
  └── catch → this.fallback.detect(post)  ← error/no-key: return heuristic result
```

`init()` in `src/content/index.ts` already builds `new LLMDetector(heuristic)` when an API key is present, and falls back to bare `heuristic` when there is no key at all.

**What v10.0 changes about this:**

- Currently `init()` branches: LLMDetector if key present, else heuristic. For LLM-primary, the intent is that `LLMDetector` is always instantiated (API key is required for the primary mode). The "no key" path remains: `LLMDetector.detect()` calls `scorePost()` in the SW, which throws `'No API key configured'`, caught by the `catch` branch, which falls back to heuristic. Behaviour is already correct — the only change is removing the `anthropicApiKey` guard in `init()` so `LLMDetector(heuristic)` is always the primary detector. The heuristic is always passed as fallback.
- The cost guardrail (question B) adds a second error path that also falls back. No structural change to `LLMDetector` is needed — it already catches anything the SW throws.

**classifyPost stays in `src/shared/classifier.ts`, unchanged.** The eval CLI imports it directly. The service worker calls it. This single-source contract must not be broken.

**The fallback branch stays inside `LLMDetector.catch()`, not in the service worker.** The SW's `scorePost()` already throws on errors (`No API key`, HTTP non-2xx, rate-limit exceeded). `LLMDetector` already catches. Adding the cost guardrail means the SW throws a new error type (`'Session cap reached'`), and `LLMDetector` catches it just as it catches any other error — same catch path, same fallback to heuristic. No changes to the service worker's response protocol.

### In-flight / async render behaviour

The content script calls `detector.detect(postData).then(...)` — the post is already rendered in the DOM before the async round-trip completes (LinkedIn's React virtualises the feed, posts arrive via MutationObserver). Current behaviour: post is visible while the LLM scores it (LLM takes ~1–2 s).

**Recommended: hide-on-result (current behaviour, no change).** Do not hide optimistically. Rationale:
- Optimistic hide followed by an unhide on LLM result (if score < threshold) would cause layout flicker and risks hiding posts the LLM later clears — a worse UX and a false-positive risk.
- The heuristic pre-score can be used as a "should we even try LLM?" gate (see cost guardrail), but the hide decision is always based on the final merged score.
- The existing `thresholdAuthors` fast-path already handles previously-flagged authors: posts from known-high-score accounts are hidden immediately with no new detection round-trip. This is the correct optimistic-hide surface — it acts on stored prior evidence, not on in-flight uncertainty.

**Re-scoring of posts scored during offline/heuristic-fallback:** Not needed in v10.0. The fallback produces a valid `DetectionResult` with `engineUsed: 'heuristic'`. Posts hidden during a fallback period are already in `storedPosts` with a heuristic score. Re-scoring would require re-surfacing post text through the LLM on reconnect — this is complex, risky (ToS surface), and low-value for a personal tool. Defer; track `engineUsed` so future eval runs can identify heuristic-scored posts if re-scoring is ever added.

---

## Question B: Per-Session Cost Guardrail State

### Pattern: Mirror the rederiver rate-limit exactly

The rederiver rate-limit in `background/index.ts` is the established, proven pattern for stateless-SW per-session rate state:

```
Read state from chrome.storage.local on every SW message
  → check limits
  → write updated state atomically (latch + counters)
  → call Anthropic
  → release latch in finally
```

The cost guardrail reuses this exact pattern.

### Storage keys (add to `StorageSchema` in `src/shared/types.ts`)

```typescript
// Per-session LLM detection cost guardrail (v10.0)
llbSessionPostCount?: number;        // posts scored via LLM this session
llbSessionCostUsd?: number;          // accumulated USD cost this session
llbSessionDateKey?: string;          // 'YYYY-MM-DD' UTC — reset trigger
llbSessionMaxPosts?: number;         // cap (config-driven; default from DetectionConfig)
llbSessionMaxCostUsd?: number;       // cap (config-driven; default from DetectionConfig)
```

**Reset semantics:** The session is UTC-day-scoped, identical to the rederiver's `llbRederiveDateKey` pattern. On every `SCORE_POST` message, `background/index.ts` reads these keys, checks `llbSessionDateKey === todayKey`, resets counters to zero on date rollover, then checks caps. If either cap is exceeded, it throws `'Session cap reached: N posts / $X.XX today'`. `LLMDetector` catches this, falls back to heuristic, logs a console warning. No latch needed (unlike rederiver) because SCORE_POST is per-post serial from the content script's `.then()` chain — there is no concurrent-tabs risk analogous to the rederiver single-flight.

### Where the check lives

**Inside `scorePost()` in `background/index.ts`**, immediately after reading the API key and before calling `classifyPost()`. This keeps the guardrail co-located with the only place that makes LLM calls for post classification. The `recordTrace()` call is not made on a guardrail rejection (no tokens consumed).

After a successful `classifyPost()` call, `scorePost()` increments both `llbSessionPostCount` and `llbSessionCostUsd` (using `computeCostUsd` from `src/shared/pricing.ts`, which is already imported in `background/index.ts`).

### Config integration

Default caps (`maxPostsPerSession`, `maxCostUsdPerSession`) come from `DetectionConfig` (see Question C). The SW reads them on every SCORE_POST from `chrome.storage.local` at the `llbDetectionConfig` key — same pattern as the API key read.

---

## Question C: Eval-Derived Config — Single Source of Truth

### The problem

The eval CLI (`scripts/eval.ts`) performs a threshold sweep and identifies the best-F1 threshold. Currently `FLAG_THRESHOLD = 35` and `currentThreshold` (from `settings.autoHideThreshold`, default 60) are constants in `src/content/index.ts`. The heuristic signal weights are baked into each signal function. There is no committed artifact that says "these are the tuned values."

### Recommended: `src/shared/detectionConfig.ts` — a committed TypeScript module

**Not a JSON file.** Reason: TypeScript const with `as const` gives compile-time type safety, imports work in both the extension (bundled by Vite) and the CLI (tsx / ts-node). A JSON file would require `import ... assert { type: 'json' }` or `JSON.parse(readFileSync(...))` — more friction and two different import paths.

```typescript
// src/shared/detectionConfig.ts

/**
 * Detection configuration — single source of truth for both runtime and eval.
 *
 * Updated by running `npm run eval` and committing the winning values.
 * Both the extension (content/index.ts, background/index.ts) and the eval CLI
 * (scripts/eval.ts) import from this file — no forked config is possible.
 *
 * v10.0 baseline derived from: [eval/results-YYYY-MM-DD.json id]
 */
export const DetectionConfig = {
  /** Score threshold for auto-hiding (currently settings.autoHideThreshold default) */
  autoHideThreshold: 60,
  /** Score threshold for flagging (FLAG_THRESHOLD in content/index.ts) */
  flagThreshold: 35,
  /** Per-session LLM call cap (post count) */
  maxPostsPerSession: 200,
  /** Per-session LLM cost cap (USD) */
  maxCostUsdPerSession: 0.50,
  /**
   * Heuristic signal weights for fallback mode.
   * Keys match HeuristicDetector signal names; values are multipliers applied to
   * the raw signal score. Default 1.0 = no change from the signal's built-in weight.
   * Updated post-eval if FP analysis reveals a specific signal is over-weighted.
   */
  heuristicWeights: {
    'listicle-cta': 1.0,
    'buzzword': 1.0,
    'em-dash': 1.0,
    'ai-vocab': 1.0,
    'hook-story': 1.0,
    'motivational': 1.0,
    'cta': 1.0,
    'impersonal-framing': 1.0,
    'generic-cta': 1.0,
  },
  /** Baseline eval run ID that this config was derived from (for regression gate) */
  baselineEvalRunId: '',
} as const;

export type DetectionConfigShape = typeof DetectionConfig;
```

### Who imports `DetectionConfig`

| Consumer | Import | What it uses |
|---|---|---|
| `src/content/index.ts` | direct | `flagThreshold`, `autoHideThreshold` (replaces hard-coded constants) |
| `src/background/index.ts` | direct | `maxPostsPerSession`, `maxCostUsdPerSession` |
| `scripts/eval.ts` | direct | `flagThreshold`, `autoHideThreshold` (sweep anchors), and for the regression gate comparison |
| `src/content/detector/heuristic.ts` | direct | `heuristicWeights` applied to signal scores in `detect()` |

**The eval CLI and the runtime use the same committed file.** When an eval run produces better values, the human updates `detectionConfig.ts`, commits, and rebuilds. The eval run's `bestF1Threshold` is the source; the config is the committed artifact.

**`settings.autoHideThreshold` in chrome.storage.local remains the user override.** `DetectionConfig.autoHideThreshold` is the default baked into the extension. If the user has set a custom threshold via the popup Settings slider, that stored value takes priority (the existing `settings?.autoHideThreshold ?? 60` pattern in `init()` becomes `settings?.autoHideThreshold ?? DetectionConfig.autoHideThreshold`).

### Heuristic weights — how they flow into HeuristicDetector

`HeuristicDetector` currently hard-codes signal contributions inside each signal function. The weights object provides a post-hoc multiplier applied in `HeuristicDetector.detect()` after raw signal scores are computed — non-destructive, backward-compatible. The signal functions themselves do not change. The multiplier is applied to each signal's `signalBreakdown` value before summing.

```typescript
// In HeuristicDetector.detect() — after all signals computed:
const adjustedBreakdown: Record<string, number> = {};
for (const [k, v] of Object.entries(rawBreakdown)) {
  const w = this.weights[k as keyof typeof DetectionConfig.heuristicWeights] ?? 1.0;
  adjustedBreakdown[k] = Math.round(v * w);
}
const score = Object.values(adjustedBreakdown).reduce((s, v) => s + v, 0);
```

---

## Question D: Regression Gate

### What it does

Reads the most recent `eval/results-YYYY-MM-DD.json` produced by `npm run eval`, compares F1 and precision at `DetectionConfig.autoHideThreshold` against a committed baseline, exits non-zero if either drops.

### Where it lives: `scripts/eval-gate.ts` (NEW)

```
npm run eval-gate -- eval/results-YYYY-MM-DD.json
```

This script:
1. Reads the supplied `EvalRun` JSON (already produced by `npm run eval`).
2. Finds the `ThresholdRow` where `threshold === DetectionConfig.autoHideThreshold`.
3. Reads the baseline from `eval/baseline.json` (committed — a committed `EvalRunSummary` object, see below).
4. Asserts `currentF1 >= baseline.f1 - TOLERANCE` and `currentPrecision >= baseline.precision - TOLERANCE` where `TOLERANCE = 0.02` (2 percentage points).
5. Exits 0 on pass, exits 1 with a table of deltas on fail.

The script imports `summarize` and `compareRuns` from `src/shared/eval/index.ts` — reusing the already-shared comparison infrastructure.

### Baseline artifact: `eval/baseline.json` (NEW committed file)

```json
{
  "id": "2026-06-15T12:00:00.000Z::llm",
  "runAt": "2026-06-15T12:00:00.000Z",
  "engine": "llm",
  "model": "claude-sonnet-4-6",
  "datasetLabel": "labeled-2026-06-15.json",
  "bestF1Threshold": 60,
  "f1": 0.87,
  "precision": 0.91,
  "recall": 0.83,
  "costUsd": 0.42,
  "fpCount": 3,
  "fnCount": 8
}
```

This is an `EvalRunSummary` — the projection type that already exists in `src/shared/eval/runs.ts`. Committing a summary (not a full `EvalRun`) keeps the file small and focused.

**How the baseline is updated:** After a deliberate tuning run that improves metrics, run `npm run eval-gate -- eval/results-YYYY-MM-DD.json --promote`. The `--promote` flag writes the new run's summary to `eval/baseline.json` and exits 0. This is a deliberate human action — not automatic.

### npm script

```json
"eval-gate": "tsx scripts/eval-gate.ts"
```

### Integration with existing eval CLI

The existing `npm run eval` already writes `eval/results-YYYY-MM-DD.json` as a conformant `EvalRun`. `eval-gate` reads that file. No changes to `scripts/eval.ts` are needed.

---

## Component Map: New vs Modified

### NEW components

| File | Type | Responsibility |
|---|---|---|
| `src/shared/detectionConfig.ts` | Shared module | Single source of truth for threshold, flag threshold, session caps, heuristic weights, baseline eval run ID |
| `scripts/eval-gate.ts` | CLI script | Regression gate: reads eval results JSON, compares vs baseline, exits non-zero on regression |
| `eval/baseline.json` | Committed data | Accepted baseline `EvalRunSummary` — gate's reference point |

### MODIFIED components

| File | Change | What Changes |
|---|---|---|
| `src/shared/types.ts` | Add storage keys | `llbSessionPostCount`, `llbSessionCostUsd`, `llbSessionDateKey`, `llbSessionMaxPosts`, `llbSessionMaxCostUsd` to `StorageSchema` |
| `src/background/index.ts` | Cost guardrail in `scorePost()` | Read session counters; check caps against `DetectionConfig`; increment on success; throw `'Session cap reached'` when exceeded |
| `src/content/index.ts` | Config + detector init | Import `DetectionConfig`; replace `FLAG_THRESHOLD = 35` and `currentThreshold = 60` defaults with `DetectionConfig.flagThreshold` / `DetectionConfig.autoHideThreshold`; always instantiate `LLMDetector(heuristic)` (remove the `anthropicApiKey` guard that picks bare heuristic) |
| `src/content/detector/heuristic.ts` | Weight application | Accept optional `weights` in constructor options; apply `DetectionConfig.heuristicWeights` multipliers to signal scores post-compute |
| `src/shared/classifier.ts` | No change | Remains transport-agnostic; no config import (config is caller's concern) |
| `src/shared/eval/metrics.ts` | No change | THRESHOLDS already exported; no regression gate logic here |
| `scripts/eval.ts` | Minor: import config | Import `DetectionConfig.autoHideThreshold` / `DetectionConfig.flagThreshold` as sweep anchors where hard-coded values were used (cosmetic, ensures eval sweeps the config threshold) |
| `package.json` | Add script | `"eval-gate": "tsx scripts/eval-gate.ts"` |

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LINKEDIN TAB (content script)                │
│                                                                     │
│  MutationObserver → observer.ts → content/index.ts                 │
│                                                                     │
│    [blocked/threshold authors]                                      │
│         ↓ hide immediately (no detection)                           │
│                                                                     │
│    [new post] → hard exclusions → LLMDetector.detect()             │
│                                      │  (async: SCORE_POST msg)    │
│                                      ↓                             │
│                         wait for result ← post visible during wait │
│                                      │                             │
│                    ┌─────────────────┴──────────────────────┐      │
│                    │ on result: merge profile signals         │      │
│                    │ mergedScore >= flagThreshold → persist  │      │
│                    │ mergedScore >= hideThreshold → hide     │      │
│                    └────────────────────────────────────────┘      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ SCORE_POST (chrome.runtime.sendMessage)
                             ↓
┌────────────────────────────────────────────────────────────────────┐
│                     SERVICE WORKER (background/index.ts)           │
│                                                                     │
│  scorePost(postText):                                              │
│    1. Read API key from storage                                     │
│    2. Read session counters from storage → check caps              │
│       └── cap exceeded → throw 'Session cap reached'              │
│    3. classifyPost(postText, apiKey)  ← src/shared/classifier.ts  │
│    4. Increment session counters in storage                         │
│    5. recordTrace() fire-and-forget                                │
│    6. sendResponse({ result })                                      │
│                                                                     │
│  On error → sendResponse({ error }) → LLMDetector catches,        │
│             falls back to HeuristicDetector.detect()               │
└────────────────────────────┬───────────────────────────────────────┘
                             │ fetch
                             ↓
                    Anthropic API (claude-sonnet-4-6)

┌────────────────────────────────────────────────────────────────────┐
│                     SHARED MODULES                                  │
│                                                                     │
│  src/shared/detectionConfig.ts  ← SINGLE SOURCE OF TRUTH          │
│    ↑ imported by content/index.ts (thresholds)                     │
│    ↑ imported by background/index.ts (session caps)                │
│    ↑ imported by content/detector/heuristic.ts (weights)           │
│    ↑ imported by scripts/eval.ts (sweep anchors)                   │
│    ↑ imported by scripts/eval-gate.ts (gate threshold)             │
│                                                                     │
│  src/shared/classifier.ts  (unchanged)                             │
│  src/shared/eval/           (unchanged)                             │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                     EVAL PIPELINE (CLI, not extension)             │
│                                                                     │
│  npm run eval -- labeled.json --engine llm                         │
│    → scripts/eval.ts → classifyPost() → eval/results-DATE.json    │
│                                                                     │
│  npm run eval-gate -- eval/results-DATE.json                       │
│    → scripts/eval-gate.ts                                          │
│       reads eval/baseline.json (committed EvalRunSummary)          │
│       compares F1/precision at DetectionConfig.autoHideThreshold   │
│       exit 0 = pass, exit 1 = regression                           │
│       --promote flag → overwrites eval/baseline.json               │
└────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Changes

### Classification path (runtime)

```
[post text] → LLMDetector.detect()
  → SCORE_POST message
  → background/index.ts: scorePost()
      read llbSessionPostCount, llbSessionCostUsd, llbSessionDateKey
      rollover if new day
      check count >= DetectionConfig.maxPostsPerSession → throw
      check costUsd >= DetectionConfig.maxCostUsdPerSession → throw
      classifyPost(text, key) → Anthropic API
      increment llbSessionPostCount, llbSessionCostUsd in storage
      recordTrace() fire-and-forget
      return DetectionResult
  → content script: merge profile signals → hide/flag
```

```
[any throw] → LLMDetector catch
  → HeuristicDetector.detect()
      compute raw signals
      apply DetectionConfig.heuristicWeights multipliers
      return DetectionResult { engineUsed: 'heuristic' }
```

### Eval/config flow

```
npm run eval → eval/results-DATE.json (EvalRun)
  → human reads bestF1Threshold, precision, F1
  → human updates src/shared/detectionConfig.ts (commit)
  → npm run eval-gate -- eval/results-DATE.json --promote
      writes eval/baseline.json (commit)
  → extension rebuild picks up new config automatically
```

---

## Build Order (dependency-ordered)

### Phase A: Config foundation (zero behaviour change)

1. **`src/shared/detectionConfig.ts`** — new file, no dependencies, no imports changed yet. Values identical to current hard-coded constants so no behaviour change on commit.
2. **`src/shared/types.ts`** — add session guardrail keys to `StorageSchema`.
3. **`src/content/index.ts`** — replace `FLAG_THRESHOLD = 35` and `currentThreshold = 60` default with `DetectionConfig.*`. No logic change, just imports from config. All tests pass.
4. **`scripts/eval.ts`** — import `DetectionConfig` for sweep anchors. Cosmetic. All eval tests pass.

Gate: `npm test && npm run type-check` — all green, no behaviour change.

### Phase B: LLM-primary promotion

5. **`src/content/index.ts`** — remove the `anthropicApiKey` ternary that picks bare `heuristic`; always instantiate `LLMDetector(heuristic)`. The no-key path now falls through `LLMDetector.catch()` via the SW's `'No API key configured'` throw — same end result (heuristic score), different code path. Manual test: with no key, posts score via heuristic. With key, posts score via LLM.

Gate: manual smoke test with and without API key set.

### Phase C: Cost guardrail

6. **`background/index.ts`** — add `checkSessionCap()` and `incrementSessionCounters()` helpers (mirrors `checkRateLimit()` / `acquireRateLimitLatch()` style). Wire into `scorePost()`. Vitest test for cap logic (can be tested by calling the helper functions directly with mocked storage values).

Gate: unit test for guardrail helpers; manual test that cap triggers fallback.

### Phase D: Heuristic weights

7. **`src/content/detector/heuristic.ts`** — add `weights` constructor option; apply multipliers in `detect()`. `DetectionConfig.heuristicWeights` all at 1.0 so initial behaviour is unchanged. Tests pass.

Gate: `npm test` — existing heuristic tests pass unchanged (weights all 1.0).

### Phase E: Regression gate

8. **`eval/baseline.json`** — committed `EvalRunSummary` produced from the first post-tuning eval run (or a placeholder with current estimated metrics).
9. **`scripts/eval-gate.ts`** — new script; imports `summarize`, `compareRuns` from `src/shared/eval/index.ts`, `DetectionConfig` from `src/shared/detectionConfig.ts`. Reads eval results JSON + baseline JSON, computes deltas, exits 0/1.
10. **`package.json`** — add `"eval-gate": "tsx scripts/eval-gate.ts"`.

Gate: `npm run eval-gate -- <some-results.json>` exits 0 against a matching baseline.

### Phase F: Tuning run (eval-driven config update)

11. Run `npm run eval -- labeled.json --engine llm` against current labeled dataset.
12. Analyse FP/FN from `errorAnalysis`. Identify over-weighted heuristic signals contributing to FPs.
13. Update `DetectionConfig.autoHideThreshold` to `bestF1Threshold` from the run.
14. Update `DetectionConfig.heuristicWeights` for any over-weighted signals.
15. Commit `src/shared/detectionConfig.ts`.
16. Run `npm run eval-gate -- <results.json> --promote` to update `eval/baseline.json`.
17. Rebuild and manual smoke test.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Forking config between runtime and eval

**What goes wrong:** Two copies of the threshold — one in `detectionConfig.ts`, one in the eval CLI. An eval run finds threshold=55 is optimal; someone updates the eval constant but forgets the runtime. Extension keeps hiding at 60, eval reports 55 as best.

**Prevention:** `detectionConfig.ts` is the only place. Both `content/index.ts` and `scripts/eval.ts` import it. The linter will flag an unused import if someone tries to add a second constant.

### Anti-Pattern 2: Guardrail state in module scope

**What goes wrong:** Session counter as a module-level variable in `background/index.ts`. Service worker terminates after ~30s idle; module scope resets to zero on restart. Counter always reads as 0; cap is never enforced.

**Prevention:** Read/write `chrome.storage.local` on every `SCORE_POST` message, exactly as the rederiver rate-limit does.

### Anti-Pattern 3: Blocking `sendResponse` on guardrail storage reads

**What goes wrong:** Making `scorePost()` do multiple sequential `chrome.storage.local.get()` calls before responding. Each call is async (~1ms) but they stack; returning `true` to keep the message channel open and then being slow means the content script's timeout fires.

**Prevention:** Batch all required storage keys into a single `chrome.storage.local.get([...])` call at the start of `scorePost()` — read API key, session counters, and config in one read (already established pattern in `checkRateLimit()`).

### Anti-Pattern 4: Running the regression gate inside the eval sweep

**What goes wrong:** Regression check at each threshold during the sweep, comparing against baseline mid-run. This makes the baseline threshold a hard-coded magic number that determines which row to check, decoupled from `DetectionConfig`.

**Prevention:** Gate script reads the finished `EvalRun` file after the sweep is complete, finds the row at `DetectionConfig.autoHideThreshold`, and compares. Config is the single source of threshold truth.

### Anti-Pattern 5: Optimistic hide before LLM result

**What goes wrong:** Hide the post immediately on observer callback, unhide if LLM score < threshold. LinkedIn's React reconciler detects the class mutation during its own render cycle and may attempt to re-render the hidden element — causing flicker, potential `display: none` race conditions, or tombstone injection on a post that clears.

**Prevention:** Hide-on-result only. The existing `.then(async (result) => { ... if (hide) { postNode.classList.add('llb-hidden') } })` pattern is correct. The `thresholdAuthors` fast-path (synchronous, no LLM call) is the appropriate hide-before-score surface because it acts on stored prior evidence.

---

## Integration Points Summary

| Boundary | Communication | Notes |
|---|---|---|
| content script → service worker | `chrome.runtime.sendMessage({ type: 'SCORE_POST' })` | Unchanged. SW now checks guardrail before calling Anthropic. |
| service worker → chrome.storage.local | `chrome.storage.local.get/set` | New keys: session counters (5 keys). Single batched read per SCORE_POST. |
| content/index.ts → detectionConfig.ts | direct TS import | Replaces hard-coded `FLAG_THRESHOLD`, `currentThreshold` defaults. |
| background/index.ts → detectionConfig.ts | direct TS import | Reads `maxPostsPerSession`, `maxCostUsdPerSession`. |
| heuristic.ts → detectionConfig.ts | direct TS import | Reads `heuristicWeights`. Applied as multiplier post-signal-compute. |
| scripts/eval.ts → detectionConfig.ts | direct TS import | Sweep anchors. No change to scoring logic. |
| scripts/eval-gate.ts → src/shared/eval/index.ts | direct TS import | Uses `summarize`, `compareRuns`. Reuses existing types. |
| scripts/eval-gate.ts → eval/baseline.json | `JSON.parse(readFileSync(...))` | Committed baseline artifact. Updated by `--promote` flag. |

---

## Sources

- Direct code reading: `src/content/index.ts`, `src/content/detector/llm.ts`, `src/content/detector/heuristic.ts`, `src/background/index.ts`, `src/shared/classifier.ts`, `src/shared/types.ts`, `src/shared/eval/index.ts`, `src/shared/eval/metrics.ts`, `src/shared/eval/runs.ts`, `src/shared/eval/evalRunStore.ts`, `scripts/eval.ts`, `package.json`
- Project context: `.planning/PROJECT.md`
- Constraint source: `CLAUDE.md`
- Existing architecture patterns: `.planning/research/ARCHITECTURE.md` (v7.0 research)

---

*Architecture research for: v10.0 LLM-Primary Detection & Eval-Driven Tuning*
*Researched: 2026-06-15*
