# Phase 35: Dashboard Polish & Feed Health - Research

**Researched:** 2026-06-21
**Domain:** Chrome MV3 extension — content-script selector telemetry + Preact dashboard UI polish
**Confidence:** HIGH (all claims verified against live source in this repo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** — Use the existing fire-and-forget `SelectorRegistry.updateCandidate(target, value)` pattern, off the critical path, exactly as `observer.ts` already does for structural selectors. Each call `.catch(() => {})`. Only `SelectorRegistry` writes selectors (CLAUDE.md #1).
- **D-02** — Write on every successful match — no per-session throttle. Matches the observer precedent (fires per-post); `updateCandidate` is cheap when the value is unchanged at index 0 (just bumps `lastMatchedAt`/`matchCount` and persists). No new throttling code.
- **D-03** — Instrument all 7 contextual selectors at their real runtime match sites:
  - `SPONSORED_MARKER` — on the truthy `querySelector` match in the sponsored exclusion check.
  - `COMPANY_PAGE_MARKER` — on the truthy `authorProfileUrl.includes(...)` match. This target is a **URL substring, not a DOM element**; "match" = the `includes()` returning true; the value passed to `updateCandidate` is the resolved marker string.
  - `OPEN_TO_WORK_MARKER` — on the truthy `querySelector` match in the open-to-work exclusion check.
  - `AUTHOR_HEADLINE`, `CONNECTION_DEGREE` — on truthy element match in `signals/profile.ts`.
  - `COMMENT_TEXT`, `COMMENT_EXPAND_BUTTON` — on truthy match in `comment-expand.ts`.
- **D-04** — Verify the live runtime path before wiring. Some selectors are referenced from both legacy modules (`exclusions.ts`) and the skill library (`src/skills/library/exclude-*/`). Instrumentation must land on the path that actually executes. **(RESOLVED below — see Architectural Responsibility Map and Open Question answers.)**
- **D-05** — Fix SHA-02 alignment with a fixed / min-width target-name column so every row's value column starts at the same x-position. Target names stay fully readable (no truncation).
- **D-06** — Relabel "Export JSON" → **"Export matching behaviour"**. Label-only; export contents and `handleExportJson` behavior unchanged.
- **D-07** — Relabel "Export Posts CSV" → **"Export Posts seen (N)"** where **N = `posts.length`**. Count format mirrors the existing "Export LLM call traces (N)" button.
- **D-08** — Change the visibility gate from `accounts.length > 0` to `posts.length > 0`. Clicking still downloads the same stored-posts CSV (behavior unchanged).
- **D-09** — Set the `<h1>` to **"LinkedIn AIVoice blocker - Feed Health"** and add a subtitle **"because your brain deserves better"** (exact strings; note "AIVoice" one word, spaced hyphen).
- **D-10** — Also update the browser-tab `<title>` in `src/modules/dashboard/index.html` (currently "LinkedIn Blocker — Dashboard").

### Claude's Discretion
- Exact CSS mechanism for the fixed/min-width column (flex-basis vs grid template vs min-width on the cell) — as long as columns align and names stay fully visible.
- Exact subtitle styling (font size/color) — match existing dashboard style tokens (`s.*`).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. The feed-health chart zero-days issue is tracked/resolved separately in `.planning/debug/feed-health-chart-zeros.md` and is NOT part of this phase. Also out of scope: any detection-scoring/exclusion/scraping change, new selector-write paths, new profile/engagement signals.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHA-01 | 7 contextual selectors record a real `lastMatchedAt` via fire-and-forget `updateCandidate()` at their live match sites | Match sites located and confirmed live (Architectural Responsibility Map). Exact `updateCandidate(target, winnerValue)` signature + `.catch(() => {})` pattern documented (Code Examples). The live exclusion path is the **skill library**, not `exclusions.ts` (Open Question 1). |
| SHA-02 | Selector Health table rows align across all columns despite the long `COMMENT_EXPAND_BUTTON` target name | `SelectorView.tsx` table is flexbox with `flex: '0 0 27%'` cells. Root cause: the `target` cell lacks `overflow/whiteSpace` so a long name wraps to 2 lines and shifts the row. Fix options in Pattern 2. |
| EXPORT-01 | "Export JSON" → "Export matching behaviour" | Button at `index.tsx:334`. Label-only string change. |
| EXPORT-02 | "Export Posts CSV" → "Export Posts seen (N)"; gate on `posts.length` | Button at `index.tsx:336-338`; gate currently `accounts.length > 0`. `(N)` pattern mirrors traces button at line 344. |
| BRAND-01 | Header title + subtitle rebrand | `<h1>` at `index.tsx:253`; `s.heading` style at line 384; `<title>` at `index.html:6`. |
</phase_requirements>

## Summary

Phase 35 is pure observability/UI polish with zero detection-logic change. The work splits cleanly into two independent surfaces: (1) **content-script selector telemetry** (SHA-01) — adding fire-and-forget `updateCandidate()` calls at 7 existing match sites, and (2) **dashboard UI** (SHA-02, EXPORT-01/02, BRAND-01) — string/CSS edits confined to `src/modules/dashboard/`.

The single highest-value research question (D-04) is **definitively resolved**: the live exclusion path at runtime is the **skill library** (`src/skills/library/exclude-*/*.skill.ts`), dispatched via `getExclusionSkills()` in `content/index.ts` (line 390). The legacy `src/content/exclusions.ts::checkExclusions()` is **dead code at runtime** — it is imported only by `src/content/exclusions.test.ts` and by no production module. Therefore the `SPONSORED_MARKER`, `COMPANY_PAGE_MARKER`, and `OPEN_TO_WORK_MARKER` instrumentation MUST land in the three skill files, not in `exclusions.ts`. The `AUTHOR_HEADLINE`/`CONNECTION_DEGREE` sites (`signals/profile.ts`) and `COMMENT_TEXT`/`COMMENT_EXPAND_BUTTON` sites (`comment-expand.ts`) are unambiguous single-path modules and are called live from `content/index.ts`.

**Primary recommendation:** Instrument the 3 exclusion selectors inside the skill `check()` methods, the 2 profile selectors inside `extractProfileSignals()`, and the 2 comment selectors inside `expandComments()` — each via `updateCandidate(target, resolve(target)).catch(() => {})`, mirroring `observer.ts` exactly. For the dashboard, apply 4 small edits (1 CSS fix to the `target` cell, 2 button-label/gate changes, 1 header + 1 `<title>` change). No new packages, no new dependencies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SHA-01 exclusion selector telemetry (`SPONSORED_MARKER`, `COMPANY_PAGE_MARKER`, `OPEN_TO_WORK_MARKER`) | Content script — **skill library** (`src/skills/library/exclude-*/*.skill.ts`) | — | This is the LIVE exclusion path: `content/index.ts:390` iterates `getExclusionSkills()`; `exclusions.ts` is dead at runtime (Open Q1). Selector match happens inside each skill's `check()`. |
| SHA-01 profile selector telemetry (`AUTHOR_HEADLINE`, `CONNECTION_DEGREE`) | Content script — `src/content/detector/signals/profile.ts::extractProfileSignals()` | — | Single path. Called from `content/index.ts:414`. Not a SignalSkill — stays in profile.ts (per Phase 30 RESEARCH). |
| SHA-01 comment selector telemetry (`COMMENT_TEXT`, `COMMENT_EXPAND_BUTTON`) | Content script — `src/content/detector/comment-expand.ts::expandComments()` | — | Single path. Called via the `fetchComments` lambda wired in `content/index.ts:317-318`. |
| SHA-01 persistence (write `lastMatchedAt`) | Content script — `SelectorRegistry.updateCandidate()` | `chrome.storage.local` | Single-writer invariant (CLAUDE.md #1): only `selector-registry.ts` writes `selectorRegistry`. Skill/signal files only CALL `updateCandidate`. |
| SHA-02 row alignment | Dashboard (Preact) — `src/modules/dashboard/SelectorView.tsx` | — | Pure render-layer CSS; reads registry from storage, no writes. |
| EXPORT-01/02 labels + gate | Dashboard (Preact) — `src/modules/dashboard/index.tsx` | — | JSX string + boolean-gate change; `handle*` functions untouched. |
| BRAND-01 header + tab title | Dashboard (Preact) — `index.tsx` `<h1>` + `index.html` `<title>` | — | Static copy. |

## Standard Stack

No new packages. This phase edits existing source only.

### Core (already present — versions not changed by this phase)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Preact + preact/hooks | Dashboard UI (`index.tsx`, `SelectorView.tsx`) | Already the project's UI runtime; inline-style objects via `s.*` token map. |
| TypeScript | All source | Project standard. |
| chrome.storage.local | Selector registry + dashboard reads | Only persistence layer (CLAUDE.md: no backend). |

**Installation:** None. `npm install` adds nothing for this phase.

## Package Legitimacy Audit

> Not applicable — Phase 35 installs no external packages. All work edits existing in-repo source. slopcheck/registry verification skipped (no new dependencies). 

## Architecture Patterns

### System Architecture Diagram

```
NORMAL BROWSING (SHA-01 telemetry write path)
─────────────────────────────────────────────
LinkedIn feed DOM
      │  MutationObserver (observer.ts) dispatches ObservedPost
      ▼
content/index.ts  startObserving callback
      │
      ├─► getExclusionSkills()  ── iterate skills in priority order ──┐
      │      • sponsoredExclusionSkill.check()   ──match──► updateCandidate('SPONSORED_MARKER', resolve(...))
      │      • companyPageExclusionSkill.check() ──match──► updateCandidate('COMPANY_PAGE_MARKER', resolve(...))
      │      • nonEnglishExclusionSkill.check()   (no contextual selector to instrument here)
      │      • openToWorkExclusionSkill.check()  ──match──► updateCandidate('OPEN_TO_WORK_MARKER', resolve(...))
      │                                                            │ (.catch(()=>{}), fire-and-forget)
      ├─► extractProfileSignals(postNode)                          │
      │      • AUTHOR_HEADLINE   match ──► updateCandidate('AUTHOR_HEADLINE', resolve(...))
      │      • CONNECTION_DEGREE match ──► updateCandidate('CONNECTION_DEGREE', resolve(...))
      │                                                            │
      └─► detector.detect() ─► fetchComments lambda ─► expandComments(postNode)
             • COMMENT_EXPAND_BUTTON match ──► updateCandidate('COMMENT_EXPAND_BUTTON', resolve(...))
             • COMMENT_TEXT          match ──► updateCandidate('COMMENT_TEXT', resolve(...))
                                                                   ▼
                                       SelectorRegistry.updateCandidate (selector-registry.ts)
                                       bumps lastMatchedAt + matchCount, persists selectorRegistry
                                                                   ▼
                                                       chrome.storage.local

DASHBOARD READ PATH (SHA-02 / BRAND / EXPORT render)
─────────────────────────────────────────────────────
chrome.storage.local ──(get + onChanged)──► index.tsx App state
      ├─► SelectorView.tsx  renders registry.targets → "Last matched" column shows candidate[0].lastMatchedAt
      └─► Data Management buttons (Export matching behaviour / Export Posts seen (N))
```

### Recommended Project Structure (files this phase touches — no new files)
```
src/
├── skills/library/
│   ├── exclude-sponsored/exclude-sponsored.skill.ts       # + updateCandidate('SPONSORED_MARKER', ...)
│   ├── exclude-company-page/exclude-company-page.skill.ts # + updateCandidate('COMPANY_PAGE_MARKER', ...)
│   └── exclude-open-to-work/exclude-open-to-work.skill.ts # + updateCandidate('OPEN_TO_WORK_MARKER', ...)
├── content/
│   ├── selector-registry.ts        # updateCandidate (NO CHANGE — already exists)
│   ├── exclusions.ts               # DEAD at runtime — DO NOT instrument (Open Q1)
│   └── detector/
│       ├── signals/profile.ts      # + updateCandidate for AUTHOR_HEADLINE, CONNECTION_DEGREE
│       └── comment-expand.ts       # + updateCandidate for COMMENT_TEXT, COMMENT_EXPAND_BUTTON
└── modules/dashboard/
    ├── index.tsx                   # <h1> (BRAND), Export buttons (EXPORT-01/02)
    ├── SelectorView.tsx            # target-cell CSS (SHA-02)
    └── index.html                  # <title> (BRAND/D-10)
```

### Pattern 1: Fire-and-forget selector telemetry (SHA-01) — mirror observer.ts exactly
**What:** After a successful (truthy) selector match, call `updateCandidate(target, resolvedValue).catch(() => {})`. Never await; never gate detection on it.
**When to use:** At each of the 7 contextual match sites.
**Example (DOM-element selectors — sponsored/open-to-work/profile/comment):**
```typescript
// Source: src/content/observer.ts:85-89 (RESHARE_INDICATOR precedent), VERIFIED in-repo
import { resolve, updateCandidate } from '../../../content/selector-registry'; // path depends on file depth

const sponsoredSelector = resolve('SPONSORED_MARKER');
const match = postNode.querySelector(sponsoredSelector);
if (match) {
  updateCandidate('SPONSORED_MARKER', sponsoredSelector).catch(() => {});
  return { excluded: true, reason: 'sponsored' as const };
}
```
**Example (COMPANY_PAGE_MARKER — URL substring, NOT a DOM element):**
```typescript
// The "value" passed is the resolved marker string (e.g. "/company/"), because that is
// the candidate.value the registry keys on. The "match" is includes() === true.
const marker = resolve('COMPANY_PAGE_MARKER');
if (postData.authorProfileUrl.includes(marker)) {
  updateCandidate('COMPANY_PAGE_MARKER', marker).catch(() => {});
  return { excluded: true, reason: 'company-page' as const };
}
```

**Critical signature facts (VERIFIED `selector-registry.ts:227-282`):**
- Signature: `updateCandidate(target: SelectorTarget, winnerValue: string): Promise<void>`.
- `winnerValue` MUST equal a `candidate.value` already in the target's list. For all 7 sites the resolved seed string (`resolve(target)`) is exactly `candidate[0].value` under normal operation, so passing `resolve(target)` lands at `idx === 0` and just bumps `lastMatchedAt`/`matchCount` (the cheap path D-02 relies on).
- If cache is not warm (`_cache === null`) or target/value not found, it is a **silent no-op** — safe to call unconditionally.
- It persists with `await storageSet(...).catch(() => {})` internally; the outer `.catch(() => {})` at the call site guards the returned promise. Both are required by the established pattern.

### Pattern 2: Fixed-width target column (SHA-02)
**What:** Make the `target` cell behave like the other cells so a long name (`COMMENT_EXPAND_BUTTON`) doesn't wrap and push the row.
**Root cause (VERIFIED `SelectorView.tsx`):** All columns use `flex: '0 0 <pct>%'` (target 27%, selector 32%, source/lastMatched/heal 13% each). The `selector` cell sets `overflow:hidden; textOverflow:ellipsis; whiteSpace:nowrap`, but the `target` cell (`s.target`, lines 116-120) sets only `flex/fontSize/fontWeight` — no `whiteSpace`. `COMMENT_EXPAND_BUTTON` (21 chars) at 27% width on a 640px page (~`maxWidth:640`) can wrap to two lines, increasing that row's height and visually misaligning it from neighbors.
**Recommended fix (discretion D-05 — names must stay fully readable, so do NOT ellipsis-truncate the target):** add `whiteSpace:'nowrap'` to `s.target` and widen the basis enough to fit the longest name on one line (e.g. bump `flex` to `'0 0 30%'` on both `columnHeaderTarget` and `target`, and reclaim the 3% from `columnHeaderSelector`/`selector` which already ellipsis-truncates). Keep header and cell flex-basis identical so the header aligns with rows. Verify `COMMENT_EXPAND_BUTTON` renders on one line at `maxWidth:640`.
**Alternative:** switch the row+header from flexbox to CSS grid with an explicit `gridTemplateColumns` (e.g. `minmax(220px, 30%) 1fr 13% 13% 13%`) — cleaner long-term alignment but a larger diff. Either satisfies D-05; flexbox tweak is the smaller change.

### Pattern 3: Count-in-label button (EXPORT-02) — mirror the traces button
**What:** Show `(N)` suffix in the label.
**Example (VERIFIED `index.tsx:339-345` traces button is the template):**
```tsx
// Existing template to mirror:
Export LLM call traces{traces.length > 0 ? ` (${traces.length})` : ''}

// EXPORT-02 target (label + gate change). Note D-07 implies the count always shows:
{posts.length > 0 && (
  <button style={s.actionBtn} onClick={handleExportPostsCsv}>
    Export Posts seen ({posts.length})
  </button>
)}
```
Note: D-08 changes the gate to `posts.length > 0`, so inside the rendered button `posts.length` is always ≥ 1 — render `(${posts.length})` unconditionally (no `> 0 ?` guard needed because the gate already guarantees it). `handleExportPostsCsv` (line 193) and `buildPostsCsvExport(posts)` are unchanged.

### Anti-Patterns to Avoid
- **Instrumenting `exclusions.ts`:** It is dead at runtime. Adding `updateCandidate` there would compile and pass its unit test but `lastMatchedAt` would still show "—" in production. (This is the exact trap D-04 warns about.)
- **Writing selectors from anywhere but SelectorRegistry:** The skill/signal files must only CALL `updateCandidate` (which lives in `selector-registry.ts`). Never `storageSet({ selectorRegistry })` outside the registry (CLAUDE.md #1).
- **Awaiting `updateCandidate`:** Would put a storage round-trip on the detection critical path. Always fire-and-forget with `.catch(() => {})`.
- **Truncating the target name for SHA-02:** D-05 requires names stay fully readable. Ellipsis on the target cell would violate it.
- **Re-deriving `nonEnglishExclusionSkill` telemetry:** D-03 lists only 7 selectors; non-english has no contextual selector target to instrument (it delegates to `isNonEnglish()` which uses `lang`/codepoints, not a registry selector). Do not invent one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persist `lastMatchedAt` / rotate winning candidate | A new storage writer in skill/signal files | `updateCandidate()` (already exists, `selector-registry.ts:227`) | Single-writer invariant (CLAUDE.md #1); it already handles index-0 bump, rotation, 10-cap, seed-preserve, persist. |
| Throttle telemetry writes | A per-session debounce/Set | Nothing — D-02 says write every match | `updateCandidate` is already cheap at idx 0; observer precedent fires per-post with no throttle. |
| Count stored posts for EXPORT-02 | A new counter/state | `posts.length` (already in App state, `index.tsx:79`) | Same `StoredPost[]` array `buildPostsCsvExport` exports. |

**Key insight:** Every mechanism SHA-01/EXPORT-02 needs already exists — this phase adds call sites and strings, not infrastructure.

## Runtime State Inventory

> Phase 35 is NOT a rename/refactor/migration. It adds call sites + UI strings. Included here only to record that no stored runtime state needs migrating.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `selectorRegistry` in `chrome.storage.local` — contextual targets currently have `candidate[0].lastMatchedAt === null` (renders "—"). After SHA-01 ships, NEW matches populate it going forward. | None — no migration. Existing nulls self-heal on next live match (D-02). No backfill required or wanted. |
| Live service config | None — no external service config embeds any string. | None — verified (extension is local-only, no backend). |
| OS-registered state | None. | None. |
| Secrets/env vars | None. | None. |
| Build artifacts | None affected by string/CSS edits. (If skill imports change, the generated registry is unaffected — `generated-skill-registry.ts` imports the skill OBJECTS, not their internals; adding `updateCandidate` inside a skill's `check()` does not change its export shape, so `npm run generate-skill-registry` need NOT be rerun. Verify with `npm run check-skill-registry` if in doubt.) | None expected. |

## Common Pitfalls

### Pitfall 1: Instrumenting the dead path (`exclusions.ts`)
**What goes wrong:** Telemetry added to `checkExclusions()` never runs; "Last matched" stays "—" in production despite green unit tests.
**Why it happens:** `exclusions.ts` and the three exclusion skills are byte-for-byte equivalent (the skills were extracted FROM `checkExclusions` in Phase 30), so it looks like either could be live.
**How to avoid:** Instrument ONLY the skill files. `content/index.ts:390` calls `getExclusionSkills()`; `checkExclusions` has zero production importers (Open Q1).
**Warning signs:** A diff touching `src/content/exclusions.ts` for SHA-01.

### Pitfall 2: Import path / circular-import worry from skill files
**What goes wrong:** Skill files live under `src/skills/library/exclude-*/` and import `resolve` from `../../../content/selector-registry`. Adding `updateCandidate` from the same module is the same import — no new module graph edge.
**Why it happens:** Fear that `content → skills` and `skills → content` is circular.
**How to avoid:** The edge already exists and is one-directional at module level (skills import `selector-registry`; `selector-registry` imports nothing from skills). Just extend the existing `import { resolve } from '...'` to `import { resolve, updateCandidate } from '...'`. VERIFIED: `exclude-sponsored.skill.ts:15` already imports `resolve` from that exact path.

### Pitfall 3: COMPANY_PAGE_MARKER value semantics
**What goes wrong:** Passing a DOM element or `true` instead of the marker string to `updateCandidate`.
**Why it happens:** Every OTHER site matches a DOM element; this one matches a URL substring.
**How to avoid:** Pass `resolve('COMPANY_PAGE_MARKER')` (the marker string itself) as `winnerValue`. The "match" is `includes() === true`; the value the registry keys on is the candidate string. (D-03 explicitly states this.)

### Pitfall 4: Heading/header alignment regression (SHA-02)
**What goes wrong:** Changing only the row `target` cell flex-basis but not the matching `columnHeaderTarget`, so the header label desynchronises from the column.
**How to avoid:** Keep `columnHeaderTarget` and `target` flex-basis identical (they are both currently `27%`). Change both together.

## Code Examples

### updateCandidate signature + behavior (the contract all 7 sites use)
```typescript
// Source: src/content/selector-registry.ts:227-282 (VERIFIED in-repo)
export async function updateCandidate(target: SelectorTarget, winnerValue: string): Promise<void>;
// - no-op if _cache is null or target/value not found (safe to call unconditionally)
// - idx === 0  -> bump lastMatchedAt (ISO string) + matchCount++  (the D-02 cheap path)
// - idx  >  0  -> rotate winner to front, bump, enforce <=10 cap (never evict seed)
// - persists via await storageSet({ selectorRegistry: _cache }).catch(()=>{})
```

### Observer precedent for the call shape (mirror this)
```typescript
// Source: src/content/observer.ts:85-89 (RESHARE_INDICATOR), VERIFIED
const reshareIndicatorSelector = resolve('RESHARE_INDICATOR');
const innerCard = card.querySelector(reshareIndicatorSelector);
if (innerCard) {
  updateCandidate('RESHARE_INDICATOR', reshareIndicatorSelector).catch(() => {});
}
```

### Profile site (two selectors in one function)
```typescript
// Source: src/content/detector/signals/profile.ts:136-152 (current code; add the two updateCandidate calls)
const headlineSel = resolve('AUTHOR_HEADLINE');
const headlineEl = postNode.querySelector(headlineSel);
if (headlineEl) updateCandidate('AUTHOR_HEADLINE', headlineSel).catch(() => {});
// ... existing scoring ...
const degreeSel = resolve('CONNECTION_DEGREE');
const degreeEl = postNode.querySelector(degreeSel);
if (degreeEl) updateCandidate('CONNECTION_DEGREE', degreeSel).catch(() => {});
```
Note: `profile.ts` currently imports only `resolve` (line 16) — extend to `import { resolve, updateCandidate } from '../../selector-registry';`.

### Comment site (two selectors in one function)
```typescript
// Source: src/content/detector/comment-expand.ts:55-88 (current code; add two calls)
const buttonSel = resolve('COMMENT_EXPAND_BUTTON');
const button = postNode.querySelector(buttonSel) as HTMLElement | null;
if (button === null) return [];
updateCandidate('COMMENT_EXPAND_BUTTON', buttonSel).catch(() => {});
// ... click + wait ...
const commentSel = resolve('COMMENT_TEXT');
const els = Array.from(postNode.querySelectorAll(commentSel));
if (els.length > 0) updateCandidate('COMMENT_TEXT', commentSel).catch(() => {});
```
Note: `comment-expand.ts` currently imports only `resolve` (line 25) — extend the import. Decide whether `COMMENT_TEXT` fires on `els.length > 0` (recommended — a real match) vs after `.filter(Boolean)`; the truthy-match rule (D-03) means fire when at least one element node is found.

### EXPORT/BRAND string edits (exact, locked)
```tsx
// index.tsx:253 — BRAND-01 (add subtitle below; style via s.* token, discretion D-09/D-10)
<h1 style={s.heading}>LinkedIn AIVoice blocker - Feed Health</h1>
<div style={s.subtitle}>because your brain deserves better</div>   // new s.subtitle token

// index.tsx:334 — EXPORT-01 (label only)
<button style={s.actionBtn} onClick={handleExportJson}>Export matching behaviour</button>

// index.tsx:336-338 — EXPORT-02 (gate + label)
{posts.length > 0 && (
  <button style={s.actionBtn} onClick={handleExportPostsCsv}>Export Posts seen ({posts.length})</button>
)}

// index.html:6 — BRAND-01 / D-10
<title>LinkedIn AIVoice blocker - Feed Health</title>   // exact tab title — confirm with user if "— Dashboard" suffix desired; CONTEXT says match header for consistency
```
> Note: CONTEXT D-10 says update the `<title>` "for consistency in the tab bar" but does not give an exact string. The header string (D-09) is the natural choice; the planner should set the `<title>` to the header text unless the user specifies otherwise. Flagged in Assumptions Log (A1).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `checkExclusions()` in `exclusions.ts` runs exclusions | `getExclusionSkills()` iterates skill-library `ExclusionSkill.check()` objects | Phase 30 (skill-registry architecture) | `exclusions.ts` is now dead at runtime; SHA-01 must instrument the skills. |
| Structural selectors only record `lastMatchedAt` (observer.ts) | This phase extends the same pattern to 7 contextual selectors | Phase 35 (this) | Closes the permanent "—" gap in Selector Health. |

**Deprecated/outdated:**
- `src/content/exclusions.ts::checkExclusions` — superseded by skill library; retained only because `exclusions.test.ts` still imports it. Out of scope to delete (not a phase requirement). Do NOT instrument it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The browser-tab `<title>` (D-10) should be set to the exact header string "LinkedIn AIVoice blocker - Feed Health". CONTEXT mandates updating it but gives no literal string. | Code Examples / BRAND-01 | Low — cosmetic tab text; user can correct in discuss/verify. Planner should confirm or default to header text. |
| A2 | `npm run generate-skill-registry` need NOT be rerun after adding `updateCandidate` inside skill `check()` bodies (export shape unchanged). | Runtime State Inventory | Low — if wrong, `npm run check-skill-registry` flags it; rerun is a one-command fix. Planner should add a `check-skill-registry` verification step. |
| A3 | `COMMENT_TEXT` telemetry should fire when ≥1 comment element node is found (truthy match), before the `.filter(Boolean)`/`.slice(20)`. | Comment site example | Low — affects only whether an empty-but-present comment list counts as a match; either reading satisfies "truthy match" (D-03). |

## Open Questions

1. **Which exclusion path executes at runtime — `exclusions.ts` or the skill library? (D-04)** — **RESOLVED.**
   - What we know: `content/index.ts:390` runs `for (const skill of getExclusionSkills()) { const r = skill.check(postData, postNode); ... }`. `getExclusionSkills()` (`skill-registry.ts:177`) returns `[...CODE_EXCLUSION_SKILLS, ...declarative]` where `CODE_EXCLUSION_SKILLS` = `GENERATED_EXCLUSION_SKILLS` (`generated-skill-registry.ts:39`) = `[sponsoredExclusionSkill, companyPageExclusionSkill, nonEnglishExclusionSkill, openToWorkExclusionSkill]`. `checkExclusions` (`exclusions.ts`) is imported ONLY by `src/content/exclusions.test.ts` (grep-verified: zero other importers).
   - Conclusion: **Instrument the skill files** (`exclude-sponsored.skill.ts`, `exclude-company-page.skill.ts`, `exclude-open-to-work.skill.ts`). Do NOT touch `exclusions.ts`.

2. **Do the profile / comment sites have a competing path?** — **No.** `extractProfileSignals` (`profile.ts`) is the sole profile extractor, called from `index.ts:414`. `expandComments` (`comment-expand.ts`) is the sole comment expander, wired via the `fetchComments` lambda at `index.ts:317-318`. Both single-path.

3. **Do contextual selectors currently feed `updateCandidate` at all?** — **No.** grep of `updateCandidate(` shows calls only in `observer.ts` (structural targets) and inside `selector-registry.ts`/heal pipeline. None of the 7 contextual targets have a call site today — which is exactly why they always render "—". Confirmed.

4. **Are there co-located unit tests the new instrumentation should follow?** — **No co-located tests exist** for `profile.ts`, `comment-expand.ts`, or the three exclusion skills (no `.test.ts` in those dirs). Existing test precedent in the detector dir: `heuristic.test.ts`, `language.test.ts`, `tombstone.test.ts` (Vitest with jsdom-style DOM mocks). If the planner wants test coverage for SHA-01, mirror those: mock `updateCandidate` (or spy on it) and assert it's called with the right `(target, value)` on a truthy match and NOT called on a miss. Note `nyquist_validation` is `false` in config — formal test mapping is optional this phase.

## Environment Availability

> Skipped — Phase 35 is code/string/CSS only, no external tools, services, runtimes, or CLI deps beyond the existing project build (`npm`, Vite, TypeScript already present). No availability probing required.

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` (treat as enabled). This phase is dashboard/observability polish with a constrained threat surface.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | Single-writer invariant (CLAUDE.md #1) already enforced — skills only CALL `updateCandidate`. |
| V5 Input Validation | yes (existing) | Selector values written are `resolve(target)` from the seeded registry, not user/DOM input. `updateCandidate` no-ops on unknown values. No new untrusted input is persisted by SHA-01. The dashboard renders `candidate.value` with `title={candidate.value}` (text content, not HTML) — Preact escapes text by default; SHA-02 CSS change introduces no new sink. |
| V6 Cryptography | no | None. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spoofed DOM marker (e.g., fake open-to-work) inflates `lastMatchedAt` | Tampering | Accepted, fail-safe: SHA-01 only writes a timestamp/count for a selector that already legitimately matched; it cannot change detection outcome or scoring (telemetry only). Matches the existing observer precedent's risk posture. |
| DOM-text injection via dashboard render | XSS (Tampering) | Preact escapes text children; `candidate.value` rendered as text + `title` attr (existing behavior, unchanged). No `dangerouslySetInnerHTML`. |
| Selector-write outside SelectorRegistry | Tampering / Elevation | CLAUDE.md #1 single-writer — instrument by CALLING `updateCandidate`, never by writing storage directly. Plan-checker/verifier should grep for stray `storageSet({ selectorRegistry })` outside `selector-registry.ts`. |

## Sources

### Primary (HIGH confidence — live source verified in this session)
- `src/content/selector-registry.ts` — `updateCandidate` signature/behavior, single-writer.
- `src/content/observer.ts` — fire-and-forget `.catch(() => {})` precedent.
- `src/content/index.ts` — exclusion dispatch via `getExclusionSkills()` (line 390); profile/comment wiring (lines 317-318, 414).
- `src/content/skill-registry.ts` + `src/content/generated-skill-registry.ts` — live exclusion skill order/source.
- `src/skills/library/exclude-{sponsored,company-page,open-to-work}/*.skill.ts` — the live exclusion match sites.
- `src/content/detector/signals/profile.ts`, `src/content/detector/comment-expand.ts` — profile/comment match sites.
- `src/modules/dashboard/index.tsx`, `SelectorView.tsx`, `index.html` — dashboard edit targets.
- `src/content/exclusions.ts` + grep of `checkExclusions` importers — confirms dead-at-runtime.
- `.planning/phases/35-dashboard-polish-feed-health/35-CONTEXT.md`, `.planning/REQUIREMENTS.md` §v11.2.

### Secondary / Tertiary
- None — no external/web sources needed; entirely in-repo verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all infra exists and was read directly.
- Architecture (D-04 live path): HIGH — traced `content/index.ts` → `getExclusionSkills()` → generated registry, and grep-confirmed `checkExclusions` has no production importer.
- Pitfalls: HIGH — each derived from a verified code fact, not training assumption.
- SHA-02 root cause: MEDIUM-HIGH — confirmed `target` cell lacks `whiteSpace:nowrap` while siblings have it; exact wrap point depends on rendered font metrics (executor should eyeball at `maxWidth:640`).

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable — in-repo facts; only invalidated by edits to the named files)
