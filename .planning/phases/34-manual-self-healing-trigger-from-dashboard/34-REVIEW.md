---
phase: 34-manual-self-healing-trigger-from-dashboard
reviewed: 2026-06-21T02:30:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - src/modules/dashboard/SelectorView.tsx
  - src/modules/dashboard/index.tsx
  - src/content/index.ts
  - src/content/observer.ts
  - src/content/selectors.ts
  - src/content/selector-registry.ts
  - src/shared/types.ts
  - src/shared/heal-messages.ts
  - src/tools/library/dom-selector-rederive/heal.ts
  - src/tools/library/dom-selector-rederive/rederiver.ts
  - src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts
  - src/background/index.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-06-21T02:30:00Z
**Depth:** deep
**Files Reviewed:** 12 (11 source + background)
**Status:** issues_found

## Summary

Phase 34 introduces a manual self-healing trigger from the dashboard. The core architecture is sound: the `TRIGGER_HEAL` message contract is well-defined, the `requestGuardedHeal` extraction correctly shares the single-flight latch between automatic and manual paths, the cool-off exemption for manual heals is correctly applied at both the content-side (observer.ts) and background-side (checkRateLimit), and the daily cap is unconditionally enforced. The validate-before-write gate (ADAPT-06) is preserved — no selector string is written without a prior `validateCandidate` pass. The `return true` channel-open discipline is correctly applied in both the content listener and the background REDERIVE_SELECTOR handler.

Four warnings are identified: a misleading summary message in SelectorView, a non-Error rejection in LLMRederiver that produces uninformative error text, stale targets that the manual heal cannot reach (FEED_CONTAINER, RESHARE_INDICATOR, POST_AUTHOR_LINK), and a `DEBUG = true` flag left in production content script. Three info items cover dead counters, unused imports, and a redundant `return true` after a synchronous sendResponse.

No critical issues were found.

## Warnings

### WR-01: Summary message says "Healed N targets" but N includes failed, rate-limited, and not-found outcomes

**File:** `src/modules/dashboard/SelectorView.tsx:601-605`
**Issue:** The summary hint at the bottom of the Heal control reads "Healed {healResults.length} target(s)" where `healResults` is the full array of `HealOutcome[]` returned by the pipeline. This array represents ALL stale targets, not only those with `result === 'healed'`. If 3 targets are stale but only 1 is successfully repaired, the message says "Healed 3 targets" which is factually incorrect and will mislead the user.
**Fix:**
```tsx
// Count only genuinely healed targets for the summary
const healedCount = healResults.filter(o => o.result === 'healed').length;
const staleCount = healResults.length;
// Then in the JSX:
{healResults !== null && healResults.length > 0 && (
  <div style={s.healHint}>
    {healedCount > 0
      ? `Healed ${healedCount} of ${staleCount} stale target${staleCount === 1 ? '' : 's'} — see the Heal column above for each outcome.`
      : `${staleCount} stale target${staleCount === 1 ? '' : 's'} — see the Heal column above for each outcome.`}
  </div>
)}
```

---

### WR-02: LLMRederiver rejects with a non-Error object, producing `[object Object]` in error messages

**File:** `src/tools/library/dom-selector-rederive/rederiver.ts:38-40`
**Issue:** When `chrome.runtime.lastError` is set, the code does `reject(chrome.runtime.lastError)`. The Chrome API's `lastError` is `{ message?: string }` — not an `Error` instance. The catch block in `heal.ts` does `err instanceof Error ? err.message : String(err)`, which falls through to `String(err)` for a plain object, producing the uninformative string `[object Object]` rather than the actual error message. This string then appears in the dashboard's `healErrorMsg` or as a `reason` on a `failed` outcome.
**Fix:**
```typescript
// rederiver.ts line 39 — wrap in a real Error so instanceof checks and .message work:
if (chrome.runtime.lastError) {
  reject(new Error(chrome.runtime.lastError.message ?? 'chrome.runtime.lastError'));
  return;
}
```

---

### WR-03: Four SelectorTarget entries are silently excluded from the manual heal set with no comment explaining their omission

**File:** `src/tools/library/dom-selector-rederive/heal.ts:57-74`
**Issue:** `CARD_TARGETS` and `SUB_ELEMENT_TARGETS` together cover 8 of the 14 `SelectorTarget` variants. The excluded 6 are: `POST_URN_ATTR` and `COMPANY_PAGE_MARKER` (correctly excluded by D-05 — they are not querySelector inputs, and the comment says so). But `FEED_CONTAINER`, `FEED_CONTAINER_FALLBACK`, `RESHARE_INDICATOR`, and `POST_AUTHOR_LINK` are also absent with no explanation. If any of these break, a manual heal click gives the user the misleading "Nothing stale — all selectors are current" message while the selector is actually broken. The `isStale()` check runs only over the defined target sets, so these targets are never probed.

`FEED_CONTAINER` and `FEED_CONTAINER_FALLBACK` may be intentionally excluded because a broken feed container prevents heal from running at all (the `liveFeedContainer()` call in the listener returns `null` and responds with `{ error: 'no live feed container' }`). But `RESHARE_INDICATOR` and `POST_AUTHOR_LINK` are live DOM selectors that should be healable. There is no code comment to indicate whether this is a deliberate scope decision or an omission.

