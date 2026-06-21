# Phase 31: Skill Library Alignment - Research

**Researched:** 2026-06-16
**Domain:** TypeScript build-time codegen + Anthropic Agent Skills folder convention + Chrome MV3 static bundling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `SKILL.md` frontmatter is the source-of-truth for DESCRIPTIVE metadata only (`name`, `description`, `metadata.kind`). Executable contract (`run()`/`check()`, `weightKey`, `inputs`, `sync`, `flavor`) stays in TypeScript. This is the lowest-risk path to zero-behavior-change.
- **D-02:** Implementation code MOVES into per-folder script files inside each `skills/library/<name>/` folder (true Anthropic Agent Skills shape). No skill definition remains outside `skills/library/`.
- **D-03:** Build-time codegen binds manifests to impls. A prebuild script scans `skills/library/**/SKILL.md`, parses + validates frontmatter, and emits a generated registry module. No `?raw` import, no hand-written co-located TS manifest mirror.
- **D-04:** The generated module carries full wiring — static imports of each folder's impl script AND its parsed metadata, assembled into a ready ordered skill array. One generated file is the single registration point. "Add a skill" = drop a `skills/library/<name>/` folder + rerun codegen.
- **D-05:** The generated module is committed to git. CI check fails if it is stale (regenerate-and-diff).
- **D-06:** Execution order is driven by an explicit ordered list in the codegen config. A test asserts generated signal-skill order equals Phase 30 `CODE_SIGNAL_SKILLS` order; exclusion order matches `CODE_EXCLUSION_SKILLS`. `signalBreakdown` key order and the golden-score snapshot both depend on this exact order.
- **D-07:** Frontmatter = Anthropic standard `name` + `description`, plus a `metadata:` block carrying `kind` (`detector` | `signal` | `exclusion`). Runtime fields (`flavor`, `inputs`, `sync`, `weightKey`) stay in TS. A test asserts frontmatter `kind` matches the TS skill's `kind`.
- **D-08:** Codegen validates the frontmatter schema and fails the build on violation — required fields present, `kind` in the allowed set, `name`/`description` non-empty.
- **D-09:** Zero behavior change. Phase 29 golden-score snapshot (`heuristic.test.ts`) must stay byte-identical. Exclusion parity must hold on representative fixture set.

### Claude's Discretion

- **Folder location** under the repo for `skills/library/` — repo-root `skills/library/` vs `src/skills/library/`. Constraint: impl scripts must be inside the TypeScript/Vite build graph and bundled via static import. `SKILL.md` files must not need to ship in the production bundle.
- **How the selector registry becomes a library skill** — full move vs thin manifest + wrapper, while preserving CLAUDE.md constraint #1 (only `SelectorRegistry` writes selector strings to storage).
- **Which exclusion skill to spike first** as the wave-1 tracer bullet (`sponsored` is simplest candidate).
- Precise codegen script location/name, frontmatter parser used, generated module name/path, stale-check CI wiring.
- Module layout details and the `SkillRegistry` API changes needed to consume the generated full-wiring array (must keep sync getters `getSignalSkills()`/`getExclusionSkills()` semantics and declarative-skill storage merge intact).

### Deferred Ideas (OUT OF SCOPE)

- LLM skill-authoring mechanism — generation/validation/write-to-storage (future fast-follow only).
- Manifest as fully-authoritative runtime source (frontmatter carrying `weightKey`/`inputs`/`sync`).
- Richer frontmatter metadata (categories, long authoring notes) beyond `name`, `description`, `kind`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SKILL-05 | Each skill is a self-contained `skills/library/<name>/` folder with a `SKILL.md` manifest (name/description/metadata frontmatter) alongside the bundled TypeScript implementation. `SkillRegistry` hydrates skill metadata from those bundled manifests at build time (static imports only; no runtime FS; MV3-CSP-safe). Zero behavior change. Tracer-bullet delivery: spike one exclusion skill end-to-end first. | Sections: Standard Stack (frontmatter parser), Architecture Patterns (folder layout, codegen script, generated module structure, SkillRegistry wiring), Pitfalls (ordering, MV3-CSP, SKILL.md not in bundle, selector single-writer) |
</phase_requirements>

---

## Summary

Phase 31 restructures the 14 existing skill modules (8 signal skills, 4 exclusion skills, 2 detector skills + the selector registry) into the Anthropic Agent Skills folder convention. Each skill becomes a self-contained `skills/library/<name>/` folder containing a `SKILL.md` manifest (descriptive frontmatter only) alongside its existing TypeScript implementation (moved verbatim). A build-time codegen script scans those manifests, validates their frontmatter, and emits one committed generated TypeScript module that carries both static import statements for every impl and the parsed metadata objects, assembling them into the ordered skill arrays that `SkillRegistry` currently builds by hand.

The key constraint is that this must be a pure refactor: the golden-score snapshot in `heuristic.test.ts` pins exact per-signal score values and `signalBreakdown` key order, and the exclusion parity tests pin which posts are excluded. Both must stay byte-identical after the migration. The only thing that changes structurally is where skill files live and how `skill-registry.ts` gets its static-import block — the runtime behavior of every skill is untouched.

The architectural risk points are: (1) the `skills/library/` folder must be inside the TypeScript/Vite build graph so impl scripts bundle via static import — this recommends `src/skills/library/` rather than repo-root; (2) the generated module's signal array order must match the Phase 30 `CODE_SIGNAL_SKILLS` order exactly, enforced by both the codegen config's ordered list and a test assertion; (3) `SKILL.md` files must not enter the production bundle (they are pure build-time inputs consumed by the codegen script via Node.js `fs`, never imported into the browser bundle); (4) the selector registry is not a skill but needs a thin `SKILL.md` + impl wrapper that preserves the single-writer invariant.

