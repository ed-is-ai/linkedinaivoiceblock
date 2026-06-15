# Phase 28: Evals Dashboard (future) - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 9 (3 new, 6 modified)
**Analogs found:** 9 / 9 (all in-repo; no RESEARCH.md fallback needed)

> Every new file in this phase has a strong in-codebase analog. The eval *logic* (types,
> metrics, sweep, compare) already ships in `src/shared/eval/` — Phase 28 is a thin
> persistence envelope + a Preact page + a few additive field/link edits. Copy idioms
> verbatim from the analogs below; do not reinvent.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/dashboard/evals.html` (NEW) | config/entry (HTML root) | request-response | `src/dashboard/index.html`, `src/popup/index.html` | exact |
| `src/dashboard/evals.tsx` (NEW) | component (Preact page) | CRUD + request-response | `src/dashboard/index.tsx` | exact |
| `src/shared/eval/evalRunStore.ts` (NEW) | service (persistence) | CRUD / FIFO append | `src/shared/traceStore.ts` (`appendTrace`) | exact |
| `src/shared/types.ts` (MODIFY §178-191) | model (type) | — | existing `UnflaggedPost.label?` (§220) | exact |
| `src/shared/eval/runs.ts` (MODIFY — optional `incomplete?`) | model (type) | — | existing `EvalRun` (§79-110) | exact |
| `src/shared/postStore.ts` (MODIFY — label write-back) | service (persistence) | CRUD | existing `persistStoredPost` / `persistUnflaggedPost` | exact |
| `src/dashboard/index.tsx` (MODIFY — add evals link) | component | — | `src/popup/index.tsx:114-115,157` (`openDashboard`) | exact |
| `src/popup/index.tsx` (MODIFY — add evals link) | component | — | `src/popup/index.tsx:114-115,157` (`openDashboard`) | exact |
| `src/manifest.json` + `vite.config.ts` (MODIFY — register entry) | config | — | `src/manifest.json` §26-37, `vite.config.ts` | exact |

**Naming note (Claude's Discretion, D-01):** The eval barrel comments (`runs.ts:6`,
`metrics.ts:15`, `index.ts:5`) already reference the future file as
`src/dashboard/evals.tsx`. Recommend keeping that path so the page sits beside `index.tsx`
and is discovered by `vite-plugin-web-extension` as a manifest-referenced HTML entry. Use
`evals.html` + `evals.tsx` co-located in `src/dashboard/`.

---

## Pattern Assignments

### `src/shared/eval/evalRunStore.ts` (NEW — service, FIFO append)

**Analog:** `src/shared/traceStore.ts` (entire file, 76 lines). Mirror it exactly:
serialized write chain + read → prepend (newest-first) → `pop()`-on-overflow → write,
non-rejecting. CONTEXT D-03 names this the required idiom; `MAX_EVAL_RUNS = 50`.

**Header / shared-module constraint** (`traceStore.ts:11-16`):
```typescript
// Shared module — must NOT import from content/ and must NOT reference the
// document or the extension runtime. Only chrome.storage.local (via storage wrappers).
import { storageGet, storageSet } from './storage';   // NOTE: from '../storage' inside src/shared/eval/
import type { TraceEntry } from './types';
```
> `evalRunStore.ts` lives in `src/shared/eval/`, so the imports are `from '../storage'`
> and `import type { EvalRun } from './runs'` (NOT a redefinition — consume the shipped type).

**Cap constant** — the cap already exists in the data model contract. Per CONTEXT
(`28-CONTEXT.md:22`) `EVAL_RUNS_KEY = 'evalRuns'` and `MAX_EVAL_RUNS = 50` are dashboard-only;
`runs.ts:12-13` explicitly says do NOT define them in `runs.ts`. Define them in this new
module:
```typescript
export const EVAL_RUNS_KEY = 'evalRuns';
export const MAX_EVAL_RUNS = 50;
```

**FIFO serialized-write idiom — copy verbatim** (`traceStore.ts:41-75`):
```typescript
let writeChain: Promise<void> = Promise.resolve();

