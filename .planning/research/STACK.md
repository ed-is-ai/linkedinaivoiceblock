# Stack Research — v10.0 LLM-Primary Detection & Eval-Driven Tuning

**Milestone:** v10.0
**Researched:** 2026-06-15
**Mode:** Stack additions only — existing codebase preserved
**Confidence:** HIGH — grounded in direct codebase inspection + live Anthropic docs fetched 2026-06-15

---

## Headline

**No new runtime dependencies are required.** Every v10.0 capability is achievable with the existing stack: `chrome.storage.local` for the cost guardrail, `vite.config.ts define` for baking derived config at build time, and a plain `tsx` script for the regression gate. The four new concerns (LLM-primary routing, cost guardrail, eval-derived config, regression gate) all integrate into existing modules.

---

## (a) Anthropic API Request Patterns

### Current models — verified 2026-06-15 from platform.claude.com/docs/en/about-claude/models/overview

| Tier | API Model ID | Alias | Input/MTok | Output/MTok | Notes |
|------|-------------|-------|------------|-------------|-------|
| Sonnet | `claude-sonnet-4-6` | same (no date suffix) | $3.00 | $15.00 | **Already in use** — classifier.ts, scorePost() |
| Haiku | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | $1.00 | $5.00 | **Already in use** — rederiveSelector() |

Both IDs are pinned snapshots. `claude-haiku-4-5-20251001` is the canonical full ID; `claude-haiku-4-5` resolves to it. The existing `MODEL_PRICING` in `src/shared/pricing.ts` already has the correct rates for both. **No pricing update needed.**

### Model choice for per-post classification

Use **`claude-sonnet-4-6`** for post classification. Do **not** downgrade to Haiku for v10.0. Rationale:

- The existing labeled eval dataset was scored by Sonnet — switching models mid-eval invalidates the baseline and makes regression gating meaningless.
- Haiku 4.5 requires a minimum of **4,096 tokens** before prompt caching activates (vs. 1,024 for Sonnet 4.6 — confirmed in Anthropic pricing docs). The SYSTEM_PROMPT (~1,300 tokens) does not meet Haiku's minimum, so cache hits would never occur and per-post cost savings would disappear.
- Sonnet 4.6 cache read cost: $0.30/MTok = $0.0003 per 1,000 cached tokens. At ~1,300 token system prompt and ~100 token post, a cache hit costs roughly **$0.00039 per post** (system prompt cached, post text not).
- Haiku 4.5 at $0.10/MTok cache read would be cheaper per-token, but no cache hits means paying $1.00/MTok input for every post — **worse than Sonnet cache hits**.

### Prompt caching — TTL critical update

**The default cache TTL changed from 1 hour to 5 minutes on 2026-03-06.** The existing `classifier.ts` uses `cache_control: { type: 'ephemeral' }` with no `ttl` field. This now defaults to 5 minutes.

- A typical browsing session on LinkedIn sees posts arrive continuously — a 5-minute TTL is adequate if posts arrive within the window.
- For the cost guardrail use case, the system prompt is re-cached on the first post after a 5-minute gap (1.25x write premium once), then all subsequent posts in the window are cache hits (0.1x). This is already the correct behavior.
- **No change required** to the existing `cache_control` usage. The 5-minute default is appropriate for interactive browsing.
- **Optional upgrade:** if sessions regularly have >5 min gaps between posts (e.g., user leaves tab open), set `ttl: "1h"` for 1-hour caching at 2x write cost. Math: if the system prompt is 1,300 tokens and a session sees 20 posts/hour, the 1h write costs $0.0078 (2x × $3/MTok × 1300 tokens) vs 5m write costing $0.0049 (1.25x) per window. For sessions with widely-spaced posts the 1h TTL wins after 1 extra cache read saves more than the write premium difference. **Defer this optimization until session timing data exists.**

### Message Batches API — verdict: DO NOT USE for v10.0

The Batches API provides 50% off (Sonnet 4.6 batch: $1.50 input / $7.50 output per MTok) but processes asynchronously within 24 hours. For per-post real-time feed hiding, a 24-hour response time is unusable — the user has already scrolled past the post.

