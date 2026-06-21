# Phase 34: Manual Self-Healing Trigger from Dashboard - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 8 (1 component, 1 content host, 3 heal-pipeline, 3 selector-cleanup sites)
**Analogs found:** 7 / 8 (the dashboard→content `chrome.tabs` direction has NO existing analog — flagged below)

> All work is internal to the existing codebase. There is no RESEARCH.md — every entry point
> is already named in 34-CONTEXT.md. The closest analogs all live in this repo.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/modules/dashboard/SelectorView.tsx` | component (Preact) | request-response (button → message → result) | same file: `onReset` confirm/writing/error state machine + inline-style `s` map | exact (same file) |
| `src/modules/dashboard/index.tsx` | provider/host | event-driven (storage) + request-response | same file: `handleResetSelectors` + `chrome.storage.onChanged` refresh | exact (same file) |
| `src/content/index.ts` | content host | event-driven (message listener) | `src/background/index.ts:199` `chrome.runtime.onMessage.addListener` envelope | role-match (different host, same envelope) |
| `src/tools/library/dom-selector-rederive/heal.ts` | service | transform (DOM → validated selector) | same file: existing `triggerHeal(container)` body | exact (generalize in place) |
| `src/tools/library/dom-selector-rederive/heuristic.ts` | service | transform | READ-only — confirm `deriveHeuristicCandidates` signature | n/a (reference) |
| `src/tools/library/dom-selector-rederive/rederiver.ts` | service | request-response (msg to SW) | READ-only — confirm `LLMRederiver.rederive(target, skeleton)` | n/a (reference) |
| `src/content/observer.ts` | observer | event-driven | same file: `onZeroPostsFound` single-flight + cool-off guard (`_healInProgress`, `_lastHealMs`) | exact (precedent to reuse) |
| `src/content/selectors.ts` + `selector-registry.ts` + `src/shared/types.ts` | config / model | n/a (removal) | the existing `SEED_MAP` / import / `SelectorTarget` union three-site structure | exact (mirror existing members) |
| **`src/manifest.json`** (NEWLY IMPLIED) | config | n/a | existing `permissions`/`host_permissions` block | partial — see "Manifest gap" |

---

## NEW — No Direct Analog: dashboard→content messaging

**This is the single piece of genuinely new wiring.** A repo-wide search confirms **zero existing
`chrome.tabs.*` usage** anywhere in `src/`. Every current cross-context message is
content/skill → service-worker via `chrome.runtime.sendMessage`, handled by ONE listener in
`src/background/index.ts`. The dashboard has never talked to a content script.

The planner must therefore compose the new path from two existing halves:

1. **The typed-message envelope + async-response contract** — copy from the service-worker
   `onMessage` handler (`src/background/index.ts:199-288`) and the promise-wrapper senders
   (`LLMRederiver.rederive`, `LLMDetector.scoreViaBackground`).
2. **The `chrome.tabs.query` + `chrome.tabs.sendMessage` transport** — NO analog; spec below from
   CONTEXT D-01/D-02. This is the one place the planner writes against the Chrome API directly
   rather than copying a repo pattern.

### Manifest gap (planner MUST address)

`src/manifest.json:12` is `"permissions": ["storage", "activeTab"]` — **no `"tabs"` permission**.
`host_permissions` already includes `https://www.linkedin.com/*` (line 13), which grants tab
URL/`sendMessage` access for matching tabs, so `chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' })`
and `chrome.tabs.sendMessage(tabId, …)` to a linkedin.com tab are permitted by host access.
The planner should **verify enablement-query behavior under host_permissions alone**; if the
`url`-filtered query returns empty despite an open feed tab, add `"tabs"` to `permissions`.
The dashboard is the `options_ui` page (`src/manifest.json:34-37`), so it runs in an
extension-page context with full `chrome.tabs` API surface.

---

## Pattern Assignments

### `src/modules/dashboard/SelectorView.tsx` (component, request-response)

**Analog:** same file — the `onReset` action is the template for the new "Heal selectors now" button.

