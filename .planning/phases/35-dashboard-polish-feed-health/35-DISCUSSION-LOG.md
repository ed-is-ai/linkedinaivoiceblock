# Phase 35: Dashboard Polish & Feed Health - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 35-dashboard-polish-feed-health
**Areas discussed:** SHA-01 (Last-matched wiring), EXPORT-02 (Export Posts button), SHA-02 (Row alignment), BRAND-01 (Header branding)

---

## SHA-01 — "Last matched" write frequency

| Option | Description | Selected |
|--------|-------------|----------|
| Every match (fire-and-forget) | Call `updateCandidate()` on every successful match, like observer.ts does for POST_CARD/FEED_CONTAINER. Cheap no-op when value unchanged at index 0. | ✓ |
| Throttle once per session | Write at most once per selector per page session to minimize storage writes. More code, deviates from precedent. | |

**User's choice:** Every match (fire-and-forget)
**Notes:** Mirrors the established observer.ts precedent; no new throttling code. All 7 contextual selectors instrumented at their real runtime match sites. COMPANY_PAGE_MARKER matches on URL substring rather than a DOM element.

---

## EXPORT-02 — Export Posts button (count + visibility)

| Option | Description | Selected |
|--------|-------------|----------|
| N = posts.length, gate on posts | Label shows live stored-post count; show button whenever posts.length > 0. Fixes mismatch (button currently hidden when no flagged account despite stored posts). | ✓ |
| N = posts.length, keep accounts gate | Show count but leave the accounts.length > 0 visibility condition unchanged. | |

**User's choice:** N = posts.length, gate on posts
**Notes:** The button exports `posts` (StoredPost[]), not accounts, so gating on accounts was a mismatch. Now gated on `posts.length > 0`; click behavior unchanged.

---

## SHA-02 — Long-row alignment (COMMENT_EXPAND_BUTTON)

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed-width target column | Give target-name column a fixed/min width so value columns align. Names fully readable. | ✓ |
| Truncate + ellipsis + tooltip | Cap cell width with ellipsis; full name on hover. Guarantees alignment for any future long name but hides part of the name. | |

**User's choice:** Fixed-width target column
**Notes:** Keeps all target names fully readable; cleanest grid alignment.

---

## BRAND-01 — Browser-tab title scope

| Option | Description | Selected |
|--------|-------------|----------|
| Rebrand both h1 and tab title | Update in-page header + subtitle AND index.html `<title>` for tab consistency. | ✓ |
| h1 + subtitle only | Update only the in-page header per the literal requirement; leave index.html `<title>` as-is. | |

**User's choice:** Rebrand both h1 and tab title
**Notes:** h1 → "LinkedIn AIVoice blocker - Feed Health", subtitle "because your brain deserves better", and index.html `<title>` (was "LinkedIn Blocker — Dashboard").

---

## Claude's Discretion

- Exact CSS mechanism for the fixed/min-width target column (flex-basis vs grid template vs min-width).
- Exact subtitle styling — match existing dashboard style tokens.

## Deferred Ideas

None — discussion stayed within phase scope. (Feed-health chart zero-days bug tracked/resolved separately in `.planning/debug/feed-health-chart-zeros.md`.)