**Primary recommendation:** Place skills at `src/skills/library/`, use `js-yaml` (already a transitive dep via `@eslint/eslintrc`) for frontmatter parsing in the codegen script, name the codegen script `scripts/generate-skill-registry.ts`, emit the generated module to `src/content/generated-skill-registry.ts`, and pin the ordered skill list in `scripts/skill-order.json`. Spike `sponsored` as the wave-1 tracer.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Frontmatter parsing / validation | Build-time codegen (Node.js script) | — | `SKILL.md` files are never imported into the browser; only the codegen script reads them via `fs`. |
| Generated registry module (static imports + metadata) | Build artifact (emitted file) | — | Committed to git; consumed by `skill-registry.ts` at bundle time via standard TS import. |
| Skill execution (run/check) | Content script (browser) | — | Impl scripts move to `src/skills/library/<name>/` but are still bundled into `content.js` via static import — same tier as before. |
| `SkillRegistry` singleton (getSignalSkills / getExclusionSkills) | Content script (browser) | — | Only the static-import/ordered-array section is replaced; all getter + storage-merge logic stays. |
| Selector registry (SelectorRegistry + single-writer rule) | Content script (browser) | — | Constraint #1 is inviolable: only `SelectorRegistry` writes selector strings to storage. The library skill for the selector registry is a thin manifest + impl wrapper around existing `SelectorRegistry`. |
| Stale-check CI guard | CI / npm script | — | `npm run generate-skill-registry` then `git diff --exit-code` on the committed generated file. |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `js-yaml` | 4.2.0 [VERIFIED: npm registry] | Parse YAML frontmatter in codegen script | Already a transitive dep via `@eslint/eslintrc` — zero new install cost; well-established (>100M weekly downloads); YAML 1.2 compliant |
| `tsx` | 4.22.4 [VERIFIED: npm registry] | Run the codegen TypeScript script without compilation | Already a devDep in the project; used for all other scripts (eval, trace-summary) |
| `typescript` | 5.x [VERIFIED: npm registry] | Type-check the generated module and impl scripts | Already used throughout the project |
| `vite` | 5.x [VERIFIED: npm registry] | Bundle impl scripts via static import in generated module | Existing build pipeline; `root: 'src'` means all imports resolve from `src/` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gray-matter` | 4.0.3 [VERIFIED: npm registry] | Alternative frontmatter parser with better `---` fence handling | Only if `js-yaml` manual fencing proves fragile; gray-matter parses `---\n...\n---` blocks directly |
| `vitest` | 4.1.7 [VERIFIED: npm registry] | Assert generated array order and frontmatter kind drift | Already used for all tests in project |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `js-yaml` (transitive dep) | hand-rolled frontmatter parser | Hand-rolled is 15–20 lines but risks edge-case YAML syntax bugs; js-yaml is already in node_modules, so it costs nothing |
| `gray-matter` | `js-yaml` with manual `---` stripping | gray-matter is slightly simpler for frontmatter specifically but adds a net-new package (js-yaml is already present) |
| `tsx` for codegen | `ts-node` | tsx is already a devDep; ts-node would be a new install |

**Installation:** No new packages required. `js-yaml` is already available in `node_modules/` as a transitive dep via `@eslint/eslintrc`. The codegen script imports it as `import yaml from 'js-yaml'` (or `require`). Add `@types/js-yaml` as a devDep if TypeScript type errors occur.

**Version verification:**
```bash
npm view js-yaml version   # → 4.2.0 (confirmed 2026-06-16)
npm view tsx version        # → 4.22.4 (confirmed 2026-06-16)
npm view gray-matter version # → 4.0.3 (confirmed 2026-06-16)
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `js-yaml` | npm | ~12 yrs | >100M/wk (est.) | github.com/nodeca/js-yaml | [OK] | Approved — already transitive dep |
| `gray-matter` | npm | ~10 yrs | >40M/wk (est.) | github.com/jonschlinkert/gray-matter | [OK] | Approved (not recommended — js-yaml preferred) |
| `yaml` | npm | ~7 yrs | >50M/wk (est.) | github.com/eemeli/yaml | [OK] | Approved alternative, not needed |

[VERIFIED: npm registry via `npm view` 2026-06-16]

No postinstall scripts detected on any package. [VERIFIED: npm registry]

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
  BUILD TIME                                        RUNTIME (browser bundle)
  ─────────────────────────────────────────────     ─────────────────────────
  src/skills/library/sponsored/
    SKILL.md ─────────────────────────────────────────────────────────── (NOT bundled)
    sponsored.skill.ts ──────────────────────────────────┐
                                                         │ static import
  src/skills/library/buzzword/                           │
    SKILL.md ─────────────────────────────────────────── │ (NOT bundled)
    buzzword.skill.ts ───────────────────────────────────┤ static import
                                                         │
  ... (14 skill folders total) ...                       │
                                                         ▼
  scripts/generate-skill-registry.ts              src/content/generated-skill-registry.ts
    reads SKILL.md via fs (Node.js) ──────────►   (COMMITTED — static imports + metadata)
    parses frontmatter (js-yaml)                        │
    validates schema (D-08)                             │ import
    reads scripts/skill-order.json                      ▼
    emits generated-skill-registry.ts           src/content/skill-registry.ts
                                                   getSignalSkills() / getExclusionSkills()
                                                   storage merge (declarative PatternSkills)
                                                         │
                                               Vite bundles content.js
                                               (impl scripts + registry — SKILL.md excluded)