**Inline-style convention** (`SelectorView.tsx:19-240`) — the project forbids CSS class selectors;
all styling is a single `s: Record<string, JSX.CSSProperties>` map. New button/result styles MUST be
added as keys here. Existing button styles to clone for the heal button + its disabled state:
```typescript
// SelectorView.tsx:212-234 — primary action button + disabled variant (reuse verbatim shape)
resetNowBtn: {
  flex: 1, padding: '6px 0', background: '#0a66c2', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600,
},
resetNowBtnDisabled: {
  flex: 1, padding: '6px 0', background: '#0a66c2', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'not-allowed', fontSize: 13,
  fontWeight: 600, opacity: 0.7,
},
resetErrorMsg: { fontSize: 12, color: '#dc2626', marginTop: 8 },  // result/error line
```
The disabled-state hint (D-01 "Open LinkedIn to heal") should reuse the `opacity: 0.7` +
`cursor: 'not-allowed'` pattern and a muted-grey caption (clone `notSeenAnnotation` at line 169:
`fontSize: 11, color: '#9ca3af'`).

**Async action + local state machine** (`SelectorView.tsx:248-265`) — the heal button copies this
`writing`/`error` flow exactly (rename to e.g. `healing`/`healError`, add per-target results):
```typescript
const [confirming, setConfirming] = useState(false);
const [writing, setWriting] = useState(false);
const [resetError, setResetError] = useState<string | null>(null);

async function handleConfirmReset() {
  setWriting(true);
  setResetError(null);
  try {
    await onReset();
    setConfirming(false);
  } catch {
    setResetError('Reset failed. Try again.');
    setConfirming(false);
  } finally {
    setWriting(false);
  }
}
```

**Button + disabled binding** (`SelectorView.tsx:444-450`) — mirror `disabled={writing}` and the
`writing ? s.resetNowBtnDisabled : s.resetNowBtn` style swap; for heal use
`disabled={!feedTabOpen || healing}`:
```typescript
<button
  style={writing ? s.resetNowBtnDisabled : s.resetNowBtn}
  disabled={writing}
  onClick={handleConfirmReset}
>
  {writing ? 'Resetting…' : 'Reset now'}
</button>
```

**Placement** — the heal control sits in the same expanded section as the reset control, after the
`<hr style={s.hrDivider} />` (line 421) alongside the existing `resetIdleBtn`.

**Prop wiring** — SelectorView currently receives `onReset: () => Promise<void>`. Add an analogous
`onHeal` (and a `feedTabOpen` boolean / enablement input) following the same `Readonly<SelectorViewProps>`
interface shape at `SelectorView.tsx:5-10`. Per the discretion clause, the heal action can either be
passed in from `index.tsx` (matching `onReset`) or owned locally — prefer **passing from `index.tsx`**
to keep the component stateless about Chrome APIs, exactly like `onReset`.

**Per-selector result display** (D-06) — render the `{ target, result }[]` response as rows reusing
the existing row layout (`s.row` at line 93, `s.target`/`s.badge` family). A `healed` row can reuse
the green traffic-light color `#10b981` (line 279); `failed`/`unchanged` reuse `#dc2626`/`#9ca3af`.

---

### `src/modules/dashboard/index.tsx` (provider/host)

**Analog:** same file — `handleResetSelectors` is the template for the new `handleHeal`, and the
existing `chrome.storage.onChanged` effect already satisfies half of D-06 ("refresh rows from storage").

**Existing write-action handler** (`index.tsx:160-162`) — `onHeal` is the sibling of this:
```typescript
async function handleResetSelectors(): Promise<void> {
  await storageSet({ selectorRegistry: buildSeedRegistry() });
}
```
The heal handler instead does the `chrome.tabs.query` → `chrome.tabs.sendMessage` round-trip (NEW
transport, spec below) and returns the per-target result array to SelectorView.

**Free row-refresh (D-06)** — the dashboard ALREADY re-renders Selector Health on any registry
write via this effect (`index.tsx:105-115`); because heal writes go through `insertCandidate` →
`storageSet({ selectorRegistry })`, the rows refresh automatically. The planner does NOT need to
add a manual reload — only confirm this listener covers the heal-written keys:
```typescript
function handleStorageChange(changes, area) {
  if (area !== 'local') return;
  if (changes['selectorRegistry']) {
    setSelectorRegistry((changes['selectorRegistry'].newValue) ?? null);
  }
  if (changes['selectorSessionMisses']) {
    setSessionMisses(new Set((changes['selectorSessionMisses'].newValue) ?? []));
  }
}
chrome.storage.onChanged.addListener(handleStorageChange);
```