**Use case boundary:** Batches API is appropriate for eval runs over a labeled dataset (offline, no latency requirement). For v10.0 eval reruns this is worth considering — but eval already runs in the CLI (Node.js, direct API fetch) and processes dozens to hundreds of posts, not thousands. The cost saving is not compelling at that scale. Keep eval using per-request calls.

### Structured outputs / tool_use — verdict: SKIP for v10.0

The `output_config.format` structured output feature (GA, no beta header required as of late 2025) guarantees schema-valid JSON at the cost of:
- Additional system prompt injection (~497 tokens for Sonnet 4.6 with `tool_choice: auto`) added to every request
- Invalidates prompt cache when `output_config.format` is present (changing any part of the structured output config breaks the cache)

For the classification use case, the existing approach — JSON-only system prompt + manual regex strip + `JSON.parse` + score-range clamp — works reliably. The `classifyPost` function has been battle-tested through v9.0 eval runs. The parse-fail rate in practice is very low, and the fallback is simply to treat the post as un-scored (heuristic fallback). Adding structured outputs would cost ~497 extra input tokens per post AND break prompt caching, making every call non-cached. That erases the ~$0.003/post savings from caching on a $0.00039-per-cache-hit basis.

**Recommendation:** Keep the existing JSON-in-system-prompt pattern. Structured outputs are valuable for high-reliability agentic workflows; they are cost-negative for high-volume prompt-cached classification.

### Token cost math (per post, Sonnet 4.6)

| Call type | Tokens | Cost |
|-----------|--------|------|
| First post (cache write, 5m TTL) | 1,300 system (write) + 100 post + 80 output | (1,300 × $3.75 + 100 × $3.00 + 80 × $15.00) / 1,000,000 = **$0.007** |
| Subsequent posts (cache hit) | 1,300 system (read) + 100 post + 80 output | (1,300 × $0.30 + 100 × $3.00 + 80 × $15.00) / 1,000,000 = **$0.00159** |
| Worst case (no caching) | 1,300 system + 100 post + 80 output | (1,400 × $3.00 + 80 × $15.00) / 1,000,000 = **$0.00546** |

A session scoring 50 posts: 1 cache write + 49 cache reads ≈ $0.007 + 49 × $0.00159 = **$0.085**. At 200 posts: **$0.325**. This is the cost the per-session guardrail should protect against.

---

## (b) Client-Side Rate Limiting / Per-Session Cap

### Pattern — token bucket in `chrome.storage.local`

The service worker already implements this pattern for `REDERIVE_SELECTOR` (see `checkRateLimit()` / `acquireRateLimitLatch()` in `src/background/index.ts`). The v10.0 cost guardrail should follow the same architecture exactly:

**State keys** (new, alongside existing `llbRederive*` keys):

```typescript
// All written to chrome.storage.local — survive SW restarts
llbSessionStartMs: number          // timestamp of first LLM call in current session
llbSessionPostCount: number        // LLM calls made in current session
llbSessionDateKey: string          // ISO date 'YYYY-MM-DD' — resets daily count
llbDailyPostCount: number          // cumulative LLM calls today
```

**Guardrail logic** (reads state from storage before every `SCORE_POST`):

```typescript
const SESSION_POST_CAP = 200;   // max LLM calls per browser session
const DAILY_POST_CAP = 500;     // max LLM calls per calendar day (resets at UTC midnight)
const SESSION_WINDOW_MS = 30 * 60 * 1000;  // 30-min session window
```

**Session definition:** A "session" is the contiguous window from the first post scored to `SESSION_WINDOW_MS` later. After the window expires the counters reset (so an afternoon browsing session + an evening browsing session each get `SESSION_POST_CAP` allowance). The date-rollover resets `llbDailyPostCount` the same way `llbRederiveCallsToday` resets in the existing pattern.

**Flow (in `scorePost` inside the SCORE_POST handler):**

1. Read `llbSessionStartMs`, `llbSessionPostCount`, `llbSessionDateKey`, `llbDailyPostCount` in one `chrome.storage.local.get` call.
2. If `Date.now() - llbSessionStartMs > SESSION_WINDOW_MS`, reset session state.
3. If daily date key differs from today, reset daily count.
4. If `llbSessionPostCount >= SESSION_POST_CAP` OR `llbDailyPostCount >= DAILY_POST_CAP`, return early (heuristic fallback — do not call LLM).
5. Increment both counters and write back before the `classifyPost` fetch (same "write before fetch" discipline as `acquireRateLimitLatch`).
6. On LLM success or failure, trace is already fire-and-forget (no change needed).

