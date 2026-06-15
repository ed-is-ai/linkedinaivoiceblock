---
phase: 27-eval-improvements
plan: "02"
subsystem: eval-scripts
tags: [eval, labeling, cli, tdd]
dependency_graph:
  requires: []
  provides: [scripts/eval-label.ts, eval-label-npm-script, eval-compare-npm-script]
  affects: [package.json]
tech_stack:
  added: []
  patterns: [node-cli-shebang, in-place-json-rewrite, isMain-guard, readline-raw-mode]
key_files:
  created:
    - scripts/eval-label.ts
    - scripts/eval-label.test.ts
  modified:
    - package.json
decisions:
  - applyLabel mutates only the label key (never reconstructs entry object) for field preservation guarantee
  - --auto mode checks `!('label' in entry)` for idempotency — skips already-labeled entries
  - Interactive mode uses process.stdin.setRawMode + once('data') pattern (Node built-in, no new packages)
  - TTY guard exits 1 before setRawMode when stdin is not a TTY (CI safety, T-27-06)
  - process.exit(0) in --auto completes the CLI; tests assert rejects.toThrow(EXIT0) per established pattern
metrics:
  duration: "4m"
  completed: "2026-06-15"
  tasks: 2
  files: 3
---

# Phase 27 Plan 02: eval-label CLI + package.json script entries Summary

**One-liner:** Interactive and `--auto` bulk-labeling CLI (`scripts/eval-label.ts`) that writes `label: 'ai'|'human'` into export JSON entries in-place, preserving all other fields, with idempotent re-runs and `npm run eval-label` / `npm run eval-compare` registered.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (TDD RED) | Failing tests for applyLabel + CLI guards | 5bb944b | scripts/eval-label.test.ts |
| 1 (TDD GREEN) | applyLabel helper + eval-label CLI implementation | 40beb69 | scripts/eval-label.ts |
| 2 | Wire eval-label + eval-compare npm scripts into package.json | 1917432 | package.json |

## Verification Results

- `npx vitest run scripts/eval-label.test.ts` — 12/12 tests pass
- `npm run type-check` — exits 0, no type errors
- `node -e` package.json check — prints `OK`
- Source assertion: `eval-label.ts` exports `function applyLabel` at line 29
- Source assertion: `eval-label.ts` exports `async function main` at line 57
- Source assertion: no imports from `src/content/detector/llm` or `src/content/index` (Node-safety)

## TDD Gate Compliance

- RED gate: `test(27-02)` commit `5bb944b` — 12 failing tests created before implementation
- GREEN gate: `feat(27-02)` commit `40beb69` — all 12 tests pass after implementation

## Deviations from Plan

None — plan executed exactly as written.

The `readline` import is used only for its type (the actual raw-mode keypress uses `process.stdin.once('data')` directly per the RESEARCH.md pattern), and a `void readline;` line was added to suppress the unused-import warning without removing the import that documents the dependency.

## Known Stubs

None. `eval-label.ts` fully implements the `--auto` mode and interactive mode. The `eval-compare` npm script entry is pre-registered per the plan's explicit instruction; the `eval-compare.ts` file itself is created by Plan 03.

## Threat Flags

No new threat surface introduced beyond what was documented in the plan's threat model (T-27-04, T-27-05, T-27-06). All three mitigations are implemented: shape-guard before any write, idempotent label mutation, TTY guard before setRawMode.

## Self-Check: PASSED

- `scripts/eval-label.ts` — FOUND
- `scripts/eval-label.test.ts` — FOUND
- `package.json` contains `eval-label` entry — FOUND
- `package.json` contains `eval-compare` entry — FOUND
- Commit 5bb944b — FOUND (RED gate)
- Commit 40beb69 — FOUND (GREEN gate)
- Commit 1917432 — FOUND (package.json)
