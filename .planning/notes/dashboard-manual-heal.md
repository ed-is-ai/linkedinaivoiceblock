---
title: Manual self-healing trigger from dashboard — architecture & constraints
date: 2026-06-20
context: /gsd-explore session — Selector Health "last matched" review led to a feature request for a manual heal button
---

# Manual Self-Healing Trigger from Dashboard

## Origin

Started from a Selector Health review: many selectors show `last matched = —`. Investigation
found that `—` does **not** mean unused — `lastMatched` is only written by
`updateCandidate()`, which is called for just 7 targets, all in
[observer.ts](../../src/content/observer.ts) (`FEED_CONTAINER`, `FEED_CONTAINER_FALLBACK`,
`RESHARE_INDICATOR`, `POST_AUTHOR_LINK`, `POST_BODY_TEXT`, `POST_CARD`, `POST_URN_ATTR`).
Exclusion/signal selectors query via `resolve()` but never call `updateCandidate`, so they can
never populate the column. The column conflates three states: *not instrumented*,
*instrumented-but-broken* (only `RESHARE_INDICATOR`), and *not-a-DOM-selector*
(`COMPANY_PAGE_MARKER`, a URL substring).

That review surfaced the desire for a user-driven "heal now" action instead of relying solely
on the automatic breakage trigger.

## Locked decisions (from explore session)

1. **No-feed-tab handling → require a feed tab.** The button is enabled only when a LinkedIn
   feed tab is open; otherwise it is disabled with a hint (e.g. "Open LinkedIn to heal"). No
   auto-navigation, no background queueing.
2. **Scope → heal all stale selectors**, not just `POST_CARD`.

## Core architectural constraint

`triggerHeal(container)` ([heal.ts:60](../../src/tools/library/dom-selector-rederive/heal.ts))
**requires a live feed container Element**. It walks the real LinkedIn DOM (heuristics first,
LLM fallback second). It is fired automatically today from
[observer.ts:204](../../src/content/observer.ts) on detected feed breakage, behind a
single-flight + cool-off guard.

The dashboard ([SelectorView.tsx](../../src/modules/dashboard/SelectorView.tsx)) is a
**separate extension page with no access to the LinkedIn feed DOM** — it reads the registry from
`chrome.storage.local` and its only current write action is `onReset`. So the button cannot heal
directly; it must reach a content script on a live feed tab.

## Proposed flow

```
SelectorView button click
  → dashboard: chrome.tabs.query for a linkedin.com/feed tab
      → none open  → button disabled + hint
      → open       → chrome.tabs.sendMessage(tabId, { type: 'TRIGGER_HEAL' })
  → content script: new onMessage listener for TRIGGER_HEAL
      → calls triggerHeal against the live container
      → responds with per-selector outcome { target, result: 'healed'|'unchanged'|'failed' }
  → dashboard: shows result, refreshes rows from storage
```

Messaging precedent already exists (content↔background via typed `chrome.runtime.sendMessage`:
`SCORE_POST`, `REDERIVE_SELECTOR`, `POST_HIDDEN`). New here: dashboard→content via
`chrome.tabs.sendMessage`, and a `TRIGGER_HEAL` message + content-side listener.

## Key gap — "heal all stale" is more than wiring a button

`triggerHeal` is **hardcoded to `POST_CARD`** (`deriveHeuristicCandidates('POST_CARD', …)`,
`insertCandidate('POST_CARD', …)`). To heal all stale selectors it must be generalized to accept
a target (or a list).

More importantly, the **heuristic deriver
([heuristic.ts](../../src/tools/library/dom-selector-rederive/heuristic.ts)) is purpose-built for
repeating card structures** — group-size bounds (`MIN_GROUP_SIZE`/`MAX_GROUP_SIZE`),
`role="article"` fallback. It derives `POST_CARD`-shaped selectors and will **not** generalize
cleanly to per-card sub-element selectors (`SPONSORED_MARKER`, `AUTHOR_HEADLINE`,
`CONNECTION_DEGREE`, `COMMENT_EXPAND_BUTTON`, `COMMENT_TEXT`, `OPEN_TO_WORK_MARKER`).

The LLM `rederiver` ([rederiver.ts](../../src/tools/library/dom-selector-rederive/rederiver.ts))
*does* take a generic `target`, but requires a configured API key. Realistic strategy:
**heuristics for card-shaped targets + LLM fallback for sub-element targets** (and degrade
gracefully when no API key is set — those targets simply report `unchanged`/`skipped`).

`COMPANY_PAGE_MARKER` is a URL substring, not a DOM selector — it is not healable via this DOM
path and should be excluded from the heal set.

## Bundled cleanup — remove redundant Selector Health rows (HEAL-06)

Two selectors are genuinely dead (zero `resolve()` consumers anywhere) and only clutter the
Selector Health tab as rows that can never match:

- `POST_AUTHOR_NAME` — author name is read via the `POST_AUTHOR_LINK` anchor in
  [observer.ts](../../src/content/observer.ts) (`authorAnchor.querySelector('strong')` plus
  `span`/text fallbacks), which fully supersedes it.
- `POST_URN_ATTR_FALLBACK` — identical value to `POST_URN_ATTR` (`'componentkey'`); never resolved.

Remove each from three sites: [selectors.ts](../../src/content/selectors.ts) (the `export const`),
[selector-registry.ts](../../src/content/selector-registry.ts) (import + `SEED_MAP`), and the
`SelectorTarget` union in [types.ts](../../src/shared/types.ts). After removal, `npm test` +
`npm run type-check` must stay green.

Note this is a *narrow* removal — only the two truly-dead selectors. The other `last matched = —`
rows (`SPONSORED_MARKER`, `OPEN_TO_WORK_MARKER`, `AUTHOR_HEADLINE`, `CONNECTION_DEGREE`,
`COMMENT_EXPAND_BUTTON`, `COMMENT_TEXT`, `RESHARE_INDICATOR`) are all live and MUST be kept; their
blank cells are an instrumentation/measurement artifact, not evidence of dead code.

## Invariants to preserve

- No selector string is written except through `SelectorRegistry.insertCandidate`, and only after
  `validateCandidate` passes (ADAPT-06). The heal button must not bypass this gate.
- Heal must run against the live DOM only — never against a static/synthetic DOM.
- Respect the existing single-flight / cool-off behavior so a manual click can't stampede the
  automatic trigger.

## Pointers

- Feature routed to **Phase 34** in ROADMAP.md; requirements **HEAL-01..HEAL-05** in REQUIREMENTS.md.
- Entry point to generalize: [heal.ts](../../src/tools/library/dom-selector-rederive/heal.ts)
- Button host: [SelectorView.tsx](../../src/modules/dashboard/SelectorView.tsx)
- Content message handling precedent: [content/index.ts](../../src/content/index.ts),
  [background/index.ts](../../src/background/index.ts)