```

**Key data flow:** SKILL.md files are read at build-time by the codegen script via Node.js `fs`, never `import`ed. The generated module emits explicit `import` statements for the impl scripts. Vite picks up `generated-skill-registry.ts` as part of the `src/` tree and bundles the impl scripts transitively. SKILL.md files never enter the Vite module graph — they are invisible to the bundler.

### Recommended Project Structure

```
src/
├── skills/
│   └── library/
│       ├── sponsored/
│       │   ├── SKILL.md              ← frontmatter only (name/description/metadata.kind)
│       │   └── sponsored.skill.ts   ← existing ExclusionSkill impl (moved verbatim)
│       ├── company-page/
│       │   ├── SKILL.md
│       │   └── company-page.skill.ts
│       ├── non-english/
│       │   ├── SKILL.md
│       │   └── non-english.skill.ts
│       ├── open-to-work/
│       │   ├── SKILL.md
│       │   └── open-to-work.skill.ts
│       ├── listicle-cta/
│       │   ├── SKILL.md
│       │   └── listicle-cta.skill.ts
│       ├── buzzword/
│       │   ├── SKILL.md
│       │   └── buzzword.skill.ts
│       ├── em-dash/
│       │   ├── SKILL.md
│       │   └── em-dash.skill.ts
│       ├── ai-vocab/
│       │   ├── SKILL.md
│       │   └── ai-vocab.skill.ts
│       ├── hook-story/
│       │   ├── SKILL.md
│       │   └── hook-story.skill.ts
│       ├── motivational/
│       │   ├── SKILL.md
│       │   └── motivational.skill.ts
│       ├── impersonal/
│       │   ├── SKILL.md
│       │   └── impersonal.skill.ts
│       ├── generic-comments/
│       │   ├── SKILL.md
│       │   └── generic-comments.skill.ts
│       ├── heuristic/
│       │   ├── SKILL.md
│       │   └── heuristic.skill.ts   ← HeuristicDetector (class renamed or re-exported)
│       ├── llm/
│       │   ├── SKILL.md
│       │   └── llm.skill.ts         ← LLMDetector (class renamed or re-exported)
│       └── selector-registry/
│           ├── SKILL.md             ← manifest only (kind: excluded from normal arrays)
│           └── selector-registry.skill.ts  ← thin re-export / wrapper
├── content/
│   ├── generated-skill-registry.ts  ← COMMITTED generated file (replaces hand-wired import block)
│   ├── skill-registry.ts            ← unchanged except: imports from generated module
│   └── ...
scripts/
├── generate-skill-registry.ts       ← codegen script (Node.js / tsx)
├── skill-order.json                 ← explicit ordered list for codegen (D-06)
└── ...
```

**Why `src/skills/library/` not repo-root `skills/library/`:**

Vite's `root: 'src'` means that all modules in the static-import graph must resolve from within `src/`. If impl scripts lived at repo-root `skills/library/`, an import like `import { sponsoredExclusionSkill } from '../../skills/library/sponsored/sponsored.skill'` in the generated module would resolve to a path outside `root: 'src'`. While Vite can technically bundle files outside `root`, this conflicts with `tsconfig.json`'s `"include": ["src/**/*"]` — TypeScript would not type-check them. Placing skills under `src/skills/library/` keeps impl scripts fully inside both the Vite build graph and the TypeScript project. SKILL.md files are read by the codegen script via `fs` paths relative to repo root — their location does not matter to the bundler. [VERIFIED: vite.config.ts root setting + tsconfig.json include field — both read 2026-06-16]

### Pattern 1: SKILL.md Frontmatter Shape

**What:** Follows the Anthropic Agent Skills standard — `name`, `description`, plus a `metadata:` block. [CITED: ~/.claude/skills/graphify/SKILL.md — confirmed 2026-06-16]

**When to use:** Every skill folder. Runtime fields (`flavor`, `inputs`, `sync`, `weightKey`) must NOT appear in frontmatter (D-01 / D-07).

**Example (wave-1 tracer: sponsored):**
```yaml
---
name: sponsored-exclusion
description: "Excludes sponsored/promoted posts before any detection runs. Checks for the SPONSORED_MARKER selector resolved via SelectorRegistry."
metadata:
  kind: exclusion
---
```

**Allowed `kind` values** (from `src/shared/skills/types.ts`): `signal` | `exclusion` | `detector`

Note: `selector-registry` is not a `kind` in the existing type system. Its skill folder needs a `metadata.kind` value — recommend `exclusion` (closest match) or a new sentinel like `registry`. Since the selector registry does not participate in the normal skill arrays, the simplest path is to give it `kind: exclusion` but NOT include it in `CODE_EXCLUSION_SKILLS`. The codegen config's ordered list simply omits it. Its SKILL.md exists for the Anthropic Agent Skills convention completeness, not for the registry arrays.

### Pattern 2: Codegen Script Structure

**What:** A `tsx`-runnable TypeScript script at `scripts/generate-skill-registry.ts` that reads manifest files, validates frontmatter, and emits the generated module. [ASSUMED — pattern derived from project's existing tsx scripts; confirmed tsx is available]

**When to use:** As a prebuild step and on-demand for CI stale-check.

**Codegen script outline:**
```typescript
// scripts/generate-skill-registry.ts
// Run with: tsx scripts/generate-skill-registry.ts
// Reads: scripts/skill-order.json + src/skills/library/**/SKILL.md
// Writes: src/content/generated-skill-registry.ts

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

interface SkillOrder {
  signals: string[];      // folder names in pipeline step order
  exclusions: string[];   // folder names in priority order
  detectors: string[];    // folder names
}

interface SkillFrontmatter {
  name: string;
  description: string;
  metadata: { kind: 'signal' | 'exclusion' | 'detector' };
}

// 1. Read ordered list from config
const order: SkillOrder = JSON.parse(
  fs.readFileSync('scripts/skill-order.json', 'utf-8')
);

// 2. For each skill name in order, read + validate SKILL.md
// 3. Emit import statements + metadata objects
// 4. Assemble ordered arrays
// 5. Write generated-skill-registry.ts
```

**Generated module outline:**
```typescript
// src/content/generated-skill-registry.ts
// DO NOT EDIT — generated by scripts/generate-skill-registry.ts
// Regenerate: tsx scripts/generate-skill-registry.ts

import { sponsoredExclusionSkill } from '../skills/library/sponsored/sponsored.skill';
// ... all other imports in declared order ...

import type { SignalSkill, ExclusionSkill, DetectorSkill } from '../shared/skills/types';

export const GENERATED_SIGNAL_SKILLS: readonly SignalSkill[] = [
  // order matches CODE_SIGNAL_SKILLS from Phase 30:
  listicleCtaSkill,
  buzzwordSkill,
  emDashSkill,
  aiVocabSkill,
  hookStorySkill,
  motivationalSkill,
  impersonalSkill,
  genericCommentsSkill,
] as const;

export const GENERATED_EXCLUSION_SKILLS: readonly ExclusionSkill[] = [
  sponsoredExclusionSkill,
  companyPageExclusionSkill,
  nonEnglishExclusionSkill,
  openToWorkExclusionSkill,
] as const;

export const GENERATED_SKILL_METADATA = {
  'sponsored': { name: 'sponsored-exclusion', description: '...', kind: 'exclusion' as const },
  // ...
} as const;
```

### Pattern 3: SkillRegistry Consumption of Generated Module

**What:** Replace the hand-wired static-import block (lines 44–58 of `skill-registry.ts`) and `CODE_SIGNAL_SKILLS` / `CODE_EXCLUSION_SKILLS` arrays (lines 75–95) with imports from the generated module. All other logic (sync getters, storage merge, `addDeclarativeSkill`, `onChanged` listener) stays exactly as-is. [VERIFIED: skill-registry.ts read 2026-06-16]

**Before (hand-wired):**
```typescript
// Lines 44–58 — import block
import { listicleCtaSkill } from './detector/signals/listicle-cta.skill';
// ... etc ...
import { openToWorkExclusionSkill } from './exclusions/open-to-work.skill';

// Lines 75–95 — ordered arrays
const CODE_SIGNAL_SKILLS: SignalSkill[] = [ listicleCtaSkill, ... ];
const CODE_EXCLUSION_SKILLS: ExclusionSkill[] = [ sponsoredExclusionSkill, ... ];
```

**After (generated):**
```typescript
import { GENERATED_SIGNAL_SKILLS, GENERATED_EXCLUSION_SKILLS } from './generated-skill-registry';

