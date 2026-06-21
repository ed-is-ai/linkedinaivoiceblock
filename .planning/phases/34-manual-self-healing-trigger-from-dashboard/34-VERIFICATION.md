---
phase: 34-manual-self-healing-trigger-from-dashboard
verified: 2026-06-21T01:55:00Z
status: passed
score: 6/6
overrides_applied: 0
---

# Phase 34: Manual Self-Healing Trigger from Dashboard — Verification Report

**Phase Goal:** The user can trigger selector self-healing on demand from the dashboard's Selector Health section — the button heals all stale selectors against a live LinkedIn feed tab and reports a per-selector outcome — reusing the existing validate-before-write heal pipeline with no new selector-write surface.
**Verified:** 2026-06-21T01:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Selector Health shows a "Heal selectors now" button; enabled only when a LinkedIn feed tab is open, otherwise disabled with a hint. | VERIFIED | `SelectorView.tsx` lines 587-606: button has `disabled={!feedTabOpen \|\| healing}`, two style branches (`s.healBtn` / `s.healBtnDisabled`), and renders `<div style={s.healHint}>Open LinkedIn to heal</div>` when `!feedTabOpen`. `feedTabOpen` state in `index.tsx` is driven by `chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' })` and refreshed on `visibilitychange` and `window focus` events. |
| 2 | Clicking (with feed tab open) runs the heal pipeline against that tab's live DOM via a TRIGGER_HEAL message to the content script — never from the dashboard's own DOM. | VERIFIED | `index.tsx` `handleHeal()` (lines 139-176): queries for the feed tab, then calls `chrome.tabs.sendMessage(tab.id!, { type: TRIGGER_HEAL })`. Content script `index.ts` listener (lines 199-230) fires only on `TRIGGER_HEAL`, resolves `liveFeedContainer()` fresh at receive time, and delegates to `requestGuardedHeal(container, true)`. The dashboard's own DOM is never touched. |
| 3 | The heal covers all currently-stale selectors (not only POST_CARD): card targets via heuristic deriver, sub-element targets via LLM fallback when an API key is configured; non-healable targets (e.g. COMPANY_PAGE_MARKER, POST_URN_ATTR) excluded. | VERIFIED | `heal.ts` defines `CARD_TARGETS = ['POST_CARD', 'POST_BODY_TEXT']` (heuristic path) and `SUB_ELEMENT_TARGETS = ['SPONSORED_MARKER', 'AUTHOR_HEADLINE', 'CONNECTION_DEGREE', 'COMMENT_EXPAND_BUTTON', 'COMMENT_TEXT', 'OPEN_TO_WORK_MARKER']` (LLM path). Code comment explicitly names POST_URN_ATTR and COMPANY_PAGE_MARKER as excluded (not querySelector inputs). Staleness is computed live via `isStale(target, container)` using `resolve(target)`. |
| 4 | The dashboard shows a per-selector result (healed / unchanged / failed / rate-limited / not-found) and Selector Health rows refresh to reflect any new active selector. | VERIFIED | `SelectorView.tsx` builds `healByTarget = new Map<SelectorTarget, HealOutcome>` from `healResults`, renders inline Heal column per row with `healBadge()` returning one of 5 badge styles (healedBadge / unchangedBadge / failedBadge / rateLimitedBadge / notFoundBadge). `index.tsx` `chrome.storage.onChanged` listener (lines 109-120) refreshes `selectorRegistry` state automatically when the heal pipeline writes new candidates. |
| 5 | No selector string is written except through SelectorRegistry.insertCandidate after validateCandidate passes (ADAPT-06 preserved); the manual trigger respects the existing single-flight guard; the 5-min cool-off is intentionally exempted for MANUAL heals; daily cap (5/day) enforced for all heals. | VERIFIED | `heal.ts`: all writes go through `validateCandidate(candidate, container)` then `insertCandidate(target, candidate, source)` — no other write surface exists. `observer.ts` line 231: `if (_healInProgress \|\| (!manual && Date.now() - _lastHealMs < HEAL_COOLOFF_MS))` — single-flight latch always blocks concurrent heals; cool-off gated behind `!manual`. `background/index.ts` `checkRateLimit(manual)` line 157: `if (!manual)` gates the 5-min check; daily cap check at line 167 is unconditional. User explicitly approved this exemption. |
| 6 | Dead selectors POST_AUTHOR_NAME and POST_URN_ATTR_FALLBACK removed from selectors.ts, selector-registry.ts (SEED_MAP/imports), and the SelectorTarget union in types.ts; tests + type-check green. | VERIFIED | `grep -r "POST_AUTHOR_NAME\|POST_URN_ATTR_FALLBACK" src/` returns zero matches. `types.ts` SelectorTarget union (lines 341-355) has 14 members — neither dead selector present. `selectors.ts` has no such exports. `selector-registry.ts` SEED_MAP (lines 59-74) has 14 entries matching the trimmed union exactly. 450/450 tests pass. |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/modules/dashboard/SelectorView.tsx` | Heal button, feedTabOpen prop, per-target result rows, 5 outcome badge styles | VERIFIED | Lines 6-12: `onHeal`, `feedTabOpen` props declared. Lines 281-315: `healedBadge`, `unchangedBadge`, `failedBadge`, `rateLimitedBadge`, `notFoundBadge` in `s` map. Lines 451-468: `healByTarget` index + `healBadge()` mapper. Lines 587-606: button + hint + result rows. All styling via inline `s` map — no className= introduced. |
| `src/modules/dashboard/index.tsx` | feedTabOpen state, visibilitychange/focus re-check, handleHeal with TRIGGER_HEAL + HEAL_BUSY special-case | VERIFIED | Lines 88-137: `feedTabOpen` state + effects. Lines 139-176: `handleHeal` with HEAL_BUSY detection at line 166, chrome.runtime.lastError surfacing at lines 147-158. Lines 308-315: `onHeal={handleHeal}` and `feedTabOpen={feedTabOpen}` passed to SelectorView. |
| `src/shared/heal-messages.ts` | TRIGGER_HEAL, HEAL_BUSY, HealResult union including 'not-found', HealOutcome, TriggerHealResponse | VERIFIED | Line 25: `TRIGGER_HEAL`. Line 32: `HEAL_BUSY = 'busy'`. Line 35: `HealResult = 'healed' \| 'unchanged' \| 'failed' \| 'rate-limited' \| 'not-found'`. Lines 53-58: `HealOutcome` with optional `reason`. Line 71: `TriggerHealResponse`. |
| `src/tools/library/dom-selector-rederive/heal.ts` | Generalized triggerHeal, CARD_TARGETS, SUB_ELEMENT_TARGETS, not-found outcome, manual flag, no stop_sequences | VERIFIED | Lines 57-74: CARD_TARGETS and SUB_ELEMENT_TARGETS. Line 142: `triggerHeal(container, manual = false)`. Lines 213-215: not-found pushed when LLM ran but no candidate validated. Lines 218-225: 'rate-limited' vs 'failed' distinction. No stop_sequences anywhere in the file. |
| `src/content/observer.ts` | requestGuardedHeal exported, manual param, cool-off gated behind !manual, single-flight always | VERIFIED | Lines 228-241: `requestGuardedHeal(container, manual = false)`. Line 231: single-flight always blocks; cool-off conditional on `!manual`. Line 237: `triggerHeal(container, manual)` — manual flag forwarded. |
| `src/content/index.ts` | TRIGGER_HEAL listener, passes manual: true to requestGuardedHeal | VERIFIED | Lines 199-230: listener handles TRIGGER_HEAL, resolves liveFeedContainer(), calls `requestGuardedHeal(container, true)` — hardcoded `true` for manual. |
| `src/tools/library/dom-selector-rederive/rederiver.ts` | rederive(target, domSkeleton, manual), forwards manual to background message | VERIFIED | Line 33: `rederive(target: string, domSkeleton: string, manual = false)`. Line 36: `{ type: 'REDERIVE_SELECTOR', target, domSkeleton, manual }` in sendMessage. No stop_sequences in this file. |
| `src/background/index.ts` | checkRateLimit(manual), cool-off gated behind !manual, daily cap always enforced | VERIFIED | Line 132: `checkRateLimit(manual = false)`. Line 157: `if (!manual)` gates the 5-min cool-off. Line 167: `if (callsToday >= REDERIVE_DAILY_CAP)` — unconditional daily cap. Line 235: `const manual = (message.manual as boolean \| undefined) ?? false`. |
| `src/content/selectors.ts` | POST_AUTHOR_NAME and POST_URN_ATTR_FALLBACK absent | VERIFIED | Neither export exists. 14 remaining exports present (FEED_CONTAINER through CONNECTION_DEGREE). |
| `src/content/selector-registry.ts` | SEED_MAP exhaustive over trimmed SelectorTarget union, no dead selector imports | VERIFIED | SEED_MAP (lines 59-74): 14 entries matching the 14-member SelectorTarget union. No import of POST_AUTHOR_NAME or POST_URN_ATTR_FALLBACK in the import block (lines 26-41). |
| `src/shared/types.ts` | SelectorTarget union has 14 members; POST_AUTHOR_NAME and POST_URN_ATTR_FALLBACK absent | VERIFIED | Lines 341-355: union has exactly 14 members. Confirmed by zero grep matches. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/modules/dashboard/index.tsx` | content script | `chrome.tabs.sendMessage(tab.id, { type: TRIGGER_HEAL })` | WIRED | handleHeal queries feed tab and sends TRIGGER_HEAL message with sendMessage; response mapped to HealOutcome[]. |
| `src/content/index.ts` listener | `src/content/observer.ts` | `requestGuardedHeal(container, true)` | WIRED | Listener resolves liveFeedContainer(), calls requestGuardedHeal with manual=true, maps null to HEAL_BUSY. |
| `src/content/observer.ts` | `src/tools/library/dom-selector-rederive/heal.ts` | `triggerHeal(container, manual)` | WIRED | requestGuardedHeal delegates to triggerHeal with manual forwarded. |
| `src/tools/library/dom-selector-rederive/heal.ts` | `src/tools/library/dom-selector-rederive/rederiver.ts` | `LLMRederiver.rederive(target, skeleton, manual)` | WIRED | Sub-element path: `rederiver.rederive(target, skeleton, manual)` — manual forwarded. |
| `src/tools/library/dom-selector-rederive/rederiver.ts` | `src/background/index.ts` | `chrome.runtime.sendMessage({ type: 'REDERIVE_SELECTOR', ..., manual })` | WIRED | manual field included in the sendMessage payload; background reads `message.manual`. |
| `src/background/index.ts` | `checkRateLimit()` | `manual` param | WIRED | `checkRateLimit(manual)` — 5-min cool-off gated; daily cap unconditional. |
| `src/content/selector-registry.ts` | `src/shared/types.ts` | `Record<SelectorTarget, string>` SEED_MAP | WIRED | SEED_MAP typed as `Record<SelectorTarget, string>` with 14 entries exhaustive over the 14-member union; type-check enforces exhaustiveness. |
| `src/modules/dashboard/index.tsx` | `src/modules/dashboard/SelectorView.tsx` | `onHeal={handleHeal}` + `feedTabOpen={feedTabOpen}` props | WIRED | Lines 308-315 in index.tsx pass both props; SelectorView destructures and uses both. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SelectorView.tsx` heal column | `healResults` (HealOutcome[]) | `onHeal()` → `handleHeal()` in index.tsx → chrome.tabs.sendMessage round-trip → content pipeline | Real pipeline outcomes: each HealOutcome.result set by heal.ts based on actual DOM querySelector results and LLM rederive calls | FLOWING |
| `SelectorView.tsx` rows | `registry` (SelectorRegistrySchema) | `chrome.storage.onChanged` listener in index.tsx automatically refreshes `selectorRegistry` state | Real storage contents populated by insertCandidate() after validateCandidate passes | FLOWING |
| `index.tsx` `feedTabOpen` | `tabs.length > 0` | `chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' })` | Real tab enumeration from browser | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test suite (450 tests covering heal pipeline, not-found outcome, manual flag, rate-limit, stop_sequences absence) | `npm test` | 450/450 passed, 36/36 test files | PASS |
| Dead selectors absent from src/ | `grep -r "POST_AUTHOR_NAME\|POST_URN_ATTR_FALLBACK" src/` | No matches | PASS |
| stop_sequences absent from tool implementation | grep for `stop_sequences` in `dom-selector-rederive.tool.ts` | Not present in implementation (only in test as assertion it is absent) | PASS |
| manual flag in full call chain | grep for `manual` across observer.ts, heal.ts, rederiver.ts, background/index.ts | All 4 files carry the flag with correct conditional logic | PASS |

