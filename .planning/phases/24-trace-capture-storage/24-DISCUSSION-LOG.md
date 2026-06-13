# Phase 24: Trace Capture & Storage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 24-trace-capture-storage
**Areas discussed:** Failed-call tracing, Pricing source, Cache-aware cost (Prompt storage depth deferred to default)

---

## Gray-area selection

Presented four areas; user selected three to discuss: **Failed-call tracing**, **Pricing source**, **Cache-aware cost**. **Prompt storage depth** was not selected → Claude default applied (store full `systemPrompt` per TRACE-01; `userPrompt` truncated to 500 — see CONTEXT D-04).

Framing carried forward from Phase 23: both LLM calls funnel through the service worker, which is the only place the Anthropic `usage` (token + cache breakdown) exists — so the SW is the interception point (stated, not asked).

---

## Failed-call tracing

| Option | Description | Selected |
|--------|-------------|----------|
| Successful only | Trace only calls that returned token usage; failures write nothing | |
| All attempts + error marker | Every attempt writes a trace; failures recorded with 0 tokens, costUsd 0, and an `error` field | ✓ |

**User's choice:** All attempts + error marker.
**Notes:** Accepts that non-cost rows mix into the store/export; Phase 25's summary can filter on `error == null`. → CONTEXT D-03.

---

## Pricing source

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded table, unknown→flag | MODEL_PRICING constant, unknown model → costUsd 0 + unpriced flag | (partial) |
| Hardcoded table, unknown→fallback price | Unknown model falls back to a default price | |
| Configurable via settings | Prices read from chrome.storage settings | (basis) |
| **Store cache token split too (recompute-safe)** | seed→storage + persist cacheRead/cacheCreation tokens per trace | ✓ |

**User's choice:** Option 3 (store cache token split, recompute-safe) **+ "refresh prices every time it loads / when the plugin is refreshed."**
**Notes:** No runtime Anthropic pricing API exists (Models API returns capabilities, not prices), so "reading Anthropic source" = seed the constant from the authoritative published numbers (pulled via the `claude-api` skill), then **re-write the table into chrome.storage on every extension (re)load** — code is the source of truth, storage is a refreshed copy. Unknown model → costUsd 0 + unpriced flag retained. → CONTEXT D-06, D-07, D-08.

---

## Cache-aware cost

| Option | Description | Selected |
|--------|-------------|----------|
| Cache-aware | costUsd from the 4-bucket usage (write 1.25×, read 0.1×) | ✓ |
| Flat input pricing | All input at full rate, ignore the cache discount | |

**User's choice:** Cache-aware (after asking "how would the code be aware of what is cached?").
**Notes:** Answered: the code does not track caching — the Anthropic response `usage` returns `cache_creation_input_tokens` / `cache_read_input_tokens` per call; the SW reads them directly. Flat pricing rejected because it overcharges the cached system prompt ~10× and would skew the Phase 25 README cost table. Authoritative numbers confirmed: Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5; cache write 1.25×, read 0.1× (priced 2026-06). → CONTEXT D-02, D-05.

---

## Claude's Discretion

- Exact storage key names, the precise extension lifecycle hook(s) for the pricing refresh, and FIFO implementation details.
- Multi-tab read-modify-write concurrency on `llbTraces` (last-write-wins acceptable).
- `systemPrompt` full-text vs `systemPromptVersion` id (defaulted to full text for TRACE-01 compliance; revisit only if storage bloat is a concern).

## Deferred Ideas

- Export Traces button + JSON download → Phase 25 (TRACE-04).
- `npm run trace-summary` cost script + README cost table → Phase 25 (TRACE-05/06).
- Eval harness → Phase 26.
- Hand-editable prices that persist in storage → negated by refresh-on-load; separate future decision if ever wanted.
