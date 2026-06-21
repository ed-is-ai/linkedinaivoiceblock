# Phase 32: Tool Abstraction Layer - Research

**Researched:** 2026-06-16
**Domain:** TypeScript extension architecture — Tool contract, codegen extension, background refactor
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Skill-vs-tool discriminator is the I/O boundary. A skill is host-agnostic, pure
  data→result (no network, no `chrome.*`, no runtime DOM query). A tool performs host I/O
  (network, `chrome.storage`, DOM read/write) and/or is non-deterministic.
- **D-02:** Composite detectors (`detect-llm`, `detect-generic-comments`) are composites whose
  I/O portion IS a tool and scoring IS a skill. This phase DOCUMENTS the seam, does NOT
  refactor the detector pipeline.
- **D-03:** Build one tool end-to-end (`dom-selector-rederive`) and reclassify one existing
  skill (`dom-selector-registry` → `kind: tool`, CR-01). For composite detectors: audit
  DOCUMENTS skill/tool seam, records decomposition as follow-up.
- **D-04:** Tools are first-class with a runtime `ToolRegistry` (mirroring `SkillRegistry`).
  Background calls `toolRegistry.get('dom-selector-rederive').execute(input)`.
- **D-05:** `ToolRegistry` lives in `src/shared/`. Mirrors SkillRegistry codegen pattern:
  codegen scans entries, emits committed `generated-tool-registry.ts` (static imports only,
  MV3-CSP-safe). Code-seeded only — no `chrome.storage` hydration this phase.
- **D-06:** `execute({ target, domSkeleton })` encapsulates the LLM call only. Rate-limit
  machinery (`checkRateLimit` / `acquireRateLimitLatch` / `releaseRateLimitLatch`), pre-latch
  API-key check, and the `REDERIVE_SELECTOR` handler STAY in `background/index.ts`.
- **D-07:** Trace recording is hoisted to `background/index.ts`. Tool returns
  `{ candidates, usage }`. Background records the success trace from returned `usage`.
- **D-08:** `LLMRederiver` (`src/content/detector/rederiver.ts`) stays in place. The
  duplicated `RederiveCandidate` type (defined in both `rederiver.ts` L17 and
  `background/index.ts` L148) is deduped — both import from the new tool.

### Claude's Discretion

- Exact `Tool<I, O>` interface placement within `src/shared/skills/types.ts` (or sibling
  `tools` types module) and whether `Tool` joins/abstains from the `AnySkill` union
  (likely NOT in `AnySkill` — intentionally distinct).
- `tools` bucket shape in `scripts/skill-order.json`, codegen extension to validate
  `metadata.kind: tool` and emit the generated tool registry, the generated module's
  name/path under `src/shared/`, and stale-check wiring (`check-skill-registry` extended
  or a sibling `check-tool-registry`).
- Exact folder name for the rederive tool (`dom-selector-rederive` per SC#3) and the
  prefix convention update in `AUTHORING.md` (a `tool` row alongside `detect-`/`exclude-`/
  `dom-selector-`).
- Precise `ToolRegistry` API surface (`get(name)`, registration/seed), so long as the
  consumer call site reads `toolRegistry.get('dom-selector-rederive').execute(input)`.
- Whether the `kind` discriminant set extension (`'tool'`) in `types.ts` is shared by
  the codegen validator and the kind-drift test (it must be).

### Deferred Ideas (OUT OF SCOPE)

- Decompose composite detectors (`detect-llm`, `detect-generic-comments`) — documented
  as follow-up only, not implemented.
- Rate-limit policy as a tool/policy object.
- Runtime/storage-hydration of LLM-authored tools (`ToolRegistry` code-seeded only).

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOOL-01 | `Tool<I, O>` contract distinct from host-agnostic skills; host I/O permitted; `skills/library/` tools folder convention, SKILL.md `metadata.kind: tool`. | §Standard Stack — `Tool<I, O>` placement in `src/shared/skills/types.ts`; §Architecture Patterns — ToolRegistry codegen mirror. |
| TOOL-02 | Migrate `rederiveSelector` + helpers as `dom-selector-rederive`; fix `dom-selector-registry` kind mislabel; audit + reclassify skills that are really tools; zero behavior change. | §rederiveSelector Body — exact signature, return shape, trace-recording seam; §Migration Seam — what moves vs stays; §Zero-Behavior-Change Guards. |

</phase_requirements>

---

## Summary

Phase 32 is a **codebase structural refactor with zero behavior change**. All decisions are
locked in CONTEXT.md. The implementation divides into five concrete work streams: (1) define
`Tool<I, O>` in `src/shared/`; (2) extend the existing `generate-skill-registry.ts` codegen
to also emit a `generated-tool-registry.ts`; (3) create `ToolRegistry` in `src/shared/`;
(4) migrate `rederiveSelector` + its companions into the first tool folder
`src/skills/library/dom-selector-rederive/`; and (5) fix the `dom-selector-registry` kind
mislabel and extend `AUTHORING.md`.

The codegen machinery (SkillRegistry) is already fully proven and committed. ToolRegistry is
a structural mirror — same `skill-order.json` shape (new `tools` bucket), same codegen
script (extended, not replaced), same stale-check pattern. The one substantive complexity is
the `rederiveSelector` migration: the function's body moves verbatim into `execute()`, but
`recordTrace` must stay in background (layering constraint D-07), so `execute()` returns
`{ candidates, usage }` instead of returning after writing the trace itself.

The `ratelimit.test.ts` test suite imports `background/index.ts` directly and tests the
REDERIVE_SELECTOR handler. After the migration the handler's body shrinks (direct call
replaced by `toolRegistry.get(...).execute(...)`) but the externally-observable
`sendResponse` values stay byte-identical — the tests pass without modification.

