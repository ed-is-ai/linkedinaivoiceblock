---
phase: 31-skill-library-alignment
plan: "04"
subsystem: skill-registry
tags: [skill-library, codegen, tests, ci, order-pinning, kind-drift-guard, authoring, D-05, D-06, D-07, SKILL-05]
dependency_graph:
  requires: [31-03]
  provides: [order-pinning-tests, kind-drift-guard-tests, ci-stale-check, skill-authoring-docs]
  affects:
    - src/content/generated-skill-registry.test.ts
    - .github/workflows/ci.yml
    - src/skills/library/AUTHORING.md
tech_stack:
  added: []
  patterns: [vitest-describe-it-expect, github-actions-ci, append-only-ordering]
key_files:
  created:
    - src/content/generated-skill-registry.test.ts
    - .github/workflows/ci.yml
    - src/skills/library/AUTHORING.md
  modified: []
decisions:
  - "CI workflow created from scratch (no prior .github/workflows/ existed); minimal ubuntu-latest workflow with push/PR triggers"
  - "check-skill-registry script was already wired in package.json from Wave 1 — no modification needed"
  - "Test file placed in src/content/ (not src/skills/library/) because it tests the generated module at src/content/generated-skill-registry.ts, mirroring the heuristic.test.ts location convention"
metrics:
  duration: "11m"
  completed: "2026-06-16"
  tasks: 3
  files: 3
---

# Phase 31 Plan 04: Skill Library Alignment — Tests, CI, Authoring Note Summary

Order-pinning and kind-drift-guard tests lock the generated registry's array invariants; a GitHub Actions CI workflow fails if the committed generated module is stale; and an AUTHORING.md documents the append-only four-step skill workflow — satisfying all five SKILL-05 success criteria.

## What Was Built

**Task 1 — Order-pinning + kind-drift-guard tests (`src/content/generated-skill-registry.test.ts`):**
- `describe('generated-skill-registry order invariants (D-06)')`:
  - `GENERATED_SIGNAL_SKILLS.map(s => s.id)` asserted `toStrictEqual(['listicle-cta','buzzword','em-dash','ai-vocab','hook-story','motivational','impersonal','generic-comments'])` — the Phase 30 CODE_SIGNAL_SKILLS order
  - `GENERATED_EXCLUSION_SKILLS.map(s => s.id)` asserted `toStrictEqual(['sponsored','company-page','non-english','open-to-work'])` — the Phase 30 CODE_EXCLUSION_SKILLS order
- `describe('generated-skill-registry kind drift-guard (D-07)')`:
  - Loop asserting every `GENERATED_SIGNAL_SKILLS` entry has `kind === 'signal'`
  - Loop asserting every `GENERATED_EXCLUSION_SKILLS` entry has `kind === 'exclusion'`
- 4/4 tests pass; 422/422 across full suite

**Task 2 — CI stale-check wiring (`.github/workflows/ci.yml`):**
- No prior `.github/` directory existed — created from scratch
- Minimal GitHub Actions workflow triggering on push to master/main and all PRs
- Step sequence: `npm ci` → `npm run check-skill-registry` (D-05) → `npm run type-check` → `npm test`
- `check-skill-registry` was already correct in `package.json` (`generate-skill-registry && git diff --exit-code src/content/generated-skill-registry.ts`); stale-check passes locally against current committed module

**Task 3 — Skill-authoring note (`src/skills/library/AUTHORING.md`, 189 lines):**
- Four-step workflow documented: create folder + SKILL.md + impl → append to skill-order.json → `npm run generate-skill-registry` → `npm test`
- Explicit **append-only** ordering rule for `signals` array with explanation of D-06 landmine (signalBreakdown key order + golden snapshot)
- Documents D-01 (frontmatter-only metadata in SKILL.md vs TS runtime contract in .skill.ts)
- Documents D-05 (committed+stale-checked generated module), D-08 (build-time frontmatter validation by codegen)
- Notes CLAUDE.md constraint #1 selector-registry single-writer invariant
- Notes SKILL.md files are build-time inputs only (never bundled; codegen uses `fs.readFileSync`)
- Notes detectors are not in skill arrays (metadata only in GENERATED_DETECTOR_SKILLS)
- Import depth rule: three levels (`../../../`) from `src/skills/library/<name>/` to `src/`

## Verification Results

| Check | Result |
|-------|--------|
| `generated-skill-registry.test.ts` (4 new tests) | 4/4 pass |
| Full test suite | 29/29 files, 422/422 tests pass |
| `npm run check-skill-registry` | exits 0 — committed module is up to date |
| CI workflow contains `check-skill-registry` step | Confirmed (grep CI_OK) |
| CI step order: stale-check before tests | Confirmed |
| AUTHORING.md references skill-order.json | Confirmed |
| AUTHORING.md contains "append" (ordering rule) | Confirmed |
| AUTHORING.md line count | 189 lines (>= 20 minimum) |

## Deviations from Plan

None — plan executed exactly as written. The `check-skill-registry` script was already present in `package.json` (added in Wave 1), so no `package.json` modification was needed. No prior `.github/workflows/ci.yml` existed, so a new minimal workflow was created.

## Known Stubs

None.

## Threat Flags

No new threat surface. All threat register items mitigated:
- T-31-04-01: `check-skill-registry` wired into CI (D-05) — job fails on stale generated module
- T-31-04-02: Order-pinning tests in `generated-skill-registry.test.ts` catch silent reorder (D-06)
- T-31-04-03: Kind-drift-guard tests + build-time codegen validation guard frontmatter/TS kind divergence (D-07/D-08)
- T-31-04-04: AUTHORING.md explicitly states SKILL.md files are never bundled (build-time only)

## Self-Check: PASSED