**Why chrome.storage.local, not in-memory:**
The service worker terminates after ~30s idle (MV3 constraint). In-memory state is lost on every SW restart. All rate-limit state must survive in storage — same discipline as the existing rederive guardrail.

**No new dependency needed.** The pattern is pure TypeScript + `chrome.storage.local`. Do not add a third-party rate-limiter library — it adds a bundled dependency to the SW with no benefit.

**Expose cap values as configurable settings** (stored in `llbSettings`) so the user can adjust from the popup. Read from storage at check time (not compiled-in constants) so changes take effect immediately without rebuild.

---

## (c) Eval-Derived Config & Regression Gate

### Baking derived config into the Vite build

**Approach: `vite.config.ts` `define` option — no new dependencies.**

After running `npm run eval` (which writes `eval/results-YYYY-MM-DD.json` as an `EvalRun` record), a new `scripts/derive-config.ts` script reads the best-F1 threshold and writes `src/shared/detectionConfig.json`. Vite's built-in `define` option (or a `JSON.stringify` import) then makes this available as a compile-time constant.

Two implementation options, in order of preference:

**Option 1 — Static JSON import (simplest, already works in Vite 5 + TypeScript):**
```typescript
// src/shared/detectionConfig.ts
import config from './detectionConfig.json' assert { type: 'json' };
export const DETECTION_CONFIG = config;
```
Vite 5 bundles JSON imports by default. `detectionConfig.json` is committed to the repo (it is the "accepted baseline" artifact). The derive script overwrites it; the developer commits the new file when accepting a new baseline.

**Option 2 — `vite.config.ts` `define` (for compile-time inlining):**
```typescript
// vite.config.ts
import detectionConfig from './src/shared/detectionConfig.json';
export default defineConfig({
  define: {
    __DETECTION_CONFIG__: JSON.stringify(detectionConfig),
  },
  // ...
});
```
Then `declare const __DETECTION_CONFIG__: DetectionConfig;` in a `.d.ts` file.

**Recommendation: Option 1.** Static JSON import is simpler, readable, and TypeScript-typed. No `.d.ts` boilerplate, no `define` magic. Vite 5 bundles it correctly for both the service worker and content script entry points.

**`detectionConfig.json` shape (proposed):**
```json
{
  "llmThreshold": 60,
  "heuristicFallbackThreshold": 60,
  "derivedAt": "2026-06-15",
  "sourceEvalRun": "2026-06-15T10:00:00.000Z::llm",
  "bestF1": 0.87,
  "precision": 0.91,
  "recall": 0.83
}
```

The `derivedAt` / `sourceEvalRun` fields make it auditable — the config is not a magic number, it has provenance.

**`scripts/derive-config.ts` (new, ~40 lines, tsx, no new deps):**
- Reads `eval/results-YYYY-MM-DD.json` (or accepts a path argument).
- Extracts `bestF1Threshold` from the `thresholdRows` array (the row with max `f1`).
- Writes `src/shared/detectionConfig.json`.
- Prints the chosen threshold + metrics to stdout.

This script is NOT part of the build; it is run manually when accepting new eval results.

### Regression gate

**Approach: plain `tsx` script invoked as `npm run eval:gate`, exits non-zero on failure.**

No new test framework. No vitest integration needed (the gate is not a unit test — it is a CI check that reads committed JSON artifacts).