const CODE_SIGNAL_SKILLS: SignalSkill[] = [...GENERATED_SIGNAL_SKILLS];
const CODE_EXCLUSION_SKILLS: ExclusionSkill[] = [...GENERATED_EXCLUSION_SKILLS];
```

The getters `getSignalSkills()` and `getExclusionSkills()` are structurally unchanged. Their behavior — code seeds + declarative storage merge, pre-load fallback — is preserved exactly. [VERIFIED: skill-registry.ts lines 185–200 read 2026-06-16]

### Pattern 4: Selector Registry as a Library Skill

**What:** The selector registry is architecturally distinct from skills — it is a DOM-interaction singleton, not a detection or exclusion skill. The minimum viable approach to satisfy "no skill definition remains outside `skills/library/`" (D-02) is a thin manifest + a re-export wrapper that does not alter the existing `SelectorRegistry` singleton at all. [ASSUMED — design choice; confirmed by CLAUDE.md constraint #1]

**Recommended shape:**
```
src/skills/library/selector-registry/
├── SKILL.md                          ← manifest for Anthropic Agent Skills convention
└── selector-registry.skill.ts       ← thin re-export or no-op wrapper
```

`SKILL.md` example:
```yaml
---
name: selector-registry
description: "Runtime source of truth for all LinkedIn DOM selector lookups. Seeded from selectors.ts defaults; hydrated via chrome.storage.local. Only SelectorRegistry may write selector strings to storage (CLAUDE.md constraint #1)."
metadata:
  kind: exclusion
