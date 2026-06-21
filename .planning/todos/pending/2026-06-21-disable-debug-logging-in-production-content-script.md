---
created: 2026-06-21T01:55:00.000Z
title: Disable DEBUG logging in production content script
area: general
files:
  - src/content/index.ts:24
---

## Problem

`src/content/index.ts` hardcodes a `DEBUG = true` flag (around line 24) that emits verbose
`console.log` output — including fragments of post text — for every post that enters the
detection pipeline, in any production Chrome install. Surfaced by the Phase 34 code review
(finding WR-04). This is pre-existing (not introduced by Phase 34) but is a privacy/noise
concern: user feed content is logged to the console on every page.

## Solution

Gate the flag on the build mode instead of hardcoding it:
`const DEBUG = import.meta.env.DEV;` (Vite injects `import.meta.env.DEV` = false in production
builds). Verify the vite-plugin-web-extension build defines `import.meta.env.DEV`; if not, use
an equivalent build-time constant. Confirm no post text is logged in a production `npm run build`
bundle afterward. Check for the same pattern in other entrypoints (background, dashboard) while
there.
