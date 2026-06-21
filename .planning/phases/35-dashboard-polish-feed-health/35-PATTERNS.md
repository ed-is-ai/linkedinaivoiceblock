# Phase 35: Dashboard Polish & Feed Health - Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 7 (all modified, no new files)
**Analogs found:** 7 / 7 (all in-repo, all verified against live source)

> Phase 35 is pure observability/UI polish: it adds call sites and UI strings to existing
> files. Every pattern below is an **internal precedent in the same repo** (not a remote
> library example) — the planner should copy these excerpts verbatim into plan actions.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/skills/library/exclude-sponsored/exclude-sponsored.skill.ts` | exclusion-skill | event-driven (telemetry side-effect) | `src/content/observer.ts` `updateCandidate(...).catch(()=>{})` precedent | exact (same mechanism) |
| `src/skills/library/exclude-company-page/exclude-company-page.skill.ts` | exclusion-skill | event-driven (telemetry side-effect) | `src/content/observer.ts` precedent + COMPANY_PAGE URL-substring note | exact |
| `src/skills/library/exclude-open-to-work/exclude-open-to-work.skill.ts` | exclusion-skill | event-driven (telemetry side-effect) | `src/content/observer.ts` precedent | exact |
| `src/content/detector/signals/profile.ts` | signal-extractor (utility) | transform (DOM → score) + telemetry | `src/content/observer.ts` `extractPostData` (resolve→query→if match→updateCandidate) | exact (same function lives in same content tier) |
| `src/content/detector/comment-expand.ts` | signal-helper (utility) | request-response (click + read) + telemetry | `src/content/observer.ts` precedent | exact |
| `src/modules/dashboard/index.tsx` | component (Preact view) | request-response (read storage, render) | self — existing "Export LLM call traces (N)" button (line 344) | exact (same file) |
| `src/modules/dashboard/SelectorView.tsx` | component (Preact view) | request-response (read storage, render) | self — existing `s.selector` cell CSS (lines 121–129) | exact (same file, sibling cell) |
| `src/modules/dashboard/index.html` | config (static HTML) | n/a | self — existing `<title>` (line 6) | exact |

**Shared analog for all 5 SHA-01 telemetry sites:** `src/content/observer.ts` already does
exactly what SHA-01 needs for the *structural* selectors. The five contextual sites copy that
shape. The only deltas are (a) the import path depth and (b) the COMPANY_PAGE URL-substring
semantics.

## Pattern Assignments

### `exclude-sponsored.skill.ts` (exclusion-skill, telemetry side-effect)

**Analog:** `src/content/observer.ts:85-89` (RESHARE_INDICATOR — resolve once, query, if truthy call updateCandidate).

**Current code** (`exclude-sponsored.skill.ts:15-27` — query is inline in the ternary; must be hoisted so the resolved string can be reused as the `winnerValue`):
```typescript
import { resolve } from '../../../content/selector-registry';
// ...
  check(_postData: PostData, postNode: Element) {
    return postNode.querySelector(resolve('SPONSORED_MARKER'))
      ? { excluded: true, reason: 'sponsored' as const }
      : { excluded: false };
  },
```

**Analog pattern to mirror** (`observer.ts:85-89`):
```typescript
const reshareIndicatorSelector = resolve('RESHARE_INDICATOR');
const innerCard = card.querySelector(reshareIndicatorSelector);
if (innerCard) {
  updateCandidate('RESHARE_INDICATOR', reshareIndicatorSelector).catch(() => {});
}
```

**Resulting shape** (hoist the selector, branch on the match, fire-and-forget before returning):
```typescript
import { resolve, updateCandidate } from '../../../content/selector-registry';
// ...
  check(_postData: PostData, postNode: Element) {
    const sponsoredSelector = resolve('SPONSORED_MARKER');
    if (postNode.querySelector(sponsoredSelector)) {
      updateCandidate('SPONSORED_MARKER', sponsoredSelector).catch(() => {});
      return { excluded: true, reason: 'sponsored' as const };
    }
    return { excluded: false };
  },
```
- **Import change:** extend the existing `import { resolve } from '../../../content/selector-registry'` (line 15) to also import `updateCandidate` from the same module. No new module-graph edge (the edge already exists; verified `exclude-sponsored.skill.ts:15`).
- Fire only on the truthy match (D-03). Do not call on the no-match branch.

---

### `exclude-company-page.skill.ts` (exclusion-skill, telemetry side-effect — URL substring, NOT a DOM element)

**Analog:** `observer.ts` precedent, but the "match" is `includes() === true`, not a DOM query.

**Current code** (`exclude-company-page.skill.ts:16-28`):
```typescript
import { resolve } from '../../../content/selector-registry';
// ...
  check(postData: PostData, _postNode: Element) {
    return postData.authorProfileUrl.includes(resolve('COMPANY_PAGE_MARKER'))
      ? { excluded: true, reason: 'company-page' as const }
      : { excluded: false };
  },