---
```

`selector-registry.skill.ts` — minimal re-export that satisfies "implementation inside folder":
```typescript
// Thin re-export. SelectorRegistry is the canonical singleton at src/content/selector-registry.ts.
// CLAUDE.md constraint #1: ONLY SelectorRegistry writes selector strings to storage.
// This file exists solely to place the implementation inside skills/library/ per D-02.
export * from '../../content/selector-registry';
```

The codegen's `skill-order.json` does NOT include `selector-registry` in `signals`, `exclusions`, or `detectors` arrays. It is tracked separately (or not at all in the arrays). This preserves zero behavior change and the single-writer invariant. [ASSUMED — excludes selector-registry from skill arrays; confirmed by phase scope]

### Pattern 5: Codegen Wiring (npm script + stale-check CI)

**What:** Wire the codegen as a prebuild step and as a CI stale-check. [ASSUMED — pattern matches project's existing tsx script pattern]

**npm scripts additions to `package.json`:**
```json
{
  "scripts": {
    "generate-skill-registry": "tsx scripts/generate-skill-registry.ts",
    "prebuild": "npm run generate-skill-registry",
    "check-skill-registry": "npm run generate-skill-registry && git diff --exit-code src/content/generated-skill-registry.ts"
  }
}
```

`prebuild` is a npm lifecycle hook that runs automatically before `npm run build`. [VERIFIED: npm lifecycle docs — `pre<script>` runs before `<script>` automatically]

`check-skill-registry` runs in CI to fail if the committed generated file is stale.

**Note on `prebuild` vs Vite plugin:** Using `prebuild` npm lifecycle is simpler and more transparent than a Vite `buildStart` hook, because: (a) the generated file is committed to git (D-05), so the build does not NEED to regenerate it at Vite startup; (b) `prebuild` gives a clear error message on failure; (c) it runs in the same process as `npm run build` without Vite plugin API complexity. The committed generated file means the build works even without the prebuild hook — the hook just keeps it fresh.

### Anti-Patterns to Avoid

- **`import.meta.glob`:** Forbidden — MV3 CSP forbids dynamic module loading. The generated module must use explicit named `import` statements for each skill. [VERIFIED: skill-registry.ts comment lines 41–43 "D-07 — no dynamic import, no import.meta.glob"]
- **Runtime `fs` reads of SKILL.md:** Forbidden — browsers have no filesystem API, and Chrome extensions cannot read arbitrary files. SKILL.md is a codegen input only.
- **Dynamic `import()` in the generated module:** Forbidden — same MV3-CSP reason. All imports must be static top-level `import` statements.
- **Weight literals in SKILL.md or generated module:** Forbidden — weights live only in `detectionConfig.ts` (Phase 29 CFG-01 / D-04). Skills read weights via `weightKey` in their TS impl; they never redeclare the value.
- **Reordering `GENERATED_SIGNAL_SKILLS`:** Critical landmine — `signalBreakdown` key order and the golden-score snapshot pin this exact order. Codegen config `skill-order.json` is the single source of order truth.
- **Moving `resolve()` calls to SKILL.md:** Forbidden — selector strings must not exist outside `selectors.ts` and `SelectorRegistry` storage per CLAUDE.md constraint #1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frontmatter parsing | Custom `---` splitter + manual YAML | `js-yaml` (already in node_modules) | Edge cases: multi-line strings, colons in values, Unicode. Already proven dep. |
| Ordered array assertion | Manual snapshot string | Vitest `toStrictEqual` comparing array of `.id` strings | Simpler and self-documenting |
| Stale-check | Custom file comparison | `git diff --exit-code` on committed file | Git already knows exactly what changed |
| Build hook | Custom Vite plugin | npm `prebuild` lifecycle hook | Generated file is committed; build works without hook; npm lifecycle is simpler |

**Key insight:** The generated file being committed to git is the design decision that simplifies everything else. It means: no build-time failure if codegen hasn't run; stale-check is just a diff; the file is reviewable in PRs; the build pipeline has no new failure modes.

---

## Research Answers to Key Questions

### Q1: Folder Location — `src/skills/library/` (RECOMMENDED)

**Reasoning:**

Vite config has `root: 'src'`. This means Vite resolves all module imports relative to `src/`. The generated module lives at `src/content/generated-skill-registry.ts`. Its static imports reference impl scripts. If those scripts are at `src/skills/library/<name>/<name>.skill.ts`, the import path is `'../skills/library/sponsored/sponsored.skill'` — a relative path within `src/`. TypeScript's `"include": ["src/**/*"]` also covers them. [VERIFIED: vite.config.ts + tsconfig.json read 2026-06-16]

If skills were at repo-root `skills/library/`, the import paths would be `'../../skills/library/...'` — outside `root: 'src'`. Vite CAN bundle such files (it follows imports regardless of root), but tsconfig would not type-check them without a `paths` alias or `include` expansion. This is a friction point with no upside. [ASSUMED — Vite behavior with files outside root; conservative recommendation]

**SKILL.md files:** The codegen script reads them via `fs.readFileSync()` using paths computed from `process.cwd()`. Location inside or outside `src/` does not matter for SKILL.md — only for impl scripts. SKILL.md files are never `import`ed by any module that Vite touches.

### Q2: Codegen Mechanism

**Recommended:** `scripts/generate-skill-registry.ts` run via `tsx`. Wire as npm `prebuild` hook. The script:

1. Reads `scripts/skill-order.json` (the ordered list — D-06).
2. For each name in order, reads `src/skills/library/<name>/SKILL.md` via `fs.readFileSync`.
3. Strips the `---` fences, parses with `js-yaml`.
4. Validates frontmatter schema (D-08): `name` present and non-empty, `description` present and non-empty, `metadata.kind` in `['signal', 'exclusion', 'detector']`.
5. On any violation: `console.error(...)` + `process.exit(1)` (fails the build).
6. Emits `src/content/generated-skill-registry.ts` with a DO-NOT-EDIT header, explicit static `import` statements, metadata object, and ordered arrays.

**Stale-check CI:** Add `check-skill-registry` npm script: `tsx scripts/generate-skill-registry.ts && git diff --exit-code src/content/generated-skill-registry.ts`. [ASSUMED — CI integration pattern; project has no CI config visible]

### Q3: Frontmatter Parser

**Use `js-yaml` 4.2.0.** [VERIFIED: npm registry 2026-06-16; slopcheck [OK] 2026-06-16]

`js-yaml` is already in `node_modules` as a transitive dep via `@eslint/eslintrc`. It has no postinstall script. Adding `@types/js-yaml` as a devDep gives TypeScript types for the codegen script.

**Parsing pattern** (strip fences manually, then parse):
```typescript
import yaml from 'js-yaml';
const raw = fs.readFileSync(skillMdPath, 'utf-8');
const match = raw.match(/^---\n([\s\S]*?)\n---/);
if (!match) throw new Error(`No frontmatter in ${skillMdPath}`);
const frontmatter = yaml.load(match[1]) as SkillFrontmatter;
```

Alternatively, `gray-matter` parses the `---` fences automatically. Gray-matter also passes slopcheck [OK]. However, it would be a new direct dep; `js-yaml` is already present. Prefer `js-yaml` unless the manual fence-strip proves fragile.

### Q4: Ordering Preservation

**The golden-score landmine:** `heuristic.test.ts` lines 370–383 pin the exact `signalBreakdown` object for the AI-voice post: `{ 'listicle-cta': 8, 'hook-story': 20, motivational: 20, impersonal: 15 }`. The key insertion order in JavaScript objects is insertion order for string keys, which propagates from the order the signals are executed and their scores written into the breakdown. If signal skills run in a different order, the breakdown object key order changes, and `toStrictEqual` fails. [VERIFIED: heuristic.test.ts lines 370–393 read 2026-06-16]

**Required `GENERATED_SIGNAL_SKILLS` order** (must match Phase 30 `CODE_SIGNAL_SKILLS` exactly):
1. `listicle-cta`
2. `buzzword`
3. `em-dash`
4. `ai-vocab`
5. `hook-story`
6. `motivational`
7. `impersonal`
8. `generic-comments`

[VERIFIED: skill-registry.ts lines 75–84 read 2026-06-16]

**Required `GENERATED_EXCLUSION_SKILLS` order:**
1. `sponsored`
2. `company-page`
3. `non-english`
4. `open-to-work`

[VERIFIED: skill-registry.ts lines 90–95 read 2026-06-16]

**`skill-order.json` structure:**
```json
{
  "signals": ["listicle-cta", "buzzword", "em-dash", "ai-vocab", "hook-story", "motivational", "impersonal", "generic-comments"],
  "exclusions": ["sponsored", "company-page", "non-english", "open-to-work"],
  "detectors": ["heuristic", "llm"]
}
```

**Drift-guard test** (new test to add):
```typescript
it('GENERATED_SIGNAL_SKILLS order matches Phase 30 CODE_SIGNAL_SKILLS order', () => {
  const expectedOrder = [
    'listicle-cta', 'buzzword', 'em-dash', 'ai-vocab',
    'hook-story', 'motivational', 'impersonal', 'generic-comments',
  ];
  expect(GENERATED_SIGNAL_SKILLS.map(s => s.id)).toStrictEqual(expectedOrder);
});
```

### Q5: Metadata-Only Hydration — Marrying Parsed Metadata + Impl

**What goes in SKILL.md vs TS (D-01):**

| Field | Source |
|-------|--------|
| `name` | SKILL.md frontmatter |
| `description` | SKILL.md frontmatter |
| `metadata.kind` | SKILL.md frontmatter |
| `kind` (TS discriminant) | TS impl (`kind: 'signal' as const`) |
| `flavor` | TS impl |
| `id` | TS impl |
| `inputs` | TS impl |
| `sync` | TS impl |
| `weightKey` | TS impl |
| `run()` / `check()` | TS impl |

The generated module does NOT merge metadata into the skill objects at runtime. The skill objects (exported by each impl file) already have their full TS contract. The generated module exports the metadata separately in `GENERATED_SKILL_METADATA` for documentation/LLM use. `SkillRegistry` only consumes `GENERATED_SIGNAL_SKILLS` and `GENERATED_EXCLUSION_SKILLS` arrays (the skill objects). The metadata is emitted into the generated module for completeness (so the file is the single registration point) but not consumed by the runtime registry. This approach requires zero change to the `SkillRegistrySchema` or storage logic.

### Q6: Selector Registry as Library Skill

**Recommended: thin manifest + thin re-export wrapper (no behavior change).**

The `SelectorRegistry` singleton in `src/content/selector-registry.ts` is large (~450 lines) and complex. Moving it verbatim to `src/skills/library/selector-registry/selector-registry.skill.ts` would change no logic, but it changes the file path — meaning every file that imports from `../selector-registry` would need its import path updated. This includes `sponsored.skill.ts`, `company-page.skill.ts`, `non-english.skill.ts`, `open-to-work.skill.ts`, and `src/content/index.ts`.

**Lower-risk option:** Keep `src/content/selector-registry.ts` where it is, and create a thin re-export at `src/skills/library/selector-registry/selector-registry.skill.ts`:
```typescript
// Thin re-export — the canonical SelectorRegistry singleton remains at src/content/selector-registry.ts.
// This file exists solely to place a representation inside skills/library/ per D-02.
// CLAUDE.md constraint #1: ONLY SelectorRegistry (at src/content/selector-registry.ts) writes selector strings.
export { resolve, load, seedIfNeeded, updateCandidate, recordMiss } from '../../content/selector-registry';
```

This satisfies D-02 ("no skill definition remains outside `skills/library/`") while preserving all import paths across the codebase. The single-writer invariant is untouched — only the original file calls `storageSet({ selectorRegistry })`. [ASSUMED — re-export pattern preserves invariant; to be confirmed by planner]

### Q7: Zero-Behavior-Change Verification

**Three test layers:**

1. **Golden-score snapshot** (`src/content/detector/heuristic.test.ts` lines 249–393): Pins exact score + breakdown for 6 post fixtures. These tests run `HeuristicDetector.detect()` which calls `getSignalSkills()` which (after migration) returns skills from `GENERATED_SIGNAL_SKILLS`. If any skill is missing, reordered, or behaves differently, a test fails. [VERIFIED: heuristic.test.ts read 2026-06-16]

2. **Exclusion parity** (`src/content/exclusions/exclusions.test.ts`): Runs the exclusion runner loop with `getExclusionSkills()` and verifies specific posts are excluded/not-excluded on representative fixtures. After migration, `getExclusionSkills()` returns skills from `GENERATED_EXCLUSION_SKILLS`. [VERIFIED: exclusions.test.ts read 2026-06-16]

3. **Order drift-guard** (new test): Asserts `GENERATED_SIGNAL_SKILLS.map(s => s.id)` equals the expected array and `GENERATED_EXCLUSION_SKILLS.map(s => s.id)` equals the expected array. Catches a codegen bug where `skill-order.json` is edited incorrectly.

4. **Frontmatter kind drift-guard** (new test — D-07): For each skill in `GENERATED_SIGNAL_SKILLS`, asserts `skill.kind === 'signal'` (matches the frontmatter `metadata.kind`). For each in `GENERATED_EXCLUSION_SKILLS`, asserts `skill.kind === 'exclusion'`. The codegen script already validates this at build time (D-08), but the runtime test provides a second layer.

**Wave-1 tracer verification:** After wiring only `sponsored` end-to-end, run `exclusions.test.ts`. If the sponsored fixture test passes, the tracer path works.

---

## Common Pitfalls

### Pitfall 1: SKILL.md Files Entering the Production Bundle

**What goes wrong:** A developer adds `import skillMdContent from '../skills/library/sponsored/SKILL.md?raw'` or similar. Vite bundles the raw string into `content.js`. The production bundle grows unnecessarily and the `.md` file is visible in the extension package.

**Why it happens:** Vite supports `?raw` imports for arbitrary files. If a developer "reads" the SKILL.md at runtime, Vite bundles it.

**How to avoid:** The codegen script reads SKILL.md via Node.js `fs` (not via import). The generated module carries the parsed metadata as a TypeScript literal object, NOT the raw markdown. No `import` statement in any TypeScript file should reference a `.md` file.

**Warning signs:** `dist/` contains `.md` files, or `content.js` grows unexpectedly after the migration.

### Pitfall 2: Signal Array Order Mutation

**What goes wrong:** A developer edits `skill-order.json` to add a new signal, places it between existing signals (e.g., between `buzzword` and `em-dash`). The golden-score snapshot fails because `signalBreakdown` key order is now different.

**Why it happens:** JavaScript object key insertion order is deterministic (insertion order for string keys in V8), so the order of signal execution determines the order of keys in `signalBreakdown`.

**How to avoid:** New signals are always appended at the END of the `signals` array in `skill-order.json`. The order-drift test provides immediate feedback if this is violated.

**Warning signs:** The golden-score `signalBreakdown` test fails with correct values but wrong key order.

### Pitfall 3: `tsconfig.json` Not Including Skills Folder

**What goes wrong:** Skills are placed at `src/skills/library/` but `tsconfig.json` `include` only covers `["src/**/*", "vite.config.ts"]`. Actually `src/**/*` does cover `src/skills/**/*` — this is NOT a real risk. But if skills were placed outside `src/`, the tsconfig would miss them.

**Why it happens:** Misunderstanding of glob patterns.

**How to avoid:** Place skills at `src/skills/library/` where `src/**/*` already includes them. [VERIFIED: tsconfig.json read 2026-06-16]

### Pitfall 4: Import Path Drift After Skill File Move

**What goes wrong:** Impl scripts move from `src/content/detector/signals/buzzword.skill.ts` to `src/skills/library/buzzword/buzzword.skill.ts`. The impl file imports from relative paths like `'./buzzwords'` (the underlying signal function). After the move, `'./buzzwords'` no longer resolves — it now points to a non-existent path.

**Why it happens:** Signal skill impls import their underlying signal functions (e.g., `import { checkBuzzwords } from './buzzwords'`). Moving the impl file changes the relative path.

**How to avoid:** When moving each impl file, update its internal relative imports to point to the original signal function location. For example, `buzzword.skill.ts` becomes:
```typescript
import { checkBuzzwords } from '../../content/detector/signals/buzzwords';
```
The underlying signal function files (`buzzwords.ts`, `listicle.ts`, `cta.ts`, etc.) do NOT move — they are unchanged. Only the skill wrapper (`.skill.ts`) moves.

**Warning signs:** TypeScript type-check fails with "Cannot find module './buzzwords'".

### Pitfall 5: Codegen Emitting a File That Fails Type-Check

**What goes wrong:** The codegen script emits `generated-skill-registry.ts` with incorrect TypeScript (wrong import paths, wrong type annotations). The file is committed, but `npm run type-check` fails.

**Why it happens:** Codegen scripts that produce TypeScript source need to be careful about the generated code's types.

**How to avoid:** After codegen emits the file, immediately run `npm run type-check` as part of the `check-skill-registry` script. Alternatively, type-annotate the generated arrays explicitly: `export const GENERATED_SIGNAL_SKILLS: readonly SignalSkill[] = [...]`.

### Pitfall 6: Wave-1 Tracer Leaves Two Import Paths Active Simultaneously

**What goes wrong:** During wave 1 (spike only `sponsored`), `skill-registry.ts` might still import `sponsoredExclusionSkill` from the old path (`'./exclusions/sponsored.skill'`) AND from the generated module. This compiles but causes the skill to appear twice in `CODE_EXCLUSION_SKILLS`.

**Why it happens:** Incremental migration leaves stale imports.

**How to avoid:** The tracer strategy is: for wave 1, the generated module handles ONLY `sponsored`. `skill-registry.ts` switches its `CODE_EXCLUSION_SKILLS` to use the generated module's array (which has only `sponsored` initially), and removes the old direct imports for `sponsored`. The other three exclusion skills are temporarily still in `CODE_EXCLUSION_SKILLS` via direct imports until wave 2. OR: run the full migration all at once (all 14 skills in one wave). The tracer just proves the path; it does not require partial handover of the arrays.

**Simpler approach:** Spike the tracer with SKILL.md + impl file move for `sponsored` only, but keep the full `CODE_EXCLUSION_SKILLS` array unchanged for the tracer wave. Only after the tracer validates the full path (SKILL.md + codegen + generated module passes type-check + parity tests) do subsequent waves replace the arrays.

---

## Code Examples

### Sponsored SKILL.md (Wave-1 Tracer)

```yaml
---
name: sponsored-exclusion
description: "Excludes sponsored/promoted posts before any detection runs. Checks for the SPONSORED_MARKER selector resolved via SelectorRegistry. Must run first (priority 1) to short-circuit before other exclusion checks."
metadata:
  kind: exclusion
