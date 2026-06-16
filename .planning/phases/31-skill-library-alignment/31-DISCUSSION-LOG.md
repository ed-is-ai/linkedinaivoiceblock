# Phase 31: Skill Library Alignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 31-skill-library-alignment
**Areas discussed:** Manifest authority & hydration, Frontmatter schema

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest authority & hydration | Is SKILL.md runtime source-of-truth or doc-only? | ✓ |
| Manifest→bundle binding | How frontmatter reaches the MV3 bundle | (answered via codegen below) |
| Frontmatter schema | Pure Anthropic standard vs extended fields | ✓ |
| Folder location & selector scope | Repo-root vs src/; selector-as-skill representation | (left to Claude's discretion) |

---

## Manifest Authority & Hydration

### Q1 — What is SKILL.md authoritative for at runtime?

| Option | Description | Selected |
|--------|-------------|----------|
| Descriptive metadata only | name/description/kind from frontmatter; run/check/weightKey/inputs/sync stay in TS | ✓ |
| Manifest fully authoritative | Frontmatter carries runtime fields; registry derives wiring | |
| Documentation-only | TS object is sole source-of-truth; registry never reads manifest | |

**User's choice:** Descriptive metadata only.
**Notes:** User added — "code should be turned into script files." Folded into the design: the implementation code MOVES into per-folder script files inside each `skills/library/<name>/` folder (true Anthropic Agent Skills shape), not left in `src/content/detector/signals/`.

### Q2 — How should the registry get manifest metadata into the bundle and bind it to the moved impl?

| Option | Description | Selected |
|--------|-------------|----------|
| ?raw import + parse at init | Each index.ts imports its SKILL.md via Vite ?raw, parses frontmatter at init | |
| Co-located TS manifest mirrors .md | Hand-written manifest.ts restates name/description | |
| Build-time codegen step | Prebuild scans skills/library/**/SKILL.md, generates a registry module | ✓ |

**User's choice:** Build-time codegen step.

### Q3a — What should the generated module contain?

| Option | Description | Selected |
|--------|-------------|----------|
| Full wiring: metadata + impl imports | Static imports of impl scripts + parsed metadata, assembled ordered array | ✓ |
| Metadata map only | id→metadata; registry keeps own hand-written impl imports | |

**User's choice:** Full wiring — one generated file is the single registration point.

### Q3b — Commit the generated file or gitignore it?

| Option | Description | Selected |
|--------|-------------|----------|
| Committed | Reviewable diffs, build order independent, CI stale-check | ✓ |
| Gitignored, built on prebuild | No stale risk, but not reviewable; every build must run codegen | |

**User's choice:** Committed.

### Q4 — How should codegen preserve exact signal/exclusion execution order?

| Option | Description | Selected |
|--------|-------------|----------|
| `order` field in frontmatter | Each SKILL.md declares numeric order; codegen sorts | |
| Explicit order list in codegen config | A separate ordered list names folders in pipeline order | ✓ |
| Filename/folder prefix | 01-…, 02-… so alphabetical = pipeline order | |

**User's choice:** Explicit order list in codegen config. (Test must assert it reproduces Phase 30 `CODE_SIGNAL_SKILLS` order — golden snapshot + signalBreakdown depend on it.)

---

## Frontmatter Schema

### Q5 — What fields should SKILL.md frontmatter carry?

| Option | Description | Selected |
|--------|-------------|----------|
| Standard + metadata.kind | name + description + metadata.kind (detector/signal/exclusion) for bucketing | ✓ |
| Pure Anthropic standard only | name + description only; bucket inferred from folder location | |
| Rich descriptive metadata | + category + authoring note | |

**User's choice:** Standard + metadata.kind. (Test asserts frontmatter kind matches TS skill's kind.)

### Q6 — Should a build-time validator enforce the frontmatter schema?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — codegen validates, fails on invalid | Required fields present, kind in allowed set, non-empty name/description | ✓ |
| No — trust authoring + tests | Rely on TS + parity/snapshot tests | |

**User's choice:** Yes — codegen validates and fails the build on violation.

---

## Claude's Discretion

- Exact folder location (`skills/library/` repo-root vs `src/skills/library/`) given Vite `root: 'src'` — must keep impl scripts in the static-import graph; SKILL.md must not need to ship in production bundle.
- How the selector registry (not currently a skill) becomes a library skill — full move vs thin manifest, preserving CLAUDE.md constraint #1.
- Which exclusion skill to spike first as the wave-1 tracer (sponsored is the simplest candidate).
- Codegen script location/name, frontmatter parser choice, generated module path, and CI stale-check wiring.
- `SkillRegistry` API changes to consume the generated full-wiring array while preserving Phase 30 getter + declarative-storage-merge semantics.

## Deferred Ideas

- LLM skill-authoring mechanism (generation/validation/write-to-storage) — future fast-follow.
- Manifest as fully-authoritative runtime source — rejected now, revisit once plumbing is proven.
- Richer frontmatter metadata — add when the LLM-authoring fast-follow has a consumer.