---

### Probe Execution

Step 7c: No probe scripts declared in this phase's PLAN files. SKIPPED (no probe scripts).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HEAL-01 | 34-04 | Dashboard Selector Health button; enabled only when a LinkedIn feed tab is open | SATISFIED | SelectorView.tsx button + feedTabOpen enablement gate; index.tsx chrome.tabs.query effect |
| HEAL-02 | 34-03 | Clicking runs heal pipeline against live feed tab via TRIGGER_HEAL; never from dashboard DOM | SATISFIED | index.tsx handleHeal sends TRIGGER_HEAL; content listener resolves liveFeedContainer() fresh |
| HEAL-03 | 34-02 | Heal covers all stale selectors (not only POST_CARD); card vs sub-element routing; non-DOM targets excluded | SATISFIED | heal.ts CARD_TARGETS + SUB_ELEMENT_TARGETS; COMPANY_PAGE_MARKER/POST_URN_ATTR excluded by design |
| HEAL-04 | 34-04 | Dashboard reports per-selector outcome; rows refresh to reflect newly-active selectors | SATISFIED | SelectorView.tsx 5-variant inline Heal column; chrome.storage.onChanged auto-refresh |
| HEAL-05 | 34-02, 34-03 | No write except through SelectorRegistry.insertCandidate after validateCandidate; single-flight guard respected; manual cool-off exemption (user-approved); daily cap always enforced | SATISFIED | heal.ts validate-then-insert gate; observer.ts single-flight + manual cool-off exemption; background checkRateLimit unconditional daily cap |
| HEAL-06 | 34-01 | Dead selectors POST_AUTHOR_NAME and POST_URN_ATTR_FALLBACK removed from all three sites; tests green | SATISFIED | Zero grep matches in src/; 14-member SelectorTarget union; SEED_MAP exhaustive; 450/450 tests |