---
```

[ASSUMED — example frontmatter; shape verified against ~/.claude/skills/graphify/SKILL.md format]

### Generated Module Pattern (DO NOT EDIT Header)

```typescript
// src/content/generated-skill-registry.ts
// ============================================================
// DO NOT EDIT — generated by scripts/generate-skill-registry.ts
// Regenerate: npm run generate-skill-registry
// Stale-check: npm run check-skill-registry
// ============================================================

import type { SignalSkill, ExclusionSkill } from '../shared/skills/types';

import { listicleCtaSkill } from '../skills/library/listicle-cta/listicle-cta.skill';
import { buzzwordSkill } from '../skills/library/buzzword/buzzword.skill';
import { emDashSkill } from '../skills/library/em-dash/em-dash.skill';
import { aiVocabSkill } from '../skills/library/ai-vocab/ai-vocab.skill';
import { hookStorySkill } from '../skills/library/hook-story/hook-story.skill';
import { motivationalSkill } from '../skills/library/motivational/motivational.skill';
import { impersonalSkill } from '../skills/library/impersonal/impersonal.skill';
import { genericCommentsSkill } from '../skills/library/generic-comments/generic-comments.skill';

import { sponsoredExclusionSkill } from '../skills/library/sponsored/sponsored.skill';
import { companyPageExclusionSkill } from '../skills/library/company-page/company-page.skill';
import { nonEnglishExclusionSkill } from '../skills/library/non-english/non-english.skill';
import { openToWorkExclusionSkill } from '../skills/library/open-to-work/open-to-work.skill';