**Primary recommendation:** Extend `generate-skill-registry.ts` in place (add a `tools`
bucket to `SkillOrder`, a second output path `src/shared/generated-tool-registry.ts`, and
a sibling `check-tool-registry` npm script). Do not create a separate codegen script — the
logic is identical and a single script is easier to audit.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| `Tool<I, O>` contract definition | `src/shared/` | — | Host-neutral types module; consumed by both background and content |
| `ToolRegistry` (runtime lookup) | `src/shared/` | — | Must be importable by service worker; matches D-05 |
| `dom-selector-rederive` execute() | `src/skills/library/` | — | Tool implementation is a library skill folder |
| Rate-limit machinery | Background (service worker) | — | Reads/writes `chrome.storage.local` per D-06; stateless SW constraint |
| `REDERIVE_SELECTOR` handler | Background (service worker) | — | Host-side orchestration; calls ToolRegistry.get().execute() per D-04 |
| Trace recording | Background (service worker) | — | `recordTrace` is a background module; D-07 forbids importing it from `src/shared/` |
| `LLMRederiver` (content relay) | Content script | — | Stays in place per D-08; only sends the message |
| Codegen (`generate-skill-registry.ts`) | `scripts/` | — | Build-time Node.js script; extended in place |
| `generated-tool-registry.ts` | `src/shared/` | — | Committed generated module; static imports only |
| `dom-selector-registry` kind fix | `src/skills/library/` | — | SKILL.md one-line change: `exclusion` → `tool` |

---

## Standard Stack

No new dependencies. All work uses existing project tooling.

| Library | Version (live) | Purpose in Phase 32 |
|---------|---------------|---------------------|
| `js-yaml` | 4.2.0 (in `package.json` deps) | SKILL.md frontmatter parse — already used by `generate-skill-registry.ts` |
| `tsx` | ^4.0.0 (devDep) | Runs codegen script at prebuild |
| `vitest` | ^4.1.7 (devDep) | Test runner for new tool registry tests |

[VERIFIED: codebase `package.json`]

### Package Legitimacy Audit

No external packages are added in this phase. The Tool abstraction reuses the existing
`js-yaml` (already installed, already validated by Phase 31). **No new npm installs.**

---

## SkillRegistry Codegen Machinery (Mirror Target for ToolRegistry)

### How it works today (fully verified from source)

**Config:** `scripts/skill-order.json` [VERIFIED: codebase read]

```json
{
  "signals":    ["detect-listicle-cta", "detect-buzzword", ...],
  "exclusions": ["exclude-sponsored", "exclude-company-page", ...],
  "detectors":  ["detect-heuristic", "detect-llm"]
}
```

**Script:** `scripts/generate-skill-registry.ts` [VERIFIED: codebase read, full file]

Key behaviors:
1. Reads `scripts/skill-order.json` into `SkillOrder` typed object.
2. For each folder name in each array, reads `src/skills/library/<folder>/SKILL.md`.
3. Normalizes CRLF (`raw.replace(/\r\n/g, '\n')`) — important on Windows checkouts.
4. Parses YAML frontmatter between `---` delimiters using `js-yaml`.
5. `validateFrontmatter()` — exits non-zero if `name`, `description`, or
   `metadata.kind` fails type check. Allowed kind values: `'signal' | 'exclusion' | 'detector'`.
6. Missing folders: logs `INFO: Skipping` to stderr and returns `null` (skip-and-continue).
7. Emits `src/content/generated-skill-registry.ts` via `fs.writeFileSync`.

**Import variable name derivation** (function `importVarName`): strips type prefix
(`detect-`, `exclude-`, `dom-selector-`) with regex `folder.replace(/^(detect|exclude|dom-selector)-/, '')`,
then camelCases, appends `ExclusionSkill` suffix for exclusions and `Skill` for others.
Example: `detect-listicle-cta` → strip prefix → `listicle-cta` → camelCase → `listicleCta`
→ append `Skill` → `listicleCtaSkill`.