```

**Resulting shape** (the `winnerValue` is the **resolved marker string itself** — Pitfall 3):
```typescript
import { resolve, updateCandidate } from '../../../content/selector-registry';
// ...
  check(postData: PostData, _postNode: Element) {
    const marker = resolve('COMPANY_PAGE_MARKER');
    if (postData.authorProfileUrl.includes(marker)) {
      updateCandidate('COMPANY_PAGE_MARKER', marker).catch(() => {});
      return { excluded: true, reason: 'company-page' as const };
    }
    return { excluded: false };
  },
```
- **Critical (Pitfall 3 / D-03):** pass `marker` (the resolved string, e.g. `/company/`) as `winnerValue`, NOT a boolean or DOM node. `marker === candidate[0].value`, so the registry bumps `lastMatchedAt` at idx 0 (the cheap path).

---

### `exclude-open-to-work.skill.ts` (exclusion-skill, telemetry side-effect — passthrough, always `excluded:false`)

**Analog:** `observer.ts` precedent. **Constraint:** this skill MUST keep returning
`{ excluded: false, openToWork }` — the telemetry call is a pure side-effect added before/inside
the return; it must not change the return shape (skill header lines 8-13 mark this parity-critical).

**Current code** (`exclude-open-to-work.skill.ts:23-37`):
```typescript
import { resolve } from '../../../content/selector-registry';
// ...
  check(_postData: PostData, postNode: Element) {
    return {
      excluded: false,
      openToWork: !!postNode.querySelector(resolve('OPEN_TO_WORK_MARKER')),
    };
  },
```

**Resulting shape** (hoist, branch on truthy match for the telemetry, preserve the exact return):
```typescript
import { resolve, updateCandidate } from '../../../content/selector-registry';
// ...
  check(_postData: PostData, postNode: Element) {
    const otwSelector = resolve('OPEN_TO_WORK_MARKER');
    const matched = !!postNode.querySelector(otwSelector);
    if (matched) {
      updateCandidate('OPEN_TO_WORK_MARKER', otwSelector).catch(() => {});
    }
    return { excluded: false, openToWork: matched };
  },
```
- Reuse the single `querySelector` result for both `openToWork` and the telemetry gate (one query, no double DOM read).
- Return shape unchanged (still `{ excluded: false, openToWork }`).

---

### `signals/profile.ts` (signal-extractor, two selectors in one function)

**Analog:** `observer.ts:85-118` `extractPostData` — same content-tier function that interleaves
`resolve → query → if(el) updateCandidate` for several targets in one pass.

**Current code** (`profile.ts:136-152`, `extractProfileSignals`):
```typescript
import { resolve } from '../../selector-registry';
// ...
export function extractProfileSignals(postNode: Element): Record<string, number> {
  const signals: Record<string, number> = {};

  const headlineEl = postNode.querySelector(resolve('AUTHOR_HEADLINE'));
  const headlineText = (headlineEl as HTMLElement | null)?.innerText?.trim() ?? '';
  const headlineScore = checkHeadlineFormula(headlineText);
  if (headlineScore > 0) signals['headline-formula'] = headlineScore;

  const degreeEl = postNode.querySelector(resolve('CONNECTION_DEGREE'));
  // ...
}
```

**Resulting shape** (hoist each resolved selector so it can be reused as `winnerValue`; fire on the truthy element match, BEFORE the score gate — D-03 says fire on the selector match, not on score>0):
```typescript
import { resolve, updateCandidate } from '../../selector-registry';
// ...
  const headlineSel = resolve('AUTHOR_HEADLINE');
  const headlineEl = postNode.querySelector(headlineSel);
  if (headlineEl) updateCandidate('AUTHOR_HEADLINE', headlineSel).catch(() => {});
  // ... existing innerText + checkHeadlineFormula scoring unchanged ...

  const degreeSel = resolve('CONNECTION_DEGREE');
  const degreeEl = postNode.querySelector(degreeSel);
  if (degreeEl) updateCandidate('CONNECTION_DEGREE', degreeSel).catch(() => {});
  // ... existing degree scoring unchanged ...