**Coverage:** 6/6 requirements HEAL-01 through HEAL-06 satisfied.

---

### Confirmed Fixes (per task instructions — verify in code, not SUMMARY)

| Fix | Claim | Code Evidence |
|-----|-------|---------------|
| stop_sequences removal | `['\n\n\n']` removed from dom-selector-rederive.tool.ts | Confirmed: `stop_sequences` does not appear anywhere in `dom-selector-rederive.tool.ts`. Test at line 154-175 of `dom-selector-rederive.test.ts` explicitly asserts it is NOT sent. |
| manual flag threading | full call chain: content/index.ts → observer.ts → heal.ts → rederiver.ts → background/index.ts | Confirmed: `index.ts` passes `manual=true` to `requestGuardedHeal`; observer.ts forwards to `triggerHeal(container, manual)`; heal.ts passes to `rederiver.rederive(target, skeleton, manual)`; rederiver.ts includes in sendMessage payload; background reads `message.manual` and passes to `checkRateLimit(manual)`. |
| per-target reasons in HealOutcome | `reason` field populated on non-healed paths | Confirmed: `heal.ts` pushes `{ target, result: 'not-found', reason: 'not found on current page' }` and `{ target, result: 'rate-limited', reason: msg }` and `{ target, result: 'failed', reason: msg }`. `heal-messages.ts` HealOutcome interface has `reason?: string`. |
| 'not-found' HealResult variant | Added to HealResult union and rendered in dashboard | Confirmed: `heal-messages.ts` line 35 includes `'not-found'`. `SelectorView.tsx` has `notFoundBadge` style and `outcome.result === 'not-found' ? 'not on page' : outcome.result` label logic. |