// Order MUST match CODE_SIGNAL_SKILLS from Phase 30 — golden-score snapshot depends on it (D-06)
export const GENERATED_SIGNAL_SKILLS: readonly SignalSkill[] = [
  listicleCtaSkill,
  buzzwordSkill,
  emDashSkill,
  aiVocabSkill,
  hookStorySkill,
  motivationalSkill,
  impersonalSkill,
  genericCommentsSkill,
];

// Order MUST match CODE_EXCLUSION_SKILLS from Phase 30 — exclusion parity depends on it (D-06)
export const GENERATED_EXCLUSION_SKILLS: readonly ExclusionSkill[] = [
  sponsoredExclusionSkill,
  companyPageExclusionSkill,
  nonEnglishExclusionSkill,
  openToWorkExclusionSkill,
];

// Descriptive metadata from SKILL.md manifests — for documentation and future LLM use.
// NOT consumed by the runtime registry — skill objects carry their own kind/id/etc.
export const GENERATED_SKILL_METADATA = {
  'listicle-cta': { name: 'listicle-cta-signal', description: '...', kind: 'signal' as const },
  // ... etc ...
} as const;
```

### Updated `skill-registry.ts` Import Section

```typescript
// Replace the hand-wired import block (old lines 44-95) with:
import {
  GENERATED_SIGNAL_SKILLS,
  GENERATED_EXCLUSION_SKILLS,
} from './generated-skill-registry';

const CODE_SIGNAL_SKILLS: SignalSkill[] = [...GENERATED_SIGNAL_SKILLS];
const CODE_EXCLUSION_SKILLS: ExclusionSkill[] = [...GENERATED_EXCLUSION_SKILLS];
// Everything else in skill-registry.ts is UNCHANGED.
```

### Moved Impl File — Updated Relative Imports

```typescript
// src/skills/library/buzzword/buzzword.skill.ts (moved from src/content/detector/signals/buzzword.skill.ts)
// ONLY change: relative import path updated to point back to original location
import { checkBuzzwords } from '../../../content/detector/signals/buzzwords';
import type { CodeSkill } from '../../../shared/skills/types';

