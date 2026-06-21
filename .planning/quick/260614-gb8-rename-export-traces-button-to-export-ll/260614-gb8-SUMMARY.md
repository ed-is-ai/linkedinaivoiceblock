---
quick_id: 260614-gb8
status: complete
date: 2026-06-14
commits: [fe94f0e]
files_modified:
  - src/dashboard/index.tsx
---

# Quick Task 260614-gb8: Rename Export Traces button

**One-liner:** Renamed the dashboard "Export Traces" button to "Export LLM call traces".

## What changed
- `index.tsx`: button label `Export Traces{...}` → `Export LLM call traces{...}`. The `(N)` count suffix and all behavior are unchanged.

## Verification
- `npx tsc --noEmit` clean.
- `npx vite build` succeeds; `grep "Export LLM call traces" dist/dashboard/index.js` matches.
