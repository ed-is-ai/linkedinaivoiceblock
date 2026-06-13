# Phase 24: Trace Capture & Storage - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Every `LLMDetector` and `LLMRederiver` call appends a structured trace entry to `chrome.storage.local` — model, prompts, token counts, cache-aware USD cost, ISO timestamp, and source — with a 500-entry FIFO cap. This phase is **capture + storage only**. The dashboard "Export Traces" button, the `npm run trace-summary` script, and the README cost table are Phase 25 (TRACE-04/05/06) and are out of scope here.

Requirements TRACE-01, TRACE-02, TRACE-03 (see REQUIREMENTS.md) define the trace fields and the FIFO cap. Discussion below locks the HOW.
</domain>

<decisions>
## Implementation Decisions

### Interception point (where traces are recorded)
- **D-01:** Record traces in the **service worker**, inside the existing `scorePost()` (SCORE_POST handler) and `rederiveSelector()` (REDERIVE_SELECTOR handler) in `src/background/index.ts`. This is the ONLY place the Anthropic `usage` object (real token + cache breakdown) exists — the content-script `LLMDetector`/`LLMRederiver` only receive the parsed result. Content-side senders stay **unchanged**. (Carries forward Phase 23's "service worker is the single LLM choke point" pattern: `LLMDetector → SCORE_POST → scorePost`, `LLMRederiver → REDERIVE_SELECTOR → rederiveSelector`.)
- **D-02:** The code does **not** track caching itself. The Anthropic response `usage` object reports the four buckets per call — `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. The SW reads those fields directly off each response. `scorePost` currently parses only `content`; it must also read `usage`.

### Failed-call tracing
- **D-03:** **All attempts produce a trace entry** (not just successful ones). A failed call — HTTP 401/429, provider rate-limit, schema-validation failure, or no API key — writes a trace with `inputTokens`/`outputTokens`/cache counts `0`, `costUsd` `0`, and an `error` string (the failure message). Successful calls write the full token/cost breakdown and no `error`. (Rationale: the user wants failure/retry visibility in the trace store, accepting that non-cost rows mix into the export — Phase 25's summary can filter on `error == null`.)

### Trace schema (TRACE-01/02)
- **D-04:** One `TraceEntry` per call with: `model` (string), `systemPrompt` (full text — TRACE-01 lists "system prompt" with no truncation note; storage budget is ample), `userPrompt` (truncated to 500 chars per TRACE-01 — for `detector` this is post text, for `rederiver` it is the already-sanitized DOM skeleton), `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `costUsd`, `timestamp` (ISO 8601), `source` (`'detector' | 'rederiver'`), and optional `error` (string, present only on failed attempts).
  - `cacheCreationTokens` + `cacheReadTokens` go **beyond** TRACE-01's literal `input/output` fields on purpose (see D-07) so cost is recomputable.

### Cost model (cache-aware)
- **D-05:** `costUsd` is computed **cache-aware** at capture in the SW, from the 4-bucket `usage` using Anthropic's cache multipliers:
  ```
  costUsd = ( input_tokens          × inputRate
            + cache_creation_tokens × inputRate × 1.25   // 5-min cache write premium
            + cache_read_tokens     × inputRate × 0.10   // cache read (90% off)
            + output_tokens         × outputRate ) / 1_000_000
  ```
  Flat input pricing was rejected: both calls send a large `cache_control: ephemeral` system prompt, so flat pricing would bill the cached prompt at ~10× its real cost on every cache hit and make the Phase 25 README cost table wrong.

### Pricing table (seed-from-source, refresh on every load)
- **D-06:** `MODEL_PRICING` is a **code constant** seeded from the authoritative published Anthropic numbers (see Canonical References), and **re-written into `chrome.storage.local` on every extension (re)load** (e.g. `chrome.runtime.onInstalled` + `onStartup`, and/or SW startup — planner picks the hook). Code is the source of truth; storage is a refreshed materialized copy, so a code update to prices propagates on the next reload. This is the **opposite** of Phase 22's `SelectorRegistry` seed semantics: SelectorRegistry preserves stored/adapted values; pricing **overwrites** from the constant on load.
- **D-07:** Each trace stores the raw `cacheCreationTokens`/`cacheReadTokens` split (D-04) so `costUsd` can be **recomputed** against whatever prices are current — pairs with D-06's refresh-on-load (a price edit in the constant + reload re-prices future traces; the stored token split lets a Phase 25 tool recompute historical ones).
- **D-08:** An **unknown / unlisted model** → `costUsd` `0` plus an `unpriced` flag (don't silently emit a wrong number). Only two models are in use today (`claude-sonnet-4-6` detector, `claude-haiku-4-5-20251001` rederiver).

### FIFO cap (TRACE-03)
- **D-09:** Store traces as a newest-or-oldest-ordered array under a `chrome.storage.local` key (e.g. `llbTraces`); on each append, if length > 500, evict the oldest (FIFO) so exactly 500 remain after the 501st call. Read-modify-write on the array. (Mirrors the existing capped `storedPosts` array pattern, cap 200, in this codebase.)

### Claude's Discretion
- Exact storage key name(s) (`llbTraces`, `llbModelPricing`), the precise extension lifecycle hook(s) used to refresh pricing, and the FIFO implementation details (slice vs shift) are the planner's call.
- Multi-tab concurrency on the `llbTraces` read-modify-write is a known last-write-wins risk (same class as Phase 23's rate-limit latch) — acceptable; planner may add a best-effort mitigation but it is not required.
- The `systemPrompt` full-text choice (D-04) is a default I picked for literal TRACE-01 compliance over an earlier "store a short prompt version id" idea; if 500× duplication of the ~3 KB detector prompt becomes a storage concern, switching to a stable `systemPromptVersion` id is a clean follow-up.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` — Phase 24 goal + Success Criteria (and Phase 25, which consumes this phase's output)
- `.planning/REQUIREMENTS.md` — TRACE-01, TRACE-02, TRACE-03 (trace fields + FIFO cap)

### Interception & storage (existing code to extend)
- `src/background/index.ts` — `scorePost()` (~L97) and `rederiveSelector()` (Phase 23) are where the Anthropic `usage` object lives; trace recording is added here. Both fetch `api.anthropic.com/v1/messages`.
- `src/content/detector/llm.ts` — `LLMDetector` (content-side sender; unchanged, context only)
- `src/content/detector/rederiver.ts` — `LLMRederiver` (content-side sender; unchanged, context only)
- `src/shared/types.ts` — `StorageSchema` (add `llbTraces` + `TraceEntry` interface; optional `llbModelPricing`)
- `src/shared/storage.ts` — `storageGet`/`storageSet` typed wrappers (all storage I/O goes through these)
- `src/dashboard/dataManagement.ts` — existing capped-array + export patterns (analog for the FIFO cap; Phase 25 will reuse for export)

### Authoritative pricing (seed for MODEL_PRICING — priced as of 2026-06, via the `claude-api` skill reference)
| Model | Input $/MTok | Output $/MTok |
| --- | --- | --- |
| `claude-sonnet-4-6` (detector) | 3.00 | 15.00 |
| `claude-haiku-4-5-20251001` (rederiver) | 1.00 | 5.00 |
- Cache multipliers (apply to the input rate): **5-min cache write = 1.25×**, **cache read = 0.1×**.
- These numbers come from the Anthropic Models/Pricing reference. Re-verify against `https://platform.claude.com/docs/en/pricing.md` (via the `claude-api` skill / WebFetch) when updating the constant.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scorePost()` / `rederiveSelector()` in `src/background/index.ts`: both already `await response.json()`; they currently read `data.content[0].text` only — extend to also read `data.usage` (input/output/cache tokens) at the same point.
- `storageGet`/`storageSet` (`src/shared/storage.ts`): generic over `StorageSchema`, so adding `llbTraces` makes trace I/O type-safe.
- Capped-array pattern: `storedPosts` (cap 200) and the rate-limit keys (Phase 23) show the established "read array → mutate → cap → write" idiom in `chrome.storage.local`.

### Established Patterns
- **SW is the single LLM choke point** (Phase 23): both LLM call types funnel through two onMessage handlers — one trace-recording helper can serve both by passing `source`.
- **Seed-vs-storage** (Phase 22 `SelectorRegistry`): the model for "constant seeds storage." Phase 24 pricing uses a *refresh-on-load* variant (overwrite from constant), explicitly different from SelectorRegistry's *preserve-stored-values* semantics — call this out in the plan so it isn't copied wrong.

### Integration Points
- Trace write happens inside the existing `.then()/.catch()` (or try/catch) of the two SW handlers — success path records full tokens/cost; failure path records the `error` trace (D-03).
- `StorageSchema` in `src/shared/types.ts` is the typed contract every entry point shares — the new `TraceEntry` type and `llbTraces` key are added here once.

</code_context>

<specifics>
## Specific Ideas

- "I want it to refresh prices every time it loads" — pricing is re-seeded into storage from the bundled constant on extension (re)load, so code edits to prices take effect on reload (D-06).
- Store the cache-token split per trace so costs are recomputable against current prices (D-07) — the user explicitly chose the recompute-safe option.
- Cost must reflect the prompt-cache discount, not flat input pricing (D-05).

</specifics>

<deferred>
## Deferred Ideas

- **Export Traces button + `linkedin-blocker-traces-YYYY-MM-DD.json` download** → Phase 25 (TRACE-04).
- **`npm run trace-summary` cost-breakdown script + README `## LLM Cost Reference` section** → Phase 25 (TRACE-05/06). Phase 24 deliberately stores the raw cache-token split (D-07) so this script can produce an accurate, recomputable cost table.
- **Eval harness (precision/recall/F1/cost against a labeled dataset)** → Phase 26 (v9.0 milestone).
- **Hand-editable prices in storage** — negated by D-06 (refresh-on-load overwrites manual edits). If editable-prices-that-persist is ever wanted, that's a separate decision (revisit the refresh-on-load semantics).

</deferred>

---

*Phase: 24-trace-capture-storage*
*Context gathered: 2026-06-13*