**`scripts/eval-gate.ts` (new, ~50 lines):**
```typescript
// Usage: tsx scripts/eval-gate.ts eval/results-YYYY-MM-DD.json eval/baseline.json
// Exits 0 if new run meets or exceeds baseline metrics; exits 1 otherwise.
import { readFileSync } from 'node:fs';
import type { EvalRun } from '../src/shared/eval/index.js';

const [, , newRunPath, baselinePath] = process.argv;
const newRun: EvalRun = JSON.parse(readFileSync(newRunPath, 'utf8'));
const baseline: EvalRun = JSON.parse(readFileSync(baselinePath, 'utf8'));

// Find metrics at the baseline threshold (not newRun's best-F1 — use a fixed point)
const baselineThreshold = baseline.bestF1Threshold;
const newRow = newRun.thresholdRows.find(r => r.threshold === baselineThreshold);
const baselineRow = baseline.thresholdRows.find(r => r.threshold === baselineThreshold);

const REGRESSION_TOLERANCE = 0.02; // allow 2% drop before failing
const f1Dropped = (baselineRow.f1 - newRow.f1) > REGRESSION_TOLERANCE;
const precisionDropped = (baselineRow.precision - newRow.precision) > REGRESSION_TOLERANCE;

if (f1Dropped || precisionDropped) {
  console.error('REGRESSION: F1 or precision dropped beyond tolerance');
  process.exit(1);
}
console.log('Gate passed');
process.exit(0);
```

**`eval/baseline.json`** is a committed `EvalRun` record. The developer runs `npm run eval` (producing `eval/results-YYYY-MM-DD.json`), inspects the output, and if satisfied copies it to `eval/baseline.json` (and commits both).

**npm scripts to add:**
```json
"eval:gate": "tsx scripts/eval-gate.ts",
"derive-config": "tsx scripts/derive-config.ts"
```

**CI integration (GitHub Actions or equivalent):**
```yaml
- run: npm run eval -- eval/labeled-posts.json --engine llm
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
- run: npm run eval:gate eval/results-$(date +%Y-%m-%d).json eval/baseline.json
```