export function appendEvalRun(run: EvalRun): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      const { evalRuns = [] } = await storageGet([EVAL_RUNS_KEY]);
      const updated = [run, ...(evalRuns as EvalRun[])];   // prepend = newest first
      if (updated.length > MAX_EVAL_RUNS) updated.pop();    // pop() = evict oldest; NOT slice()
      await storageSet({ [EVAL_RUNS_KEY]: updated });
    })
    .catch(() => {});                                       // non-rejecting
  return writeChain;
}
```
> The `pop()` (not `slice()`) eviction is an enforced codebase idiom — see the inline note at
> `traceStore.ts:65`. A read accessor (`getEvalRuns(): Promise<EvalRun[]>` wrapping
> `storageGet`) is also needed for the page's "compare to previous" view.

**Storage wrapper signatures** (`src/shared/storage.ts:25,37`):
```typescript
export async function storageGet<K extends keyof StorageSchema>(...)
export async function storageSet(values: Partial<StorageSchema>): Promise<void>
```
> `evalRuns` must be added to `StorageSchema` (in `types.ts`) so the typed wrappers accept it
> — same way `llbTraces`, `storedPosts`, `unflaggedPosts` are keyed.

---

### `src/dashboard/evals.tsx` (NEW — Preact page, CRUD + request-response)

**Analog:** `src/dashboard/index.tsx` (whole file). Copy the page skeleton, the styles-object
convention, the storage-read `useEffect`, and the render mount. Render the layout from the
locked mockup `evals-option-a-console.html`.

**Mount + imports + render** (`index.tsx:1-7,359`):
```typescript
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { StoredPost, UnflaggedPost } from '../shared/types';
// consume the shipped eval core — DO NOT redefine these:
import { summarize, compareRuns, computeMetrics, filterErrors, buildPostData, formatSignalBreakdown,
         type EvalRun, type PostDetail, type ThresholdRow } from '../shared/eval';
// ...
render(<App />, document.getElementById('root')!);
```

**Storage-read on mount** — copy the pattern at `index.tsx:87-103` (single
`chrome.storage.local.get([...])` → `setState`, `.catch` → friendly load error):
```typescript
useEffect(() => {
  chrome.storage.local.get(['storedPosts', 'unflaggedPosts', 'evalRuns'])
    .then((r) => { setPosts(r.storedPosts ?? []); setUnflagged(r.unflaggedPosts ?? []); setRuns(r.evalRuns ?? []); })
    .catch(() => setLoadError('Could not load data. Try reopening the page.'));
}, []);
```

**Styles object convention — REQUIRED** (`index.tsx:307-357`). Use one typed `const s`
object of inline-style objects (NOT CSS files / class names — aligns with CLAUDE.md
"no CSS class names" and the popup/dashboard precedent):
```typescript
const s: Record<string, import('preact').JSX.CSSProperties> = {
  page: { maxWidth: 640, margin: '40px auto', padding: '0 24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#1a1a1a' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '20px 24px', marginBottom: 16 },
  toggleActive: { /* brand blue #0a66c2 fill */ }, actionBtn: { /* ... */ }, /* etc */
};
```
> Brand palette already established: primary `#0a66c2`, destructive `#dc2626`, muted `#6b7280`/`#9ca3af`,
> borders `#e5e7eb`/`#d1d5db`. Reuse for the metric grid, sweep table (highlight best row),
> FP/FN cards, and Δ table.

**Run-loop reference (heuristic + LLM) — adapt from the CLI** (`scripts/eval.ts:191-318`).
The CLI is the authoritative shape; the page does the same sequence but in-browser:

- **Heuristic path** (`eval.ts:193,209-210`): `new HeuristicDetector()` with NO `fetchComments`
  (DOM-free; generic-comments signal won't fire — that's expected). Then
  `buildPostData(entry)` → `detector.detect(postData)`.
  ```typescript
  const detector = new HeuristicDetector();         // src/content/detector/heuristic.ts:41
  const postData = buildPostData(post as unknown as Record<string, unknown>);
  const result = await detector.detect(postData);   // { score, confidence, signalBreakdown, reasoning? }
  ```
- **LLM path** — the CLI calls `classifyPost(text, apiKey)` directly, but **the page must NOT**
  (no Anthropic fetch from a page; D-07). Instead route each post through the existing
  service-worker relay (analog `src/background/index.ts:343-360`):
  ```typescript
  const resp = await chrome.runtime.sendMessage({ type: 'SCORE_POST', postText: post.text });
  if (resp.error) { errored++; continue; }          // SCORE_POST returns { result } | { error }
  scored.push({ label: post.label, score: resp.result.score });
  ```
  > The `SCORE_POST` handler is NOT rate-limited (only `REDERIVE_SELECTOR` is — `index.ts:362-366`),
  > and each call already self-records a trace. So the page fires N sequential calls; the
  > pre-run estimate (D-05) and Cancel (D-06) are the only spend guards. Loop sequentially
  > (await each), accumulate `scored`/`details`/`errored`, and on Cancel break the loop.

