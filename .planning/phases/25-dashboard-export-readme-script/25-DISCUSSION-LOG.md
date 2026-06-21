# Phase 25: Dashboard Export + README Script - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 25-dashboard-export-readme-script
**Areas discussed:** Cost source, Trace export shape, Error traces (README handling deferred to Claude default)

---

## Gray-area selection

Presented four areas; user selected three: **Cost source**, **Trace export shape**, **Error traces**. **README handling** not selected → Claude default applied (create README.md if missing; idempotently replace only the `## LLM Cost Reference` section; scaffold minimal title + one-liner — CONTEXT D-06).

Carry-forward stated (not asked): export reuses `triggerDownload` + the `dataManagement.ts` builder pattern; scripts live in `scripts/` as ESM; Phase 24 stored the raw token split (D-07) for recompute. TRACE-05 table columns are locked by the requirement.

---

## Cost source

| Option | Description | Selected |
|--------|-------------|----------|
| Recompute from token split × current prices | Reuse computeCostUsd × current MODEL_PRICING; README reflects today's rates | ✓ |
| Sum stored costUsd | Total capture-time costUsd; simplest but mixes pricing eras | |
| Recompute + show captured total | Recompute for table, print captured sum as a drift check | |

**User's choice:** Recompute from token split × current prices.
**Notes:** Script reuses the extension's own `computeCostUsd` (imported from src/shared/pricing.ts) — single cost formula in the codebase; map TraceEntry's camelCase split back to the Anthropic usage shape. → CONTEXT D-01, D-01a.

---

## Trace export shape

| Option | Description | Selected |
|--------|-------------|----------|
| Envelope {exportedAt, traces} | Wrapped, matches buildJsonExport convention; script imports current code prices | ✓ |
| Envelope + embedded pricing snapshot | Self-contained/portable; recompute uses frozen export prices | |
| Raw TraceEntry[] array | Smallest; no metadata headroom | |

**User's choice:** Envelope `{exportedAt, traces}`.
**Notes:** No embedded pricing — pairs with the recompute-with-current-prices decision. Add `buildTracesExport` to dataManagement.ts; reuse triggerDownload; add an "Export Traces" button. → CONTEXT D-02, D-02a.

---

## Error traces in the cost table

| Option | Description | Selected |
|--------|-------------|----------|
| Successful in cost columns + separate failed count | Real spend in token/USD columns; failures shown separately; avg over successful | ✓ |
| Count all attempts in call count | call count incl. failures; avg USD/call diluted | |
| Exclude error traces entirely | Cleanest table; loses failure visibility | |

**User's choice:** Successful in cost columns + separate failed count.
**Notes:** Phase 24 traces every attempt; failures have an `error` field, 0 tokens/cost. → CONTEXT D-03.

---

## Claude's Discretion
- Script runtime defaulted to TypeScript via `tsx` (so it can import the shared cost module) — CONTEXT D-04.
- README create-if-missing + section-replace — CONTEXT D-06.
- stdout rendering (markdown vs aligned), failed-as-column-vs-footnote, totals/summary lines, tsx version pin.

## Deferred Ideas
- Eval runner → Phase 26 (consumes the detection/posts export + labels, not the trace export).
- Embedded pricing snapshot in the export → rejected (recompute-with-current-prices chosen).
- Summing stored costUsd → rejected (mixes pricing eras).
