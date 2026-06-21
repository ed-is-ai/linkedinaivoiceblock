# Phase 35: Dashboard Polish & Feed Health - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure dashboard/observability polish for the v11.2 milestone. Five net-new requirements,
no detection-logic changes and no new scraping surface:

- **SHA-01** — Make Selector Health "Last matched" reflect reality for the 7 *contextual*
  selectors that currently always show "—".
- **SHA-02** — Fix the Selector Health row alignment broken by the long
  `COMMENT_EXPAND_BUTTON` target name.
- **EXPORT-01** — Relabel "Export JSON" → "Export matching behaviour" (label-only).
- **EXPORT-02** — Relabel "Export Posts CSV" → "Export Posts seen (N)" and fix its
  visibility gate.
- **BRAND-01** — Rebrand the dashboard header (title + subtitle).

**In scope:** instrumenting fire-and-forget `updateCandidate()` calls at existing contextual
selector match sites; a CSS alignment fix in `SelectorView.tsx`; two button label changes and
one visibility-gate change in the dashboard's Data Management section; header `<h1>`/subtitle
copy and the `index.html` browser-tab `<title>`.

**Out of scope:** any change to detection scoring, exclusion logic, or scraping; the
feed-health chart zero-days bug (already resolved separately in
`.planning/debug/feed-health-chart-zeros.md`); new selector-write paths (only `SelectorRegistry`
writes selectors — CLAUDE.md #1 / ADAPT-06); new profile/engagement signals (deferred per
REQUIREMENTS.md "Out of Scope").
</domain>

<decisions>
## Implementation Decisions