The gate compares at the committed baseline threshold (not the new run's own best-F1) to avoid the "threshold drift" failure mode where a new run optimizes to a different threshold and appears better while actually being worse at the calibrated operating point.

---

## Recommended Stack — Consolidated

### Core Technologies (unchanged)

| Technology | Version | Purpose | Change |
|------------|---------|---------|--------|
| TypeScript | ^5.0.0 | All source | None |
| Preact | ^10.0.0 | Popup + dashboard UI | None |
| Vite 5 + vite-plugin-web-extension | ^5.0.0 / ^4.5.1 | Build system | None — JSON import is built-in |
| vitest | ^4.1.7 | Unit tests | None |
| tsx | ^4.0.0 | CLI eval scripts | Reuse for new scripts |

### Anthropic Models (verified 2026-06-15)

| Model | API ID | Role | Per-MTok (input/output) | Cache read/MTok |
|-------|--------|------|------------------------|-----------------|
| Sonnet 4.6 | `claude-sonnet-4-6` | Per-post LLM classifier (primary) | $3.00 / $15.00 | $0.30 |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Selector rederiver only | $1.00 / $5.00 | $0.10 |

**Note:** Haiku's 4,096-token minimum cache requirement means it is unsuitable as the classifier model — the SYSTEM_PROMPT (~1,300 tokens) does not meet the minimum and caching would never activate.

### New Modules (hand-rolled, zero new deps)

| Module | Size | Description |
|--------|------|-------------|
| `src/background/rateLimiter.ts` | ~60 lines | Per-session + daily LLM cap; reads/writes `chrome.storage.local`; reuse `checkRateLimit` pattern from existing rederive guardrail |
| `src/shared/detectionConfig.json` | ~10 lines | Committed JSON artifact — derived threshold + provenance metadata |
| `scripts/derive-config.ts` | ~40 lines | Reads best eval run, writes `detectionConfig.json` |
| `scripts/eval-gate.ts` | ~50 lines | CI regression gate; exits non-zero on F1/precision regression |

### Supporting Libraries (existing, no changes)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| fast-levenshtein | ^3.0.0 | Selector fuzzy matching | Already present, unchanged |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Anthropic SDK (`@anthropic-ai/sdk`) | Adds 200+ KB bundle to service worker; `classifyPost` already does direct `fetch` with all required headers | Keep bare `fetch` in `classifier.ts` |
| Zod / AJV for response validation | Overkill for one schema; already proven with inline type guards in `isRederiveModelOutput` | Inline type guard in `classifyPost` (already exists) |
| Message Batches API for live scoring | Async up to 24h — incompatible with real-time feed hiding | Per-request fetch (existing) |
| Structured outputs (`output_config.format`) | +497 tokens/request + invalidates prompt cache = net cost increase | JSON-in-system-prompt (existing, proven) |
| `chrome.storage.session` for rate-limit state | Cleared on browser close; may not persist across SW restarts within a session | `chrome.storage.local` (existing pattern) |
| vite-plugin-json or json-loader | Vite 5 handles JSON imports natively | Native JSON import in TypeScript |
| Jest / mocha for regression gate | Extra dev dep; `tsx` script + `process.exit` is simpler and already in devDeps | Plain `tsx` script |

---

## Prompt Caching — Key Update for v10.0

The cache TTL default changed from 1 hour to 5 minutes on 2026-03-06. The `pricing.ts` formula already uses the 1.25× write multiplier correctly for 5-minute cache writes. **No code change needed** — the existing formula applies to the new default TTL.

If in future sessions show gaps > 5 minutes between posts (detectable from trace data), upgrade to `ttl: "1h"` and update the `CACHE_WRITE_MULTIPLIER` to 2.0 in `pricing.ts`. At current session patterns this is premature.

---

## Storage Schema — New Keys

All in `chrome.storage.local`, keyed under `StorageSchema` in `src/shared/types.ts`:

```typescript
// Rate limiter state (v10.0)
llbSessionStartMs: number;        // Date.now() of first LLM call in current session
llbSessionPostCount: number;      // LLM post calls in current session window
llbSessionDateKey: string;        // 'YYYY-MM-DD' — resets daily counters
llbDailyPostCount: number;        // LLM post calls today

// Config (v10.0) — overwritten on every extension load (same pattern as llbModelPricing)
llbDetectionConfig: DetectionConfig;  // mirrors detectionConfig.json; re-seeded from JSON
```

The `llbDetectionConfig` key follows the same "code is source of truth, storage is refreshed copy" pattern established by `llbModelPricing` (D-06 in `background/index.ts`). On every `onInstalled` + `onStartup`, write the compiled-in `DETECTION_CONFIG` constant to storage. Content scripts and popup read from storage so they get the current value without a build-time dependency.

---

## Version Compatibility (no changes)

| Package | Version | Notes |
|---------|---------|-------|
| vite | ^5.0.0 | JSON imports native — `assert { type: 'json' }` works in TS 5 with `resolveJsonModule: true` |
| typescript | ^5.0.0 | `resolveJsonModule` already expected to be true in existing tsconfig |
| tsx | ^4.0.0 | Runs new `derive-config.ts` and `eval-gate.ts` scripts without additional config |
| vitest | ^4.1.7 | No changes; regression gate is not a vitest test |

Check `tsconfig.json` for `"resolveJsonModule": true` before implementing the JSON import — add it if absent.

---

## Sources

- `platform.claude.com/docs/en/about-claude/models/overview` — model IDs, pricing, context windows (fetched 2026-06-15, HIGH confidence)
- `platform.claude.com/docs/en/about-claude/pricing` — full pricing table including batch, cache write 5m/1h, cache read rates (fetched 2026-06-15, HIGH confidence)
- `platform.claude.com/docs/en/build-with-claude/prompt-caching` — TTL options, minimum token requirements per model, pricing multipliers (fetched 2026-06-15, HIGH confidence)
- `platform.claude.com/docs/en/build-with-claude/batch-processing` — async model, 50% discount, latency guarantee (fetched 2026-06-15, HIGH confidence)
- `platform.claude.com/docs/en/build-with-claude/structured-outputs` — output_config.format vs tool_use, token overhead (fetched 2026-06-15, HIGH confidence)
- `dev.to/whoffagents/anthropic-silently-dropped-prompt-cache-ttl-from-1-hour-to-5-minutes-16ao` — TTL change 2026-03-06 (MEDIUM confidence — confirmed by official pricing page)
- `src/background/index.ts`, `src/shared/classifier.ts`, `src/shared/pricing.ts` — direct codebase inspection (HIGH confidence)

---

*Stack research for: LinkedIn Blocker v10.0 — LLM-Primary Detection & Eval-Driven Tuning*
*Researched: 2026-06-15*
