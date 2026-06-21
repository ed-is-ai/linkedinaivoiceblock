---
created: 2026-06-21T00:30:20.189Z
title: Instrument lastMatched for exclusion and signal selectors
area: ui
files:
  - src/content/observer.ts:60-158
  - src/content/exclusions.ts
  - src/content/selector-registry.ts:227-257
  - src/modules/dashboard/SelectorView.tsx:497-499
---

## Problem

The dashboard "Selector Health" tab shows "—" (never matched) in the **Last matched**
column for roughly half the selectors — `SPONSORED_MARKER`, `COMPANY_PAGE_MARKER`,
`OPEN_TO_WORK_MARKER`, `CONNECTION_DEGREE`, `AUTHOR_HEADLINE`, `COMMENT_TEXT`,
`COMMENT_EXPAND_BUTTON`. This looks like those selectors are broken or that the content
never appears, but neither is true: the user has definitely seen sponsored posts,
comments, reshares, and #OpenToWork content.

Root cause is an **instrumentation gap**, not staleness and not "content not seen":
`lastMatchedAt` is only ever written by `updateCandidate()`
(src/content/selector-registry.ts:227-257), and the ONLY production caller is the
observer post-extraction hot path (src/content/observer.ts), which records exactly 7
structural targets: `FEED_CONTAINER`, `FEED_CONTAINER_FALLBACK`, `RESHARE_INDICATOR`,
`POST_AUTHOR_LINK`, `POST_BODY_TEXT`, `POST_CARD`, `POST_URN_ATTR`.

Every other selector is resolved via `resolve()` in the exclusion path
(src/content/exclusions.ts — SPONSORED_MARKER, COMPANY_PAGE_MARKER) and the signal
skills (CONNECTION_DEGREE, AUTHOR_HEADLINE, OPEN_TO_WORK_MARKER, COMMENT_TEXT,
COMMENT_EXPAND_BUTTON), but those match paths never call `updateCandidate()`. So those
rows are structurally incapable of ever showing anything but "—", even when the
selector is actively matching content. The Selector Health "Last matched" column is
therefore misleading for those targets.

Note: `RESHARE_INDICATOR` IS instrumented (observer.ts:88); if it still reads "—" that
is the one row where it could legitimately mean "no reshare seen recently" or a genuinely
stale selector worth checking — distinct from the instrumentation gap above.

Surfaced during Phase 34 (manual self-healing trigger) verification — same contextual
selectors that healed as "not on page" are the ones that read "—" here.

## Solution

Call `updateCandidate(target, resolvedSelector)` (fire-and-forget, `.catch(() => {})`,
matching the observer hot-path pattern) from the exclusion and signal match sites so a
successful match records `lastMatchedAt` for those targets too:
- src/content/exclusions.ts — on a successful SPONSORED_MARKER / COMPANY_PAGE_MARKER match.
- The signal skills under detect-aiwriting-heuristic/signals/* — on a successful match for
  CONNECTION_DEGREE, AUTHOR_HEADLINE, OPEN_TO_WORK_MARKER, COMMENT_TEXT, COMMENT_EXPAND_BUTTON.

Keep it fire-and-forget and off the critical path (do not await; never let a registry
write block detection). Add/adjust unit tests asserting a match records lastMatchedAt for
at least one exclusion target and one signal target. After this, the dashboard "Last
matched" column reflects reality and the contextual selectors stop falsely reading "—".

Decide whether COMMENT_TEXT / CONNECTION_DEGREE should still be expected-blank given they
are conditionally rendered — the dashboard's existing essential-vs-contextual styling
(SelectorView.tsx:493-523, "(not seen this session)") may already cover the messaging once
real timestamps flow in.
