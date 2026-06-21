---
phase: 34-manual-self-healing-trigger-from-dashboard
plan: "04"
subsystem: dashboard
tags: [heal, dashboard, chrome-tabs, preact, message-transport, outcome-semantics]
dependency_graph:
  requires:
    - phase: 34-02
      provides: heal-messages-contract (TRIGGER_HEAL, HEAL_BUSY, HealOutcome, TriggerHealResponse)
    - phase: 34-03
      provides: content-script TRIGGER_HEAL listener + requestGuardedHeal + HEAL_BUSY response shape
  provides:
    - handleHeal (chrome.tabs.query + chrome.tabs.sendMessage round-trip with HEAL_BUSY special-casing)
    - feedTabOpen enablement state from chrome.tabs.query
    - SelectorView heal button + disabled hint + per-target healed/unchanged/failed/rate-limited/not-found result rows
    - not-found outcome variant (neutral grey — LLM ran but element not on page)
  affects: []
tech-stack:
  added: []
  patterns: [chrome-tabs-sendMessage-transport, enablement-gated-button, per-target-result-rows, inline-style-only, outcome-semantic-softening, manual-flag-threading]
key-files:
  created: []
  modified:
    - src/modules/dashboard/index.tsx
    - src/modules/dashboard/SelectorView.tsx
    - src/shared/heal-messages.ts
    - src/tools/library/dom-selector-rederive/heal.ts
    - src/tools/library/dom-selector-rederive/heal.test.ts
    - src/content/observer.ts
    - src/content/index.ts
    - src/tools/library/dom-selector-rederive/rederiver.ts
    - src/background/index.ts
key-decisions:
  - "host_permissions (https://www.linkedin.com/*) suffice for url-scoped chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' }); 'tabs' permission NOT added to manifest"
  - "Manual heal cool-off exemption: requestGuardedHeal + background handler accept manual=true; manual calls bypass the 5-min cool-off; daily cap (5/day) and single-flight latch are unchanged"
  - "'not-found' vs 'failed' outcome: LLM ran but no candidate matched live DOM -> 'not-found' (grey/neutral); API/pipeline exception -> 'failed' (red); card-path heuristic failure (POST_CARD/POST_BODY_TEXT) stays 'failed'"
  - "Row refresh is automatic: existing chrome.storage.onChanged listener in index.tsx already covers selectorRegistry key changes; no manual setSelectorRegistry added in handleHeal"
patterns-established:
  - "All SelectorView styling via inline style objects in the s map; zero className= selectors (CLAUDE.md #1)"
  - "Heal button async state machine cloned from the existing writing/resetError flow in the same component"
  - "Outcome softening: distinguish pipeline-failure (exception thrown) from element-absent (LLM ran, no DOM match) with a separate neutral result variant"
  - "Manual flag threading: pass manual=true through the full call chain for per-invocation cool-off policy override"
requirements-completed: [HEAL-01, HEAL-04]
duration: ~35min (2 planned tasks + Task 3 human-verify + 4 post-Task-2 fix commits)
completed: "2026-06-21"
---

# Phase 34 Plan 04: Dashboard Heal Button + Transport Summary

**Enablement-gated "Heal selectors now" button wired via chrome.tabs.sendMessage, with HEAL_BUSY special-casing, manual cool-off exemption, per-target healed/unchanged/failed/rate-limited/not-found result rows, and live-verification-driven fixes to the LLM rederive pipeline**

## Performance

- **Duration:** ~35 min (including live verification + 4 post-Task-2 fix commits)
- **Started:** 2026-06-21T00:05:00Z
- **Completed:** 2026-06-21T01:20:00Z
- **Tasks:** 3 (Tasks 1-2 auto; Task 3 human-verify resolved by human approval)
- **Files modified:** 9

## Accomplishments

