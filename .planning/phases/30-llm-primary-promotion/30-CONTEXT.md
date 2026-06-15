# Phase 30: LLM-Primary Promotion - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Promote the LLM to the **authoritative per-post classifier**. The heuristic takes on two new, distinct roles:
1. **Synchronous optimistic pre-pass** — runs instantly on DOM insertion to hide likely-bot posts *before* the LLM round-trip completes, so the user never sees a flash of bot content (LLM-03).
2. **Silent fallback** — scores posts with no user-visible error when there is no API key, the extension is offline, or the LLM call errors (LLM-01).

Add a **session-level scored-URN cache** so SPA navigation (`pushState`/`popstate` → `reinit()`) does not re-send already-scored posts to the LLM — cost dedup that survives reinit (LLM-02).

**Already built (do NOT re-implement):** `LLMDetector` with a heuristic fallback hook ([src/content/detector/llm.ts](../../../src/content/detector/llm.ts)), the background `SCORE_POST` → Anthropic flow ([src/background/index.ts](../../../src/background/index.ts)), `classifyPost` ([src/shared/classifier.ts](../../../src/shared/classifier.ts)), and the `detector = apiKey ? new LLMDetector(heuristic) : heuristic` selection ([src/content/index.ts:233-235](../../../src/content/index.ts#L233-L235)). Phase 30 adds the **cache**, the **optimistic pre-pass + reconciliation**, and the **trace/source semantics** around them.

**Out of scope:** runtime enforcement of `maxPostsPerSession` (Phase 31 — Cost Guardrail); threshold/weight tuning (Phase 32/33); changing the LLM model or prompt; new detection signals.

</domain>

<decisions>
## Implementation Decisions

### Optimistic Hide & Reconciliation (LLM-03)
- **D-01:** **The LLM is always authoritative; the heuristic's optimistic hide is provisional.** When the synchronous pre-pass hides a post, the LLM result reconciles it on return: if the merged LLM score clears the effective auto-hide threshold → **confirm** (inject tombstone, persist flagged account/stored post, count in stats); if it does not → **revert** (remove `.llb-hidden`, no persist, no stats count). A post the heuristic *missed* but the LLM flags is hidden on LLM return — a brief late-hide is acceptable, because criterion 3's no-flash guarantee only covers heuristic-flagged posts.

### Optimistic Pre-Pass Scope & Threshold (LLM-03)
- **D-02:** The optimistic pre-pass runs the **synchronous heuristic with NO comment expansion** (do not await `fetchComments`; comment fetching is async and would blow the ~10 ms budget). **Synchronous profile signals** (`extractProfileSignals`, already sync + cached at [content/index.ts:302-305](../../../src/content/index.ts#L302-L305)) ARE merged into the optimistic score, so the optimistic gate uses the same scoring basis as the authoritative merge ([:309-311](../../../src/content/index.ts#L309-L311)).
- **D-03:** The optimistic-hide gate fires at the **auto-hide threshold** (`detectionConfig.thresholds.autoHideDefault` = 60, plus the open-to-work penalty when applicable), **NOT** the flag threshold (35). **Intentional reinterpretation of success criterion 4**, which literally says "flag threshold": the user chose the auto-hide threshold to minimize hidden→visible flicker (posts scoring 35–59 that the LLM clears would otherwise flash hidden then revert). This honors criterion 4's *intent* (no flash of bot content) while avoiding flicker on borderline posts. **Verifier note:** treat criterion 4's "flag threshold" wording as satisfied by the auto-hide threshold gate — this is a deliberate decision, not a defect.

### Scored-URN Session Cache (LLM-02)
- **D-04:** Implement as a **module-scoped `Map<urn, DetectionResult>`** declared OUTSIDE `init()` so it survives `reinit()` and SPA navigation. The existing `popstate`/`pushState` reset handlers ([content/index.ts:240-259](../../../src/content/index.ts#L240-L259)) clear per-session caches (expansion budget, profile-signal cache, hidden nodes) — they **must NOT clear the scored-URN cache**. The cache is cleared only on a full page reload (a genuinely new browsing session).
- **D-05:** On re-observing a URN already in the cache, **skip the LLM call entirely** and re-apply the cached decision synchronously (re-hide if it was hidden). This is what prevents duplicate trace entries for the same URN within a session (criterion 3). Cache the **authoritative `DetectionResult`** (the merged outcome), not just a boolean marker, so the re-applied decision matches the original.
- **D-06:** The cache is **unbounded within a session** (URN strings + small result objects; a feed session rarely exceeds a few hundred unique posts). It is a *dedup* cache and is **separate from** Phase 31's `maxPostsPerSession` (= 50), which is a per-session **LLM spend** guardrail — do not conflate the two or use 50 as this cache's eviction bound.

### Stats & Trace Accounting (LLM-01)
- **D-07:** **Authoritative-only accounting.** `hiddenToday`/stats increment and exactly **one trace per URN** are written when the authoritative result returns (LLM, or heuristic fallback) — **never on the optimistic hide**. A reverted optimistic hide must leave stats and traces untouched (it was never counted). Keep the stats-increment at the confirmed-hide site ([:338](../../../src/content/index.ts#L338)).
- **D-08:** Traces from the LLM path carry `source: "detector"` (criterion 1); the silent-fallback path carries `engineUsed: "heuristic"`. The optimistic pre-pass itself emits no trace.

### Claude's Discretion
- Exact data structure / module location for the scored-URN cache (a top-level `const scoredUrnCache = new Map()` in content/index.ts vs a small dedicated module) — executor picks the cleanest placement consistent with D-04.
- How to thread the synchronous heuristic into the existing flow (e.g., a `detectSync()` path on `HeuristicDetector`, or calling the existing signal functions directly) — executor's choice, as long as it does not await comment expansion and reuses the existing signal pipeline.
- Precise reconciliation mechanics (revert via `classList.remove('llb-hidden')` + tombstone removal) — executor implements to satisfy D-01.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — LLM-01 (LLM primary + silent heuristic fallback), LLM-02 (session scored-URN cache surviving `reinit()`), LLM-03 (optimistic hide + confirm/revert).
- `.planning/ROADMAP.md` §"Phase 30: LLM-Primary Promotion" — goal + 4 success criteria (note D-03 reinterprets criterion 4's "flag threshold" as the auto-hide threshold).

### Code to modify
- `src/content/index.ts` — the scoring orchestration. Detector selection (L233-235), the per-post `startObserving` callback + async `detector.detect().then()` flow (L261-358), and the SPA reset handlers (L240-259) that must NOT clear the new cache. This is where the optimistic pre-pass, reconciliation, and cache wiring land.
- `src/content/detector/heuristic.ts` — `HeuristicDetector` (the `fetchComments` option); source of the synchronous pre-pass scoring path.
- `src/content/detector/llm.ts` — `LLMDetector` (authoritative path + existing fallback to heuristic on error).

### Code to be aware of (likely read-only)
- `src/background/index.ts` — `SCORE_POST` handler / Anthropic fetch; the authoritative LLM result origin.
- `src/shared/classifier.ts` — `classifyPost`; produces the LLM `DetectionResult`.
- `src/shared/traceStore.ts` — trace persistence; where `source`/`engineUsed` is recorded (criterion 1 wants `source: "detector"` for LLM).
- `src/shared/types.ts` — `Detector`, `DetectionResult`, `PostData` interfaces (the call site contract that never changes).
- `src/shared/detectionConfig.ts` (Phase 29) — `thresholds.flag` (35), `thresholds.autoHideDefault` (60), `thresholds.openToWorkPenalty` (20), `maxPostsPerSession` (50). The optimistic gate (D-03) reads `autoHideDefault`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LLMDetector` (detector/llm.ts) already implements the `Detector` interface with a constructor fallback — reuse as-is for the authoritative path; the optimistic pre-pass is additive, not a replacement.
- `extractProfileSignals` + `profileSignalCache` (content/index.ts:302-305) is already synchronous and per-author cached — directly usable in the optimistic pre-pass (D-02).
- The existing hide/tombstone/persist block (content/index.ts:337-354) is the "confirm" path for D-01; the revert is its inverse.

### Established Patterns
- Detection flows through the pluggable `Detector` interface; the call site (`detector.detect(postData).then(...)`) is the single scoring entry point — the optimistic pre-pass must wrap, not bypass, this contract.
- SPA navigation resets are centralized in the `popstate`/`pushState` handlers (content/index.ts:240-259); session-scoped state lives in module-level vars/maps. The scored-URN cache follows this module-level pattern but is deliberately exempt from the reset (D-04).
- `.llb-hidden { display: none !important }` class toggle is the only hide mechanism (per CLAUDE.md constraint — no `element.remove()`); both optimistic hide and revert use `classList`.

### Integration Points
- Optimistic pre-pass inserts between exclusion checks (content/index.ts:291-292) and the async `detector.detect()` (L307): run sync heuristic → if ≥ auto-hide threshold, add `.llb-hidden` now → then dispatch the LLM detect → reconcile in the `.then()`.
- Scored-URN cache wraps the `detector.detect()` dispatch: check cache before dispatch (skip LLM on hit), populate cache in the `.then()` with the authoritative result.

</code_context>

<specifics>
## Specific Ideas

- Zero flash-of-bot is the felt success measure for LLM-03 — the user explicitly traded a small amount of flicker risk away by choosing the auto-hide threshold (60) over the flag threshold (35) for the optimistic gate (D-03).
- "No duplicate trace entries for the same URN within a session" (criterion 3) is the concrete, testable definition of the cache working — verifiable in exported traces.

</specifics>

<deferred>
## Deferred Ideas

- **Runtime enforcement of `maxPostsPerSession`** — Phase 31 (Cost Guardrail). Phase 30's cache is dedup-only and does not cap LLM spend.
- **Persisting the scored-URN cache across full page reloads** (e.g., to `chrome.storage.session`) — not required by LLM-02 ("survives `reinit()`", i.e., within-session SPA nav only). Out of scope unless a later phase needs cross-reload dedup.
- **Tuning the optimistic gate threshold** — tied to Phase 32/33 threshold tuning; the gate reads `detectionConfig.thresholds.autoHideDefault`, so it tunes automatically with that value.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 30-llm-primary-promotion*
*Context gathered: 2026-06-15*
