---
phase: 34-manual-self-healing-trigger-from-dashboard
plan: "04"
subsystem: dashboard-ui
tags: [heal, dashboard, chrome-tabs, SelectorView, TRIGGER_HEAL, HEAL_BUSY]
dependency_graph:
  requires:
    - phase: 34-02
      provides: heal-messages-contract (TRIGGER_HEAL, HEAL_BUSY, HealOutcome, TriggerHealResponse)
    - phase: 34-03
      provides: content-script TRIGGER_HEAL listener + requestGuardedHeal + HEAL_BUSY response shape
  provides:
    - handleHeal (chrome.tabs.query + chrome.tabs.sendMessage round-trip with HEAL_BUSY special-casing)
    - feedTabOpen enablement state from chrome.tabs.query
    - SelectorView heal button + disabled hint + per-target healed/unchanged/failed result rows
  affects: [human-verification]
tech-stack:
  added: []
  patterns: [chrome-tabs-sendMessage-transport, enablement-gated-button, per-target-result-rows, inline-style-only]
key-files:
  created: []
  modified:
    - src/modules/dashboard/index.tsx
    - src/modules/dashboard/SelectorView.tsx
key-decisions:
  - "host_permissions (https://www.linkedin.com/*) suffice for url-scoped chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' }); 'tabs' permission NOT added to manifest"
  - "feedTabOpen re-checked on visibilitychange and window focus events so enablement reflects tabs opened after the dashboard loads"
  - "Row refresh stays driven by the existing chrome.storage.onChanged listener — no manual setSelectorRegistry added in handleHeal (confirmed in index.tsx)"
  - "handleHeal sender shape mirrors LLMRederiver.rederive: reject on chrome.runtime.lastError, falsy response, and response.error"
  - "HEAL_BUSY special-cased into a distinct 'Heal already running — try again in a moment' Error (not a generic error string, not an empty result)"
patterns-established:
  - "All SelectorView styling via inline style objects in the s map; zero className= selectors (CLAUDE.md #1)"
  - "Heal button async state machine cloned from the existing writing/resetError flow in the same component"
requirements-completed: [HEAL-01, HEAL-04]
duration: ~12min
completed: "2026-06-21"
---

# Phase 34 Plan 04: Dashboard Heal Button + Transport Summary

**Enablement-gated "Heal selectors now" button wired via chrome.tabs.sendMessage to the content script, with HEAL_BUSY special-casing and per-target healed/unchanged/failed result rows rendered as inline-style-only Preact JSX**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-21T00:05:00Z
- **Completed:** 2026-06-21T00:17:00Z
- **Tasks:** 2 auto + 1 checkpoint
- **Files modified:** 2

## Accomplishments

- `handleHeal` in `index.tsx` queries `chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' })` for both enablement detection and message targeting, sends `chrome.tabs.sendMessage(tabId, { type: TRIGGER_HEAL })`, and returns `HealOutcome[]`
- `HEAL_BUSY` sentinel detected from `response.error` and surfaced as a distinct "Heal already running — try again in a moment" Error (not a generic error message, not an empty result)
- `feedTabOpen` state re-checked on `visibilitychange` and `window focus` events so the button enables when the user opens LinkedIn after the dashboard is already loaded
- `SelectorView` heal button: `disabled={!feedTabOpen || healing}`, swaps to `healBtnDisabled` inline style, shows "Open LinkedIn to heal" hint when `!feedTabOpen`, label reads "Healing…" during in-flight request
- Per-target result rows rendered with color tokens: `healed` → `#10b981`, `failed` → `#dc2626`, `unchanged` → `#9ca3af`; all styles in the `s` map, zero `className=` (CLAUDE.md constraint 1)
- Manifest unchanged: `host_permissions` (`https://www.linkedin.com/*`) suffices for the url-scoped `chrome.tabs.query`; the broad `"tabs"` permission was NOT added (T-34-11 mitigation confirmed)
- Row refresh confirmed to require no manual `setSelectorRegistry` — the existing `chrome.storage.onChanged` listener in `index.tsx` already covers `selectorRegistry` key changes written by `insertCandidate` → `storageSet` (D-06 confirmed satisfied)

