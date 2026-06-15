# Phase 30: LLM-Primary Promotion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 30-llm-primary-promotion
**Areas discussed:** Area selection (no preference → Claude drove), Optimistic pre-pass threshold (user decision)

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic reconciliation | Revert/keep-hidden/late-hide policy when heuristic and LLM disagree | |
| Scored-URN cache design | Marker vs full result; lifetime/eviction | |
| Pre-pass scope & threshold | Sync heuristic, profile signals, which threshold | |
| Stats & trace accounting | Count/trace timing; source semantics | |

**User's choice:** "[No preference]" — deferred area selection to Claude.
**Notes:** Per discuss-phase philosophy (user = visionary, Claude = builder), Claude made grounded recommendations on all four areas and surfaced only the single decision with a genuine, user-facing UX tradeoff (the optimistic-hide threshold) for explicit choice.

---

## Optimistic Pre-Pass Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Flag threshold (35) | Literal reading of success criterion 4; maximum no-flash coverage but posts scoring 35–59 the LLM clears would flicker hidden→visible on revert | |
| Auto-hide threshold (60) | Optimistically hide only posts the heuristic would actually auto-hide; far fewer reverts/flicker; slight deviation from criterion 4's wording but arguably its intent | ✓ |
| You decide | Claude picks given the tradeoff and locked criterion | |

**User's choice:** Auto-hide threshold (60).
**Notes:** Deliberate reinterpretation of success criterion 4 ("flag threshold") in favor of its intent (no flash of bot content) while minimizing hidden→visible flicker on borderline posts. Captured as D-03 with an explicit verifier note so it is not treated as a defect.

---

## Claude-Recommended Decisions (locked, no objection raised)

These three areas were decided by Claude's recommendation after the user expressed no preference on area selection:

- **Optimistic reconciliation (→ D-01):** LLM always authoritative; optimistic hide is provisional; revert if LLM doesn't confirm at the auto-hide threshold; late-hide for heuristic-missed/LLM-flagged posts.
- **Scored-URN cache (→ D-04/D-05/D-06):** module-scoped `Map<urn, DetectionResult>` surviving `reinit()`/SPA nav (exempt from the popstate/pushState reset handlers), cleared only on full reload; cache hit skips the LLM and re-applies the cached decision; unbounded per session; separate from Phase 31's spend cap.
- **Stats & trace accounting (→ D-07/D-08):** authoritative-only — stats and exactly one trace per URN on the authoritative result; optimistic hides never counted/traced; LLM `source: "detector"`, fallback `engineUsed: "heuristic"`.

## Claude's Discretion

- Exact data structure / module location for the scored-URN cache.
- How to thread the synchronous heuristic into the existing flow (a `detectSync()` path vs calling signal functions directly), without awaiting comment expansion.
- Precise reconciliation mechanics for revert (classList + tombstone removal).

## Deferred Ideas

- Runtime enforcement of `maxPostsPerSession` — Phase 31 (Cost Guardrail).
- Persisting the scored-URN cache across full page reloads (`chrome.storage.session`) — not required by LLM-02.
- Tuning the optimistic gate threshold — Phase 32/33 (auto-tunes via `detectionConfig.thresholds.autoHideDefault`).
