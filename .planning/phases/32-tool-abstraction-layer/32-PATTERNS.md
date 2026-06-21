# Phase 32: Tool Abstraction Layer - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 11 (8 new, 3 modified in source; plus 2 doc/config modifications)
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/skills/types.ts` (MODIFY) | type contract | — | self (extend with `Tool<I,O>`) | exact |
| `src/shared/tool-registry.ts` (NEW) | registry singleton | request-response | `src/content/skill-registry.ts` (code-seed path) | role-match |
| `src/shared/generated-tool-registry.ts` (NEW) | codegen output | — | `src/content/generated-skill-registry.ts` | exact |
| `src/shared/generated-tool-registry.test.ts` (NEW) | test | — | `src/content/generated-skill-registry.test.ts` | exact |
| `scripts/generate-skill-registry.ts` (MODIFY) | codegen script | batch | self (extend with `tools` bucket) | exact |
| `scripts/skill-order.json` (MODIFY) | config | — | self (add `tools` array) | exact |
| `src/skills/library/dom-selector-rederive/SKILL.md` (NEW) | tool manifest | — | `src/skills/library/exclude-sponsored/SKILL.md` | role-match |
| `src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts` (NEW) | tool impl | request-response | `src/background/index.ts` `rederiveSelector` body | exact (relocation) |
| `src/background/index.ts` (MODIFY) | service, event-driven | request-response | self (handler rewire) | exact |
| `src/content/detector/rederiver.ts` (MODIFY) | message relay | request-response | self (import path update) | exact |
| `src/skills/library/dom-selector-registry/SKILL.md` (MODIFY) | tool manifest | — | `src/skills/library/exclude-sponsored/SKILL.md` | role-match |
| `src/skills/library/AUTHORING.md` (MODIFY) | documentation | — | self (additive) | exact |

---

## Pattern Assignments

### `src/shared/skills/types.ts` (MODIFY — add `Tool<I, O>`)

**Analog:** self (lines 147–153 for union type pattern; lines 122–143 for interface-with-discriminant pattern)

**Existing interface-with-discriminant pattern** (lines 138–143):
```typescript
export interface DetectorSkill {
  kind: 'detector';
  /** Human-readable identifier: 'heuristic' | 'llm' */
  name: string;
  detect(post: PostData): Promise<DetectionResult>;
}
```

**Existing union type at bottom of file** (lines 149–153):
```typescript
/** Any signal-producing skill (imperative or declarative) */
export type SignalSkill = CodeSkill | PatternSkill;

/** Any skill managed by the registry */
export type AnySkill = DetectorSkill | SignalSkill | ExclusionSkill;
```

**Pattern to follow — append after line 153** (do NOT add `Tool` to `AnySkill`):
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
  /** Unique identifier — matches the library folder name */
  name: string;
  /** One-sentence description of what this tool does */
  description: string;
  /** Execute the tool. May perform network, chrome.storage, or DOM I/O. */
  execute(input: I): Promise<O>;
}
```

**`kind` discriminant set in codegen** (`scripts/generate-skill-registry.ts` line 63):
```typescript
// CURRENT (line 63):
if (!['signal', 'exclusion', 'detector'].includes(kind as string)) {

// AFTER extension:
if (!['signal', 'exclusion', 'detector', 'tool'].includes(kind as string)) {
```

---

### `src/shared/tool-registry.ts` (NEW)

**Analog:** `src/content/skill-registry.ts` — specifically the code-seed / sync-getter portion (lines 46–76). The ToolRegistry is intentionally simpler: no `chrome.storage` hydration, no `migrate()`, no `onChanged` listener (D-05, code-seeded only).

**Static import pattern from analog** (skill-registry.ts lines 46–50):
```typescript
// Static imports from the committed generated registry module.
// DO NOT import skill modules directly here — skill-registry.ts is no longer
// the registration point. To add a skill: drop a skills/library/<name>/ folder
// + rerun `npm run generate-skill-registry`.
// (D-07 — no dynamic import, no import.meta.glob; MV3-CSP-safe and tree-shakeable)
import {
  GENERATED_SIGNAL_SKILLS,
  GENERATED_EXCLUSION_SKILLS,
} from './generated-skill-registry';
```

**Core pattern to mirror** — full `tool-registry.ts` follows the sync-Map singleton shape:
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

