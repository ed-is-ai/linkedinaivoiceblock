# Phase 30: Skill Registry Architecture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 30-skill-registry-architecture
**Areas discussed:** Skill meaning, roadmap fit, design goal, granularity, behavior posture, displaced LLM work, extension-surface scope, exclusion scope, milestone retitle

> This phase replaced the earlier "LLM-Primary Promotion" discussion. The user pivoted to an architecture refactor ("put logic into skills"). The prior LLM-primary context was superseded.

---

## What "skills" means

| Option | Description | Selected |
|--------|-------------|----------|
| In-extension skill registry | Runtime plugin architecture; each signal/detector becomes a self-registering skill behind a registry | ✓ |
| Claude Code SKILL.md | Move dev/automation workflows into .claude/skills/ as slash-commands | |
| Both / a blend | Some runtime modularization and some dev-tooling skills | |

**User's choice:** In-extension skill registry.

---

## Roadmap fit

| Option | Description | Selected |
|--------|-------------|----------|
| Replace Phase 30 | Repurpose Phase 30 to the skills refactor; re-slot LLM-primary | ✓ |
| New phase before 30 | Insert refactor as a foundation; LLM-primary builds on it | |
| Rethink the roadmap | Revisit the v10.0 milestone shape | |
| Just explore for now | Don't touch the roadmap yet | |

**User's choice:** Replace Phase 30.

---

## Primary design goal

| Option | Description | Selected |
|--------|-------------|----------|
| Add signals fast | Optimize for low-friction extensibility | |
| Decouple for LLM-primary | Separate sync/async scoring for later LLM work | |
| Testability/clarity | Independently testable, self-documenting behaviors | |
| Let the LLM extend it | A registry the LLM (or user) can add skills to programmatically | ✓ |

**User's choice:** Let the LLM extend it.
**Notes:** Drove the declarative-skill design (D-02) and the SkillRegistry storage-hydration approach (D-06). Claude flagged that MV3 CSP forbids runtime code, so LLM-authorable skills must be **declarative data**, not code.

---

## Skill granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Signal-level | Each signal a skill; detectors stay strategies | |
| Detector-level | Only heuristic/llm are skills | |
| Two-level | Detectors are skills AND signals are sub-skills | ✓ |

**User's choice:** Two-level (→ D-01).

---

## Behavior posture

| Option | Description | Selected |
|--------|-------------|----------|
| Strict preserve | Zero behavior change, golden-snapshot-guarded | ✓ |
| Preserve + small wins | Allow low-risk cleanups during the move | |

**User's choice:** Strict preserve (→ D-08/D-09). Guarded by the Phase 29 golden-score snapshot + an exclusion-parity check.

---

## Displaced LLM-primary work (LLM-01/02/03)

| Option | Description | Selected |
|--------|-------------|----------|
| Re-slot to a later phase | Keep as a future phase building on skills | |
| Partly fold in | Pull sync/async pre-pass scaffolding in | |
| Drop it | Abandon the LLM-primary direction; remove LLM-01/02/03 | ✓ |

**User's choice:** Drop it. LLM-01/02/03 removed from REQUIREMENTS.md; the LLM remains one DetectorSkill.

---

## Extension-surface scope (this phase)

| Option | Description | Selected |
|--------|-------------|----------|
| Architecture + empty surface | Two-level registry + storage-hydrated declarative loader, zero declarative skills seeded; LLM-authoring is a fast-follow | ✓ |
| Architecture + live LLM authoring | Also build the LLM-writes-skills mechanism now | |
| Just the code registry | No declarative/storage layer yet | |

**User's choice:** Architecture + empty surface (→ D-06/D-07). Provably identical now; LLM-authoring mechanism deferred.

---

## Exclusion scope

| Option | Description | Selected |
|--------|-------------|----------|
| Signals only | Exclusions stay as the hard pre-filter | |
| Exclusions become skills too | Model exclusions as a third skill kind | ✓ |

**User's choice:** Exclusions become skills too (→ D-03), with the hard-exclusion ordering preserved (D-09 / SKILL-03).

---

## Milestone retitle

| Option | Description | Selected |
|--------|-------------|----------|
| Leave it for now | Don't touch milestone framing | |
| Retitle the milestone too | Update v10.0 name/intent to the skills direction | ✓ |

**User's choice:** Retitle. v10.0 "LLM-Primary Detection & Eval-Driven Tuning" → "Skill-Based Detection & Eval-Driven Tuning" (ROADMAP, REQUIREMENTS, PROJECT, STATE updated).

## Claude's Discretion

- Module layout for `src/shared/skills/` + registry API shape.
- How `HeuristicDetector` becomes a registry runner while preserving the golden snapshot.
- `PatternSkill` declarative schema (rule kinds shipped first).
- Physical relocation of exclusion logic while keeping short-circuit ordering.

## Deferred Ideas

- LLM skill-authoring mechanism (fast-follow phase).
- LLM-primary promotion (dropped; `sync` flag leaves a seam if revived).
- Richer `PatternSkill` rule kinds; migrating complex signals to declarative.