**Import path derivation** (function `importPath`):
`'../skills/library/${folder}/${folder}.skill'`
(relative from `src/content/` — the generated file's location)

**Generated module location:** `src/content/generated-skill-registry.ts`

**Generated module structure:** [VERIFIED: codebase read]
- DO-NOT-EDIT header with regenerate and stale-check commands
- `import type { SignalSkill, ExclusionSkill } from '../shared/skills/types'`
- Static imports for all signal skills (in order)
- Static imports for all exclusion skills (in order)
- `export const GENERATED_SIGNAL_SKILLS: readonly SignalSkill[] = [...]`
- `export const GENERATED_EXCLUSION_SKILLS: readonly ExclusionSkill[] = [...]`
- `export const GENERATED_DETECTOR_SKILLS = {...} as const` (metadata only — detectors are
  NOT in arrays; instantiated directly in `src/content/index.ts` and `scripts/eval.ts`)
- `export const GENERATED_SKILL_METADATA = {...} as const` (all skills, descriptive)

**Consumer:** `src/content/skill-registry.ts` imports
`{ GENERATED_SIGNAL_SKILLS, GENERATED_EXCLUSION_SKILLS }` from
`'./generated-skill-registry'` and spreads into `CODE_SIGNAL_SKILLS` /
`CODE_EXCLUSION_SKILLS` constants. [VERIFIED: codebase read]

**npm scripts:** [VERIFIED: `package.json`]
```json
"generate-skill-registry": "tsx scripts/generate-skill-registry.ts",
"prebuild":                 "npm run generate-skill-registry",
"check-skill-registry":    "npm run generate-skill-registry && git diff --exit-code src/content/generated-skill-registry.ts"
```

**CI integration:** `.github/workflows/ci.yml` — step "Stale-check generated skill registry
(D-05)" runs `npm run check-skill-registry` before type-check and tests. [VERIFIED: codebase read]

**Tests:** `src/content/generated-skill-registry.test.ts` — order-pinning (D-06) and
kind-drift-guard (D-07) tests. Uses `toStrictEqual` on `.map(s => s.id)` arrays. [VERIFIED: codebase read]

### How ToolRegistry codegen will mirror this

The planner has two structural choices (Claude's Discretion):

**Option A — Extend `generate-skill-registry.ts` in place:**
- Add `tools: string[]` to `SkillOrder` interface and `skill-order.json`.
- Add a `tools` parse/validate branch (kind must be `'tool'`).
- Emit a second output file: `src/shared/generated-tool-registry.ts`.
- Add `import type { Tool } from './tools/types'` to the generated header.
- Generated tool import path relative from `src/shared/`: `'../skills/library/${folder}/${folder}.tool'`
  (using `.tool` extension by analogy with `.skill`).
- Add `check-tool-registry` npm script:
  `npm run generate-skill-registry && git diff --exit-code src/shared/generated-tool-registry.ts`
- **Advantage:** Single script to maintain; `validateFrontmatter` extended once for `'tool'`.

**Option B — Sibling script `scripts/generate-tool-registry.ts`:**
- Separate script, separate `tool-order.json` config.
- **Advantage:** Complete isolation; no coupling to skill codegen.
- **Disadvantage:** Duplicated YAML-parse and emit logic; two scripts to update when
  the frontmatter contract changes.

**Recommendation (Claude's Discretion):** Option A. The logic is identical; extending the
existing script avoids duplication and the project has precedent for a single multi-output
prebuild script. The `SkillOrder` type rename to `RegistryOrder` (or just adding `tools?:
string[]`) is a one-line TypeScript change.

### Generated tool registry location

CONTEXT.md D-05: ToolRegistry lives in `src/shared/`. Therefore the generated file is
`src/shared/generated-tool-registry.ts` (not `src/content/` — tools are consumed by
background, not the content script directly for this phase).

**Import path from `src/shared/generated-tool-registry.ts` to tool implementations:**
`'../skills/library/${folder}/${folder}.tool'`
(up one from `src/shared/` to `src/`, then down to `skills/library/<folder>/`)

---

## rederiveSelector Body — Exact Migration Anatomy

All line numbers verified against live `src/background/index.ts`:

### What MOVES into `dom-selector-rederive/dom-selector-rederive.tool.ts`

| Item | Live location | Disposition |
|------|--------------|-------------|
| `REDERIVE_SYSTEM_PROMPT` (string const) | L114–141 | Move to tool file |
| `interface RederiveCandidate` | L148–151 | Move to tool file; becomes the exported type |
| `interface RederiveModelOutput` | L152–154 | Move to tool file (private) |
| `function isRederiveModelOutput` | L161–172 | Move to tool file (private) |
| `rederiveSelector` body | L258–335 | Becomes `execute()` body — see seam below |

### What STAYS in `src/background/index.ts`

| Item | Live location | Reason |
|------|--------------|--------|
| `REDERIVE_COOLOFF_MS` constant | L144 | Rate-limit policy — stays in orchestration |
| `REDERIVE_DAILY_CAP` constant | L146 | Rate-limit policy — stays in orchestration |
| `function checkRateLimit` | L180–222 | Host I/O (`chrome.storage.local.get`) — host-side orchestration |
| `function acquireRateLimitLatch` | L234–243 | Host I/O (`chrome.storage.local.get/set`) |
| `function releaseRateLimitLatch` | L247–249 | Host I/O (`chrome.storage.local.set`) |
| `REDERIVE_SELECTOR` handler (L362–412) | L362–412 | Host-side orchestration; calls ToolRegistry |
| `recordTrace(...)` calls within handler | L374–383, L398–406 | `recordTrace` is a background module |
| `recordTrace(...)` in rederiveSelector success path | L319–325 | HOISTED to handler (D-07 — see below) |

### The trace-recording seam (D-07) — critical to get right

The current `rederiveSelector` (L319–325) calls `recordTrace` on the SUCCESS path before
returning `{ candidates }`. Under D-07, `execute()` cannot call `recordTrace` (layering:
tool lives in `src/shared/`, `recordTrace` lives in background). The solution:

**Before (in `rederiveSelector` at L319–325):**
```typescript
recordTrace({
  source: 'rederiver',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: REDERIVE_SYSTEM_PROMPT,
  userPrompt: userContent,
  usage: data.usage,
});
return { candidates: parsed.candidates };
```

**After — `execute()` returns `{ candidates, usage }`:**
```typescript
// Inside dom-selector-rederive execute():
return { candidates: parsed.candidates, usage: data.usage };  // usage was already read

// In background/index.ts REDERIVE_SELECTOR handler (at the call site after await):
const { candidates, usage } = await tool.execute({ target, domSkeleton });
recordTrace({                         // success trace — same data, same place in code
  source: 'rederiver',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: REDERIVE_SYSTEM_PROMPT,
  userPrompt: `Target: ${message.target}\n\nDOM skeleton:\n${message.domSkeleton}`,
  usage,
});
sendResponse({ result: candidates });
```

`data.usage` is already read from the JSON response body at L304–308 in
`rederiveSelector` — it is typed as `AnthropicUsage | undefined`. The return shape change
from `{ candidates: RederiveCandidate[] }` to `{ candidates: RederiveCandidate[]; usage:
AnthropicUsage | undefined }` is the only signature change.

### `rederiveSelector` function signature vs `execute()` input type

**Current signature:**
```typescript
async function rederiveSelector(
  target: string,
  domSkeleton: string,
): Promise<{ candidates: RederiveCandidate[] }>
```

**New `execute()` signature:**
```typescript
execute(input: { target: string; domSkeleton: string }): Promise<{ candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }>
```

The destructuring `const { target, domSkeleton } = input` inside `execute()` is the only
structural change to the function body. The HTTP fetch at L274–296, the retry loop L267–332,
the `isRederiveModelOutput` validation, and the two-attempt parse are all relocated verbatim.

### `AnthropicUsage` type availability

`AnthropicUsage` is currently imported in `background/index.ts` from
`'../shared/classifier'`. The tool in `src/skills/library/dom-selector-rederive/` needs
this type too. It should be re-exported from `src/shared/classifier.ts` (already accessible)
and imported by the tool: `import type { AnthropicUsage } from '../../../shared/classifier'`.

Verify the current export: [ASSUMED — not verified in this session whether `AnthropicUsage`
is currently exported from `src/shared/classifier.ts`; the background file imports it from there].

### REDERIVE_SELECTOR handler rewire — exact diff

Current handler body at L362–412 calls `rederiveSelector(...)` directly:
```typescript
const { candidates } = await rederiveSelector(
  message.target as string,
  message.domSkeleton as string,
);
sendResponse({ result: candidates });
```

After migration (the only change inside the try block):
```typescript
const tool = toolRegistry.get('dom-selector-rederive');
const { candidates, usage } = await tool.execute({
  target: message.target as string,
  domSkeleton: message.domSkeleton as string,
});
recordTrace({    // success trace hoisted here (D-07)
  source: 'rederiver',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: REDERIVE_SYSTEM_PROMPT,
  userPrompt: `Target: ${message.target as string}\n\nDOM skeleton:\n${message.domSkeleton as string}`,
  usage,
});
sendResponse({ result: candidates });
```

Note: `REDERIVE_SYSTEM_PROMPT` remains accessible in `background/index.ts` for use in
error traces (L378, L402). After the migration the success trace also needs it. Because D-06
says the constant moves to the tool, there are two options:
1. Re-export `REDERIVE_SYSTEM_PROMPT` from the tool and import it back in background.
2. Keep a local copy of the prompt string in background for trace purposes only.

**Recommendation (Claude's Discretion):** Re-export `REDERIVE_SYSTEM_PROMPT` from the tool
and import it in background — single source of truth avoids drift. The constant is already
committed in background.

---

## RederiveCandidate Type Deduplication (D-08)

### Current duplicate definitions

**Definition 1:** `src/content/detector/rederiver.ts` L17–20 [VERIFIED: codebase read]
```typescript
export interface RederiveCandidate {
  selector: string;
  rationale: string;
}
```

**Definition 2:** `src/background/index.ts` L148–151 [VERIFIED: codebase read]
```typescript
interface RederiveCandidate {  // NOTE: module-private (no export)
  selector: string;
  rationale: string;
}
```

Both are identical in shape. The one in background is module-private.

### After deduplication

Single definition lives in `src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts`:
```typescript
export interface RederiveCandidate {
  selector: string;
  rationale: string;
}
```

Both background and rederiver.ts import from the tool:
```typescript
// src/background/index.ts:
import type { RederiveCandidate } from '../skills/library/dom-selector-rederive/dom-selector-rederive.tool';

// src/content/detector/rederiver.ts:
import type { RederiveCandidate } from '../../skills/library/dom-selector-rederive/dom-selector-rederive.tool';
```

**Import depth from `src/content/detector/rederiver.ts` to tool:**
`src/content/detector/` → `../../` = `src/` → `skills/library/dom-selector-rederive/` = correct path.

**Import depth from `src/background/index.ts` to tool:**
`src/background/` → `../` = `src/` → `skills/library/dom-selector-rederive/` = `'../skills/library/dom-selector-rederive/dom-selector-rederive.tool'`.

---

## Tool<I, O> Interface Design

### Placement (Claude's Discretion — recommendation)

Place `Tool<I, O>` in `src/shared/skills/types.ts` alongside the existing skill interfaces.
The alternative (sibling `src/shared/tools/types.ts`) adds a new directory and import path
complexity for a single interface. The existing `types.ts` already declares the analogous
`AnySkill` union; `Tool<I, O>` should be nearby but NOT in `AnySkill` (it is intentionally
distinct — D-01).

**Proposed addition to `src/shared/skills/types.ts`:**

```typescript
// ---------------------------------------------------------------------------
// Tool contract (Phase 32 — D-01, D-04)
// ---------------------------------------------------------------------------

/**
 * A first-class imperative capability that MAY perform host I/O
 * (network, chrome.storage, DOM read/write) — distinct from the
 * host-agnostic skill types (SignalSkill / ExclusionSkill / DetectorSkill).
 *
 * Tools are NOT part of AnySkill — the I/O boundary is the discriminator (D-01).
 * Tools live in src/skills/library/ with SKILL.md metadata.kind: 'tool'.
 * ToolRegistry (src/shared/tool-registry.ts) is the runtime lookup point.
 */
export interface Tool<I, O> {
  /** Unique identifier — matches the library folder name (unprefixed base, e.g. 'dom-selector-rederive') */
  name: string;
  /** One-sentence description of what this tool does */
  description: string;
  /** Execute the tool. May perform network, chrome.storage, or DOM I/O. */
  execute(input: I): Promise<O>;
}
```

The `kind` discriminant set in `validateFrontmatter` (in `generate-skill-registry.ts`) and
in the kind-drift test must be extended to include `'tool'`:
- Current valid kinds: `'signal' | 'exclusion' | 'detector'`
- New valid kinds: `'signal' | 'exclusion' | 'detector' | 'tool'`

### `AnySkill` union — do NOT include Tool

`AnySkill = DetectorSkill | SignalSkill | ExclusionSkill` (current `types.ts` L153).
`Tool<I, O>` is intentionally NOT added to this union — the I/O boundary separates it
categorically. The SkillRegistry and ToolRegistry are distinct runtime objects.

---

## ToolRegistry Design

### Minimal API surface (mirroring SkillRegistry, no storage hydration)

```typescript
// src/shared/tool-registry.ts

import { GENERATED_TOOLS } from './generated-tool-registry';
import type { Tool } from './skills/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _registry: Map<string, Tool<any, any>> = new Map(
  GENERATED_TOOLS.map(t => [t.name, t])
);

export function get<I, O>(name: string): Tool<I, O> {
  const tool = _registry.get(name);
  if (!tool) throw new Error(`[ToolRegistry] Unknown tool: '${name}'`);
  return tool as Tool<I, O>;
}
```

Because there is only one tool this phase, the API does not need `list()`, `has()`, or
`register()` beyond `get()`. Keep it minimal; expand in follow-up phases when follow-up
needs arise.

### Generated tool registry location and shape

`src/shared/generated-tool-registry.ts` (DO-NOT-EDIT, emitted by codegen):

```typescript
// src/shared/generated-tool-registry.ts
// DO NOT EDIT — generated by scripts/generate-skill-registry.ts
// Regenerate: npm run generate-skill-registry
// Stale-check: npm run check-tool-registry

import type { Tool } from './skills/types';
import { domSelectorRederiveTool } from '../skills/library/dom-selector-rederive/dom-selector-rederive.tool';

export const GENERATED_TOOLS: readonly Tool<unknown, unknown>[] = [
  domSelectorRederiveTool,
];

export const GENERATED_TOOL_METADATA = {
  'dom-selector-rederive': {
    name: 'dom-selector-rederive',
    description: '...',
    kind: 'tool' as const,
  },
} as const;
```

**Import variable name for tools:** The existing `importVarName` function strips
`detect-` / `exclude-` / `dom-selector-` prefixes. For tools with folder name
`dom-selector-rederive`, stripping `dom-selector-` → `rederive` → camelCase → `rederive`
→ suffix `Tool` → `rederiveTool`. However, folder name IS `dom-selector-rederive` — if
the strip is applied it becomes `rederive`. Consider whether the `dom-selector-` prefix
strip is appropriate for a tool folder. The tool's export const would be
`domSelectorRederiveTool` if the full folder name (no prefix strip) is camelCased.

**Recommendation (Claude's Discretion):** Do not strip the `dom-selector-` prefix for tools
— the prefix strip exists because `dom-selector-` was the selector-registry convention, not
a type prefix. For tools, use the full folder name camelCased. For `dom-selector-rederive`:
camelCase(`dom-selector-rederive`) = `domSelectorRederiveTool`. The tool's exported const
should be `domSelectorRederiveTool`.

A cleaner approach: add a `'tool'` branch to `importVarName` that uses the full folder name
(no prefix strip) and appends `Tool` suffix:
```typescript
if (kind === 'tool') {
  const camel = folder.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return `${camel}Tool`;
}
```

---

## AUTHORING.md Extension

Current AUTHORING.md lives at `src/skills/library/AUTHORING.md`. [VERIFIED: codebase read]

### Current prefix table (lines 23–28):

| Prefix | Kind | Examples |
|--------|------|---------|
| `detect-` | `signal` and `detector` | `detect-ai-vocab`, `detect-heuristic` |
| `exclude-` | `exclusion` | `exclude-sponsored`, `exclude-company-page` |
| `dom-selector-` | the selector registry skill | `dom-selector-registry` |

### Additions needed for Phase 32:

1. New prefix row: `dom-selector-` broadened to include `kind: tool` entries (since
   `dom-selector-rederive` is a tool), OR a separate `tool` prefix like `tool-`. Given that
   `dom-selector-rederive` already uses `dom-selector-` as a semantic prefix (not just a
   type prefix), the cleaner convention is:

   - Add a `tool-` prefix for generic tools OR
   - Document that `dom-selector-` covers both the registry skill and rederive tool (type-
     agnostic domain prefix)

   **Recommendation:** Introduce a `tool-` prefix convention for future tools, but document
   that `dom-selector-rederive` was named before the `tool-` convention and uses `dom-selector-`
   as its domain prefix. The AUTHORING.md table should acknowledge this.

2. New section: **Skill-vs-Tool Decision Rule (D-01/D-02)** — the I/O boundary rule.
3. New section: **Tool authoring workflow** — same 4-step pattern as skills but with:
   - `metadata.kind: tool` in SKILL.md
   - `<name>.tool.ts` (not `.skill.ts`) as the implementation file
   - `add to skill-order.json 'tools' array`
   - `execute(input: I): Promise<O>` instead of `run(ctx)`
   - Export `Tool<I, O>` type from `src/shared/skills/types`
4. New note: `dom-selector-registry` is reclassified to `kind: tool` (CR-01 fix) — document
   why it was misclassified (it reads/writes `chrome.storage.local`).

The `fetchComments` injection in `detect-generic-comments` is the canonical example of the
skill/tool seam for composite detectors (per D-02) — cite it in the rule section.

---

## Zero-Behavior-Change Guards

### Guards that must remain green (verified from codebase)

**1. `npm run check-skill-registry`** [VERIFIED: `package.json`, `ci.yml`]

Command: `npm run generate-skill-registry && git diff --exit-code src/content/generated-skill-registry.ts`

Phase 32 extends the codegen script but does NOT change the existing output file
`src/content/generated-skill-registry.ts`. If the `tools` bucket is added to
`skill-order.json` with tools listed there (not mixed into signals/exclusions/detectors),
the existing generated file should be regenerated identically. The planner must ensure the
codegen extension does not inadvertently change the existing signal/exclusion/detector output.

**2. Golden-score snapshot** [VERIFIED: file exists at `src/content/detector/heuristic.test.ts`]

This test uses `toStrictEqual` on `signalBreakdown`. Phase 32 does NOT change:
- Signal skill ordering
- Any `run()` logic
- Any detection config weights

The test should remain byte-identical with no modifications.

**3. Exclusion parity test** [VERIFIED: file exists at `src/content/exclusions/exclusions.test.ts`]

Phase 32 does NOT change exclusion skill logic. Test remains unchanged.

**4. `src/background/ratelimit.test.ts`** [VERIFIED: full file read]

This test imports `'./index'` (background/index.ts) and captures the `onMessage` listener.
After migration, the `REDERIVE_SELECTOR` handler calls `toolRegistry.get(...).execute(...)`
instead of `rederiveSelector(...)` directly. The handler's externally observable behavior
(rate-limit checks, `sendResponse` payloads, `chrome.storage` mutations) is unchanged.

The test will need `fetch` mock behavior unchanged. The test does NOT need to be updated
unless `vi.resetModules()` + `await import('./index')` fails to initialize the new
`ToolRegistry`. The planner should ensure `ToolRegistry` is a simple synchronous singleton
(no async init) so module import remains synchronous.

**5. New check: `npm run check-tool-registry`**

New stale-check: `npm run generate-skill-registry && git diff --exit-code src/shared/generated-tool-registry.ts`

Must be added to CI after `check-skill-registry` step.

### Order-pinning and kind-drift tests

`src/content/generated-skill-registry.test.ts` [VERIFIED: full file read] tests:
- `GENERATED_SIGNAL_SKILLS.map(s => s.id)` order (toStrictEqual against hardcoded array)
- `GENERATED_EXCLUSION_SKILLS.map(s => s.id)` order
- All items have correct `kind`

Phase 32 adds analogous tests for `GENERATED_TOOLS`:
- `GENERATED_TOOLS.map(t => t.name)` matches tool-order.json `tools` array
- All items satisfy `typeof t.execute === 'function'`

These can live in a new file `src/shared/generated-tool-registry.test.ts`.

---

## dom-selector-registry Kind Fix (CR-01)

**Current SKILL.md:** `src/skills/library/dom-selector-registry/SKILL.md` [VERIFIED: codebase read]
```yaml
metadata:
  kind: exclusion   # WRONG — this is not an exclusion skill
```

**Fix:** Change to `kind: tool`.

**Impact on codegen:** `dom-selector-registry` is NOT listed in `skill-order.json` (verified
— it is not in `signals`, `exclusions`, or `detectors` arrays). Therefore changing its
`kind` in SKILL.md has NO effect on `generated-skill-registry.ts`. It only corrects the
self-documenting manifest.

**Impact on ToolRegistry:** `dom-selector-registry` should NOT be added to `skill-order.json`
`tools` array — AUTHORING.md explicitly says it is NOT wired into any skill array and NOT
imported at runtime. The kind fix is metadata-only.

**The `dom-selector-registry.skill.ts` body is a thin re-export** [VERIFIED: codebase read]
— it just re-exports from `src/content/selector-registry.ts`. It must NOT gain a
`storageSet` call (CLAUDE.md constraint #1 single-writer invariant).

---

## Architecture Patterns

### System Architecture Diagram

```
scripts/skill-order.json
  { tools: ['dom-selector-rederive'] }
         |
         v
scripts/generate-skill-registry.ts (extended)
         |
         +---> src/content/generated-skill-registry.ts  (EXISTING, unchanged)
         |
         +---> src/shared/generated-tool-registry.ts    (NEW)
                   |
                   | static import
                   v
              src/shared/tool-registry.ts               (NEW)
                   | get('dom-selector-rederive')
                   v
      src/skills/library/dom-selector-rederive/
        dom-selector-rederive.tool.ts                   (NEW)
        SKILL.md (kind: tool)
          |
          | execute({ target, domSkeleton })
          | returns { candidates, usage }
          v
       Anthropic API (fetch, MV3 service worker context)

-------- Call path at runtime --------

src/content/detector/rederiver.ts  (STAYS, sends message)
  |  chrome.runtime.sendMessage(REDERIVE_SELECTOR)
  v
src/background/index.ts  (MODIFIED: handler rewired)
  checkRateLimit() + acquireRateLimitLatch()
  → toolRegistry.get('dom-selector-rederive').execute(...)
  → recordTrace(success)  [hoisted from tool]
  → sendResponse({ result: candidates })
  → releaseRateLimitLatch()
```

### Recommended Project Structure (new files)

```
scripts/
  generate-skill-registry.ts    # extended in-place (adds tools bucket + second output)
  skill-order.json              # extended: new "tools" array

src/
  shared/
    skills/
      types.ts                  # Tool<I, O> interface added
    tool-registry.ts            # ToolRegistry.get(name) singleton
    generated-tool-registry.ts  # DO NOT EDIT — codegen output
  skills/
    library/
      dom-selector-rederive/
        SKILL.md                # metadata.kind: tool
        dom-selector-rederive.tool.ts   # Tool<{target,domSkeleton},{candidates,usage}> impl
      dom-selector-registry/
        SKILL.md                # kind: exclusion → tool (CR-01 fix)
      AUTHORING.md              # extended: tool prefix row + skill-vs-tool rule
  background/
    index.ts                    # REDERIVE_SELECTOR handler rewired; rederiveSelector removed
  content/
    detector/
      rederiver.ts              # RederiveCandidate import path updated (D-08)
```

### File extension convention for tools

Existing skill implementations use `.skill.ts`. Tools should use `.tool.ts` for symmetry
and to distinguish them in the file tree.

The codegen import path function (`importPath`) must be parameterized on kind:
- `kind === 'tool'` → `'../skills/library/${folder}/${folder}.tool'` (for generated-tool-registry)
- skill kinds → `'../skills/library/${folder}/${folder}.skill'` (unchanged)

---

## Common Pitfalls

### Pitfall 1: Changing generated-skill-registry.ts output while extending codegen

**What goes wrong:** Adding the `tools` bucket to `skill-order.json` and the codegen
inadvertently changes the signal/exclusion section of the generated file (e.g., a new
header comment, a changed blank line).

**Why it happens:** The codegen writes `generated-skill-registry.ts` in one pass. Any
change to the script's emit logic can affect earlier sections.

**How to avoid:** Run `git diff src/content/generated-skill-registry.ts` immediately after
extending the codegen. The file must be byte-identical to pre-extension. The
`check-skill-registry` CI step will catch this, but catch it locally first.

**Warning signs:** `npm run check-skill-registry` fails after adding the `tools` bucket.

### Pitfall 2: ToolRegistry initialization during ratelimit.test.ts import

**What goes wrong:** `ratelimit.test.ts` does `vi.resetModules()` then
`await import('./index')`. If `tool-registry.ts` or `generated-tool-registry.ts` has an
async init path, the module graph may fail to initialize synchronously.

**Why it happens:** The test replaces `chrome` globals via `vi.stubGlobal` before the
import. If `ToolRegistry` reads `chrome.storage` at module init time, the test mock may not
be installed yet.

**How to avoid:** `ToolRegistry` must be a synchronous singleton built from the static
`GENERATED_TOOLS` array — no `chrome.*` calls at module init. The `Map` construction is
synchronous.

**Warning signs:** `ratelimit.test.ts` fails with "Unknown tool" or "TypeError: Cannot
read properties of undefined (reading 'get')".

### Pitfall 3: Forgetting REDERIVE_SYSTEM_PROMPT at error trace call sites

**What goes wrong:** `REDERIVE_SYSTEM_PROMPT` moves to the tool file. The background still
has three `recordTrace` calls that reference it (L374–383 no-key path, L398–406 error path,
and the new success path). If only the tool is updated, `background/index.ts` will have
undefined-reference errors.

**Why it happens:** Three `recordTrace` calls each reference `REDERIVE_SYSTEM_PROMPT`.

**How to avoid:** Re-export `REDERIVE_SYSTEM_PROMPT` from the tool and import it in
background. Include the re-export in the same PR as the tool creation.

**Warning signs:** TypeScript compile error `Cannot find name 'REDERIVE_SYSTEM_PROMPT'` in
`background/index.ts`.

### Pitfall 4: RederiveCandidate type mismatch after dedup

**What goes wrong:** `rederiver.ts` uses `RederiveCandidate` as a return type annotation.
After dedup, the type is imported from the tool instead of defined locally. If the tool's
exported type is in a file that also imports from `src/shared/`, a circular import may form.

**Why it happens:** `dom-selector-rederive.tool.ts` imports from `src/shared/skills/types`
(for `Tool<I, O>`); `src/content/detector/rederiver.ts` imports `RederiveCandidate` from
the tool. There is no cycle: `rederiver.ts` → tool → shared types (no cycle back to
content).

**How to avoid:** Verify import graph: `rederiver.ts` → tool → `shared/skills/types` →
`shared/types` (no content imports). Straightforward.

**Warning signs:** TypeScript error "Circular reference detected" or tsc hanging.

### Pitfall 5: `dom-selector-registry` added to ToolRegistry by mistake

**What goes wrong:** Planner adds `dom-selector-registry` to `skill-order.json` `tools`
array, making it a registered tool. The runtime would then try to resolve it as a `Tool<I,O>`
with an `execute()` method — but `dom-selector-registry.skill.ts` is a thin re-export with
no `execute()`.

**Why it happens:** CR-01 fix (kind mislabel) is conflated with ToolRegistry registration.

**How to avoid:** CR-01 fix is ONLY a change to `dom-selector-registry/SKILL.md`. Nothing
is added to `skill-order.json` for this folder. Document explicitly in the plan.

---

## Code Examples

### Tool<I, O> interface (addition to `src/shared/skills/types.ts`)

```typescript
// [ASSUMED — proposed shape consistent with D-01/D-04; no external source to cite]
export interface Tool<I, O> {
  name: string;
  description: string;
  execute(input: I): Promise<O>;
}
```

### dom-selector-rederive SKILL.md

```yaml
---
name: dom-selector-rederive
description: "LLM tool that proposes CSS post-card selectors from a PII-stripped DOM skeleton. Calls the Anthropic API (via fetch in the service worker context) and returns ranked candidates with schema validation. Part of the Phase 23 self-healing selector pipeline."
metadata:
  kind: tool
---
```

### dom-selector-rederive tool skeleton

```typescript
// src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts
// [ASSUMED — shape consistent with D-06/D-07; mirrors rederiveSelector body]
import type { Tool } from '../../../shared/skills/types';
import type { AnthropicUsage } from '../../../shared/classifier';

export interface RederiveCandidate {
  selector: string;
  rationale: string;
}

// (REDERIVE_SYSTEM_PROMPT, RederiveModelOutput, isRederiveModelOutput relocate here)

export const domSelectorRederiveTool: Tool<
  { target: string; domSkeleton: string },
  { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }
> = {
  name: 'dom-selector-rederive',
  description: 'Proposes CSS selectors for broken post-card targets via Claude Haiku.',
  async execute({ target, domSkeleton }) {
    // ... rederiveSelector body relocated verbatim, minus recordTrace call ...
    return { candidates: parsed.candidates, usage: data.usage };
  },
};
```

### ToolRegistry get() call in background/index.ts

```typescript
// [ASSUMED — consistent with D-04/D-06 decision]
import { get as getTool } from '../shared/tool-registry';
// ...
const { candidates, usage } = await getTool<
  { target: string; domSkeleton: string },
  { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }
>('dom-selector-rederive').execute({
  target: message.target as string,
  domSkeleton: message.domSkeleton as string,
});
```

### skill-order.json with tools bucket

```json
{
  "signals":    ["detect-listicle-cta", "detect-buzzword", "detect-em-dash",
                 "detect-ai-vocab", "detect-hook-story", "detect-motivational",
                 "detect-impersonal", "detect-generic-comments"],
  "exclusions": ["exclude-sponsored", "exclude-company-page",
                 "exclude-non-english", "exclude-open-to-work"],
  "detectors":  ["detect-heuristic", "detect-llm"],
  "tools":      ["dom-selector-rederive"]
}
```

---

## Skill-vs-Tool Audit Results

Verified against all skill folders in `src/skills/library/`: [VERIFIED: codebase glob]

| Folder | Current kind | I/O? | Correct kind | Action |
|--------|-------------|------|-------------|--------|
| `detect-listicle-cta` | `signal` | No | `signal` | None |
| `detect-buzzword` | `signal` | No | `signal` | None |
| `detect-em-dash` | `signal` | No | `signal` | None |
| `detect-ai-vocab` | `signal` | No | `signal` | None |
| `detect-hook-story` | `signal` | No | `signal` | None |
| `detect-motivational` | `signal` | No | `signal` | None |
| `detect-impersonal` | `signal` | No | `signal` | None |
| `detect-generic-comments` | `signal` | Yes (fetchComments — injected) | Composite: scoring is `signal`, fetch is tool seam | Document seam only (D-03) |
| `detect-heuristic` | `detector` | No (orchestrates pure skills) | `detector` | None |
| `detect-llm` | `detector` | Yes (SCORE_POST message — I/O via SW) | Composite: relay is `detector`, fetch is tool seam | Document seam only (D-03) |
| `exclude-sponsored` | `exclusion` | No (DOM read via passed Element) | `exclusion` | None |
| `exclude-company-page` | `exclusion` | No (URL string check) | `exclusion` | None |
| `exclude-non-english` | `exclusion` | No (DOM lang attr via passed Element) | `exclusion` | None |
| `exclude-open-to-work` | `exclusion` | No (metadata passthrough) | `exclusion` | None |
| `dom-selector-registry` | `exclusion` | YES — `chrome.storage.local` reads/writes | `tool` | CR-01 fix: change SKILL.md kind |

**Composite seam documentation (D-02/D-03):**
- `detect-generic-comments`: the `fetchComments` function injected by the runner IS the tool
  (DOM read). `checkGenericComments(comments)` is the skill. Seam: runner passes
  `fetchComments` to `run()`. Decomposition is a follow-up.
- `detect-llm`: the `SCORE_POST` message IS the tool invocation (background fetch). The
  relay class (`LLMDetector`) is a thin orchestrator. Decomposition is a follow-up.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.7 |
| Config file | `vitest.config.ts` (inferred from devDeps) or `vite.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` (no separate watch mode needed for CI) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | `Tool<I, O>` interface defined in `src/shared/skills/types.ts` | type (tsc) | `npm run type-check` | Covered by existing CI |
| TOOL-01 | `GENERATED_TOOLS` array exists and has correct `name`/`execute` | unit | `npm test` (generated-tool-registry.test.ts) | No — Wave 0 gap |
| TOOL-01 | All tools in array have `typeof execute === 'function'` | unit | `npm test` (generated-tool-registry.test.ts) | No — Wave 0 gap |
| TOOL-02 | `dom-selector-rederive.execute()` returns `{ candidates, usage }` with valid schema | unit | `npm test` (dom-selector-rederive.test.ts) | No — Wave 0 gap |
| TOOL-02 | `REDERIVE_SELECTOR` handler behavior unchanged | unit | `npm test` (ratelimit.test.ts) | YES — must remain green |
| TOOL-02 | Golden-score snapshot byte-identical | unit | `npm test` (heuristic.test.ts) | YES — must remain green |
| TOOL-02 | Exclusion parity byte-identical | unit | `npm test` (exclusions.test.ts) | YES — must remain green |
| TOOL-02 | `check-tool-registry` stale-check passes | CI | `npm run check-tool-registry` | No — Wave 0 gap (new npm script) |

### Sampling Rate

- **Per task commit:** `npm run type-check && npm test`
- **Per wave merge:** `npm test && npm run check-skill-registry && npm run check-tool-registry`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/shared/generated-tool-registry.test.ts` — TOOL-01 order and kind drift guard
- [ ] `src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts` — TOOL-02 execute() unit test (optional but recommended; the ratelimit.test.ts indirectly covers integration)
- [ ] `check-tool-registry` npm script in `package.json`
- [ ] CI step for `check-tool-registry` in `.github/workflows/ci.yml`

---

## Environment Availability

Step 2.6: SKIPPED — Phase 32 is a pure code/config refactor with no new external tools,
services, or runtimes. All required tooling (tsx, vitest, tsc, js-yaml) is already present
in the project devDependencies. The Anthropic API is called at runtime (not build time) and
is already used by the existing `rederiveSelector` path.

---

## Security Domain

`security_enforcement` not set in config — treated as enabled.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Tool does not introduce new auth flows |
| V3 Session Management | No | No session state introduced |
| V4 Access Control | No | Tool registry is code-seeded; no external write path |
| V5 Input Validation | Yes | `isRederiveModelOutput` schema-validates LLM response before any selector string is trusted — moves to tool file, must remain |
| V6 Cryptography | No | API key handling unchanged; key read from storage, not logged or stored by the tool |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM-injected malicious selector string | Tampering | `isRederiveModelOutput` type guard validates schema; strings passed to `querySelectorAll` only (ADAPT-06) |
| Tool name collision / registry poisoning | Elevation of Privilege | Registry is code-seeded only (no storage hydration D-05); `get()` throws on unknown name |
| API key in tool error trace | Information Disclosure | Tool must not log `apiKey`; existing pattern passes only `usage` and `error` message to caller |

---

## State of the Art

| Old Approach | Current Approach | Phase Changed | Impact |
|--------------|-----------------|---------------|--------|
| `rederiveSelector` as a private module function | `Tool<I, O>` with `ToolRegistry.get().execute()` | Phase 32 | Explicit I/O boundary; discoverable via registry |
| `RederiveCandidate` defined in two files | Single export from tool file | Phase 32 | Eliminates type drift |
| `dom-selector-registry` SKILL.md `kind: exclusion` | `kind: tool` | Phase 32 (CR-01) | Accurate self-documentation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `AnthropicUsage` is currently exported from `src/shared/classifier.ts` | rederiveSelector Body | If not exported, the tool cannot import it — must re-export or define a local type |
| A2 | The `Tool<I, O>` interface does not belong in `AnySkill` | Tool<I,O> Design | If planner adds it to `AnySkill`, SkillRegistry type-checks may fail |
| A3 | Tool `.tool.ts` file extension convention (rather than `.skill.ts`) | Architecture Patterns | Cosmetic only; `.skill.ts` would also work but reduces clarity |
| A4 | Codegen should extend `generate-skill-registry.ts` in place (Option A) | SkillRegistry Codegen Machinery | If a sibling script is preferred, the codegen paths differ but the outcome is equivalent |
| A5 | `domSelectorRederiveTool` (full camelCase, no prefix strip) is the correct export name | ToolRegistry Design | If prefix-strip logic is applied, name becomes `rederiveTool`; kind-drift test must match |

---

## Open Questions

1. **Is `AnthropicUsage` exported from `src/shared/classifier.ts`?**
   - What we know: `background/index.ts` imports `{ AnthropicUsage }` from `'../shared/classifier'` (L7).
   - What's unclear: Whether it is a named export or a re-export; not verified in this session.
   - Recommendation: Planner should read `src/shared/classifier.ts` L1–20 to confirm the
     export. If not exported, add `export type { AnthropicUsage }` to `classifier.ts`.

2. **Should `check-tool-registry` be a separate npm script or extend `check-skill-registry`?**
   - What we know: Current `check-skill-registry` diffs only `src/content/generated-skill-registry.ts`.
   - What's unclear: Whether combining the two diffs in one script is desirable.
   - Recommendation: Two separate scripts (`check-skill-registry` + `check-tool-registry`)
     for clarity; chain in CI as separate steps. Both run in the same prebuild pass.

3. **userPrompt string in success trace — exact string to pass?**
   - What we know: Current `rederiveSelector` builds `userContent` inside the loop as
     `${retryHint}Target: ${target}\n\nDOM skeleton:\n${domSkeleton}`. The success trace
     (L319–325) passes this `userContent` (which includes the retry hint on attempt 2).
   - What's unclear: After hoisting the trace to the handler, the handler has
     `message.target` and `message.domSkeleton` but not the constructed `userContent`.
   - Recommendation: The handler constructs `Target: ${target}\n\nDOM skeleton:\n${domSkeleton}`
     (no retry hint — the trace should reflect the original input, not the retry variant).
     The difference is cosmetic/observability-only. Flag in the plan comment.

---

## Sources

### Primary (HIGH confidence)

- `src/background/index.ts` (L1–415, fully read) — live rederiveSelector body, handler, types
- `scripts/generate-skill-registry.ts` (L1–251, fully read) — codegen machinery
- `scripts/skill-order.json` (L1–22, fully read) — bucket shape
- `src/content/skill-registry.ts` (L1–273, fully read) — SkillRegistry consumer pattern
- `src/content/generated-skill-registry.ts` (L1–72, fully read) — generated module shape
- `src/content/generated-skill-registry.test.ts` (L1–52, fully read) — test patterns
- `src/shared/skills/types.ts` (L1–174, fully read) — AnySkill, existing interfaces
- `src/content/detector/rederiver.ts` (L1–52, fully read) — duplicate RederiveCandidate
- `src/skills/library/AUTHORING.md` (L1–213, fully read) — existing prefix conventions
- `src/skills/library/dom-selector-registry/SKILL.md` (L1–7) — CR-01 mislabel confirmed
- `src/skills/library/dom-selector-registry/dom-selector-registry.skill.ts` — thin re-export
- `package.json` (L1–52, fully read) — npm scripts, deps
- `.github/workflows/ci.yml` (L1–34, fully read) — CI stale-check wiring
- `src/background/ratelimit.test.ts` (L1–258, fully read) — test structure for migration safety
- `src/shared/types.ts` (L1–501, fully read) — StorageSchema, TraceEntry

### Secondary (MEDIUM confidence)

- `src/content/selector-registry.ts` — CLAUDE.md single-writer invariant verified live
- `src/skills/library/` glob — all 31 folder entries confirmed

---

## Metadata

**Confidence breakdown:**
- rederiveSelector migration anatomy: HIGH — read full function body, all line numbers verified
- Codegen machinery: HIGH — read full codegen script and generated output
- Tool<I, O> placement: MEDIUM — recommended from patterns; placement is Claude's Discretion
- ToolRegistry API surface: MEDIUM — minimal design recommended; exact API is Claude's Discretion
- AUTHORING.md extension content: HIGH — read full existing doc; additions are additive
- Zero-behavior-change guards: HIGH — read all four test files

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable codebase; no external API changes expected)
