# Skill Authoring Guide

How to add a new detection skill to the LinkedIn Blocker skill library.

---

## Overview

All skill definitions live in `src/skills/library/<name>/`.  Each folder contains:

- `SKILL.md` — build-time manifest (frontmatter only; never bundled)
- `<name>.skill.ts` — runtime TypeScript implementation

The codegen script (`scripts/generate-skill-registry.ts`) reads every folder listed in
`scripts/skill-order.json`, validates the SKILL.md frontmatter at build time (D-08), and
emits the committed generated module `src/content/generated-skill-registry.ts` (D-05).

### Folder name = type prefix + base name

The folder name (and the matching `SKILL.md` `name:` field and `<name>.skill.ts` filename)
carries a **type prefix** so the skill kind is visible in the file tree without opening
SKILL.md:

| Prefix          | Kind                       | Examples                                     |
|-----------------|----------------------------|----------------------------------------------|
| `detect-`       | `signal` and `detector`    | `detect-ai-vocab`, `detect-heuristic`        |
| `exclude-`      | `exclusion`                | `exclude-sponsored`, `exclude-company-page`  |
| `dom-selector-` | the selector registry skill| `dom-selector-registry`                      |

The **exported const name is NOT prefixed** — it keeps its plain camelCase form
(`aiVocabSkill`, `sponsoredExclusionSkill`). The codegen strips the type prefix from the
folder name before deriving the import variable, so folder `exclude-sponsored` binds to the
export `sponsoredExclusionSkill`. The runtime skill object's `id` is also unprefixed
(`'sponsored'`, `'ai-vocab'`) — order-pinning (D-06) keys on `id`, so prefixes never affect
ordering.

---

## Four-Step Authoring Workflow

### Step 1 — Create the skill folder

Use the prefixed folder name throughout (e.g. a new buzzword-style signal `detect-foo`):

```
src/skills/library/detect-foo/
  SKILL.md
  detect-foo.skill.ts
```

**SKILL.md** — frontmatter only; no runtime fields.  Three mandatory fields:

```yaml
---
name: detect-foo              # MUST equal the folder name (type-prefixed)
description: "One-sentence description of what the skill detects."
metadata:
  kind: signal                # signal | exclusion | detector
---
```

Rules for `SKILL.md`:
- `metadata.kind` must be one of `signal`, `exclusion`, or `detector`.
- Do NOT add runtime fields (`flavor`, `inputs`, `sync`, `id`, `weightKey`, etc.).
  Those live in the `.skill.ts` implementation, not in the manifest.
- SKILL.md is a build-time input only — it is never imported into the bundle (D-01).
  The codegen reads it via `fs.readFileSync`; Vite never sees it.

**`<name>.skill.ts`** — carries the runtime contract.  For a signal skill:

```typescript
import { checkMyFunction } from '../../../content/detector/signals/my-function';
import type { CodeSkill } from '../../../shared/skills/types';

export const fooSkill: CodeSkill = {   // export name is UNPREFIXED (no detect-)
  kind: 'signal',
  id: 'foo',                            // id is UNPREFIXED — order-pinning keys on it (D-06)
  flavor: 'code',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkMyFunction(postData.postText);
  },
};
```

Import depth from `src/skills/library/<name>/` to `src/` is **three levels** (`../../../`).
Common paths:
- Underlying function: `'../../../content/detector/signals/<function-file>'`
- Shared types: `'../../../shared/skills/types'`
- Detection config: `'../../../shared/detectionConfig'`
- Selector registry: `'../../../content/selector-registry'`

Weights MUST NOT appear in SKILL.md or the skill object literal.  They live in the
underlying function files or in `src/shared/detectionConfig.ts` (D-04).

### Step 2 — Add the skill name to `scripts/skill-order.json`

**APPEND to the END of the `signals` array only.**  Never insert between existing entries.

List the **prefixed folder name**.