- `handleHeal` in `index.tsx` queries `chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' })` for both enablement detection and message targeting, sends `chrome.tabs.sendMessage(tabId, { type: TRIGGER_HEAL })`, and returns `HealOutcome[]`
- `HEAL_BUSY` sentinel detected from `response.error` and surfaced as a distinct "Heal already running — try again in a moment" Error (not a generic error, not an empty result)
- `feedTabOpen` state re-checked on `visibilitychange` and `window focus` events so the button enables when the user opens LinkedIn after the dashboard is already loaded
- `SelectorView` heal button with `disabled={!feedTabOpen || healing}`, disabled inline style, "Open LinkedIn to heal" hint, and per-target result rows with 5 result variants: healed (green), unchanged (grey), failed (red), rate-limited (amber), not-found (grey "not on page")
- Live verification confirmed: healing runs against the LinkedIn feed tab, selectors heal/remain unchanged, per-target reasons surface, cool-off exemption works, whitespace stop_sequences bug fixed
- Rows refresh automatically via the existing `chrome.storage.onChanged` listener — no manual reload added

## Task Commits

1. **Task 1: Dashboard transport — feedTabOpen enablement + handleHeal round-trip** - `c0750c0` (feat)
2. **Task 2: SelectorView heal button + disabled hint + per-target result rows** - `31c43d3` (feat)
3. **Fix: surface real connection error + reload hint** - `9e1a2c9` (fix)
4. **Fix: drop invalid whitespace-only stop_sequences (Anthropic API 400)** - `290e9dc` (fix)
5. **Fix: manual cool-off exemption + per-target reasons** - `3807d9d` (fix)
6. **Feat: soften absent-element heal outcome to 'not-found'** - `d2bf8ed` (feat)
7. **Task 3: Human verification** — approved live, no code commit

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/modules/dashboard/index.tsx` — `feedTabOpen` state + visibilitychange/focus effect; `handleHeal` with HEAL_BUSY special-case; `onHeal` and `feedTabOpen` props on `<SelectorView>`
- `src/modules/dashboard/SelectorView.tsx` — extended props with `onHeal`/`feedTabOpen`; `HealOutcome` import; `healing`/`healError`/`healResults` state machine; heal button; per-target result rows with 5 variants including `notFoundBadge` and "not on page" label; all styles in `s` map
- `src/shared/heal-messages.ts` — `HealResult` union extended with `'not-found'`; doc comment explaining neutral semantics
- `src/tools/library/dom-selector-rederive/heal.ts` — sub-element "candidates-but-none-validated" branch changed to `'not-found'`/`'not found on current page'`; `manual` flag threaded to `LLMRederiver.rederive`; per-target reasons populated on all non-healed paths
- `src/tools/library/dom-selector-rederive/heal.test.ts` — all-candidates-fail assertions updated to `'not-found'`; manual-flag threading + rate-limited + thrown-error tests added; thrown-error path still expects `'failed'`; card-path failure tests unchanged
- `src/content/observer.ts` — `requestGuardedHeal` accepts `manual` flag; manual=true skips 5-min cool-off (daily cap + single-flight retained)
- `src/content/index.ts` — TRIGGER_HEAL listener passes `manual: true` to `requestGuardedHeal`; per-target reasons preserved in response envelope
- `src/tools/library/dom-selector-rederive/rederiver.ts` — `rederive()` accepts `manual` param, forwards to background rederive message; filters whitespace-only `stop_sequences` entries before API call
- `src/background/index.ts` — background rederive handler reads `manual` from message; skips 5-min cool-off when `manual=true`; filters whitespace-only `stop_sequences`

## Decisions Made

- **Manifest permission path:** `host_permissions` alone suffices for url-scoped `chrome.tabs.query`; `"tabs"` NOT added to `permissions`. Satisfies T-34-11 (minimize over-broad tab access).
- **Manual heal cool-off exemption:** `manual=true` bypasses the 5-min cool-off throughout the full call chain; daily cap (5/day) and single-flight latch are unchanged. Without this, all-but-the-first sub-element target within a single click would hit cool-off and return `'unchanged'` silently. User explicitly approved.
- **'not-found' vs 'failed' semantics:** LLM ran but no candidate matched the live DOM → `'not-found'` (grey "not on page" badge). API/pipeline exception → `'failed'` (red badge). Card-path heuristic failure (POST_CARD/POST_BODY_TEXT) stays `'failed'` — a missing card IS a real failure. User locked this decision.
- **Row refresh is automatic:** Existing `chrome.storage.onChanged` listener in `index.tsx` already covers `selectorRegistry` key; no manual reload needed in `handleHeal` (D-06 confirmed).

## Deviations / Fixes During Live Verification

Live verification (Task 3) exercised the LLM-rederive call chain for the first time in a real environment (34-02 only used mocks), exposing four issues requiring post-Task-2 fix commits. These fixes touch files beyond 34-04's declared `files_modified` — a legitimate cross-cutting bug fix discovered at the integration checkpoint.

### Post-Task-2 Fixes

**1. [Rule 3 - Blocking] Surface real connection error + reload hint (9e1a2c9)**
- **Found during:** Task 3 live verification
- **Issue:** When the content script was not yet injected in the feed tab, the dashboard showed a generic/unhelpful error; `chrome.runtime.lastError.message` was swallowed.
- **Fix:** `handleHeal` captures and surfaces `chrome.runtime.lastError.message`; added a "try reloading the LinkedIn tab" hint in the error display.
- **Files modified:** `src/modules/dashboard/index.tsx`, `src/modules/dashboard/SelectorView.tsx`

**2. [Rule 1 - Bug] Drop whitespace-only stop_sequences causing unconditional Anthropic API 400 (290e9dc)**
- **Found during:** Task 3 live verification — LLM rederive calls all returned HTTP 400
- **Issue:** Latent Phase-23 bug: `stop_sequences` was set to `['\n\n\n']`. The Anthropic API rejects whitespace-only stop sequences unconditionally — every LLM heal attempt failed before reaching the model.
- **Fix:** Filter out whitespace-only entries from `stop_sequences` in `rederiver.ts` and background handler before the API call.
- **Files modified:** `src/tools/library/dom-selector-rederive/rederiver.ts`, `src/background/index.ts`

**3. [Rule 2 - Missing Critical] Manual cool-off exemption + per-target reasons (3807d9d)**
- **Found during:** Task 3 live verification — only the first sub-element target healed; remaining 5 showed `'unchanged'` with no explanation
- **Issue (a):** The 5-min cool-off in `requestGuardedHeal`/background blocked all subsequent sub-element rederive calls within a single manual click (6 sequential calls, only the first bypassed cool-off).
- **Issue (b):** Per-target `reason` fields were not returned from the content listener, making `'failed'` and `'rate-limited'` outcomes opaque to the user.
- **Fix:** Threaded `manual=true` flag through the full call chain (dashboard → content → observer → triggerHeal → LLMRederiver → background); `manual=true` skips the 5-min cool-off. Per-target `reason` preserved in the response envelope.
- **Files modified:** `src/modules/dashboard/index.tsx`, `src/content/index.ts`, `src/content/observer.ts`, `src/tools/library/dom-selector-rederive/heal.ts`, `src/tools/library/dom-selector-rederive/rederiver.ts`, `src/background/index.ts`

**4. [User Decision] Soften absent-element outcome from red 'failed' to neutral 'not-found' (d2bf8ed)**
- **Found during:** Task 3 live verification — COMMENT_TEXT and CONNECTION_DEGREE showed red 'failed' when those elements were simply not visible on the current feed (comments collapsed, no graded-connection badges visible)
- **Issue:** Red 'failed' implied pipeline failure, but the LLM ran successfully and returned candidates — the element just wasn't rendered on the current page. Expected behavior, not a failure.
- **Fix:** Added `'not-found'` to `HealResult` union; sub-element "candidates-but-none-validated" branch pushes `'not-found'`/`'not found on current page'`; dashboard renders grey "not on page" badge. Red `'failed'` reserved for thrown errors. Tests updated.
- **Files modified:** `src/shared/heal-messages.ts`, `src/tools/library/dom-selector-rederive/heal.ts`, `src/tools/library/dom-selector-rederive/heal.test.ts`, `src/modules/dashboard/SelectorView.tsx`

---

**Total deviations:** 4 post-Task-2 fixes (1 blocking error-surface, 1 latent Phase-23 API bug, 1 missing cool-off exemption + reasons, 1 user-approved outcome softening)
**Impact on plan:** All fixes necessary for correctness and usability. No scope creep beyond the LLM-rederive integration surface that 34-04 was the first to exercise live. Plan goals fully met.

## Issues Encountered

- Phase-23 latent bug: `stop_sequences: ['\n\n\n']` caused unconditional Anthropic 400 on every heal call. Fixed by filtering whitespace-only entries (commit 290e9dc).
- Single-flight cool-off semantics mismatch: the per-request cool-off was designed for auto-heal (rate-limit protection), but a manual one-click action triggering 6 sequential calls hit the cool-off after the first. Resolved by `manual=true` cool-off exemption (commit 3807d9d).

## User Setup Required

None — no external service configuration required. Anthropic API key configured via dashboard Settings panel (Phase 23).

## Next Phase Readiness

- Phase 34 is complete. All 4 plans executed; manual heal button fully functional end-to-end on a live LinkedIn feed tab.
- The `'not-found'` outcome variant and `manual=true` cool-off exemption are documented in `heal-messages.ts` and `heal.ts` for future maintainers.
- No blockers. v10.0 milestone is ready for verification.

## Known Stubs

None. All result variants (healed/unchanged/failed/rate-limited/not-found) are wired to real pipeline outcomes.

## Threat Flags

None. Both STRIDE mitigations verified:
- T-34-10: `chrome.tabs.query` scoped to `https://www.linkedin.com/feed/*`; `sendMessage` targets only that tab id.
- T-34-11: broad `"tabs"` permission NOT added; `host_permissions` path confirmed sufficient.
- T-34-12: dashboard never writes selectors directly; only triggers the content pipeline gated behind `validateCandidate`/`insertCandidate`.

