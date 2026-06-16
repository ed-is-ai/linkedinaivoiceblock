---
phase: 31-skill-library-alignment
plan: "01"
subsystem: skill-registry
tags: [skill-library, codegen, build-time, exclusion-skills, tracer-bullet]
dependency_graph:
  requires: []
  provides: [skill-library-path, codegen-script, generated-skill-registry, sponsored-skill-folder]
  affects: [src/content/skill-registry.ts, src/content/generated-skill-registry.ts]
tech_stack:
  added: [js-yaml (via @types/js-yaml devDep), skill-order.json config]
  patterns: [build-time-codegen, static-import-only, committed-generated-file, tracer-bullet-spike]
key_files:
  created:
    - src/skills/library/sponsored/SKILL.md
    - src/skills/library/sponsored/sponsored.skill.ts
    - scripts/generate-skill-registry.ts
    - scripts/skill-order.json
    - src/content/generated-skill-registry.ts
  modified:
    - src/content/skill-registry.ts
    - package.json
  deleted:
    - src/content/exclusions/sponsored.skill.ts
decisions:
  - "Place skills at src/skills/library/ (inside TypeScript/Vite build graph, covered by tsconfig include src/**/*)"
  - "Codegen is resilient for tracer wave: skip absent SKILL.md folders, only wire present ones"
  - "importVarName generates <camel>ExclusionSkill suffix for exclusion kind, matching existing codebase convention"
  - "Wave-1 tracer: CODE_EXCLUSION_SKILLS = [...GENERATED_EXCLUSION_SKILLS, <3 direct imports>] to avoid Pitfall 6 double-import"
metrics:
  duration: "18m"
  completed: "2026-06-16"
  tasks: 3
  files: 7
---

# Phase 31 Plan 01: Skill Library Alignment — Tracer Bullet (Sponsored) Summary

End-to-end skill-library path proven via a single tracer: `sponsored` exclusion skill moved to `src/skills/library/sponsored/` (SKILL.md + impl), codegen script emits a committed static-import-only generated module, and `SkillRegistry` resolves it — exclusion parity and golden-score snapshot byte-identical.

## What Was Built

The complete skill-library mechanism (D-02 through D-09) exercised on the cheapest slice:

1. **`src/skills/library/sponsored/`** — Anthropic Agent Skills folder with `SKILL.md` (name/description/metadata.kind frontmatter, no runtime fields) and `sponsored.skill.ts` (byte-identical body from the deleted `src/content/exclusions/sponsored.skill.ts`; import path corrected to `../../../content/selector-registry`).

2. **`scripts/generate-skill-registry.ts`** — tsx-runnable codegen that reads `skill-order.json`, validates SKILL.md frontmatter (D-08: name/description non-empty strings, kind in allowed set, `process.exit(1)` on violation), and emits `src/content/generated-skill-registry.ts` using only top-level static `import` statements (no `import()`, no `import.meta.glob`, no `eval` — D-03/MV3-CSP). Tracer-phase resilience: skips absent SKILL.md folders rather than failing, so declared-but-not-yet-migrated names in `skill-order.json` do not break the build.

3. **`scripts/skill-order.json`** — Explicit ordered config (D-06) with all 14 skill folder names across `signals`, `exclusions`, and `detectors` arrays in the exact pipeline/priority order required by the golden-score snapshot and exclusion parity tests.

4. **`src/content/generated-skill-registry.ts`** — Committed generated module (D-05) with DO-NOT-EDIT header, static import of `sponsoredExclusionSkill`, and exported `GENERATED_SIGNAL_SKILLS` (empty this wave) and `GENERATED_EXCLUSION_SKILLS` ([sponsoredExclusionSkill]) arrays plus `GENERATED_SKILL_METADATA` object.