Key constraint (RESEARCH.md Pitfall 2): `_registry` Map construction MUST be synchronous — no `chrome.*` calls at module init. Tests use `vi.resetModules()` + `await import('./index')` and stubs must be installed before module init.

---

### `src/shared/generated-tool-registry.ts` (NEW — codegen output)

**Analog:** `src/content/generated-skill-registry.ts` (lines 1–71) — exact structural mirror.

**Header pattern** (generated-skill-registry.ts lines 1–6):
```typescript
// src/content/generated-skill-registry.ts
// ============================================================
// DO NOT EDIT — generated by scripts/generate-skill-registry.ts
// Regenerate: npm run generate-skill-registry
// Stale-check: npm run check-skill-registry
// ============================================================
```

**Type import pattern** (generated-skill-registry.ts line 8):
```typescript
import type { SignalSkill, ExclusionSkill } from '../shared/skills/types';
```

**Static import + readonly array export pattern** (lines 11–36):
```typescript
// Signal skill imports (pipeline step-order — DO NOT reorder ...)
import { listicleCtaSkill } from '../skills/library/detect-listicle-cta/detect-listicle-cta.skill';

export const GENERATED_SIGNAL_SKILLS: readonly SignalSkill[] = [
  listicleCtaSkill,
  ...
];
```

**Generated tool registry mirrors this exactly** — adapting header and content:
```typescript
// src/shared/generated-tool-registry.ts
// ============================================================
// DO NOT EDIT — generated by scripts/generate-skill-registry.ts
// Regenerate: npm run generate-skill-registry
// Stale-check: npm run check-tool-registry
// ============================================================

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

**Import path derivation for tools** (from `src/shared/`, one level up to `src/`, then down):
`'../skills/library/${folder}/${folder}.tool'`
(contrasts with skill path `'../skills/library/${folder}/${folder}.skill'` relative from `src/content/`)

**Export const name derivation** — do NOT strip `dom-selector-` prefix for tools (RESEARCH.md §ToolRegistry Design). Full folder name camelCased + `Tool` suffix:
- `dom-selector-rederive` → camelCase → `domSelectorRederive` → append `Tool` → `domSelectorRederiveTool`

---

### `src/shared/generated-tool-registry.test.ts` (NEW)

**Analog:** `src/content/generated-skill-registry.test.ts` (lines 1–51) — full structural mirror.

**Test structure pattern** (lines 1–51):
```typescript
import { describe, it, expect } from 'vitest';
import {
  GENERATED_SIGNAL_SKILLS,
  GENERATED_EXCLUSION_SKILLS,
} from './generated-skill-registry';

describe('generated-skill-registry order invariants (D-06)', () => {
  it('GENERATED_SIGNAL_SKILLS order matches Phase 30 CODE_SIGNAL_SKILLS order', () => {
    const expected = ['listicle-cta', 'buzzword', ...];
    expect(GENERATED_SIGNAL_SKILLS.map(s => s.id)).toStrictEqual(expected);
  });
});

describe('generated-skill-registry kind drift-guard (D-07)', () => {
  it('all GENERATED_SIGNAL_SKILLS have kind === signal', () => {
    for (const skill of GENERATED_SIGNAL_SKILLS) {
      expect(skill.kind).toBe('signal');
    }
  });
});
```

**Adapted for tool registry** — two describe blocks:
1. **Order-pinning:** `GENERATED_TOOLS.map(t => t.name)` toStrictEqual `['dom-selector-rederive']`
2. **Kind/execute drift-guard:** all tools have `typeof t.execute === 'function'` (tools have no `kind` field on the object — the SKILL.md kind is codegen-only metadata; the `Tool<I,O>` interface has `name`, `description`, `execute`)

---

### `scripts/generate-skill-registry.ts` (MODIFY — add `tools` bucket)

**Analog:** self (lines 1–250). Extension follows the existing pattern exactly.

**`SkillOrder` interface** (lines 24–28) — add `tools?` field:
```typescript
interface SkillOrder {
  signals: string[];
  exclusions: string[];
  detectors: string[];
  // Phase 32: tools bucket (D-05)
  tools?: string[];
}
```

**`SkillFrontmatter` and `SkillEntry` kind union** (lines 31–41) — extend:
```typescript
interface SkillFrontmatter {
  name: string;
  description: string;
  metadata: { kind: 'signal' | 'exclusion' | 'detector' | 'tool' };
}

