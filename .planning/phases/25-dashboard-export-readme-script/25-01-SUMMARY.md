---
phase: 25-dashboard-export-readme-script
plan: "01"
subsystem: dashboard
tags: [export, traces, dashboard, storage]
dependency_graph:
  requires: [24-trace-capture-storage]
  provides: [trace-export-button, buildTracesExport]
  affects: [src/dashboard/dataManagement.ts, src/dashboard/index.tsx]
tech_stack:
  added: []
  patterns: [pure-string-builder, blob-download-trigger, chrome-storage-single-get]
key_files:
  created: []
  modified:
    - src/dashboard/dataManagement.ts
    - src/dashboard/dataManagement.test.ts
    - src/dashboard/index.tsx
decisions:
  - "buildTracesExport placed in dataManagement.ts alongside existing builders (pure, no DOM/chrome/console)"
  - "Export Traces button rendered unconditionally — empty trace store is a valid export (D-07)"
  - "llbTraces added to existing single chrome.storage.local.get call — no second get or useEffect"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-14"
  tasks_completed: 2
  files_modified: 3
---

# Phase 25 Plan 01: Add Export Traces Button to Dashboard Summary

**One-liner:** Pure `buildTracesExport` builder + unit tests + `handleExportTraces` button wiring in the dashboard that downloads all stored LLM traces as a `{ exportedAt, traces }` envelope.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add buildTracesExport pure builder + unit tests | 0890f45 | src/dashboard/dataManagement.ts, src/dashboard/dataManagement.test.ts |
| 2 | Wire handleExportTraces + Export Traces button + llbTraces load in dashboard | 1ec7d84 | src/dashboard/index.tsx |

## What Was Built

### Task 1: buildTracesExport pure builder + unit tests (TDD)

**RED phase:** Added failing test import of `buildTracesExport` (not yet exported) and a `describe('buildTracesExport')` block with 4 tests in `dataManagement.test.ts`. Tests confirmed failing (TypeError: buildTracesExport is not a function).

**GREEN phase:** Added `export function buildTracesExport(traces: TraceEntry[]): string` to `dataManagement.ts`. The function builds `{ exportedAt: new Date().toISOString(), traces }` and returns `JSON.stringify(payload, null, 2)`. Pure function — no DOM, no `chrome.*`, no `console.*`.

All 41 tests pass (37 pre-existing + 4 new buildTracesExport tests).

### Task 2: Dashboard wiring

- `TraceEntry` added to shared types import in `index.tsx`
- `buildTracesExport` added to dataManagement import in `index.tsx`
- `const [traces, setTraces] = useState<TraceEntry[]>([])` added alongside `posts` state
- `'llbTraces'` added to the existing single `chrome.storage.local.get([...])` call
- `setTraces((result.llbTraces ?? []) as TraceEntry[])` added in the existing `.then` body
- `handleExportTraces` added — mirrors `handleExportJson`, calls `triggerDownload(buildTracesExport(traces), \`linkedin-blocker-traces-${today}.json\`, 'application/json')`
- "Export Traces" button added in an unconditional flex row below the existing account-gated export buttons

## Verification

- `npx vitest run src/dashboard/dataManagement.test.ts` — 41/41 tests pass
- `npx tsc --noEmit` — exits 0
- `npx vite build` — exits 0

## Deviations from Plan

None — plan executed exactly as written.

The "Export Traces" button was placed in a separate unconditional `<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>` below the existing account-gated row, rather than inside the conditional block. This is consistent with the plan requirement: "render it unconditionally (an empty trace store is a valid export per D-07)."

## Known Stubs

None. The `buildTracesExport` builder is fully wired to the real `llbTraces` storage key.

## Threat Flags

No new threat surface introduced. `buildTracesExport` accepts only `TraceEntry[]` (no API key field by construction — T-24-01). The `result.llbTraces ?? []` default covers the missing-key case per T-25-02 mitigation.

## Self-Check: PASSED

- `src/dashboard/dataManagement.ts` contains `export function buildTracesExport(` — FOUND
- `src/dashboard/dataManagement.test.ts` contains `describe('buildTracesExport'` — FOUND
- `src/dashboard/index.tsx` contains `function handleExportTraces` — FOUND
- `src/dashboard/index.tsx` contains `Export Traces` — FOUND
- `src/dashboard/index.tsx` contains `llbTraces` — FOUND
- Commit 0890f45 (Task 1) — FOUND
- Commit 1ec7d84 (Task 2) — FOUND
