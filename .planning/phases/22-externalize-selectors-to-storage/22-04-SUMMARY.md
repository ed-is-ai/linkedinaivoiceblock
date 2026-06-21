---
phase: 22
plan: 04
subsystem: dashboard-selector-health
tags: [dashboard, preact, selector-registry, reset-to-defaults, onchanged]
dependency_graph:
  requires:
    - SELECTOR-06 (reset-to-defaults escape hatch)
    - SELECTOR-07 (read-only health view)
    - SELECTOR-08 (cross-tab onChanged refresh)
    - Plan 22-02 (SelectorRegistry singleton + buildSeedRegistry)
  provides:
    - Read-only Selector Health panel in dashboard
    - Inline-confirm reset-to-defaults control
    - onChanged-driven live refresh of registry + session misses
  affects:
    - Phase 23 (self-healing surfaces health/staleness in this panel)
tech_stack:
  added: []
  patterns:
    - Props-fed Preact component (no direct storage access)
    - BatchBlockBar inline-confirm state machine (confirming/writing)
    - chrome.storage.onChanged listener with removeListener cleanup
key_files:
  created:
    - src/dashboard/SelectorView.tsx (read-only health table + source badge + session-miss states + inline reset)
  modified:
    - src/dashboard/index.tsx (selectorRegistry/sessionMisses state, get() extension, onChanged listener, handleResetSelectors, SelectorView placement)
decisions:
  - SelectorView is props-fed; dashboard App owns storage read, onChanged subscription, and reset handler
  - handleResetSelectors does NOT setSelectorRegistry directly — onChanged propagates the refresh (SELECTOR-08)
  - FEED_ESSENTIAL set hard-coded (FEED_CONTAINER, POST_CARD, POST_AUTHOR_LINK, POST_BODY_TEXT) per UI-SPEC note 5
metrics:
  completed_date: 2026-06-13
  tasks_completed: 3/3
  commits:
    - c96ec55: feat(22-04) create SelectorView.tsx read-only health panel + reset control
    - b768997: feat(22-04) wire SelectorView into dashboard with storage read + onChanged + reset handler
---

# Phase 22 Plan 04: Selector Health Dashboard Panel

## One-Liner

Add a read-only Selector Health panel and an inline-confirm reset-to-defaults control to the
dashboard, fed by `selectorRegistry` + `selectorSessionMisses` from `chrome.storage.local` and
refreshed live via `chrome.storage.onChanged`.

## Summary

**Task 1 — SelectorView.tsx (new component):**
- Default-exported Preact function component taking `{ registry, sessionMisses, onReset, error }`.
- Renders a card with a per-target health table (Target / Active selector / Source / Last matched),
  source badge (`seed` blue chip in Phase 22), and last-matched date (`—` when null).
- Session-miss styling per UI-SPEC: feed-essential misses render red with a left border and the
  heading reads "Selector Health (N stale)"; contextual misses render grey with a
  "(not seen this session)" annotation.
- Reset control reuses the BatchBlockBar inline-confirm state machine (`confirming` / `writing` /
  `resetError`): idle button → confirm strip ("Reset all selectors to bundled defaults?") →
  Cancel / Reset now, with "Resetting…" disabled state and a "Reset failed. Try again." error path.
- All styling via a local inline `JSX.CSSProperties` record; no CSS classes, no new dependencies.

**Task 2 — dashboard/index.tsx wiring:**
- Added `selectorRegistry` (`SelectorRegistrySchema | null`) and `sessionMisses` (`Set<SelectorTarget>`)
  state slices.
- Extended the existing `chrome.storage.local.get` key array with `selectorRegistry` and
  `selectorSessionMisses`; hydrates both on mount.
- Added a `chrome.storage.onChanged` (area `local`) listener that updates both slices, with a
  `removeListener` cleanup (SELECTOR-08).
- Added `handleResetSelectors()` calling `storageSet({ selectorRegistry: buildSeedRegistry() })` —
  intentionally does NOT call `setSelectorRegistry`; the onChanged listener propagates the refresh
  so the table updates immediately after reset (SELECTOR-06 / SELECTOR-08).
- Placed `<SelectorView />` between the feed-health metrics cards and the Data management card.

**Task 3 — Human verification (blocking gate):**
- User loaded the built extension, confirmed the Selector Health panel placement, source badges,
  last-matched values, session-miss styling, and that the inline-confirm reset updates the table
  immediately via onChanged with no console errors. **Approved 2026-06-13.**

## Verification

✓ `npm run type-check` — zero type errors
✓ `npm run build` — built clean
✓ Human-verify checkpoint approved (panel placement, badges, session-miss states, live reset refresh)

## Deviations from Plan

The component shipped to spec in commits c96ec55 / b768997. A subsequent enhancement (collapsible
card with a green/amber/red traffic-light health indicator and a recent-match staleness check)
extends the panel beyond the original UI-SPEC. That polish — together with the runtime match-tracking
that populates `lastMatchedAt` (full `updateCandidate` wiring in observer.ts) — is committed
separately as Phase 23 groundwork, since live health tracking is a Phase 23 concern, not part of the
22-04 contract.

## SELECTOR Requirements Met

✓ **SELECTOR-06:** Inline-confirm reset restores all entries to the seed via `buildSeedRegistry()`.
✓ **SELECTOR-07:** Read-only health view lists active selector, source badge, last-matched, and
  session-miss warnings split by criticality.
✓ **SELECTOR-08:** Dashboard refreshes from `chrome.storage.onChanged`; reset relies on the listener
  for immediate table update.

## Next Steps

- **Phase 23 — Self-Healing Selector Adapter:** detect selector breakage on a live feed and
  re-derive working candidates (structural heuristics → LLM fallback). The full `updateCandidate`
  match-tracking and the health-staleness UI committed alongside this plan feed that detection.
