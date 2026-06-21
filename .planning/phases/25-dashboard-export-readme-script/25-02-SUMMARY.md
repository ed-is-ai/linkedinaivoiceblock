---
phase: 25-dashboard-export-readme-script
plan: "02"
subsystem: scripts
tags: [cli, cost-reporting, readme, trace-summary, tsx]
dependency_graph:
  requires:
    - "25-01 (buildTracesExport + trace export — provides the JSON format this script reads)"
    - "src/shared/pricing.ts (computeCostUsd + MODEL_PRICING — cost recompute source)"
    - "src/shared/types.ts (TraceEntry interface)"
  provides:
    - "scripts/trace-summary.ts (npm run trace-summary CLI)"
    - "README.md ## LLM Cost Reference section (generated, idempotent)"
  affects:
    - "package.json (new trace-summary script + tsx devDependency)"
    - "README.md (idempotent section write)"
tech_stack:
  added:
    - "tsx ^4.0.0 — TypeScript runner for Node CLI scripts (devDependency)"
  patterns:
    - "ESM Node script header (shebang + fileURLToPath/__dirname)"
    - "computeCostUsd recompute per trace (D-01/D-01a) — never sums stored costUsd"
    - "upsertReadmeSection — idempotent section replace (find heading, slice to next ## or EOF)"
key_files:
  created:
    - "scripts/trace-summary.ts — CLI: validate, recompute, group, table, README upsert"
    - "README.md — created by script with minimal scaffold + LLM Cost Reference section"
  modified:
    - "package.json — trace-summary script + tsx devDependency"
    - "package-lock.json — tsx v4.22.4 materialized"
decisions:
  - "tsx ^4.0.0 added as devDependency (pre-approved by user as legitimate — privatenumber/tsx, millions of weekly downloads)"
  - "Cost recomputed per trace via computeCostUsd() — stored entry.costUsd never used for totals (D-01/D-01a)"
  - "Failed calls tracked in a separate column; token/USD columns exclude them (D-03)"
  - "README upsert replaces only from SECTION_HEADING to next ## heading or EOF, preserving all other content (D-06, T-25-04)"
  - "model/source strings used only as map keys and printed text — never passed to eval (T-25-05)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-14"
  tasks_completed: 2
  tasks_total: 3
  files_created: 2
  files_modified: 2
---

# Phase 25 Plan 02: Trace Summary CLI + README LLM Cost Reference Summary

**One-liner:** `npm run trace-summary <file>` CLI that recomputes LLM costs via `computeCostUsd`, prints a grouped source/model breakdown table, and idempotently upserts a `## LLM Cost Reference` section in `README.md`.

## What Was Built

### Task 1 (Pre-approved)
Human legitimacy gate for `tsx` package was pre-approved by user before execution. `tsx` v4.22.4 confirmed as official esbuild-based TypeScript runner (`privatenumber/tsx`).

### Task 2: package.json — trace-summary script + tsx devDependency
- Added `"trace-summary": "tsx scripts/trace-summary.ts"` to scripts block after `generate-icons`
- Added `"tsx": "^4.0.0"` to devDependencies (alphabetical position, before `typescript`)
- Ran `npm install` → tsx v4.22.4 installed, lockfile updated
- Verification: `node -e "..."` and `npx tsx --version` both pass

### Task 3: scripts/trace-summary.ts — full CLI implementation
- **Validation (D-07):** Checks `process.argv[2]` presence; wraps file read + JSON parse in try/catch; validates `parsed.traces` is an array; exits non-zero with clear stderr on all error conditions; treats `traces: []` as valid
- **Cost recompute (D-01/D-01a):** Maps camelCase TraceEntry fields (`inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`) to snake_case Anthropic usage shape and calls `computeCostUsd(entry.model, usage)` — stored `entry.costUsd` is never used for totals
- **Aggregation (D-03, D-05):** Groups by `source+model`; successful calls accumulate token/USD sums; failed calls (`entry.error` present) tracked in a separate `failed` column
- **Table output:** Markdown table with columns: source | model | calls | failed | input tokens | output tokens | total USD | avg USD/call + totals row; written to stdout and passed to `upsertReadmeSection`
- **README upsert (D-06, T-25-04):** Creates `README.md` if missing with minimal scaffold; if existing, replaces section from `## LLM Cost Reference` to next `## ` heading or EOF; idempotent — two consecutive runs leave exactly one section instance

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| `scripts['trace-summary']` === `tsx scripts/trace-summary.ts` | PASS |
| `devDependencies.tsx` present | PASS |
| `npx tsx --version` exits 0 | PASS (v4.22.4) |
| Script contains `computeCostUsd(entry.model` | PASS |
| Script contains `## LLM Cost Reference` | PASS |
| Script body does NOT sum `entry.costUsd` for USD totals | PASS (0 matches) |
| Fixture run exits 0, shows failed=1, README section created | PASS |
| Non-existent file exits non-zero with stderr | PASS |
| Non-JSON file exits non-zero | PASS |
| JSON with no `traces` array exits non-zero | PASS |
| `traces: []` fixture exits 0 | PASS |
| Second run leaves exactly 1 `## LLM Cost Reference` section | PASS |
| Full verify command prints `VERIFY_OK` | PASS |

## Deviations from Plan

None — plan executed exactly as written. Task 1 was pre-approved by the orchestrator per user confirmation.

## Known Stubs

None. The script reads real trace data and computes real costs from `MODEL_PRICING`.

## Threat Flags

None beyond what is documented in the plan's threat model. All STRIDE mitigations implemented as specified:
- T-25-03: read+parse in try/catch with process.exit(1) on any throw
- T-25-04: section replacement scoped to heading → next ## or EOF; idempotency verified
- T-25-05: model/source strings used only as map keys and printed text; no eval

## Self-Check

### Files exist:
- `scripts/trace-summary.ts` — FOUND
- `README.md` — FOUND
- `package.json` (modified) — FOUND

### Commits exist:
- `9236f4b` chore(25-02): add trace-summary npm script and tsx devDependency
- `2d90ce7` feat(25-02): implement trace-summary CLI — cost recompute, grouped table, README upsert

## Self-Check: PASSED