5. **`src/content/skill-registry.ts`** — Exclusion import block rewired: `sponsoredExclusionSkill` direct import replaced by `import { GENERATED_EXCLUSION_SKILLS } from './generated-skill-registry'`; `CODE_EXCLUSION_SKILLS` now spreads `GENERATED_EXCLUSION_SKILLS` first (tracer) then the three remaining direct imports (wave-2 migration). Signal imports and all other code (lines 97–293) unchanged.

6. **`package.json`** — Three new npm scripts: `generate-skill-registry`, `prebuild`, `check-skill-registry`; `@types/js-yaml` added to devDependencies.

## Verification Results

| Check | Result |
|-------|--------|
| `exclusions.test.ts` | 6/6 pass — exclusion parity byte-identical |
| `heuristic.test.ts` | 19/19 pass — golden-score snapshot byte-identical |
| `npx tsc --noEmit` | Clean (0 errors) |
| Codegen idempotency | Second run produces no git diff |
| No dynamic imports in generated module | Confirmed (grep: no `import(`, `import.meta.glob`, `eval(`) |
| No `.md` import in src/ | Confirmed |
| Invalid kind validation | `process.exit(1)` with stderr message verified |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Import path depth corrected for skill library location**

- **Found during:** Task 1 — TypeScript type-check
- **Issue:** Plan acceptance criteria stated `import { resolve } from '../../content/selector-registry'` but `src/skills/library/sponsored/` is 3 levels deep under `src/`, not 2. The path `../../content/selector-registry` from that location resolves to `src/skills/content/` (non-existent). The RESEARCH.md described the path pattern from a higher level without computing the exact depth.
- **Fix:** Changed all three imports to `../../../content/selector-registry`, `../../../shared/skills/types`, `../../../shared/types` (one extra level).
- **Files modified:** `src/skills/library/sponsored/sponsored.skill.ts`
- **Commit:** a9150cd

**2. [Rule 1 - Bug] importVarName needed kind-suffix to match codebase convention**

- **Found during:** Task 2 — inspecting generated module output
- **Issue:** Initial `importVarName` implementation generated `sponsoredSkill` (no suffix) but the actual export from `sponsored.skill.ts` is `sponsoredExclusionSkill`. The codebase uses `<camel>ExclusionSkill` for exclusion skills.
- **Fix:** Added `kind` parameter to `importVarName`; exclusion skills get `ExclusionSkill` suffix, others get `Skill` suffix.
- **Files modified:** `scripts/generate-skill-registry.ts`
- **Commit:** fef9a7a

**3. [Rule 3 - Blocking] Corrupted rolldown binding after disk-full npm install**

- **Found during:** Task 3 — running vitest
- **Issue:** `npm install --save-dev @types/js-yaml` failed mid-write (ENOSPC — disk full at 0 bytes free). The `@rolldown/binding-win32-x64-msvc.node` file in the worktree was truncated (12MB vs correct 23MB), causing vitest to fail to load its config.
- **Fix:** Copied the valid binding from the main repo's `node_modules` (same version). `@types/js-yaml` was already present in the worktree's `node_modules` as a transitive dep; only added it to `package.json` devDependencies manually (no install needed).
- **Note:** The disk space issue is an environmental constraint — the worktree's `node_modules` are partially incomplete due to the full disk. The fix is minimal (restore only the file needed for the immediate test run).

## Known Stubs

None. The tracer proves a real end-to-end path — `sponsoredExclusionSkill` genuinely resolves through the generated module and the exclusion parity test confirms it produces identical behavior.

## Threat Flags

No new threat surface introduced. All items in the plan's threat register were mitigated:
- T-31-01: `check-skill-registry` script added (regenerate-and-diff guard)
- T-31-02: Generated module verified to contain only static top-level `import` statements
- T-31-03: `yaml.load` used on descriptive-only frontmatter (string scalars only), validated by D-08 schema check
- T-31-04: No `.md` imports exist in `src/` (verified by grep)
- T-31-SC: `@types/js-yaml` — types-only package, no runtime code, already present transitively

## Self-Check: PASSED