## Self-Check: PASSED

- `src/modules/dashboard/index.tsx`: FOUND — imports TRIGGER_HEAL/HEAL_BUSY/HealOutcome/TriggerHealResponse; feedTabOpen state + effect present; handleHeal with chrome.tabs.sendMessage + HEAL_BUSY special-case; onHeal+feedTabOpen passed to SelectorView
- `src/modules/dashboard/SelectorView.tsx`: FOUND — onHeal/feedTabOpen in props; HealOutcome imported; 5-variant result rows with notFoundBadge + "not on page" label; all styles in s map; no className= introduced
- `src/shared/heal-messages.ts`: FOUND — HealResult includes 'not-found'; doc comment present
- `src/tools/library/dom-selector-rederive/heal.ts`: FOUND — sub-element not-healed branch pushes 'not-found'; catch block still pushes 'failed'/'rate-limited'; card-path 'failed' unchanged
- `src/tools/library/dom-selector-rederive/heal.test.ts`: FOUND — all-candidates-fail tests expect 'not-found' with 'not found on current page'; thrown-error test expects 'failed'
- `src/manifest.json`: UNCHANGED — "tabs" not added to permissions
- Commit c0750c0: Task 1 (index.tsx)
- Commit 31c43d3: Task 2 (SelectorView.tsx)
- Commit 9e1a2c9: fix connection error surface
- Commit 290e9dc: fix whitespace stop_sequences
- Commit 3807d9d: manual cool-off exemption + per-target reasons
- Commit d2bf8ed: soften 'not-found' outcome
- npm test: 450/450 passed
- npm run build: green

---
*Phase: 34-manual-self-healing-trigger-from-dashboard*
*Completed: 2026-06-21*