**Fix:** Either add `RESHARE_INDICATOR` and `POST_AUTHOR_LINK` to `SUB_ELEMENT_TARGETS` (they are sub-element selectors used with `querySelector`) or add an explicit comment explaining why they are excluded:
```typescript
/**
 * Sub-element targets routed through the LLM re-deriver.
 * POST_URN_ATTR (attribute name) and COMPANY_PAGE_MARKER (URL substring) are intentionally
 * absent — they are not querySelector inputs and must never appear in the heal set (D-05).
 * FEED_CONTAINER / FEED_CONTAINER_FALLBACK are excluded because a broken feed container
 * causes liveFeedContainer() to return null before this function is reached.
 * RESHARE_INDICATOR and POST_AUTHOR_LINK are in scope for future expansion (HEAL-07).
 */
const SUB_ELEMENT_TARGETS: ReadonlyArray<SelectorTarget> = [
  'RESHARE_INDICATOR',   // add if scope is expanded
  'POST_AUTHOR_LINK',    // add if scope is expanded
  'SPONSORED_MARKER',
  'AUTHOR_HEADLINE',
  'CONNECTION_DEGREE',
  'COMMENT_EXPAND_BUTTON',
  'COMMENT_TEXT',
  'OPEN_TO_WORK_MARKER',
];
```

---

### WR-04: `DEBUG = true` is hardcoded in production content script

**File:** `src/content/index.ts:24`
**Issue:** `const DEBUG = true;` enables verbose per-post `console.log` output on every post that enters the detection pipeline in production builds. This produces significant log noise in any real user's DevTools console and leaks post text fragments (up to 500+ characters per post). The verification report notes this is pre-existing, but Phase 34 modified this file extensively and did not address it. There is no build-time variable substitution that would make this false in production.
**Fix:**
```typescript
// Replace the hardcoded constant with a build-time flag:
const DEBUG = import.meta.env.DEV;
// Vite sets import.meta.env.DEV = true in dev and false in production builds.
```
If the log is needed for ongoing development, the alternative is to wrap it in a try/finally that never logs in production — but the `import.meta.env.DEV` pattern is the idiomatic Vite approach.

---

## Info

### IN-01: `aiSignalsToday`, `botSignalsToday`, and `AI_LANGUAGE_SIGNALS` are declared/imported but never read

**File:** `src/content/index.ts:14,88-89,335-336`
**Issue:** `AI_LANGUAGE_SIGNALS` is imported (line 14) but not referenced anywhere in the file. `aiSignalsToday` and `botSignalsToday` are module-scope `let` variables that are reset to 0 on SPA navigation (lines 335-336) but are never incremented or read. These are dead code that was apparently left over from an earlier iteration of the signal-counting feature.
**Fix:** Remove the unused import and the two unused counter variables. If these counters are planned for future DailyStats extensions, add a `// TODO(INSIGHT-03): increment once signal-category tracking is added` comment to make the intent explicit.

---

### IN-02: `return true` after synchronous `sendResponse` in the TRIGGER_HEAL listener

**File:** `src/content/index.ts:207-209`
**Issue:** In the `!container` branch of the TRIGGER_HEAL listener, `sendResponse({ error: 'no live feed container' })` is called synchronously and then `return true` is returned. The `return true` tells Chrome to keep the message channel open for an async response, but the response has already been sent. Chrome's runtime will close the channel after the synchronous `sendResponse` call regardless. The extra `return true` is harmless but misleading — it implies an async response is forthcoming when it is not.
**Fix:**
```typescript
if (!container) {
  sendResponse({ error: 'no live feed container' });
  return false; // synchronous sendResponse — channel is already closed
}
```
Alternatively, keeping `return true` is acceptable since Chrome silently ignores duplicate-close, but `return false` more accurately communicates intent and is consistent with the `POST_HIDDEN` handler in background/index.ts which returns `false` for synchronous no-ops.

---

### IN-03: `_lastHealMs` is not reset in `reinit()` — cool-off persists across SPA navigations for automatic heals

**File:** `src/content/observer.ts:336-357`
**Issue:** `reinit()` resets `_zeroMatchWindowStart`, `_postsSeenThisSession`, `_healInProgress`, and the breakage interval, but does NOT reset `_lastHealMs`. This means if an automatic heal fires on the feed page and the user navigates to a profile and back within 60 seconds, the automatic breakage-detection heal is suppressed. This appears to be intentional (the content-side cool-off is 60 seconds, much shorter than the background-side 5 minutes), but it is not documented. If it is intentional, add a comment: `// _lastHealMs intentionally NOT reset on SPA navigation — the 60s cool-off should persist across navigations to avoid hammering the pipeline when SPA transitions are rapid.`
**Fix:** Either add the explanatory comment, or if the behavior is an oversight, reset `_lastHealMs` in `reinit()`:
```typescript
_healInProgress = false;
_lastHealMs = 0; // reset cool-off so a fresh page load can heal immediately if needed
```

---

_Reviewed: 2026-06-21T02:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