---

### Anti-Patterns Found

No blockers. Scanned all files modified in this phase:

- No `TBD`, `FIXME`, or `XXX` markers in modified files.
- No stub returns (all 5 HealResult variants wired to real pipeline outcomes).
- No hardcoded empty props at call sites.
- `DEBUG = true` in `content/index.ts` (line 24) — pre-existing, not introduced by this phase; console.log already present from earlier phases.

---

### Human Verification Required

One item requires human testing (cannot be verified programmatically):

#### 1. End-to-End Heal Flow in Live Extension

**Test:** Load the extension in Chrome, browse the LinkedIn feed, open the dashboard, and click "Heal selectors now" with a feed tab open.
**Expected:** The button enters the "Healing…" state; per-target outcome badges appear in the Heal column of the Selector Health rows; any newly-healed selector updates its row in the registry; no red console errors appear.
**Why human:** The full chrome.tabs.sendMessage → content script → background LLM call chain requires a real Chrome environment with a live LinkedIn feed tab. The test suite mocks chrome APIs and the Anthropic API.

Note: The SUMMARY states this was live-verified during Task 3 (human-verify step) and four issues were found and fixed. The task instructions indicate this was resolved by human approval. Since SUMMARY.md is not considered evidence, this item is flagged for awareness, but the automated checks (450/450 tests, full chain verified in code) provide strong confidence.

---

### Gaps Summary

No gaps. All 6 success criteria verified against the actual codebase. All 6 requirements (HEAL-01 through HEAL-06) are satisfied. The three confirmed bug fixes (stop_sequences removal, manual flag threading, not-found variant) are present in code. The test suite confirms 450/450 green.

The one human verification item (live end-to-end test in Chrome) is not a blocker — it was performed during phase execution per Task 3. It is listed for completeness per verification protocol.

---

_Verified: 2026-06-21T01:55:00Z_
_Verifier: Claude (gsd-verifier)_