### SHA-01 — "Last matched" instrumentation
- **D-01:** Use the **existing fire-and-forget `SelectorRegistry.updateCandidate(target, value)`
  pattern**, off the critical path, exactly as [observer.ts](../../../src/content/observer.ts)
  already does for structural selectors (`FEED_CONTAINER`, `POST_CARD`, `POST_AUTHOR_LINK`,
  `POST_BODY_TEXT`, `RESHARE_INDICATOR`, `POST_URN_ATTR`). Each call `.catch(() => {})`. Only
  `SelectorRegistry` writes selectors (CLAUDE.md #1).
- **D-02:** Write on **every successful match** — no per-session throttle. Rationale: matches the
  established observer precedent (which also fires per-post), and `updateCandidate` is already
  cheap when the value is unchanged at index 0 (it just bumps `lastMatchedAt`/`matchCount` and
  persists). No new throttling code.
- **D-03:** Instrument all **7 contextual selectors at their real runtime match sites**:
  - `SPONSORED_MARKER` — on the truthy `querySelector` match in the sponsored exclusion check.
  - `COMPANY_PAGE_MARKER` — on the truthy `authorProfileUrl.includes(...)` match (this target is
    a **URL substring, not a DOM element**; "match" = the includes() returning true; the value
    passed to `updateCandidate` is the resolved marker string).
  - `OPEN_TO_WORK_MARKER` — on the truthy `querySelector` match in the open-to-work exclusion check.
  - `AUTHOR_HEADLINE`, `CONNECTION_DEGREE` — on truthy element match in
    [signals/profile.ts](../../../src/content/detector/signals/profile.ts).
  - `COMMENT_TEXT`, `COMMENT_EXPAND_BUTTON` — on truthy match in
    [comment-expand.ts](../../../src/content/detector/comment-expand.ts).
- **D-04:** **Verify the live runtime path before wiring.** Some of these selectors are referenced
  from both legacy modules (`exclusions.ts`) and the skill library
  (`src/skills/library/exclude-*/...`). The instrumentation must land on the path that actually
  executes at runtime so timestamps reflect real matches — a research/plan task to confirm which
  exclusion path is live (skill-registry-dispatched vs `exclusions.ts`).

### SHA-02 — Row alignment
- **D-05:** Fix alignment with a **fixed / min-width target-name column** so every row's value
  column starts at the same x-position. Target names stay **fully readable** (no truncation).
  Cleanest grid alignment; future long names also align as long as the width accommodates them.

### EXPORT-01 — JSON button label
- **D-06:** Relabel "Export JSON" → **"Export matching behaviour"**. Label-only; export contents
  and `handleExportJson` behavior unchanged. (Locked verbatim by requirement.)

### EXPORT-02 — Posts CSV button label + visibility
- **D-07:** Relabel "Export Posts CSV" → **"Export Posts seen (N)"** where **N = `posts.length`**
  (the live count of stored posts — the same `StoredPost[]` array that `buildPostsCsvExport`
  already exports). Count format mirrors the existing "Export LLM call traces (N)" button.
- **D-08:** **Change the visibility gate from `accounts.length > 0` to `posts.length > 0`.**
  Current behavior is a mismatch: the button exports `posts` but is hidden unless a *flagged
  account* exists, so stored posts can exist with the button hidden. Gating on `posts.length`
  fixes this. Clicking still downloads the same stored-posts CSV (behavior unchanged).

### BRAND-01 — Header branding
- **D-09:** Set the `<h1>` to **"LinkedIn AIVoice blocker - Feed Health"** and add a subtitle
  **"because your brain deserves better"** (exact strings, note the "AIVoice" spelling and the
  hyphen separator).
- **D-10:** **Also update the browser-tab `<title>`** in
  [index.html](../../../src/modules/dashboard/index.html) (currently
  "LinkedIn Blocker — Dashboard") for consistency in the tab bar.

### Claude's Discretion
- Exact CSS mechanism for the fixed/min-width column (flex-basis vs grid template vs min-width on
  the cell) — planner/executor choice, as long as columns align and names stay fully visible.
- Exact subtitle styling (font size/color) — match existing dashboard style tokens (`s.*`).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"v11.2 Requirements — Dashboard Polish & Feed Health" — the
  authoritative text for SHA-01, SHA-02, EXPORT-01, EXPORT-02, BRAND-01.
- `.planning/ROADMAP.md` — Phase 35 line under "v11.2 Dashboard Polish & Feed Health".

### Selector instrumentation (SHA-01)
- `src/content/selector-registry.ts` — `updateCandidate(target, value)` (the fire-and-forget
  write path; the only selector-write surface) and `lastMatchedAt` semantics.
- `src/content/observer.ts` — the established `updateCandidate(...).catch(() => {})` precedent to
  mirror (lines ~60–158).
- `src/content/exclusions.ts` — `SPONSORED_MARKER`, `COMPANY_PAGE_MARKER`, `OPEN_TO_WORK_MARKER`
  match sites.
- `src/content/detector/signals/profile.ts` — `AUTHOR_HEADLINE`, `CONNECTION_DEGREE` match sites.
- `src/content/detector/comment-expand.ts` — `COMMENT_TEXT`, `COMMENT_EXPAND_BUTTON` match sites.
- `src/skills/library/exclude-sponsored/`, `exclude-company-page/`, `exclude-open-to-work/` —
  skill-library equivalents; confirm which path is the live runtime path (D-04).

### Dashboard UI (SHA-02, EXPORT-01/02, BRAND-01)
- `src/modules/dashboard/index.tsx` — header `<h1>` (~line 253), Data Management buttons
  (~lines 334–337), `posts` state (`posts.length`), `handleExportJson` / `handleExportPostsCsv`.
- `src/modules/dashboard/SelectorView.tsx` — Selector Health table rows (alignment fix).
- `src/modules/dashboard/index.html` — browser-tab `<title>` (~line 6).
- `CLAUDE.md` §"Critical Constraints" #1 — only `SelectorRegistry` writes selector strings.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `updateCandidate(target, value)` in `selector-registry.ts` — already the exact mechanism SHA-01
  needs; no new function required, just new call sites.
- "Export LLM call traces (N)" button in `index.tsx` — existing count-in-label + count-based
  pattern to copy for EXPORT-02's "(N)".
- `posts` (`StoredPost[]`) state in `index.tsx` — already loaded from storage and already the
  source for `buildPostsCsvExport`; `posts.length` is the N for EXPORT-02.

### Established Patterns
- Fire-and-forget selector telemetry: `updateCandidate(...).catch(() => {})`, never awaited, never
  on the detection critical path (observer.ts precedent).
- Dashboard is a stateless reader of `chrome.storage.local`; these changes are all read/label/CSS,
  no new storage writes from the dashboard.

### Integration Points
- SHA-01 adds calls inside content-script exclusion/signal code paths (not the dashboard).
- SHA-02/EXPORT/BRAND are confined to the `src/modules/dashboard/` module.
</code_context>

<specifics>
## Specific Ideas

- Header title string is exact: **"LinkedIn AIVoice blocker - Feed Health"** (note "AIVoice"
  one word, spaced hyphen). Subtitle exact: **"because your brain deserves better"**.
- EXPORT-01 label exact: **"Export matching behaviour"** (British spelling).
- EXPORT-02 label exact pattern: **"Export Posts seen (N)"**.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The feed-health chart zero-days issue is tracked
and resolved separately in `.planning/debug/feed-health-chart-zeros.md`, awaiting human verify;
it is not part of this phase.)

</deferred>

---

*Phase: 35-dashboard-polish-feed-health*
*Context gathered: 2026-06-21*