## Task Commits

1. **Task 1: Dashboard transport — feedTabOpen enablement + handleHeal round-trip** - `c0750c0` (feat)
2. **Task 2: SelectorView heal button + disabled hint + per-target result rows** - `31c43d3` (feat)
3. **Task 3: Human verification (checkpoint)** — awaiting human confirm

## Files Created/Modified

- `src/modules/dashboard/index.tsx` — added `feedTabOpen` state + visibilitychange/focus effect; `handleHeal` with HEAL_BUSY special-case; `onHeal` and `feedTabOpen` props on `<SelectorView>`
- `src/modules/dashboard/SelectorView.tsx` — extended props with `onHeal` / `feedTabOpen`; `HealOutcome` import; `healing`/`healError`/`healResults` state machine; heal button; per-target result rows; new keys in `s` map

## Decisions Made

- **Manifest permission path:** `host_permissions` alone suffices for `chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' })`; did NOT add `"tabs"` to `permissions`. This satisfies T-34-11 (minimize over-broad tab access).
- **Re-query on focus:** Used `visibilitychange` + `window focus` events (not polling) to update `feedTabOpen` when the user navigates away and opens LinkedIn after the dashboard is already loaded.
- **HEAL_BUSY sentinel:** `response.error === HEAL_BUSY` throws `new Error('Heal already running — try again in a moment')` — a semantically distinct rejection path that `handleHeal` in `SelectorView` surfaces verbatim in `healError`.
- **Row refresh is automatic:** Confirmed the existing `chrome.storage.onChanged` listener in `index.tsx` re-sets `selectorRegistry` state when `insertCandidate` writes fire, so no manual reload is needed inside `handleHeal`.

## Deviations from Plan

None — plan executed exactly as written. Both acceptance criteria sets pass:
- `index.tsx` imports from shared module only; no inline string literals; `handleHeal` correctly rejects on all three error paths; HEAL_BUSY special-cased; `onHeal`+`feedTabOpen` passed to `<SelectorView>`.
- `SelectorView.tsx` has correct prop types; `disabled={!feedTabOpen || healing}` binding confirmed; result rows use exact color tokens from plan; `HealOutcome` imported from shared module; no `className=` added.

## Known Stubs

None. No placeholder data or stub values introduced.

## Threat Flags

None. Both STRIDE mitigations verified:
- T-34-10: `chrome.tabs.query` is url-scoped to `https://www.linkedin.com/feed/*`; `sendMessage` targets only that tab id.
- T-34-11: broad `"tabs"` permission NOT added; `host_permissions` path confirmed sufficient and documented.
- T-34-12: Dashboard never writes selectors directly; it only sends `TRIGGER_HEAL` to the content pipeline which gates writes behind `validateCandidate`/`insertCandidate`.

## Self-Check: PASSED

- src/modules/dashboard/index.tsx: FOUND — imports TRIGGER_HEAL/HEAL_BUSY/HealOutcome/TriggerHealResponse; feedTabOpen state + effect present; handleHeal with chrome.tabs.sendMessage; onHeal+feedTabOpen passed to SelectorView
- src/modules/dashboard/SelectorView.tsx: FOUND — onHeal/feedTabOpen in props; HealOutcome imported; healing/healError/healResults state; heal button with disabled binding; per-target result rows with color tokens; all styles in s map
- src/manifest.json: UNCHANGED — "tabs" not added to permissions
- Commit c0750c0: Task 1 (index.tsx)
- Commit 31c43d3: Task 2 (SelectorView.tsx)
- npm run type-check: 0 errors
- npm test: 440/440 passed
- npm run build: green

## Next Phase Readiness

- Human verification (Task 3 checkpoint) awaiting operator confirmation on a live feed tab
- Once approved, Phase 34 is complete