**Enablement input** — the "is a feed tab open?" check (D-01) belongs here (or in a small effect),
passed down as a prop. Use `chrome.tabs.query` (NEW — no analog). Suggested shape:
```typescript
// NEW transport — no repo analog; spec from CONTEXT D-01
const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' });
const feedTabOpen = tabs.length > 0;
```

---

### `src/content/index.ts` (content host — new `TRIGGER_HEAL` listener)

**Analog:** `src/background/index.ts:199-288` — the **canonical typed `onMessage` envelope**. NOTE:
`src/content/index.ts` does NOT currently register any `chrome.runtime.onMessage` listener (it only
registers `chrome.storage.onChanged` at line 127). The new `TRIGGER_HEAL` listener is the FIRST
message listener in the content script, so copy the envelope shape wholesale from background.

**Envelope + async-response contract** (`background/index.ts:199-222`) — copy this exactly: discriminate
on `message?.type`, call `sendResponse({ result })` / `sendResponse({ error })`, and **`return true`
to keep the channel open for the async heal**:
```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SCORE_POST') {
    const postText = message.postText as string;
    scorePost(postText)
      .then(result => sendResponse({ result }))
      .catch((err: Error) => { /* … */ sendResponse({ error: err.message }); });
    return true; // keep channel open for async response
  }
  // …
  return false;
});
```

The `TRIGGER_HEAL` branch must:
1. Resolve the **live** feed container fresh (never a captured ref) — copy `liveFeedContainer()` from
   `observer.ts:212-217` (or export & reuse it):
   ```typescript
   document.querySelector(resolve('FEED_CONTAINER')) ??
   document.querySelector(resolve('FEED_CONTAINER_FALLBACK'))
   ```
   If null → `sendResponse({ error: 'no live feed container' })` (D-09: live DOM only).
2. Call the generalized `triggerHeal(...)` (see heal.ts below), collecting per-target outcomes.
3. `sendResponse({ result: outcomes })` where `outcomes: { target, result: 'healed'|'unchanged'|'failed' }[]`
   (D-06).
4. `return true` for the async path.

**Error envelope discipline** — match the `{ result }` / `{ error }` two-shape contract the senders
already expect (`rederiver.ts:35-46`, `llm.skill.ts:31-41`): a missing/`undefined` response and an
explicit `{ error }` both reject on the sender side. Keep heal failures inside `{ result: [...] }`
with per-target `'failed'`, reserving `{ error }` for pipeline-level failures (no feed container,
exception).

---

### `src/tools/library/dom-selector-rederive/heal.ts` (service — generalize `triggerHeal`)

**Analog:** the existing `triggerHeal(container)` body itself (`heal.ts:60-101`). This is generalized
**in place** from hardcoded `'POST_CARD'` to a target (or internal target list) per D-03/D-04.

**Current hardcoding to remove** (`heal.ts:62-66, 80-93`):
```typescript
const heuristics = deriveHeuristicCandidates('POST_CARD', container);   // line 62 — hardcoded
// …
await insertCandidate('POST_CARD', h.selector, 'heuristic');            // line 66 — hardcoded
// …
llmCandidates = await rederiver.rederive('POST_CARD', skeleton);        // line 84 — hardcoded
await insertCandidate('POST_CARD', c.selector, 'llm');                 // line 93 — hardcoded
```

**Heal routing by target shape (D-04)** — two existing derivers, route by target class:
- **Card-shaped → heuristic** (`heuristic.ts`): `deriveHeuristicCandidates(target, container)`. NOTE
  its signature is **narrowly typed** today: `target: 'POST_CARD' | 'POST_BODY_TEXT'`
  (`heuristic.ts:84`). Card-shaped heal set = these two only. The group-size bounds
  (`MIN_GROUP_SIZE`/`MAX_GROUP_SIZE`) + `[role="article"]` fallback only make sense for repeating
  card structures — do NOT pass sub-element targets here.
