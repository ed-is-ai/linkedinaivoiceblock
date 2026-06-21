---
quick_id: 260614-g9t
status: complete
date: 2026-06-14
commits: [f7f2afa]
files_modified:
  - src/dashboard/index.tsx
---

# Quick Task 260614-g9t: Inline export buttons

**One-liner:** Merged the two export-button flex rows into a single wrapping row so all export buttons sit inline.

## What changed
- `index.tsx`: replaced the separate "JSON + Posts CSV" row and the standalone "Export Traces" row with one `display:flex; flexWrap:wrap` container holding all three buttons.
- Per-button account gating preserved: Export JSON + Export Posts CSV render only when `accounts.length > 0`; Export Traces always renders and is disabled when `traces.length === 0`.
- The "No flagged accounts yet" note moved above the button row (shown only when empty).

## Verification
- `npx tsc --noEmit` clean.
- `npx vite build` succeeds.
- Pure presentational change — no logic/exports touched, no test references the dashboard root render.