**Sweep + best-F1 + error-analysis + EvalRun assembly — copy structure** (`eval.ts:259-319`):
use the shipped `computeMetrics` per threshold, pick highest non-null `f1`, compute
`filterErrors(details, bestF1Threshold, 'human'|'ai')` AFTER the sweep, then assemble the
`EvalRun` literal exactly as `eval.ts:289-319` — but with `source: 'dashboard'`,
`dataset.source: 'storage'`. On completion call `appendEvalRun(run)`.

**Partial-run flag (D-06):** when cancelled/errored, still assemble + persist the `EvalRun`.
Mark incompleteness either via the optional `incomplete?: boolean` field added to `runs.ts`
(see modify section) or derive it from `counts.scored < counts.labeled`. Render partial
metrics with a visible "partial" marker.

**Cost estimate for D-05 confirm modal** — use `MODEL_PRICING` / `computeCostUsd` from
`src/shared/pricing.ts:31-93`. Estimate = `postCount × avgUsdPerPost` (avg derived from a
typical post's token count, or a flat per-post estimate). The actual per-call cost comes back
inside each `SCORE_POST` trace; accumulate running cost for the "47/142 · $0.02 so far" readout.

---

### `src/dashboard/evals.html` (NEW — HTML entry)

**Analog:** `src/dashboard/index.html` (identical 12-line shape). Copy verbatim, change title
and script src:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LinkedIn Blocker — Evals</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./evals.tsx"></script>
  </body>
</html>
```

---

### `src/manifest.json` + `vite.config.ts` (MODIFY — register the build entry)

**Analogs:** `src/manifest.json:34-37` (`options_ui` → `dashboard/index.html`) and
`vite.config.ts` (whole file). D-02 says the evals page is NOT a second `options_ui` slot —
it is opened via in-UI links. `vite-plugin-web-extension` discovers HTML entries that are
*referenced from the manifest*; a page reachable only via `chrome.runtime.getURL` needs to be
declared so it gets built and shipped.

**Mechanism (Claude's Discretion, D-01):** the established way to ship an extra page with this
plugin is `web_accessible_resources` (or the plugin's `additionalInputs`). Current manifest has
no `web_accessible_resources`; adding the new page there is the lowest-risk path:
```jsonc
// src/manifest.json — additive
"web_accessible_resources": [
  { "resources": ["dashboard/evals.html"], "matches": ["https://www.linkedin.com/*"] }
]
```
> The vite config (`vite.config.ts:1-18`) needs no change if the plugin picks the page up from
> the manifest; if not, declare it via the plugin's `additionalInputs`. Planner: verify which
> the installed `vite-plugin-web-extension` version requires — this is the one piece of build
> wiring left to Claude's Discretion.

**Resolved URL for the links:** `chrome.runtime.getURL('dashboard/evals.html')` (mirrors the
existing `getURL('dashboard/index.html')` at `popup/index.tsx:115`).

---

### `src/popup/index.tsx` & `src/dashboard/index.tsx` (MODIFY — add "Evals" link)

**Analog:** the popup's existing dashboard link — `popup/index.tsx:114-116` + button at `:157`
+ style `dashboardLink` at `:386`. Add a sibling:
```typescript
function openEvals() {
  window.open(chrome.runtime.getURL('dashboard/evals.html'), '_blank', 'noreferrer');
}
// ...
<button onClick={openEvals} style={styles.dashboardLink}>🧪 Open Evals</button>
```
> For `dashboard/index.tsx`, add the same `window.open(getURL(...))` button using the existing
> `s.actionBtn` style (`index.tsx:345`) inside the Data-management card or a new small header link.

---

### `src/shared/types.ts` (MODIFY §178-191 — add `label?` to `StoredPost`; D-10)

**Analog:** `UnflaggedPost.label?` at `types.ts:216-220` — copy the field + doc, but the doc
must say the *Evals page* writes it (a deliberate shift from "never written by the extension").
```typescript
export interface StoredPost {
  urn: string; authorId: string; authorName: string; score: number; text: string; hiddenAt: number;
  /** User-supplied ground-truth label ('ai' | 'human') for eval purposes.
   *  Written by the Evals page (Phase 28, D-08) — the content script never writes it. */
  label?: string;   // <-- additive, mirrors UnflaggedPost.label
}
```
> This is the cleanest of D-10's two options (vs a separate URN→label map). `FlaggedPost`
> (`types.ts:234-252`) is export-only and already has `label?` — leave it as is. Also add the
> `evalRuns` key to `StorageSchema` so `storageGet/storageSet` are typed for it.

---

### `src/shared/eval/runs.ts` (MODIFY — optional `incomplete?: boolean`; D-06)

**Analog:** the existing `EvalRun` interface (`runs.ts:79-110`). Per D-06, EITHER add a small
additive field OR derive from counts — Claude's Discretion. If adding:
```typescript
export interface EvalRun {
  // ...existing fields...
  /** True when a run was cancelled/interrupted; metrics computed on partial data (Phase 28, D-06). */
  incomplete?: boolean;   // additive, optional — preserves CLI/storage drop-in compatibility
}
```
> Optional + additive keeps the DATA-MODEL.md "drop-in, no migration" guarantee (`runs.ts:73-78`).
> The CLI never sets it (its runs are always complete), so existing `results-*.json` stay valid.
> Recommendation per CONTEXT: deriving from `counts.scored < counts.labeled` avoids touching the
> contract at all — planner's call.

---

### `src/shared/postStore.ts` (MODIFY — label write-back; D-08/D-09)

**Analog:** `persistStoredPost` (`postStore.ts:40-67`) and `persistUnflaggedPost` (`:83-121`) —
same read → find-by-urn → mutate → `storageSet` shape. Add label write-back functions that
mutate the matching entry's `label` in `storedPosts[]` and `unflaggedPosts[]`:
```typescript
export async function setPostLabel(urn: string, label: 'ai' | 'human'): Promise<void> {
  const { storedPosts = [], unflaggedPosts = [] } = await storageGet(['storedPosts', 'unflaggedPosts']);
  const inStored = storedPosts.find((p: StoredPost) => p.urn === urn);
  if (inStored) { inStored.label = label; await storageSet({ storedPosts }); return; }
  const inUnflagged = unflaggedPosts.find((p) => p.urn === urn);
  if (inUnflagged) { inUnflagged.label = label; await storageSet({ unflaggedPosts }); }
}
```
> **D-09 idempotent bulk-seed:** the bulk button seeds `flagged→ai`, `unflagged→human` and must
> only fill entries where `label` is currently undefined — never overwrite a manual label.
> Mirror the existing dedup-guard style (`postStore.ts:51,97` use `.some(...)` to skip) — here
> guard with `if (p.label === undefined) p.label = ...`.

---

## Shared Patterns

### Serialized FIFO write chain (newest-first, `pop()` eviction, non-rejecting)
**Source:** `src/shared/traceStore.ts:41-75` (cap 500). Also `postStore.ts:62-66` (cap 200).
**Apply to:** new `evalRunStore.ts` (cap 50). This is the single enforced storage-write idiom.

### Stateless Preact page reading `chrome.storage.local` directly + inline-style objects
**Source:** `src/dashboard/index.tsx` (read `useEffect` :87-103, styles `const s` :307-357, mount :359);
`src/popup/index.tsx` parallels it.
**Apply to:** `evals.tsx`. No backend, no router, no CSS files — read storage, render, write via
`storageSet`/`chrome.storage.local.set`. (CLAUDE.md: local-only storage, no CSS class names.)

### Consume-the-shared-eval-core seam (one impl, CLI + dashboard)
**Source:** `src/shared/eval/index.ts` barrel; `runs.ts`/`metrics.ts` headers explicitly name
`src/dashboard/evals.tsx` as the future consumer.
**Apply to:** `evals.tsx` imports `summarize`, `compareRuns`, `computeMetrics`, `filterErrors`,
`buildPostData`, `formatSignalBreakdown`, and all `EvalRun*` types from `../shared/eval` —
NEVER redefines them. The compare view uses `compareRuns` (same fn the CLI's eval-compare uses,
so terminal and UI diffs can't drift).

### Page-to-page navigation via `chrome.runtime.getURL` + `window.open`
**Source:** `src/popup/index.tsx:114-116,157`.
**Apply to:** the popup→evals and dashboard→evals links.

### LLM scoring via the service-worker `SCORE_POST` relay (never fetch from a page)
**Source:** handler `src/background/index.ts:343-360`; request shape
`{ type: 'SCORE_POST', postText }` → response `{ result } | { error }`. CLI's direct
`classifyPost` call (`eval.ts:214`) is the WRONG pattern for the page.
**Apply to:** the LLM run loop in `evals.tsx`. Not rate-limited; each call self-traces.

### Cost math
**Source:** `src/shared/pricing.ts` — `MODEL_PRICING` (:31), `computeCostUsd` (:62-93).
**Apply to:** D-05 pre-run estimate modal + D-06 running-cost readout.

## No Analog Found

None. Every file maps to an existing in-repo pattern.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | — |

## Metadata

**Analog search scope:** `src/shared/` (traceStore, postStore, pricing, classifier, storage, eval/),
`src/dashboard/`, `src/popup/`, `src/background/`, `src/content/detector/`, `scripts/eval.ts`,
`src/manifest.json`, `vite.config.ts`.
**Files scanned:** ~15.
**Pattern extraction date:** 2026-06-15.