```
- **Import change:** `profile.ts:16` currently imports only `resolve` — extend to `import { resolve, updateCandidate } from '../../selector-registry';`.
- Fire on the truthy **element** match (`if (headlineEl)` / `if (degreeEl)`), not on `score > 0`. A real selector match is the telemetry event.
- The pure functions (`checkHeadlineFormula`, `checkConnectionDegree`) are untouched — they remain DOM-free and testable.

---

### `comment-expand.ts` (signal-helper, two selectors; one inside try/catch)

**Analog:** `observer.ts` precedent. The whole function body is already wrapped in `try/catch`
(silent-degrade), so the fire-and-forget `.catch(()=>{})` is layered inside that.

**Current code** (`comment-expand.ts:55-82`, inside `expandComments`):
```typescript
import { resolve } from '../selector-registry';
// ...
    const button = postNode.querySelector(resolve('COMMENT_EXPAND_BUTTON')) as HTMLElement | null;
    if (button === null) {
      return [];
    }
    button.click();
    pageExpansionCount++;
    await new Promise<void>(r => setTimeout(r, 800));
    const comments = Array.from(postNode.querySelectorAll(resolve('COMMENT_TEXT')))
      .map(el => (el as HTMLElement).innerText.trim())
      .filter(Boolean)
      .slice(0, 20);
    return comments;
```

**Resulting shape** (hoist both selectors; fire COMMENT_EXPAND_BUTTON after the non-null check, COMMENT_TEXT when ≥1 element node is found — A3, before `.filter(Boolean)`):
```typescript
import { resolve, updateCandidate } from '../selector-registry';
// ...
    const buttonSel = resolve('COMMENT_EXPAND_BUTTON');
    const button = postNode.querySelector(buttonSel) as HTMLElement | null;
    if (button === null) return [];
    updateCandidate('COMMENT_EXPAND_BUTTON', buttonSel).catch(() => {});
    button.click();
    pageExpansionCount++;
    await new Promise<void>(r => setTimeout(r, 800));

    const commentSel = resolve('COMMENT_TEXT');
    const commentEls = Array.from(postNode.querySelectorAll(commentSel));
    if (commentEls.length > 0) updateCandidate('COMMENT_TEXT', commentSel).catch(() => {});
    const comments = commentEls
      .map(el => (el as HTMLElement).innerText.trim())
      .filter(Boolean)
      .slice(0, 20);
    return comments;
```
- **Import change:** `comment-expand.ts:25` currently imports only `resolve` — extend to `import { resolve, updateCandidate } from '../selector-registry';`.
- COMMENT_TEXT fires when at least one element node is found (`commentEls.length > 0`), i.e. before `.filter(Boolean)`/`.slice(20)` (A3 — truthy match per D-03).
- Both calls stay inside the existing `try { ... } catch { return []; }` so a stale node still degrades silently.

---

### `index.tsx` — BRAND-01, EXPORT-01, EXPORT-02 (component)

**Analog for EXPORT-02 "(N)":** the existing "Export LLM call traces (N)" button in the SAME
Data Management block (`index.tsx:339-345`). It is the count-in-label precedent.

**BRAND-01 — header** (`index.tsx:253`; `s.heading` token at line 384 `{ fontSize: 22, fontWeight: 700, marginBottom: 24 }`):
```tsx
// current:
<h1 style={s.heading}>LinkedIn Blocker — Feed Health</h1>
// →
<h1 style={s.heading}>LinkedIn AIVoice blocker - Feed Health</h1>
<div style={s.subtitle}>because your brain deserves better</div>
```
- Add a new `s.subtitle` style token (discretion D-09 — match existing dashboard tokens, e.g. a muted color like `#6b7280` and smaller `fontSize`, mirroring `s.statSub`/`s.categoryNote` style values in this file). The `s.heading` `marginBottom: 24` may need to move to the subtitle so the pair stays grouped — executor's call.
- Exact strings (locked): h1 = `LinkedIn AIVoice blocker - Feed Health` (note "AIVoice" one word, spaced hyphen); subtitle = `because your brain deserves better`.

**EXPORT-01 — JSON label** (`index.tsx:334`, label-only; `handleExportJson` and the `accounts.length > 0 || posts.length > 0 || unflagged.length > 0` gate on line 333 are unchanged):
```tsx
// current:
<button style={s.actionBtn} onClick={handleExportJson}>Export JSON</button>
// →
<button style={s.actionBtn} onClick={handleExportJson}>Export matching behaviour</button>
```

