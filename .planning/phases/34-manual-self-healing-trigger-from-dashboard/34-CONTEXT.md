# Phase 34: Manual Self-Healing Trigger from Dashboard - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning
**Source:** Explore-session capture (`.planning/notes/dashboard-manual-heal.md`)

<domain>
## Phase Boundary

Add a user-driven "heal now" action to the dashboard's Selector Health section. Today
selector self-healing fires automatically from `observer.ts` on detected feed breakage,
behind a single-flight + cool-off guard. This phase exposes the *same* heal pipeline as a
manual trigger the user can fire on demand — with no new selector-write surface and no new
heal logic beyond generalizing the existing pipeline from `POST_CARD`-only to all stale
selectors.

The dashboard (`src/modules/dashboard/SelectorView.tsx`) is a **separate extension page with
no access to the LinkedIn feed DOM**. It reads the registry from `chrome.storage.local`; its
only current write action is `onReset`. Healing requires a live feed container Element, so the
button cannot heal directly — it must reach a content script running on a live LinkedIn feed
tab via `chrome.tabs.sendMessage`.

**In scope:** dashboard button + enablement logic, `TRIGGER_HEAL` message + content-side
listener, generalizing `triggerHeal` to accept a target, heuristic-vs-LLM heal routing per
target shape, per-selector outcome reporting + row refresh, and removal of two dead selectors.

**Out of scope:** auto-navigation to LinkedIn, background queueing of heal requests, changing
the automatic breakage trigger, healing non-DOM targets (URL-substring markers), and any new
selector-write path that bypasses `validateCandidate`.
</domain>

<decisions>
## Implementation Decisions

### No-feed-tab handling (HEAL-01) — LOCKED
- D-01: The "Heal selectors now" button is **enabled only when a LinkedIn feed tab is open**;
  otherwise it is **disabled with a hint** (e.g. "Open LinkedIn to heal"). No auto-navigation,
  no background queueing. Dashboard queries via `chrome.tabs.query` for a `linkedin.com/feed`
  tab to decide enablement.

### Trigger mechanism (HEAL-02) — LOCKED
- D-02: Clicking the button runs the heal pipeline against the **live feed tab's DOM** via a
  `TRIGGER_HEAL` message sent with `chrome.tabs.sendMessage(tabId, { type: 'TRIGGER_HEAL' })`,
  handled by a **new content-script `onMessage` listener**. Healing is **never** attempted from
  the dashboard's own DOM. This is a new messaging direction (dashboard→content); the typed
  `chrome.runtime.sendMessage` precedent already exists for `SCORE_POST`, `REDERIVE_SELECTOR`,
  `POST_HIDDEN`.

### Heal scope — heal all stale selectors (HEAL-03) — LOCKED
- D-03: Scope is **all currently-stale selectors, not just `POST_CARD`**. `triggerHeal` is
  **hardcoded to `POST_CARD`** today (`deriveHeuristicCandidates('POST_CARD', …)`,
  `insertCandidate('POST_CARD', …)`) and must be **generalized to accept a target** (or list).
- D-04: Heal routing by target shape:
  - **Card-shaped targets → heuristic deriver** (`heuristic.ts`, purpose-built for repeating
    card structures via group-size bounds + `role="article"` fallback).
  - **Sub-element targets → LLM `rederiver`** (`rederiver.ts` takes a generic `target` but
    **requires a configured API key**). Sub-element targets include `SPONSORED_MARKER`,
    `AUTHOR_HEADLINE`, `CONNECTION_DEGREE`, `COMMENT_EXPAND_BUTTON`, `COMMENT_TEXT`,
    `OPEN_TO_WORK_MARKER`.
  - **Degrade gracefully when no API key is set** — sub-element targets that need the LLM simply
    report `unchanged`/`skipped` rather than erroring.
- D-05: `COMPANY_PAGE_MARKER` is a **URL substring, not a DOM selector** — it is not healable via
  this DOM path and must be **excluded from the heal set**.

### Outcome reporting (HEAL-04) — LOCKED
- D-06: The content script responds with a **per-selector outcome**
  `{ target, result: 'healed' | 'unchanged' | 'failed' }`. The dashboard shows the result and
  **refreshes the Selector Health rows from storage** to reflect any newly-active selector.

### Write-path invariants (HEAL-05) — LOCKED
- D-07: **No selector string is written except through `SelectorRegistry.insertCandidate` after
  `validateCandidate` passes** (ADAPT-06 preserved). The manual trigger must not bypass this gate.
- D-08: The manual trigger **respects the existing single-flight / cool-off guard** so a manual
  click cannot stampede the automatic trigger.