export const buzzwordSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'buzzword',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkBuzzwords(postData.postText);
  },
};
```

### Frontmatter Validation Snippet (Codegen Script)

```typescript
function validateFrontmatter(fm: unknown, skillName: string): SkillFrontmatter {
  const f = fm as Record<string, unknown>;
  if (!f || typeof f !== 'object') throw new Error(`${skillName}: SKILL.md frontmatter is empty or not an object`);
  if (typeof f['name'] !== 'string' || !f['name'].trim()) throw new Error(`${skillName}: SKILL.md 'name' must be a non-empty string`);
  if (typeof f['description'] !== 'string' || !f['description'].trim()) throw new Error(`${skillName}: SKILL.md 'description' must be a non-empty string`);
  const meta = f['metadata'] as Record<string, unknown> | undefined;
  const kind = meta?.['kind'];
  if (!['signal', 'exclusion', 'detector'].includes(kind as string)) {
    throw new Error(`${skillName}: SKILL.md metadata.kind must be 'signal' | 'exclusion' | 'detector', got: ${kind}`);
  }
  return f as unknown as SkillFrontmatter;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-wired `import` block in skill-registry.ts | Committed generated module (this phase) | Phase 31 | "Add a skill" = drop a folder + rerun codegen instead of editing registry |
| Skill impls scattered in `src/content/detector/signals/` + `src/content/exclusions/` | Self-contained `src/skills/library/<name>/` folders | Phase 31 | Each skill is independently navigable; aligns with Anthropic Agent Skills convention |
| No manifest metadata | `SKILL.md` per skill with `name`/`description`/`kind` | Phase 31 | Clean seam for future LLM skill authoring (deferred) |

**Deprecated/outdated:**
- Direct static imports in `skill-registry.ts` for individual skill modules: replaced by import from generated module.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Placing skills at `src/skills/library/` keeps impl scripts inside the Vite build graph given `root: 'src'` | Folder Location (Q1) | LOW — Vite actually follows imports regardless of root; but tsconfig include would miss skills outside src/. Recommendation remains correct. |
| A2 | Thin re-export at `src/skills/library/selector-registry/selector-registry.skill.ts` satisfies D-02 "no skill definition remains outside skills/library/" | Q6 / Selector Pattern | MEDIUM — user may want the actual SelectorRegistry code to move. If so, all callers of `src/content/selector-registry.ts` need their import paths updated — add to planner scope. |
| A3 | `prebuild` npm lifecycle hook is sufficient for codegen wiring; no Vite plugin needed | Codegen Wiring Pattern | LOW — the committed generated file means the Vite build works without the hook; the hook is just for freshness. |
| A4 | The selector-registry skill folder uses `kind: exclusion` (closest match) in its SKILL.md and is omitted from all skill arrays | Pattern 4 | LOW — this is cosmetic since the folder is not wired into any array; kind value does not affect runtime. |
| A5 | Wave-1 tracer strategy is to prove the full path without switching the arrays — test parity on the tracer before committing to full migration | Pitfall 6 | LOW — alternative is full migration in one wave; either works given good tests. |
| A6 | `@types/js-yaml` is needed as a devDep for TypeScript type-checking of the codegen script | Standard Stack | LOW — if the codegen script uses `import yaml from 'js-yaml'` with `isolatedModules: true`, TypeScript needs types. Without `@types/js-yaml`, a `// @ts-ignore` or `declare module` workaround is needed. Adding `@types/js-yaml` is the clean path. |

---

## Open Questions

1. **Should the `selector-registry` skill folder MOVE the actual `SelectorRegistry` code, or use a thin re-export?**
   - What we know: Moving the code would update D-02 fully but requires updating 4+ import sites. Thin re-export satisfies the spirit of D-02 with zero import changes.
   - What's unclear: Whether the user considers a re-export as "the implementation inside the folder."
   - Recommendation: Start with thin re-export (lower risk); note in skill-authoring doc that the re-export is intentional.

2. **Should `detectors` (HeuristicDetector, LLMDetector) be included in `GENERATED_DETECTOR_SKILLS` in the generated module?**
   - What we know: Phase 30 `SkillRegistry` does NOT store detectors in a code-seed array — they are instantiated in `src/content/index.ts`. The generated module currently only exports `GENERATED_SIGNAL_SKILLS` and `GENERATED_EXCLUSION_SKILLS`.
   - What's unclear: Whether the user wants `HeuristicDetector` and `LLMDetector` to also appear in a generated detector array.
   - Recommendation: Emit `GENERATED_DETECTOR_SKILLS` for completeness (the `skill-order.json` has `detectors: ["heuristic", "llm"]`), but `skill-registry.ts` does not consume it — detectors are instantiated separately in `index.ts`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Codegen script execution | ✓ | v26.1.0 | — |
| `tsx` (devDep) | Running `scripts/generate-skill-registry.ts` | ✓ | 4.22.4 | `ts-node` (not installed) |
| `js-yaml` (transitive dep) | Frontmatter parsing in codegen | ✓ | 4.2.0 | Hand-rolled parser (viable but not recommended) |
| `@types/js-yaml` | TypeScript types for codegen script | ✗ | — | Add as devDep |
| `vitest` | Order drift-guard tests | ✓ | 4.1.7 | — |
| `git` | Stale-check (`git diff --exit-code`) | ✓ | (system) | — |

**Missing dependencies with no fallback:** None — all are available or trivially installable.

**Missing dependencies with fallback:**
- `@types/js-yaml`: Not installed as a direct dep. Need to add as devDep or use `// @ts-ignore` in codegen script.

---

## Validation Architecture

> `nyquist_validation` is explicitly `false` in `.planning/config.json`. Section omitted.

---

## Security Domain

This phase is a pure code reorganization — no new network calls, no new storage keys, no new DOM access, no new user inputs. The existing ASVS posture is unchanged. MV3 CSP is enforced by the design constraint that all imports are static (no `import()`, no `eval`). No security-domain research required for this phase.

---

## Sources

### Primary (HIGH confidence)
- `src/content/skill-registry.ts` — Phase 30 SkillRegistry: static-import block (L44-58), `CODE_SIGNAL_SKILLS` order (L75-84), `CODE_EXCLUSION_SKILLS` order (L90-95), sync getters (L185-200). Read 2026-06-16.
- `src/shared/skills/types.ts` — All skill type contracts and `kind` discriminant allowed values. Read 2026-06-16.
- `vite.config.ts` — `root: 'src'`, build pipeline. Read 2026-06-16.
- `tsconfig.json` — `include: ["src/**/*", "vite.config.ts"]`. Read 2026-06-16.
- `src/content/detector/heuristic.test.ts` — Golden-score snapshot (lines 249-393), pinned `signalBreakdown` key order. Read 2026-06-16.
- `src/content/exclusions/exclusions.test.ts` — Exclusion parity test runner. Read 2026-06-16.
- `src/content/exclusions/sponsored.skill.ts` — Wave-1 tracer candidate implementation. Read 2026-06-16.
- `src/content/detector/signals/buzzword.skill.ts`, `listicle-cta.skill.ts`, `generic-comments.skill.ts` — Impl file patterns and internal import paths. Read 2026-06-16.
- `~/.claude/skills/graphify/SKILL.md` — Concrete Anthropic Agent Skills frontmatter shape. Read 2026-06-16.
- `package.json` — Existing deps; confirmed `tsx` is devDep; `js-yaml` and `gray-matter` are NOT in git HEAD deps. Read 2026-06-16.

### Secondary (MEDIUM confidence)
- `npm view js-yaml version time.modified` — 4.2.0, modified 2026-06-04. Confirmed via npm registry 2026-06-16.
- `npm view gray-matter version time.modified` — 4.0.3, modified 2023-07-12. Confirmed via npm registry 2026-06-16.
- `npm view tsx version` — 4.22.4. Confirmed via npm registry 2026-06-16.
- `node_modules/.package-lock.json` — Confirmed `js-yaml` is a transitive dep via `@eslint/eslintrc`. Read 2026-06-16.
- slopcheck 0.6.1 — `gray-matter`, `js-yaml`, `yaml` all rated [OK]. Run 2026-06-16.
- No postinstall scripts on any of the three packages. Verified 2026-06-16.

### Tertiary (LOW confidence)
- Graphify knowledge graph: stale by 406 hours (351 commits behind). Not used — all findings from direct source inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages verified via npm registry and confirmed present in node_modules.
- Architecture: HIGH — patterns derived directly from reading the existing Phase 30 code.
- Pitfalls: HIGH (ordering, import paths, SKILL.md bundling) / MEDIUM (selector re-export pattern).
- Codegen specifics: MEDIUM — script structure is assumed from project patterns; exact implementation is for the planner to specify.

**Research date:** 2026-06-16
**Valid until:** 2026-09-16 (stable stack — vite/ts/vitest; no fast-moving deps introduced)