**EXPORT-02 — Posts CSV label + gate** (`index.tsx:336-338`):
```tsx
// current:
{accounts.length > 0 && (
  <button style={s.actionBtn} onClick={handleExportPostsCsv}>Export Posts CSV</button>
)}
// →  (gate flips to posts.length; count is unconditional because the gate guarantees ≥1)
{posts.length > 0 && (
  <button style={s.actionBtn} onClick={handleExportPostsCsv}>Export Posts seen ({posts.length})</button>
)}
```
- `posts` state already exists (`index.tsx:79` `useState<StoredPost[]>([])`) and is the same array `handleExportPostsCsv` / `buildPostsCsvExport` use — `posts.length` is the N (D-07). No new state.
- Mirror the traces button's `(N)` format. The traces button guards the count with `traces.length > 0 ? ...` because it renders even at 0; here the gate already guarantees `posts.length >= 1`, so render `({posts.length})` unconditionally (no `> 0 ?` guard).
- `handleExportPostsCsv` behavior unchanged (D-08).

---

### `SelectorView.tsx` — SHA-02 row alignment (component)

**Analog:** the sibling `s.selector` cell in the SAME file (`SelectorView.tsx:121-129`), which
already sets `overflow/textOverflow/whiteSpace:nowrap`. The fix makes the `s.target` cell
behave consistently — but WITHOUT truncation (D-05 requires names stay fully readable).

**Root cause** (verified): every cell uses `flex: '0 0 <pct>%'`. The `s.target` cell
(`lines 116-120`) sets only `flex/fontSize/fontWeight` and **no `whiteSpace`**, so the
21-char `COMMENT_EXPAND_BUTTON` can wrap to two lines at the 27% basis (page `maxWidth:640`,
`index.tsx:378`), increasing that row's height and misaligning it.

**Current cell + matching header** (`SelectorView.tsx:84-86` header, `116-120` cell):
```tsx
columnHeaderTarget: {
  flex: '0 0 27%',
},
// ...
target: {
  flex: '0 0 27%',
  fontSize: 13,
  fontWeight: 400,
},
```

**Recommended fix (Pattern 2 / D-05):** add `whiteSpace: 'nowrap'` to `s.target` and widen the
basis enough to fit `COMMENT_EXPAND_BUTTON` on one line; reclaim the width from the `selector`
column (which already ellipsis-truncates). **Change `columnHeaderTarget` and `target` together**
(Pitfall 4 — keep header/cell flex-basis identical):
```tsx
columnHeaderTarget: { flex: '0 0 30%' },          // was 27%
columnHeaderSelector: { flex: '0 0 29%' },        // was 32% — reclaim 3% (cell already ellipsises)
// ...
target: {
  flex: '0 0 30%',                                // was 27%, matches header
  fontSize: 13,
  fontWeight: 400,
  whiteSpace: 'nowrap' as const,                  // NEW — prevents the wrap (no overflow/ellipsis: names stay fully readable, D-05)
},
selector: { flex: '0 0 29%', /* ...existing overflow/ellipsis... */ },
```
- Do NOT add `overflow:hidden`/`textOverflow:ellipsis` to `s.target` — that would truncate names, violating D-05. `whiteSpace:nowrap` alone forces one line; widening the basis ensures the longest name fits.
- **Alternative (discretion D-05):** convert the header+row from flexbox to CSS grid with `gridTemplateColumns: minmax(220px, 30%) 1fr 13% 13% 13%`. Cleaner long-term, larger diff. Either satisfies D-05; the flex tweak is the smaller change.
- Verify `COMMENT_EXPAND_BUTTON` renders on one line at `maxWidth:640` (the longest target name).

---

### `index.html` — BRAND-01 / D-10 tab title (config)

**Current** (`index.html:6`):
```html
<title>LinkedIn Blocker — Dashboard</title>
```
**→** set to the header string for tab-bar consistency (Assumption A1 — CONTEXT mandates updating it but gives no literal; default to header text unless user specifies):
```html
<title>LinkedIn AIVoice blocker - Feed Health</title>
```

## Shared Patterns