- **Sub-element → LLM** (`rederiver.ts`): `new LLMRederiver().rederive(target, skeleton)` already
  takes a generic `target: string` (`rederiver.ts:26`). Sub-element targets per D-04:
  `SPONSORED_MARKER, AUTHOR_HEADLINE, CONNECTION_DEGREE, COMMENT_EXPAND_BUTTON, COMMENT_TEXT,
  OPEN_TO_WORK_MARKER`. **Degrade gracefully with no API key** — the existing key check is already
  present and simply returns:
  ```typescript
  // heal.ts:74-78 — reuse verbatim; report 'unchanged'/'skipped' instead of returning void
  const apiKeyResult = await storageGet(['anthropicApiKey']);
  if (!apiKeyResult.anthropicApiKey) {
    console.warn('[LLB] heal: no API key - LLM fallback skipped');
    return;  // ← generalized: record 'unchanged' for this sub-element target, continue
  }
  ```
- **Exclude `COMPANY_PAGE_MARKER`** from the heal set (D-05 — it is a URL substring, not a DOM
  selector; `selectors.ts:94` `'/company/'`). Also exclude attribute-name strings `POST_URN_ATTR`
  (`'componentkey'`) which are not querySelector inputs.

**Write-gate invariant (D-07)** — every candidate, heuristic or LLM, MUST pass `validateCandidate`
before `insertCandidate`. Preserve the existing loop structure exactly (`heal.ts:63-71, 90-98`):
```typescript
for (const h of heuristics) {
  const valid = validateCandidate(h.selector, container);
  if (valid.pass) {
    await insertCandidate('POST_CARD', h.selector, 'heuristic');  // ← parameterize target
    return;  // ← generalized: record 'healed' for this target, continue to next
  }
}
```
`insertCandidate` is the **only** sanctioned write surface (`selector-registry.ts:337-388`,
CLAUDE.md #1) — do not add a second write path.

**Return shape (D-06)** — `triggerHeal` currently returns `Promise<void>`. Generalize to return the
per-target outcome list so `content/index.ts` can forward it:
`Promise<Array<{ target: SelectorTarget; result: 'healed' | 'unchanged' | 'failed' }>>`.

**Single-flight discretion (D-08)** — per the discretion clause, choose whether `triggerHeal` takes
a single target (caller iterates) or an internal target list. **Prefer the internal target list**
so the entire heal stays inside ONE guarded invocation (the observer holds `_healInProgress` across
the whole `triggerHeal(...)` promise — see observer.ts below). A caller-iterates design would need
the guard re-checked per target.

---

### `src/content/observer.ts` (single-flight + cool-off precedent — READ; possibly extract)

**Analog / precedent the manual trigger MUST reuse:** `onZeroPostsFound` (`observer.ts:185-209`).
This is the exact guard the manual path must not stampede (D-08).

**The guard** (`observer.ts:198-209`):
```typescript
if (_healInProgress || Date.now() - _lastHealMs < HEAL_COOLOFF_MS) {
  return; // a heal is in flight or the cool-off has not elapsed
}
_healInProgress = true;
_lastHealMs = Date.now();
_zeroMatchWindowStart = null;
triggerHeal(container)
  .catch(() => {})
  .finally(() => {
    _healInProgress = false;
  });
```
Module-scope guard state (`observer.ts:32-33`, `47-48`):
```typescript
let _healInProgress = false;   // content-side single-flight guard
let _lastHealMs = 0;           // epoch ms of last heal attempt (content-side cool-off)
const HEAL_COOLOFF_MS = 60_000;
```

**How the manual path reuses it** — the `TRIGGER_HEAL` listener in `content/index.ts` lives in the
same content-script realm but a DIFFERENT module from `observer.ts`. The guard variables are
currently **module-private to observer.ts** (not exported). The planner must EITHER:
1. **Extract** the guard into a shared helper exported from `observer.ts` (e.g.
   `tryAcquireHeal(): boolean` + `releaseHeal(): void`, or `runGuardedHeal(container, fn)`) and have
   both `onZeroPostsFound` and the manual listener call it — single source of truth; OR
2. Have the manual listener call a new exported `requestHeal()` on `observer.ts` that wraps
   `triggerHeal` in the same `_healInProgress`/`_lastHealMs` guard.

**Recommendation:** option 1/2 (extract or expose a guarded entry on `observer.ts`). Do NOT duplicate
the guard variables in `content/index.ts` — two independent latches would allow a manual click to run
concurrently with an automatic heal, defeating D-08. The service worker's own LLM rate-limit
(`background/index.ts:118-197`, `REDERIVE_COOLOFF_MS`/`REDERIVE_DAILY_CAP` + single-flight latch)
remains the backstop for LLM calls regardless.

Also note the **live-container re-resolve** rationale (`observer.ts:220-232` `checkBreakage`): LinkedIn
replaces the LazyColumn on virtual scroll without a URL change, so the manual path must resolve the
container fresh at message-receive time, never reuse a stale reference (matches D-09).

---

### Heal set: how "stale" is determined (discretion clause)

**Existing staleness signal to reuse** — `selectorSessionMisses` in `chrome.storage.local`, surfaced
to the dashboard as `sessionMisses: Set<SelectorTarget>` (`index.tsx:85, 99, 112`; written by
`recordMiss` in `selector-registry.ts:394-401`). SelectorView already consumes this to color stale
rows (`SelectorView.tsx:268-271, 374`). The heal set = stale targets, computed from existing signals;
do NOT invent a new staleness metric.

Caveat for the planner (already noted in CONTEXT D-11 / the explore note): `lastMatchedAt` is only
written by `updateCandidate`, called for just 7 targets in `observer.ts`
(`FEED_CONTAINER`, `FEED_CONTAINER_FALLBACK`, `RESHARE_INDICATOR`, `POST_AUTHOR_LINK`,
`POST_BODY_TEXT`, `POST_CARD`, `POST_URN_ATTR` — see lines 59, 65, 87, 95, 112, 148, 157). A blank
`last matched` column is NOT proof of staleness for the other live selectors. Drive the heal set off
`sessionMisses` (genuine resolve-but-no-match), intersected with the DOM-healable target set
(exclude `COMPANY_PAGE_MARKER` and attribute-name strings).

---

### Dead-selector removal (HEAL-06) — three-site mirror

**Analog:** the existing union/import/`SEED_MAP` members — remove exactly the two dead members,
mirroring how every other member appears at all three sites. Remove `POST_AUTHOR_NAME` and
`POST_URN_ATTR_FALLBACK` from:

1. **`src/content/selectors.ts`** — delete the two `export const`s:
   - `POST_AUTHOR_NAME` (`selectors.ts:73`): `'a[href*="/in/"]:has(strong) strong'`
   - `POST_URN_ATTR_FALLBACK` (`selectors.ts:62`): `'componentkey'` (identical to `POST_URN_ATTR`)
   Also update the verification comment at `selectors.ts:98` which names `POST_AUTHOR_NAME`.

2. **`src/content/selector-registry.ts`** — remove from BOTH the import block
   (`selector-registry.ts:31` `POST_URN_ATTR_FALLBACK`, `:33` `POST_AUTHOR_NAME`) AND the `SEED_MAP`
   (`selector-registry.ts:66` `POST_URN_ATTR_FALLBACK`, `:67` `POST_AUTHOR_NAME`). `SEED_MAP` is typed
   `Record<SelectorTarget, string>` (line 61) so it MUST stay exhaustive over the union — removing
   the union member and the map entry together keeps it compiling. Also check `resolve()` doc comment
   (`selector-registry.ts:211`) which mentions `POST_URN_ATTR_FALLBACK`.

3. **`src/shared/types.ts`** — remove the two members from the `SelectorTarget` union
   (`types.ts:346` `POST_URN_ATTR_FALLBACK`, `:348` `POST_AUTHOR_NAME`).

**Verify after removal:** the author name is read via the `POST_AUTHOR_LINK` anchor in `observer.ts`
(`authorAnchor?.querySelector('strong')` + `span`/text fallbacks, `observer.ts:91-104`), which fully
supersedes `POST_AUTHOR_NAME`; `POST_URN_ATTR` (not the fallback) is the only URN attr resolved
(`observer.ts:150`). Confirm with `Grep` that neither dead name has any `resolve()` consumer before
deleting. `npm test` + `npm run type-check` must stay green (D-10). **Narrow removal only** — the
other `last matched = —` rows are LIVE and MUST be kept (D-11).

---

## Shared Patterns

### Typed cross-context message envelope
**Source:** `src/background/index.ts:199-288` (handler), `src/tools/library/dom-selector-rederive/rederiver.ts:26-49`
and `src/skills/library/detect-aiwriting-llm/detect-aiwriting-llm.skill.ts:28-45` (promise-wrapped senders).
**Apply to:** the new `TRIGGER_HEAL` content listener AND the dashboard sender.
- Handler discriminates on `message?.type`, replies `{ result }` or `{ error }`, returns `true` for async.
- Sender wraps `sendMessage` in a `Promise`, rejects on `chrome.runtime.lastError`, on a falsy
  `response` ("No response from service worker"), and on `response.error`.
```typescript
return new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({ type: '…', … }, (response) => {
    if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
    if (!response) { reject(new Error('No response …')); return; }
    if (response.error) { reject(new Error(response.error)); return; }
    resolve(response.result);
  });
});
```
**Note:** the dashboard→content sender uses `chrome.tabs.sendMessage(tabId, …)` instead of
`chrome.runtime.sendMessage` — same callback/response shape, different transport (no repo analog for
`chrome.tabs.sendMessage`).

### Single-flight + cool-off heal guard
**Source:** `src/content/observer.ts:198-209` (+ state at lines 32-33, 47-48).
**Apply to:** the manual `TRIGGER_HEAL` path — reuse, do not duplicate (D-08).
**Backstop:** service-worker LLM rate-limit `src/background/index.ts:118-197`
(`checkRateLimit`/`acquireRateLimitLatch`/`releaseRateLimitLatch`, persisted to storage).

### Sole selector write surface
**Source:** `src/content/selector-registry.ts:337-388` (`insertCandidate`) gated by
`validateCandidate` (`heal.ts:65, 91`).
**Apply to:** all heal writes (D-07, CLAUDE.md #1). No new write path.

### Dashboard inline-style + auto-refresh
**Source:** `SelectorView.tsx:19-240` (`s` style map; NO CSS classes — CLAUDE.md #1) and
`index.tsx:105-115` (`chrome.storage.onChanged` → `setSelectorRegistry`).
**Apply to:** the heal button, disabled hint, and per-target result rows; row refresh after heal is
free via the existing storage listener (D-06).

---

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| `chrome.tabs.query` enablement check | provider | request-response | **Zero `chrome.tabs.*` usage in `src/`** — first use in the codebase. Spec from CONTEXT D-01. |
| `chrome.tabs.sendMessage(tabId, …)` transport | provider | request-response | Same — new dashboard→content direction. Reuse the `runtime.sendMessage` callback/response *shape*, but the transport call itself has no analog. |
| `src/manifest.json` `tabs` permission | config | n/a | May need `"tabs"` added to `permissions` if host-permission-scoped `chrome.tabs.query({url})` returns empty; verify at plan time. |

---

## Metadata

**Analog search scope:** `src/content/`, `src/background/`, `src/modules/dashboard/`,
`src/tools/library/dom-selector-rederive/`, `src/skills/library/detect-aiwriting-llm/`,
`src/shared/types.ts`, `src/manifest.json`.
**Files scanned:** 13 read in full + repo-wide greps for `chrome.tabs`, `onMessage`/`sendMessage`,
`SelectorTarget`, and the dead selector names.
**Key codebase facts established:**
- No existing `chrome.tabs.*` usage (dashboard→content is genuinely new).
- `src/content/index.ts` has no `chrome.runtime.onMessage` listener yet — `TRIGGER_HEAL` is the first.
- All typed messaging is currently content/skill → SW via ONE handler in `background/index.ts:199`.
- The dashboard already auto-refreshes Selector Health on `selectorRegistry` storage change
  (satisfies half of D-06).
- `deriveHeuristicCandidates` is typed `'POST_CARD' | 'POST_BODY_TEXT'`; `LLMRederiver.rederive`
  takes a generic `target: string`.
- `SEED_MAP` is `Record<SelectorTarget, string>` (exhaustive) — union + map + import must change together.
- Manifest lacks `"tabs"` permission; has linkedin.com host permission.
**Pattern extraction date:** 2026-06-20
