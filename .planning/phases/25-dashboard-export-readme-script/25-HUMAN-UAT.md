---
status: partial
phase: 25-dashboard-export-readme-script
source: [25-VERIFICATION.md]
started: 2026-06-14T10:35:00Z
updated: 2026-06-14T10:35:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Dashboard Export Traces button — runtime behavior
expected: Load the built extension in Chrome and open the dashboard (`chrome-extension://.../dashboard.html`), Data Management card. (a) With no LLM traces recorded, the "Export Traces" button appears grayed out (`opacity 0.5`, `cursor: not-allowed`) and is unclickable. (b) After the LLM detector has run (API key configured, posts processed), the button shows "Export Traces (N)" and is clickable. (c) Clicking it downloads `linkedin-blocker-traces-YYYY-MM-DD.json` containing a `{ exportedAt, traces }` envelope that is valid JSON parseable by `npm run trace-summary`.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
