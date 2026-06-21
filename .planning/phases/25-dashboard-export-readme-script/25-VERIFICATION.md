---
phase: 25-dashboard-export-readme-script
verified: 2026-06-14T10:55:00Z
status: passed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Open built dashboard in Chrome, confirm Export Traces button is visible"
    expected: "Button renders in the Data Management card. When no traces exist, button appears grayed out/disabled. When traces exist, button shows count (e.g. 'Export Traces (3)'). Clicking it while enabled triggers download of linkedin-blocker-traces-YYYY-MM-DD.json."
    why_human: "chrome.storage.local interaction and Blob download require a real Chrome extension context — cannot be verified with grep or tsx runner alone."
    result: "passed — confirmed in Chrome 2026-06-14 (see 25-HUMAN-UAT.md). Empty-store disabled state and populated-store download both verified after activating LLM mode via a feed-tab reload."
---

# Phase 25: Dashboard Export + README Script Verification Report

**Phase Goal:** The user can download all stored LLM traces from the dashboard as a JSON file, and `npm run trace-summary` reads that file, prints a cost breakdown table, and updates README.md with a LLM Cost Reference section.
**Verified:** 2026-06-14T10:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Opening the dashboard shows an "Export Traces" button; clicking it downloads a `linkedin-blocker-traces-YYYY-MM-DD.json` file containing all stored trace entries | VERIFIED (code) / needs human for runtime | `handleExportTraces` in `index.tsx:142-145` calls `triggerDownload(buildTracesExport(traces), \`linkedin-blocker-traces-${today}.json\`, 'application/json')`. Button rendered at L273-281, visible unconditionally (disabled when `traces.length === 0`). `llbTraces` wired into single storage get at L87,94. |
| 2 | Running `npm run trace-summary <file>` prints a cost breakdown table grouped by source and model (call count, input tokens, output tokens, total USD, avg USD/call) | VERIFIED | `npx tsx scripts/trace-summary.ts ./fixture-traces.json` ran and printed correct grouped markdown table with all required columns. Spot-check output confirmed: source\|model\|calls\|failed\|input tokens\|output tokens\|total USD\|avg USD/call plus totals row. |
| 3 | After running the script, README.md contains an updated `## LLM Cost Reference` section with the generated table | VERIFIED | `grep -c "## LLM Cost Reference" README.md` returned `1`. Two consecutive runs leave exactly one section. README.md line 5 contains the heading with the generated table below it. |
| 4 | The script exits non-zero with a clear error message if the input file is missing or malformed | VERIFIED | Confirmed: missing file → exit 1 + stderr `Error: Could not read or parse file: ./nonexistent-file.json`; non-JSON → exit 1 + same error; JSON without `traces` array → exit 1 + `Error: JSON does not contain a "traces" array.`; empty `traces: []` → exit 0 (valid per D-07). |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/dashboard/dataManagement.ts` | `buildTracesExport` pure string builder | VERIFIED | `export function buildTracesExport(traces: TraceEntry[]): string` at L104-110. Returns `JSON.stringify({exportedAt, traces}, null, 2)`. No DOM/chrome/console references. |
| `src/dashboard/dataManagement.test.ts` | Unit tests for `buildTracesExport` | VERIFIED | `describe('buildTracesExport')` block present. 41/41 tests pass via `npx vitest run src/dashboard/dataManagement.test.ts`. |
| `src/dashboard/index.tsx` | `handleExportTraces` + Export Traces button + `llbTraces` storage load | VERIFIED | All three elements present at L142-145 (handler), L273-281 (button), L87+94 (storage). Exactly one `chrome.storage.local.get(` call. |
| `scripts/trace-summary.ts` | Node CLI: validate, recompute costs, print table, upsert README section | VERIFIED | 214-line implementation with all required behaviors. File exists, substantive, and confirmed working via spot-checks. |
| `package.json` | `trace-summary` script + `tsx` devDependency | VERIFIED | `scripts['trace-summary'] === 'tsx scripts/trace-summary.ts'`; `devDependencies.tsx === '^4.0.0'`; `npx tsx --version` returns `4.22.4`. |
| `README.md` | Generated `## LLM Cost Reference` section | VERIFIED | Section exists at line 5; idempotent (two runs → still exactly 1 section). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/dashboard/index.tsx` | `buildTracesExport` | `import from ./dataManagement`, called inside `handleExportTraces` | VERIFIED | L4 imports `buildTracesExport`; L144 calls `buildTracesExport(traces)` |
| `src/dashboard/index.tsx` | `chrome.storage.local.get llbTraces` | Added to existing single get key array; `setTraces` in `.then` | VERIFIED | L87: `'llbTraces'` in get array; L94: `setTraces((result.llbTraces ?? []) as TraceEntry[])`. Only 1 `get(` call total. |
| `handleExportTraces` | `triggerDownload` | Reuses existing helper with traces filename | VERIFIED | L144: `triggerDownload(buildTracesExport(traces), \`linkedin-blocker-traces-${today}.json\`, 'application/json')` |
| `scripts/trace-summary.ts` | `src/shared/pricing.ts computeCostUsd` | import + per-trace recompute with snake_case usage mapping | VERIFIED | L8: `import { computeCostUsd } from '../src/shared/pricing.js'`; L103: `computeCostUsd(entry.model, usage)`. `entry.costUsd` never used for sums (grep returned 0 matches). |
| `scripts/trace-summary.ts` | `README.md` | idempotent `upsertReadmeSection` + `writeFileSync` | VERIFIED | L172-207: `upsertReadmeSection` function replaces section heading to next `##` or EOF. Idempotency confirmed by 2-run test. |
| `package.json` | `scripts/trace-summary.ts` | `tsx scripts/trace-summary.ts` npm script | VERIFIED | `scripts['trace-summary'] === 'tsx scripts/trace-summary.ts'` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `src/dashboard/index.tsx` Export Traces button | `traces` state | `chrome.storage.local.get(['llbTraces'])` at L87 → `setTraces(result.llbTraces ?? [])` at L94 | Yes — real storage key from Phase 24 trace recording | FLOWING |
| `scripts/trace-summary.ts` table output | `parsed.traces` | `readFileSync(resolve(filePath))` + `JSON.parse` | Yes — real file read; spot-check confirmed correct output | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Script prints grouped table with failed column | `npx tsx scripts/trace-summary.ts ./fixture-traces.json` | Correct markdown table with `detector \| claude-sonnet-4-6 \| 1 \| 1 \| ...` | PASS |
| README updated after run | `grep -c "## LLM Cost Reference" README.md` | `1` | PASS |
| Idempotency (second run) | `npx tsx scripts/trace-summary.ts ./fixture` + `grep -c "## LLM Cost Reference" README.md` | Still `1` | PASS |
| Missing file exits non-zero | `npx tsx scripts/trace-summary.ts ./nonexistent.json; echo $?` | Exit 1, stderr error message | PASS |
| Non-JSON exits non-zero | `npx tsx scripts/trace-summary.ts ./fixture-notjson.txt; echo $?` | Exit 1, stderr error message | PASS |
| No `traces` array exits non-zero | `npx tsx scripts/trace-summary.ts ./fixture-no-traces.json; echo $?` | Exit 1, `Error: JSON does not contain a "traces" array.` | PASS |
| Empty `traces: []` exits 0 (valid) | `npx tsx scripts/trace-summary.ts ./fixture-empty.json; echo $?` | Exit 0, table with `(no traces)` row | PASS |
| CR-01: null entries skipped with warning | `npx tsx scripts/trace-summary.ts ./fixture-malformed-entries.json` | Warnings for null/42/"bad", continues processing valid entry, exit 0 | PASS |
| WR-01: non-finite tokens → 0, no NaN | malformed fixture with `inputTokens: null` | Table shows `0` tokens, `$0.000000` cost — no `NaN` values | PASS |
| Full test suite | `npx vitest run` | 250/250 tests pass across 18 test files | PASS |
| TypeScript | `npx tsc --noEmit` | Exit 0 (clean) | PASS |
| Build | `npx vite build` | Exit 0, bundle produced | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| TRACE-04 | 25-01-PLAN.md | Dashboard "Export Traces" button downloads `linkedin-blocker-traces-YYYY-MM-DD.json` | SATISFIED | `handleExportTraces`, button wiring, `llbTraces` storage load all present and verified |
| TRACE-05 | 25-02-PLAN.md | `npm run trace-summary <file>` prints cost breakdown table grouped by source+model | SATISFIED | Script runs correctly, correct columns, correct grouping, correct totals row |
| TRACE-06 | 25-02-PLAN.md | `npm run trace-summary <file>` writes/updates `## LLM Cost Reference` in README.md | SATISFIED | Section exists in README.md; idempotent upsert confirmed |

---

### Code Review Findings — Post-Fix Verification

The 25-REVIEW.md documents critical/warning findings fixed in commits 2268937, 773bc35, 26de97b:

| Finding | Fix | Status |
|---------|-----|--------|
| CR-01: null/primitive entries in `traces` array crash the CLI | Guard at `trace-summary.ts:63-66`: skip non-object entries with stderr warning | VERIFIED — confirmed working with fixture containing null/number/string entries |
| WR-01: non-finite token fields propagate NaN into table/README | `safe()` coercion at `trace-summary.ts:92-101` before accumulating | VERIFIED — `null` and non-number tokens produce 0, not NaN |
| WR-02: `filterCleansed` silently drops all data on invalid date string | `parseCutoffMs` at `dataManagement.ts:64-71` throws `RangeError` on non-finite date | VERIFIED — test at `dataManagement.test.ts:213-215` expects `RangeError`, all 250 tests pass |
| WR-03: Export Traces button always active even when traces empty | Button rendered with `disabled={traces.length === 0}` and visual `opacity: 0.5, cursor: not-allowed` at `index.tsx:275-277` | VERIFIED — button visible unconditionally but disabled/grayed when empty |
| IN-01: `deriveCleanseCount` test relied on implicit NaN behavior | Test updated to `expect(...).toThrow(RangeError)` at `dataManagement.test.ts:213` | VERIFIED — test matches new behavior |
| IN-02: `buildTracesExport` passes traces array by reference | Accepted as by-design (cap enforced at write time per TRACE-03) | Accepted — no code change required |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TBD/FIXME/XXX/placeholder patterns detected in any phase-modified file | — | — |

---

### Human Verification Required

#### 1. Dashboard Export Traces Button — Runtime Behavior

**Test:** Load the built extension in Chrome, open the dashboard (`chrome-extension://.../dashboard.html`). Inspect the Data Management card.

**Expected:**
- When no LLM traces have been recorded (no API key configured), the "Export Traces" button appears grayed out with `cursor: not-allowed` and is unclickable.
- After the LLM detector has run (API key configured, some LinkedIn posts processed), the button should display as "Export Traces (N)" where N is the trace count, and clicking it should trigger a download of `linkedin-blocker-traces-YYYY-MM-DD.json` containing a `{ exportedAt, traces }` envelope.
- The downloaded file should be valid JSON parseable by `npm run trace-summary`.

**Why human:** `chrome.storage.local` and Blob download behavior require a real Chrome extension runtime context. The code is correct and verified by grep/unit tests, but the end-to-end download flow cannot be exercised in a Node/tsx environment.

---

### Gaps Summary

No blocking gaps found. All four success criteria are met in the codebase:

1. Export Traces button exists in dashboard, wired to `llbTraces` storage, downloads correct envelope — code-verified; awaiting 1 human runtime check.
2. `npm run trace-summary` script exists, validated, and produces correct grouped tables — spot-checked with 8 fixture scenarios.
3. README.md `## LLM Cost Reference` section exists and is idempotently managed — confirmed via two-run test.
4. Script exits non-zero with clear stderr on missing/malformed/no-traces input — confirmed via 4 error-path spot-checks.

Code-review fixes (CR-01/WR-01/WR-02/WR-03/IN-01) are all committed and verified. The single human verification item is a runtime UX check for the Chrome extension context.

---

_Verified: 2026-06-14T10:35:00Z_
_Verifier: Claude (gsd-verifier)_
