# Phase 33: Improve Modularity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 33-Improve Modularity
**Areas discussed:** Phase setup, Detector migration, Tool migration, Registry+codegen unification, src/shared reorg, UX modules

---

## Phase Setup (Phase 33 not yet in roadmap)

| Option | Description | Selected |
|--------|-------------|----------|
| Add Phase 33 to roadmap | Append "improve modularity" as a new phase, then discuss | ✓ |
| Start a new milestone | Open v11.0 via /gsd-new-milestone, scope requirements first | |
| Discuss now, formalize after | Gather decisions, slot into roadmap afterward | |

**User's choice:** Add Phase 33 to roadmap.
**Notes:** Milestone v10.0 was complete; Phase 33 added under a new lightweight v11.0 "Modularity & Maintainability" milestone header in ROADMAP.md.

---

## Discuss area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Finish detector migration | What moves from src/content/detector/ into owning skills | ✓ |
| Finish tool migration | dom-selector-registry naming + selector internals | ✓ |
| Unify registry+codegen | One pattern vs separate | ✓ |
| Reorganize src/shared/ | Group grab-bag by concern | ✓ |
| (Other) UX modularity | dashboard + evals bundled; want separate modules under a "modules" folder | ✓ |

**User's choice:** All four offered areas + a fifth (UX modules) added freeform.

---

## Detector migration

| Option | Description | Selected |
|--------|-------------|----------|
| Owned logic moves, infra stays | Skill/tool-owned logic relocates; cross-cutting DOM utils stay in content | ✓ |
| Move everything possible | Aggressive co-location; content/detector/ disappears | |
| Minimal — just the detectors | Only heuristic.ts + llm.ts move | |

**User's choice:** Owned logic moves, infra stays.
**Notes:** comment-expand/language/tombstone treated as shared pipeline infra; rederiver → rederive tool; profile signal → skill.

---

## Tool migration (selector internals)

| Option | Description | Selected |
|--------|-------------|----------|
| Into the tool folders | Co-locate heal/sanitizer/validator/heuristic inside dom-selector-* tools | ✓ |
| Shared selector module | One place both tools import | |
| Rename only, leave logic | Fix naming only, leave content/selector/ | |

**User's choice:** Into the tool folders. Plus rename SKILL.md→TOOL.md, .skill.ts→.tool.ts to match rederive.

---

## Registry + codegen

| Option | Description | Selected |
|--------|-------------|----------|
| Unify codegen, keep registries | One generator, two outputs; distinct SkillRegistry/ToolRegistry | ✓ |
| Fully unify | One registry abstraction + one generated module | |
| Align conventions only | Keep separate, mirror naming | |

**User's choice:** Unify codegen, keep registries distinct.

---

## src/shared/ reorg

| Option | Description | Selected |
|--------|-------------|----------|
| Group by concern | Cohesive subfolders | ✓ |
| Minimal clustering | Only obvious clusters | |
| Leave flat | Defer | |

**User's choice:** Group by concern.
**Notes:** User-locked folder names — storage cluster is **"Memory"** (not storage); other folders LLM, eval, skills. types.ts stays at root.

---

## UX modules

| Option | Description | Selected |
|--------|-------------|----------|
| All three: dashboard, evals, popup | src/modules/{dashboard,evals,popup}/ as peer modules | ✓ |
| Dashboard + evals only | Leave popup in place | |
| Split in place, no modules/ folder | Sibling top-level folders | |

**User's choice:** All three under src/modules/.

| Option | Description | Selected |
|--------|-------------|----------|
| Each module owns its own | No shared folder; modules self-contained | ✓ |
| Add a shared UX folder | modules/common/ seam for future reuse | |

**User's choice:** Each module owns its own (no common folder).

---

## Claude's Discretion

- Exact per-file ownership determinations within the locked principles/folder names.
- Wave/plan sequencing across the five largely-independent tracks.
- Atomic-commit-per-track approach (recommended for zero-behavior-change verification).

## Deferred Ideas

- Full registry unification (rejected — would collapse the Phase 32 skill/tool distinction).
- Shared/common UX module (rejected — nothing shared across surfaces today).
- Eval-driven tuning / regression gate (remains deferred from v10.0).