```json
{
  "signals": [
    "detect-listicle-cta",
    "detect-buzzword",
    "detect-em-dash",
    "detect-ai-vocab",
    "detect-hook-story",
    "detect-motivational",
    "detect-impersonal",
    "detect-generic-comments",
    "detect-foo"          // <-- append here, at the end
  ],
  "exclusions": [ ... ],
  "detectors":  [ ... ]
}
```

**Why append-only?**  The `signalBreakdown` key insertion order in the heuristic test
golden snapshot (D-06) is pinned to array position.  Inserting a new skill between
existing entries changes all subsequent key positions and breaks `toStrictEqual` in
`heuristic.test.ts`.  If you must change order, update the golden snapshot intentionally
and document the decision.

Exclusion skills must also be appended to the `exclusions` array end for the same reason:
the order-pinning test in `generated-skill-registry.test.ts` pins both arrays (D-06).

### Step 3 — Regenerate the committed module

```bash
npm run generate-skill-registry
```

The script:
1. Reads `scripts/skill-order.json` for the canonical order.
2. Reads and validates each `src/skills/library/<name>/SKILL.md` (fails on invalid
   frontmatter — D-08).
3. Emits `src/content/generated-skill-registry.ts`.

Commit the regenerated module together with your new skill files.

### Step 4 — Run the tests

```bash
npm test
```

Checks that catch mistakes:
- **Order-pinning tests** (`generated-skill-registry.test.ts`): assert signal and exclusion
  array IDs match the Phase 30 canonical order (D-06).
- **Kind drift-guard tests** (`generated-skill-registry.test.ts`): assert every runtime
  skill object has the expected `kind` discriminant (D-07).
- **Golden-score snapshot** (`heuristic.test.ts`): asserts `signalBreakdown` key order and
  values byte-identically (D-06 landmine — reordering signals breaks this test).
- **Exclusion parity test** (`exclusions.test.ts`): asserts exclusion check results
  byte-identically.

---

## Reference Example

`src/skills/library/exclude-sponsored/` is the canonical tracer skill:

```
exclude-sponsored/
  SKILL.md                     (name: exclude-sponsored, kind: exclusion, no runtime fields)
  exclude-sponsored.skill.ts   (exports sponsoredExclusionSkill — kind, id: 'sponsored', check())
```

---

## Important Constraints

### Stale-check (D-05)

The committed generated module is stale-checked in CI:

```bash
npm run check-skill-registry   # regenerate + git diff --exit-code
```

The CI job fails if the committed `generated-skill-registry.ts` does not match a fresh
regeneration from the current SKILL.md sources.  Always regenerate and commit the module
before opening a PR.

### Codegen validates frontmatter at build time (D-08)

`npm run generate-skill-registry` exits non-zero if any SKILL.md in `skill-order.json` is
missing, has no valid frontmatter block, or has an invalid `metadata.kind`.  Fix the error
before committing.

### Selector-registry single-writer invariant (CLAUDE.md constraint #1)

`src/content/selector-registry.ts` is the ONLY module that writes selector strings to
`chrome.storage.local`.  The `src/skills/library/dom-selector-registry/` folder is a
thin re-export for convention completeness only — it is NOT wired into any skill array and
MUST NOT call `storageSet`.

### SKILL.md files are never bundled

Vite never imports `.md` files.  The codegen reads SKILL.md via `fs.readFileSync` at
build time.  Do not add any `import '...SKILL.md'` statement anywhere in TypeScript source.

### Detectors are not in skill arrays

`detect-heuristic` and `detect-llm` appear in `scripts/skill-order.json` `detectors` array
for metadata completeness only.  Detectors are NOT added to `GENERATED_SIGNAL_SKILLS` or
`GENERATED_EXCLUSION_SKILLS`.  They are instantiated directly in `src/content/index.ts`
and `scripts/eval.ts` via the barrel re-exports at `src/content/detector/heuristic.ts`
and `src/content/detector/llm.ts`.