interface SkillEntry {
  name: string;
  description: string;
  kind: 'signal' | 'exclusion' | 'detector' | 'tool';
  folder: string;
}
```

**`validateFrontmatter` allowed-kinds check** (line 63):
```typescript
// CURRENT:
if (!['signal', 'exclusion', 'detector'].includes(kind as string)) {
// AFTER:
if (!['signal', 'exclusion', 'detector', 'tool'].includes(kind as string)) {
```

**`importVarName` extension** (lines 115–131) — add `tool` branch before the generic case:
```typescript
function importVarName(folder: string, kind: 'signal' | 'exclusion' | 'detector' | 'tool'): string {
  if (kind === 'tool') {
    // Full folder name camelCased (no prefix strip) + Tool suffix
    const camel = folder.replace(/-([a-z])/g, (_, c: string) => (c as string).toUpperCase());
    return `${camel}Tool`;
  }
  // existing logic for signal/exclusion/detector...
  const base = folder.replace(/^(detect|exclude|dom-selector)-/, '');
  const camel = base.replace(/-([a-z])/g, (_, c: string) => (c as string).toUpperCase());
  const suffix = kind === 'exclusion' ? 'ExclusionSkill' : 'Skill';
  return `${camel}${suffix}`;
}
```

**`importPath` extension** — parameterize on kind (new function or extend existing):
```typescript
function importPath(folder: string, kind: 'signal' | 'exclusion' | 'detector' | 'tool'): string {
  if (kind === 'tool') {
    // Relative from src/shared/ (generated-tool-registry.ts lives there)
    return `../skills/library/${folder}/${folder}.tool`;
  }
  // Existing: relative from src/content/ (generated-skill-registry.ts lives there)
  return `../skills/library/${folder}/${folder}.skill`;
}
```

**`main()` extension** (lines 141–248) — add tool parsing after detector entries, emit second output file:
```typescript
// After existing detectorEntries parse:
const toolEntries: SkillEntry[] = (order.tools ?? [])
  .map(parseSkillMd)
  .filter((e): e is SkillEntry => e !== null);

// Emit generated-tool-registry.ts to src/shared/ (separate from src/content/)
const toolOutputPath = path.join(repoRoot, 'src', 'shared', 'generated-tool-registry.ts');
const toolLines: string[] = [];
// ... (DO-NOT-EDIT header, Tool import, static imports, GENERATED_TOOLS array, GENERATED_TOOL_METADATA object)
fs.writeFileSync(toolOutputPath, toolLines.join('\n'), 'utf-8');
```

Critical constraint (RESEARCH.md Pitfall 1): the extension must NOT change the existing `generated-skill-registry.ts` emit path or any existing `lines.push()` calls that write the skill output. Tool output goes to a separate `toolLines` array and a separate `writeFileSync` call.

---

### `scripts/skill-order.json` (MODIFY — add `tools` array)

**Analog:** self (lines 1–22). Append a new `tools` key.

**Current structure** (lines 1–22):
```json
{
  "signals":    ["detect-listicle-cta", "detect-buzzword", "detect-em-dash",
                 "detect-ai-vocab", "detect-hook-story", "detect-motivational",
                 "detect-impersonal", "detect-generic-comments"],
  "exclusions": ["exclude-sponsored", "exclude-company-page",
                 "exclude-non-english", "exclude-open-to-work"],
  "detectors":  ["detect-heuristic", "detect-llm"]
}
```

**After extension:**
```json
{
  "signals":    [...same...],
  "exclusions": [...same...],
  "detectors":  [...same...],
  "tools":      ["dom-selector-rederive"]
}
```

Rule: `dom-selector-registry` is NOT added to `tools` — the CR-01 fix is SKILL.md metadata only (RESEARCH.md Pitfall 5).

---

### `src/skills/library/dom-selector-rederive/SKILL.md` (NEW)

**Analog:** `src/skills/library/exclude-sponsored/SKILL.md` (lines 1–6) — exact frontmatter shape.

**Analog SKILL.md pattern:**
```yaml
---
name: exclude-sponsored
description: "Excludes sponsored/promoted posts before any detection runs. Checks for the SPONSORED_MARKER selector resolved via SelectorRegistry. Must run first (priority 1) to short-circuit before other exclusion checks."
metadata:
  kind: exclusion
---
```

**Tool manifest — same three required fields, `kind: tool`:**
```yaml
---
name: dom-selector-rederive
description: "LLM tool that proposes CSS post-card selectors from a PII-stripped DOM skeleton. Calls the Anthropic API (via fetch in the service worker context) and returns ranked candidates with schema validation. Part of the Phase 23 self-healing selector pipeline."
metadata:
  kind: tool
---
```

Rules from AUTHORING.md (verified lines 63–66):
- `metadata.kind` must be one of the allowed values (now extended to include `'tool'`)
- Do NOT add runtime fields in SKILL.md
- SKILL.md is build-time only — never imported into the bundle

---

### `src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts` (NEW)

**Analog:** `src/background/index.ts` `rederiveSelector` function (lines 258–335) — body relocates verbatim.

**Import pattern from analog skill** (`exclude-sponsored.skill.ts` lines 15–17):
```typescript
import { resolve } from '../../../content/selector-registry';
import type { ExclusionSkill } from '../../../shared/skills/types';
import type { PostData } from '../../../shared/types';
```

Import depth confirmed: `src/skills/library/<name>/` → `../../../` → `src/` (AUTHORING.md line 87).

**Tool implementation imports** (adapting the depth pattern):
```typescript
import type { Tool } from '../../../shared/skills/types';
import type { AnthropicUsage } from '../../../shared/classifier';
```

`AnthropicUsage` is confirmed exported from `src/shared/classifier.ts` at line 18:
```typescript
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
```

**Exported const pattern** (analog: `exclude-sponsored.skill.ts` line 19):
```typescript
export const sponsoredExclusionSkill: ExclusionSkill = {
  kind: 'exclusion',
  id: 'sponsored',
  check(_postData: PostData, postNode: Element) { ... },
};
```

**Tool const pattern mirrors this shape:**
```typescript
export const domSelectorRederiveTool: Tool<
  { target: string; domSkeleton: string },
  { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }
> = {
  name: 'dom-selector-rederive',
  description: 'Proposes CSS selectors for broken post-card targets via Claude Haiku.',
  async execute({ target, domSkeleton }) {
    // ... rederiveSelector body relocated verbatim ...
    return { candidates: parsed.candidates, usage: data.usage };
  },
};
```

**What moves into this file** (from `src/background/index.ts` with verified line numbers):

| Item | Source line | Disposition |
|------|-------------|-------------|
| `REDERIVE_SYSTEM_PROMPT` | L114–141 | Move; re-export for background import |
| `interface RederiveCandidate` | L148–151 | Move; change to `export interface` |
| `interface RederiveModelOutput` | L152–154 | Move; keep private |
| `function isRederiveModelOutput` | L161–172 | Move; keep private |
| `rederiveSelector` body | L258–335 | Becomes `execute()` body |

**The `recordTrace` removal** (RESEARCH.md §trace-recording seam):
The current `rederiveSelector` success path (L319–325) calls `recordTrace`. That call is REMOVED from `execute()`. Instead `execute()` returns `{ candidates: parsed.candidates, usage: data.usage }` and the caller (background handler) records the trace with the returned `usage`.

**`REDERIVE_SYSTEM_PROMPT` re-export** — background still needs it for error-trace calls (L378, L402). Export it and re-import in background:
```typescript
// dom-selector-rederive.tool.ts
export const REDERIVE_SYSTEM_PROMPT = `You are a CSS selector analyst...`;
```

---

### `src/background/index.ts` (MODIFY — handler rewire + rederiveSelector removal)

**Analog:** self. Changes are surgical: remove the functions that move to the tool, add a tool import, rewire the handler.

**Current handler try block** (lines 391–396):
```typescript
try {
  const { candidates } = await rederiveSelector(
    message.target as string,
    message.domSkeleton as string,
  );
  sendResponse({ result: candidates });
```

**Rewired handler try block** (D-06/D-07):
```typescript
try {
  const tool = get<
    { target: string; domSkeleton: string },
    { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }
  >('dom-selector-rederive');
  const { candidates, usage } = await tool.execute({
    target: message.target as string,
    domSkeleton: message.domSkeleton as string,
  });
  recordTrace({          // success trace hoisted from execute() per D-07
    source: 'rederiver',
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: REDERIVE_SYSTEM_PROMPT,
    userPrompt: `Target: ${message.target as string}\n\nDOM skeleton:\n${message.domSkeleton as string}`,
    usage,
  });
  sendResponse({ result: candidates });
```

**Import additions to background/index.ts:**
```typescript
import { get as getTool } from '../shared/tool-registry';
import type { RederiveCandidate } from '../skills/library/dom-selector-rederive/dom-selector-rederive.tool';
import { REDERIVE_SYSTEM_PROMPT } from '../skills/library/dom-selector-rederive/dom-selector-rederive.tool';
```

Import depth from `src/background/` to tool: `../` → `src/` → `skills/library/dom-selector-rederive/` = `'../skills/library/dom-selector-rederive/dom-selector-rederive.tool'` (RESEARCH.md §RederiveCandidate Type Deduplication, confirmed).

**What is REMOVED from background/index.ts** (no longer needed after relocation):
- `const REDERIVE_SYSTEM_PROMPT` (L114–141) — imported from tool instead
- `interface RederiveCandidate` (L148–151) — imported from tool instead
- `interface RederiveModelOutput` (L152–154) — private to tool
- `function isRederiveModelOutput` (L161–172) — private to tool
- `async function rederiveSelector(...)` (L258–335) — body becomes `execute()`

**What STAYS** (D-06): `REDERIVE_COOLOFF_MS` (L144), `REDERIVE_DAILY_CAP` (L146), `checkRateLimit` (L180–222), `acquireRateLimitLatch` (L234–243), `releaseRateLimitLatch` (L247–249), the full `REDERIVE_SELECTOR` handler structure (L362–412).

---

### `src/content/detector/rederiver.ts` (MODIFY — dedup RederiveCandidate, D-08)

**Analog:** self. Single change: remove local `RederiveCandidate` definition (lines 17–20), import it from tool.

**Current local definition** (lines 17–20):
```typescript
/** A single LLM-proposed selector candidate returned from the service worker. */
export interface RederiveCandidate {
  selector: string;
  rationale: string;
}
```

**After dedup** — remove the local definition, add import:
```typescript
export type { RederiveCandidate } from '../../skills/library/dom-selector-rederive/dom-selector-rederive.tool';
```

Import depth from `src/content/detector/` to tool: `../../` → `src/` → `skills/library/dom-selector-rederive/` = `'../../skills/library/dom-selector-rederive/dom-selector-rederive.tool'` (RESEARCH.md §RederiveCandidate Type Deduplication, confirmed).

Note: `LLMRederiver` class (lines 22–52) stays entirely in place. Only the type definition moves.

---

### `src/skills/library/dom-selector-registry/SKILL.md` (MODIFY — CR-01 kind fix)

**Analog:** self. One-line change.

**Current** (line 5): `  kind: exclusion`
**After**: `  kind: tool`

No other changes. This folder is NOT added to `skill-order.json` `tools` array — the fix is metadata documentation only. The body text "NOT wired into any skill array" remains accurate (RESEARCH.md §dom-selector-registry Kind Fix).

---

### `src/skills/library/AUTHORING.md` (MODIFY — tool rule + prefix row)

**Analog:** self. Additive extensions to three sections.

**Current prefix table** (lines 23–28):
```markdown
| Prefix          | Kind                       | Examples                                     |
|-----------------|----------------------------|----------------------------------------------|
| `detect-`       | `signal` and `detector`    | `detect-ai-vocab`, `detect-heuristic`        |
| `exclude-`      | `exclusion`                | `exclude-sponsored`, `exclude-company-page`  |
| `dom-selector-` | the selector registry skill| `dom-selector-registry`                      |
```

**Table row to add** (after `dom-selector-` row):
```markdown
| `dom-selector-` | `tool` (rederive tool); also `exclusion` mislabel (corrected CR-01) | `dom-selector-rederive`, `dom-selector-registry` |
```

The SKILL.md `kind` field extension (line 63 of AUTHORING.md):
```markdown
- `metadata.kind` must be one of `signal`, `exclusion`, `detector`, or `tool`.
```

**New section to add — Skill-vs-Tool Decision Rule (D-01/D-02):**
The I/O boundary is the discriminator. A skill is host-agnostic, deterministic, pure data→result (no network, no `chrome.*`, no runtime DOM query). A tool performs host I/O. Composite detectors (`detect-generic-comments`, `detect-llm`) are composites whose `fetchComments` / `SCORE_POST` fetch IS the tool and whose scoring logic IS the skill. Decomposition of composites is a follow-up.

**New section to add — Tool authoring workflow:**
Four-step workflow mirroring the skill authoring steps:
1. Create `src/skills/library/<name>/` with `SKILL.md` (`kind: tool`) and `<name>.tool.ts` (not `.skill.ts`)
2. Add to `skill-order.json` `tools` array
3. Run `npm run generate-skill-registry` (regenerates both `generated-skill-registry.ts` and `generated-tool-registry.ts`)
4. Run `npm test && npm run check-tool-registry`

---

## Shared Patterns

### Static Import Convention (MV3-CSP-safe)
**Source:** `src/content/skill-registry.ts` lines 40–50 comment block; `src/content/generated-skill-registry.ts` line 11
**Apply to:** `src/shared/tool-registry.ts`, `src/shared/generated-tool-registry.ts`
```typescript
// No dynamic import, no import.meta.glob, no eval — MV3-CSP safe (Phase 30 D-07)
import { domSelectorRederiveTool } from '../skills/library/dom-selector-rederive/dom-selector-rederive.tool';
```

### Import Depth from `src/skills/library/<name>/`
**Source:** `src/skills/library/AUTHORING.md` line 87; `src/skills/library/exclude-sponsored/exclude-sponsored.skill.ts` lines 15–17
**Apply to:** `dom-selector-rederive.tool.ts` imports
```typescript
import type { Tool } from '../../../shared/skills/types';        // 3 levels up
import type { AnthropicUsage } from '../../../shared/classifier'; // 3 levels up
```

### SKILL.md Frontmatter Shape
**Source:** `src/skills/library/exclude-sponsored/SKILL.md` lines 1–6
**Apply to:** `dom-selector-rederive/SKILL.md`
Three mandatory fields only: `name`, `description`, `metadata.kind`. No runtime fields.

### DO-NOT-EDIT Codegen Header
**Source:** `src/content/generated-skill-registry.ts` lines 1–6
**Apply to:** `src/shared/generated-tool-registry.ts`
```typescript
// ============================================================
// DO NOT EDIT — generated by scripts/generate-skill-registry.ts
// Regenerate: npm run generate-skill-registry
// Stale-check: npm run check-tool-registry
// ============================================================
```

### Fire-and-Forget Trace Recording
**Source:** `src/background/index.ts` lines 31–71 (`recordTrace` function + usage pattern at L93–100)
**Apply to:** rewired `REDERIVE_SELECTOR` handler after `tool.execute()` returns
```typescript
// Fire-and-forget — a trace write must never break the response path.
recordTrace({
  source: 'rederiver',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: REDERIVE_SYSTEM_PROMPT,
  userPrompt: `Target: ${target}\n\nDOM skeleton:\n${domSkeleton}`,
  usage,   // AnthropicUsage | undefined — cost degrades to 0 if absent
});
```

### npm Script Pattern (stale-check)
**Source:** `package.json` (verified by RESEARCH.md):
```json
"check-skill-registry": "npm run generate-skill-registry && git diff --exit-code src/content/generated-skill-registry.ts"
```
**Apply to:** new `check-tool-registry` script:
```json
"check-tool-registry": "npm run generate-skill-registry && git diff --exit-code src/shared/generated-tool-registry.ts"
```

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `src/shared/`, `src/content/`, `src/background/`, `src/skills/library/`, `scripts/`
**Files scanned:** 12 source files read (full content)
**Pattern extraction date:** 2026-06-16

### Open Questions Requiring Planner Attention

1. **`REDERIVE_SYSTEM_PROMPT` at error trace sites** — after D-06 moves the const to the tool and the background re-imports it, verify that the two error-trace `recordTrace` calls at L374–383 (no-key path) and L398–406 (catch path) in background still compile. Both reference `REDERIVE_SYSTEM_PROMPT` — the re-import covers them.

2. **`userPrompt` string in success trace** — the current `rederiveSelector` passes `userContent` (which includes retry hint on attempt 2). The hoisted handler trace uses `message.target`/`message.domSkeleton` directly (no retry hint). RESEARCH.md §Open Questions #3 notes this is cosmetic/observability-only. Flag in plan comment but do not block.

3. **`check-tool-registry` CI step** — add to `.github/workflows/ci.yml` after the existing `check-skill-registry` step (same pattern).
