---
status: complete
phase: 25-dashboard-export-readme-script
source: [25-VERIFICATION.md]
started: 2026-06-14T10:35:00Z
updated: 2026-06-14T10:55:00Z
---

## Current Test

[all items verified in Chrome]

## Tests

### 1a. Export Traces button renders + disabled when empty
expected: In the built dashboard's Data Management card, the "Export Traces" button is visible and, with no LLM traces stored, renders grayed out (`opacity 0.5`, `cursor: not-allowed`) and is unclickable.
result: passed — confirmed in Chrome 2026-06-14; user elected to keep the disabled-when-empty behavior (WR-03 over plan decision D-07).

### 1b. Export Traces download with a populated trace store
expected: After the LLM detector has run (Anthropic API key configured + posts scored, so `llbTraces` is non-empty), the button shows "Export Traces (N)", is clickable, and clicking it downloads `linkedin-blocker-traces-YYYY-MM-DD.json` containing a `{ exportedAt, traces }` envelope that is valid JSON parseable by `npm run trace-summary`.
result: passed — confirmed in Chrome 2026-06-14. Note: LLM traces only accumulate after the LinkedIn feed tab is reloaded so the content script re-inits and selects LLMDetector (detector is chosen once at init; configuring the key alone does not retro-activate an already-loaded tab).

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