- D-09: Heal must run against the **live DOM only** — never a static/synthetic DOM.

### Dead-selector cleanup (HEAL-06) — LOCKED
- D-10: Remove exactly two genuinely-dead selectors (zero `resolve()` consumers anywhere):
  - `POST_AUTHOR_NAME` — superseded by reading the `POST_AUTHOR_LINK` anchor in `observer.ts`
    (`authorAnchor.querySelector('strong')` + `span`/text fallbacks).
  - `POST_URN_ATTR_FALLBACK` — identical value to `POST_URN_ATTR` (`'componentkey'`); never resolved.
  Remove each from **three sites**: `src/content/selectors.ts` (the `export const`),
  `src/content/selector-registry.ts` (import + `SEED_MAP`), and the `SelectorTarget` union in
  `src/shared/types.ts`. After removal, `npm test` + `npm run type-check` must stay green.
- D-11: This is a **narrow** removal. The other `last matched = —` rows (`SPONSORED_MARKER`,
  `OPEN_TO_WORK_MARKER`, `AUTHOR_HEADLINE`, `CONNECTION_DEGREE`, `COMMENT_EXPAND_BUTTON`,
  `COMMENT_TEXT`, `RESHARE_INDICATOR`) are **all live and MUST be kept** — their blank cells are
  an instrumentation artifact (`lastMatched` is only written by `updateCandidate`, called for 7
  targets in `observer.ts`), not evidence of dead code. Do NOT remove them.

### Claude's Discretion
- Exact wording of the disabled-state hint and the result presentation layout (reuse
  SelectorView's existing inline-style patterns; this project forbids CSS class selectors).
- Whether `triggerHeal` accepts a single target iterated by the caller or an internal target list —
  pick the shape that keeps the single-flight/cool-off guard intact.
- How "stale" is determined for the heal set (which targets are currently failing) — reuse
  existing registry/staleness signals rather than inventing a new one.
- Message response typing / error envelope shape (follow the existing typed-message precedent).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Heal pipeline (generalization target)
- `src/tools/library/dom-selector-rederive/heal.ts` — `triggerHeal(container)` entry point;
  hardcoded to `POST_CARD`; must be generalized to accept a target.
- `src/tools/library/dom-selector-rederive/heuristic.ts` — heuristic deriver for card-shaped
  targets (group-size bounds, `role="article"` fallback).
- `src/tools/library/dom-selector-rederive/rederiver.ts` — LLM rederiver; generic `target`,
  requires API key.

### Trigger & messaging
- `src/content/observer.ts` — automatic heal trigger (`observer.ts:204`), single-flight + cool-off
  guard, and the 7 `updateCandidate` call sites.
- `src/content/index.ts` — content-script message handling precedent (`SCORE_POST` etc.); host for
  the new `TRIGGER_HEAL` `onMessage` listener.
- `src/background/index.ts` — typed `chrome.runtime.sendMessage` precedent.

### Dashboard UI
- `src/modules/dashboard/SelectorView.tsx` — Selector Health section; button host; existing
  inline-style system + traffic-light status dots; current `onReset` write action.

### Selector registry & types (HEAL-06 removal sites + write gate)
- `src/content/selectors.ts` — seed/default selector strings (`export const`s to remove).
- `src/content/selector-registry.ts` — `SelectorRegistry`, `SEED_MAP`, `insertCandidate`,
  `validateCandidate` (the only sanctioned write path).
- `src/shared/types.ts` — `SelectorTarget` union (remove the two dead members).

### Project rules
- `CLAUDE.md` — selector strategy (data-* only), no `element.remove()`, no programmatic block
  clicks, stateless service worker, single-writer SelectorRegistry invariant.
</canonical_refs>

<specifics>
## Specific Ideas

Proposed flow (from explore note):
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

UI note: this reuses the existing SelectorView component and styling — no new design system.
The button sits in the Selector Health section alongside the existing reset action.
</specifics>

<deferred>
## Deferred Ideas

- Auto-navigation to LinkedIn when no feed tab is open (explicitly rejected — require an open tab).
- Background queueing of heal requests (explicitly rejected).
- Healing non-DOM targets such as `COMPANY_PAGE_MARKER` (URL substring — not healable this way).
- Fixing the `last matched = —` instrumentation gap for the live-but-uninstrumented selectors
  (out of scope; only the column's *meaning* was clarified, not changed).
</deferred>

---

*Phase: 34-manual-self-healing-trigger-from-dashboard*
*Context derived 2026-06-20 from explore-session capture (`.planning/notes/dashboard-manual-heal.md`)*