### Fire-and-forget selector telemetry (applies to all 5 SHA-01 sites)
**Source:** `src/content/observer.ts:85-89` (RESHARE_INDICATOR), repeated across lines 60-158.
**Contract:** `src/content/selector-registry.ts:227-282`.
```typescript
const sel = resolve('TARGET');            // resolve once
const matched = node.querySelector(sel);  // (or .includes(sel) for COMPANY_PAGE)
if (matched) {
  updateCandidate('TARGET', sel).catch(() => {});  // never awaited; both this .catch
                                                   // and the internal storageSet.catch required
}
```
**Verified facts from `selector-registry.ts:227-282`:**
- `updateCandidate(target, winnerValue)`: no-op if `_cache` is null or target/value not found (safe to call unconditionally).
- `winnerValue` must equal an existing `candidate.value`; passing `resolve(target)` lands at idx 0 and just bumps `lastMatchedAt` (ISO string) + `matchCount++` — the cheap path D-02 relies on.
- It persists internally via `await storageSet({ selectorRegistry: _cache }).catch(() => {})`.
**Apply to:** the 3 exclusion skills, `profile.ts`, `comment-expand.ts`. Each only CALLS `updateCandidate` — never writes `selectorRegistry` directly (single-writer invariant, CLAUDE.md #1).

### Single-writer invariant (CLAUDE.md #1)
**Source:** `src/content/selector-registry.ts` is the only module that writes `selectorRegistry`.
**Apply to:** all 5 SHA-01 files — they import and call `updateCandidate`; never `storageSet({ selectorRegistry })`. (Verifier should grep for stray `storageSet({ selectorRegistry })` outside `selector-registry.ts`.)

### Inline `s.*` style-token map (Preact dashboard)
**Source:** `src/modules/dashboard/index.tsx:378+` and `SelectorView.tsx:22-316` — `const s: Record<string, JSX.CSSProperties> = { ... }`.
**Apply to:** BRAND-01 (`s.subtitle` new token — model on `s.statSub`/`s.categoryNote`), SHA-02 (`s.target`/`s.columnHeaderTarget` edits). New visual styling goes through a token in `s`, never a raw inline literal at the JSX site, matching the file's convention.

### Count-in-label button (EXPORT-02)
**Source:** `src/modules/dashboard/index.tsx:344` — `Export LLM call traces{traces.length > 0 ? ` (${traces.length})` : ''}`.
**Apply to:** the Posts-seen button. Difference: EXPORT-02's gate (`posts.length > 0`) already guarantees ≥1, so the `(N)` is rendered unconditionally inside the button.

## No Analog Found

None. All 7 files have an exact in-repo precedent (the SHA-01 sites mirror `observer.ts`; the
dashboard edits mirror existing siblings in the same files). The planner does NOT need to fall
back to RESEARCH.md generic patterns for any file.

## Anti-Patterns (do NOT do — from RESEARCH)

| Anti-pattern | Why it's wrong |
|--------------|----------------|
| Instrumenting `src/content/exclusions.ts` | **Dead at runtime** — imported only by `exclusions.test.ts`. The live path is the skill library (`content/index.ts:390` → `getExclusionSkills()`). Instrumenting it compiles + passes its unit test but "Last matched" stays "—" in production. A diff touching `exclusions.ts` for SHA-01 is the warning sign. |
| Writing `storageSet({ selectorRegistry })` from a skill/signal file | Violates CLAUDE.md #1 single-writer. Only CALL `updateCandidate`. |
| `await`-ing `updateCandidate` | Puts a storage round-trip on the detection critical path. Always fire-and-forget with `.catch(() => {})`. |
| Passing a boolean/DOM node as COMPANY_PAGE `winnerValue` | Must pass the resolved marker string (`resolve('COMPANY_PAGE_MARKER')`); the registry keys on `candidate.value`. |
| `overflow:hidden`/`textOverflow:ellipsis` on `s.target` | Truncates the target name; violates D-05 (names must stay fully readable). Use `whiteSpace:nowrap` + wider basis instead. |
| Instrumenting `nonEnglishExclusionSkill` | D-03 lists only 7 selectors; non-english has no contextual selector target (delegates to `isNonEnglish()` using `lang`/codepoints). Don't invent one. |

## Build / Verification Notes

- **Skill registry regen (A2):** adding `updateCandidate` inside a skill's `check()` body does NOT change its export shape, so `npm run generate-skill-registry` should NOT need rerunning. Planner should add a `npm run check-skill-registry` verification step to confirm.
- **No new packages** — all infra (`updateCandidate`, `posts` state, `s.*` tokens) already exists.
- **No co-located tests** exist for `profile.ts`, `comment-expand.ts`, or the three exclusion skills. If SHA-01 test coverage is wanted, mirror `detector/heuristic.test.ts` / `language.test.ts` (Vitest + jsdom): spy on `updateCandidate` and assert it's called with `(target, value)` on a truthy match and NOT on a miss. Optional this phase (`nyquist_validation` is false).

## Metadata

**Analog search scope:** `src/content/` (observer, selector-registry, exclusions, detector/signals, detector), `src/skills/library/exclude-*/`, `src/modules/dashboard/`.
**Files scanned (read in full or targeted):** observer.ts, selector-registry.ts (updateCandidate), the 3 exclusion skills, profile.ts, comment-expand.ts, SelectorView.tsx, index.tsx (header/buttons/state/styles), index.html.
**Pattern extraction date:** 2026-06-21
