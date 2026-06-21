---
created: 2026-06-21T01:55:30.000Z
title: Decide manual heal coverage for RESHARE_INDICATOR and POST_AUTHOR_LINK
area: general
files:
  - src/tools/library/dom-selector-rederive/heal.ts:56-82
---

## Problem

The manual heal set (Phase 34) covers card targets (POST_CARD, POST_BODY_TEXT via the heuristic
deriver) and 6 sub-element targets (via the LLM rederiver), but `RESHARE_INDICATOR` and
`POST_AUTHOR_LINK` are in neither set. Both are structural post selectors that ARE
observer-instrumented (they record lastMatched and are eligible for the automatic zero-posts
breakage heal), but the manual "Heal selectors now" button will never attempt them. If either
breaks while posts still render, a manual heal reports "Nothing stale" even though a real
selector is broken. Surfaced by the Phase 34 code review (finding WR-03). A scope comment was
added to heal.ts documenting the omission; this todo tracks the actual decision.

## Solution

Decide whether manual heal should cover `RESHARE_INDICATOR` and `POST_AUTHOR_LINK`:
- If yes, route them through the appropriate path. `POST_AUTHOR_LINK` resolves an anchor inside
  the card and is shape-compatible with the heuristic/card path; `RESHARE_INDICATOR` is a
  sub-element marker and would fit `SUB_ELEMENT_TARGETS` (LLM path). Add to the relevant set,
  add staleness/outcome handling, and add unit tests mirroring the existing per-target tests.
- If no, keep the current scope and rely on the automatic breakage heal for these structural
  selectors; the heal.ts comment already documents the rationale.
Consider together with the related observability gap todo
([[instrument-lastmatched-for-exclusion-and-signal-selectors]]).
