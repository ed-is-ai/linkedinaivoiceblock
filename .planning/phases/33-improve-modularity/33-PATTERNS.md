# Phase 33: Improve Modularity — Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 38 (across five tracks: barrel deletion, tool renames, selector co-location, shared regroup, UX split)
**Analogs found:** 38 / 38 (every destination has a verified analog in the current codebase)

---

## File Classification

| File (source → destination) | Role | Data Flow | Closest Analog | Match Quality |
|------------------------------|------|-----------|----------------|---------------|
| **Track 1 — Barrel deletion** | | | | |
| `src/content/detector/heuristic.ts` → DELETE (barrel) | utility | — | itself (confirmed thin re-export) | exact |
| `src/content/detector/llm.ts` → DELETE (barrel) | utility | — | itself (confirmed thin re-export) | exact |
| `src/content/index.ts` (import repoint ×2) | config | request-response | itself | self |
| `scripts/eval.ts` (import repoint ×1) | utility | batch | itself | self |
| `src/dashboard/evals.tsx` (import repoint ×1) | component | request-response | itself | self |
| `src/content/detector/heuristic.test.ts` (import repoint) | test | — | itself | self |
| `src/content/detector/rederiver.ts` → `src/tools/library/dom-selector-rederive/rederiver.ts` | utility | request-response | `src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts` | role-match |
| **Track 2 — Selector internals + registry rename** | | | | |
| `src/tools/library/dom-selector-registry/SKILL.md` → `TOOL.md` | config | — | `src/tools/library/dom-selector-rederive/TOOL.md` | exact |
| `src/tools/library/dom-selector-registry/dom-selector-registry.skill.ts` → `.tool.ts` | utility | — | `src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts` | exact |
| `src/content/selector/heal.ts` → `src/tools/library/dom-selector-rederive/heal.ts` | service | event-driven | `src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts` | role-match |
| `src/content/selector/heuristic.ts` → `src/tools/library/dom-selector-rederive/heuristic.ts` | utility | transform | `src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts` | role-match |
| `src/content/selector/sanitizer.ts` → `src/tools/library/dom-selector-rederive/sanitizer.ts` | utility | transform | `src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts` | role-match |
| `src/content/selector/validator.ts` → `src/tools/library/dom-selector-rederive/validator.ts` | utility | transform | `src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts` | role-match |
| `src/content/selector/heal.test.ts` → `src/tools/library/dom-selector-rederive/heal.test.ts` | test | — | `src/tools/library/dom-selector-rederive/dom-selector-rederive.test.ts` | exact |
| `src/content/selector/heuristic.test.ts` → `src/tools/library/dom-selector-rederive/heuristic.test.ts` | test | — | `src/tools/library/dom-selector-rederive/dom-selector-rederive.test.ts` | exact |
| `src/content/selector/sanitizer.test.ts` → `src/tools/library/dom-selector-rederive/sanitizer.test.ts` | test | — | `src/tools/library/dom-selector-rederive/dom-selector-rederive.test.ts` | exact |
| `src/content/selector/validator.test.ts` → `src/tools/library/dom-selector-rederive/validator.test.ts` | test | — | `src/tools/library/dom-selector-rederive/dom-selector-rederive.test.ts` | exact |
| `src/content/selector/__fixtures__/` → `src/tools/library/dom-selector-rederive/__fixtures__/` | config | — | (static HTML; no analog needed) | — |
| `src/content/observer.ts` (import repoint heal.ts) | service | event-driven | itself | self |
| **Track 3 — Codegen verify (no-op)** | | | | |
| `src/shared/tool-registry.ts` comment update | config | — | itself (stale comment fix only) | self |
| **Track 4 — src/shared/ regroup** | | | | |
| `src/shared/postStore.ts` → `src/shared/memory/postStore.ts` | service | CRUD | `src/shared/storage.ts` (sibling in new memory/) | role-match |
| `src/shared/postStore.test.ts` → `src/shared/memory/postStore.test.ts` | test | — | co-located pattern (all tests move with impl) | exact |
| `src/shared/queue.ts` → `src/shared/memory/queue.ts` | service | CRUD | `src/shared/storage.ts` (sibling in new memory/) | role-match |
| `src/shared/storage.ts` → `src/shared/memory/storage.ts` | service | CRUD | itself | self |
| `src/shared/traceStore.ts` → `src/shared/memory/traceStore.ts` | service | CRUD | `src/shared/storage.ts` (sibling in new memory/) | role-match |
| `src/shared/traceStore.test.ts` → `src/shared/memory/traceStore.test.ts` | test | — | co-located pattern | exact |
| `src/shared/pricing.ts` → `src/shared/llm/pricing.ts` | service | transform | itself | self |
| `src/shared/pricing.test.ts` → `src/shared/llm/pricing.test.ts` | test | — | co-located pattern | exact |
| `src/shared/signals.ts` → `src/shared/llm/signals.ts` | config | — | itself | self |
| **Track 5 — UX modules split** | | | | |
| `src/dashboard/index.html` → `src/modules/dashboard/index.html` | config | — | `src/popup/index.html` | exact |
| `src/dashboard/index.tsx` → `src/modules/dashboard/index.tsx` | component | request-response | itself | self |
| `src/dashboard/SelectorView.tsx` → `src/modules/dashboard/SelectorView.tsx` | component | request-response | itself | self |
| `src/dashboard/dataManagement.ts` → `src/modules/dashboard/dataManagement.ts` | utility | transform | itself | self |
| `src/dashboard/dataManagement.test.ts` → `src/modules/dashboard/dataManagement.test.ts` | test | — | co-located pattern | exact |
| `src/dashboard/evals.html` → `src/modules/evals/evals.html` | config | — | `src/dashboard/index.html` | exact |
| `src/dashboard/evals.tsx` → `src/modules/evals/evals.tsx` | component | request-response | itself | self |
| `src/dashboard/evalsLabeling.ts` → `src/modules/evals/evalsLabeling.ts` | utility | CRUD | itself | self |
| `src/dashboard/evalsRunEngine.ts` → `src/modules/evals/evalsRunEngine.ts` | service | batch | itself | self |
| `src/dashboard/evals.test.ts` → `src/modules/evals/evals.test.ts` | test | — | co-located pattern | exact |
| `src/popup/index.html` → `src/modules/popup/index.html` | config | — | `src/dashboard/index.html` | exact |
| `src/popup/index.tsx` → `src/modules/popup/index.tsx` | component | request-response | itself | self |
| `src/popup/AccountRow.tsx` → `src/modules/popup/AccountRow.tsx` | component | request-response | itself | self |
| `src/popup/BatchBlockBar.tsx` → `src/modules/popup/BatchBlockBar.tsx` | component | request-response | itself | self |

---

## Pattern Assignments

### Track 1: Barrel Deletion (D-01 / D-02)

#### `src/content/detector/heuristic.ts` and `llm.ts` — delete barrels

These two files are confirmed thin re-export barrels. They are deleted; their 3+1 import sites are repointed directly to the skill folder.

**Current barrel shape** (`src/content/detector/heuristic.ts`, lines 1-9):
```typescript
/**
 * Thin re-export barrel — the HeuristicDetector class definition has moved to
 * src/skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill.ts (Phase 31 Plan 03, D-02).
 * This file exists only to preserve import sites in src/content/index.ts,
 * scripts/eval.ts, and src/content/detector/heuristic.test.ts.
 * DO NOT add class bodies or skill definitions here.
 */
export type { HeuristicDetectorOptions } from '../../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
export { HeuristicDetector } from '../../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
```

**Import repoints after deletion — all importers must use the skill path directly:**

`src/content/index.ts` line 5:
```typescript
// BEFORE:
import { HeuristicDetector } from './detector/heuristic';
// AFTER:
import { HeuristicDetector } from '../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
```

`src/content/index.ts` line 6:
```typescript
// BEFORE:
import { LLMDetector } from './detector/llm';
// AFTER:
import { LLMDetector } from '../skills/library/detect-aiwriting-llm/detect-aiwriting-llm.skill';
```

`src/dashboard/evals.tsx` line 18:
```typescript
// BEFORE:
import { HeuristicDetector } from '../content/detector/heuristic';
// AFTER:
import { HeuristicDetector } from '../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
```
(Note: after Track 5 this file moves to `src/modules/evals/evals.tsx`, so the depth becomes `../../skills/...`)

`scripts/eval.ts` line 30:
```typescript
// BEFORE:
import { HeuristicDetector } from '../src/content/detector/heuristic.js';
// AFTER:
import { HeuristicDetector } from '../src/skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill.js';
```

`src/content/detector/heuristic.test.ts` line 6:
```typescript
// BEFORE:
import { HeuristicDetector } from './heuristic';
// AFTER:
import { HeuristicDetector } from '../../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
```

#### `src/content/detector/rederiver.ts` → `src/tools/library/dom-selector-rederive/rederiver.ts`

Move the file unchanged. Only internal imports change.

**Current file** (`src/content/detector/rederiver.ts`, lines 16-18):
```typescript
import type { RederiveCandidate } from '../../tools/library/dom-selector-rederive/dom-selector-rederive.tool';

export type { RederiveCandidate };
```

**After move to `src/tools/library/dom-selector-rederive/rederiver.ts`**, update the import:
```typescript
// BEFORE:
import type { RederiveCandidate } from '../../tools/library/dom-selector-rederive/dom-selector-rederive.tool';
// AFTER:
import type { RederiveCandidate } from './dom-selector-rederive.tool';
```

**Importer update** — `src/content/selector/heal.ts` line 29 (becomes inner tool path after Track 2):
```typescript
// BEFORE (current heal.ts):
import { LLMRederiver } from '../detector/rederiver';
// AFTER (inside tool folder — Track 2 final location):
import { LLMRederiver } from './rederiver';
```

---

### Track 2: Selector Internals + dom-selector-registry Rename (D-03 / D-04)

#### D-03: `dom-selector-registry` file renames (2-file operation)

**Analog for TOOL.md format** — `src/tools/library/dom-selector-rederive/TOOL.md` (lines 1-6):
```yaml
---
name: dom-selector-rederive
description: "LLM tool that proposes CSS post-card selectors from a PII-stripped DOM skeleton. Calls the Anthropic API (via fetch in the service worker context) and returns ranked candidates with schema validation. Part of the Phase 23 self-healing selector pipeline."
metadata:
  kind: tool
---
```

**Pattern to replicate** for `src/tools/library/dom-selector-registry/TOOL.md` (rename from SKILL.md, content already correct — `metadata.kind: tool` already set, only filename changes):
```yaml
---
name: dom-selector-registry
description: "Runtime source of truth for all DOM selector lookups. ..."
metadata:
  kind: tool
---
```

**Analog for `.tool.ts` naming** — `src/tools/library/dom-selector-rederive/dom-selector-rederive.tool.ts` line 1:
```typescript
/**
 * dom-selector-rederive tool (Phase 32 — TOOL-02).
 * ...
 */
import type { Tool } from '../../../shared/skills/types';
```

Rename `dom-selector-registry.skill.ts` → `dom-selector-registry.tool.ts`. File body is unchanged (confirmed: not imported at runtime, thin re-export only).

#### D-04: Selector internals move to `dom-selector-rederive` tool folder

All five implementation files and four test files relocate from `src/content/selector/` to `src/tools/library/dom-selector-rederive/`.

**heal.ts import updates** (this file coordinates all others; most paths change):

```typescript
// BEFORE (src/content/selector/heal.ts lines 25-30):
import { resolve, insertCandidate } from '../selector-registry';
import { deriveHeuristicCandidates } from './heuristic';
import { validateCandidate } from './validator';
import { buildDomSkeleton } from './sanitizer';
import { LLMRederiver } from '../detector/rederiver';
import { storageGet } from '../../shared/storage';

// AFTER (src/tools/library/dom-selector-rederive/heal.ts):
import { resolve, insertCandidate } from '../../../content/selector-registry';
import { deriveHeuristicCandidates } from './heuristic';
import { validateCandidate } from './validator';
import { buildDomSkeleton } from './sanitizer';
import { LLMRederiver } from './rederiver';
// NOTE: after Track 4, storage path becomes:
import { storageGet } from '../../../shared/memory/storage';
// If Track 2 executes before Track 4, use the interim path:
import { storageGet } from '../../../shared/storage';
```

**heuristic.ts import update** (one path change):
```typescript
// BEFORE (src/content/selector/heuristic.ts):
import { resolve } from '../selector-registry';
// AFTER (src/tools/library/dom-selector-rederive/heuristic.ts):
import { resolve } from '../../../content/selector-registry';
```

**sanitizer.ts and validator.ts**: No import path changes (they have no imports from `selector-registry` or `shared/`; verify by inspection before executing).

**heal.test.ts import update**:
```typescript
// BEFORE (src/content/selector/heal.test.ts):
import { storageGet } from '../../shared/storage';
// AFTER (src/tools/library/dom-selector-rederive/heal.test.ts):
import { storageGet } from '../../../shared/storage';
// (or '../../../shared/memory/storage' if Track 4 has already run)
```

**observer.ts import repoint** (`src/content/observer.ts` line 15):
```typescript
// BEFORE:
import { triggerHeal, isFeedUrl, hasFeedContainer } from './selector/heal';
// AFTER:
import { triggerHeal, isFeedUrl, hasFeedContainer } from '../tools/library/dom-selector-rederive/heal';
```

**Analog: tool test file structure** — `src/tools/library/dom-selector-rederive/dom-selector-rederive.test.ts` (lines 14-18):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  domSelectorRederiveTool,
  type RederiveCandidate,
} from './dom-selector-rederive.tool';
```
All moved test files must use `./` relative imports for sibling files (same tool folder).

**Target folder shape after Tracks 1+2:**
```
src/tools/library/dom-selector-rederive/
  TOOL.md                              (existing)
  dom-selector-rederive.tool.ts        (existing)
  dom-selector-rederive.test.ts        (existing)
  rederiver.ts                         (moved from content/detector/)
  heal.ts                              (moved from content/selector/)
  heuristic.ts                         (moved from content/selector/)
  sanitizer.ts                         (moved from content/selector/)
  validator.ts                         (moved from content/selector/)
  heal.test.ts                         (moved from content/selector/)
  heuristic.test.ts                    (moved from content/selector/)
  sanitizer.test.ts                    (moved from content/selector/)
  validator.test.ts                    (moved from content/selector/)
  __fixtures__/
    feed-abvariant-a.html
    feed-abvariant-b.html
    feed-broken-classrot.html
    feed-empty.html
    feed-healthy.html
    feed-jobcards.html
    feed-loggedout.html
    feed-pii-rich.html
    feed-promoted.html
    feed-skeleton.html
```

---

### Track 3: Codegen Verify (D-05 — no code change required)

Track 3 is a verification-only step. `scripts/generate-skill-registry.ts` already produces both generated files in a single run (verified: lines 268 and 327 of the script).

**Stale comment to fix** in `src/shared/tool-registry.ts` — change any reference from `src/skills/library/<name>/` to `src/tools/library/<name>/` (the post-32 refactor moved tools; the comment was not updated).

**Verification commands (run after Tracks 1 and 2):**
```bash
npm run generate-skill-registry
npm run check-skill-registry && npm run check-tool-registry
```

---

### Track 4: src/shared/ Regroup (D-06)

#### Pattern: sibling relative imports stay unchanged when both files move together

Files that import each other within the same future subfolder do NOT need path updates for those cross-references:

```typescript
// src/shared/postStore.ts (before move) — imports from sibling:
import { storageGet, storageSet } from './storage';
// src/shared/memory/postStore.ts (after move) — same relative path still works:
import { storageGet, storageSet } from './storage';
// (storage.ts is also moving to memory/ — relative path is preserved)
```

#### Pattern: importer path depth increases by one segment for all external callers

**Analog for the depth change** — `src/content/index.ts` lines 11-14 (current imports from `src/shared/`):
```typescript
import { storageGet, storageSet } from '../shared/storage';
import { persistFlaggedAccount } from '../shared/queue';
import { persistStoredPost, persistUnflaggedPost } from '../shared/postStore';
import { AI_LANGUAGE_SIGNALS } from '../shared/signals';
```

After Track 4 all four of these become:
```typescript
import { storageGet, storageSet } from '../shared/memory/storage';
import { persistFlaggedAccount } from '../shared/memory/queue';
import { persistStoredPost, persistUnflaggedPost } from '../shared/memory/postStore';
import { AI_LANGUAGE_SIGNALS } from '../shared/llm/signals';
```

**Full importer repoint list for `storage.ts → memory/storage.ts`** (most widely imported):

| Importer | Old | New |
|----------|-----|-----|
| `src/background/index.ts` L6 | `'../shared/storage'` | `'../shared/memory/storage'` |
| `src/content/index.ts` L11 | `'../shared/storage'` | `'../shared/memory/storage'` |
| `src/content/selector-registry.ts` | `'../shared/storage'` | `'../shared/memory/storage'` |
| `src/content/skill-registry.ts` | `'../shared/storage'` | `'../shared/memory/storage'` |
| `src/dashboard/index.tsx` L7 | `'../shared/storage'` | `'../shared/memory/storage'` (→ `../../shared/memory/storage` after Track 5) |
| `src/tools/library/dom-selector-rederive/heal.ts` | (varies by T2 interim path) | `'../../../shared/memory/storage'` |
| `src/tools/library/dom-selector-rederive/heal.test.ts` | (varies) | `'../../../shared/memory/storage'` |

**Full importer repoint list for `pricing.ts → llm/pricing.ts`**:

| Importer | Old | New |
|----------|-----|-----|
| `src/background/index.ts` L4 | `'../shared/pricing'` | `'../shared/llm/pricing'` |
| `src/dashboard/evals.tsx` L19 | `'../shared/pricing'` | `'../shared/llm/pricing'` (→ `../../shared/llm/pricing` after Track 5) |
| `scripts/eval.ts` L13 | `'../src/shared/pricing.js'` | `'../src/shared/llm/pricing.js'` |
| `scripts/trace-summary.ts` L8 | `'../src/shared/pricing.js'` | `'../src/shared/llm/pricing.js'` |

**Remaining single-importer repoints**:
- `traceStore.ts`: `src/background/index.ts` L5 `'../shared/traceStore'` → `'../shared/memory/traceStore'`
- `queue.ts`: `src/content/index.ts` L12 `'../shared/queue'` → `'../shared/memory/queue'`
- `postStore.ts`: three importers (see RESEARCH.md Track 4 table)
- `signals.ts`: `src/content/index.ts` L14 `'../shared/signals'` → `'../shared/llm/signals'`

**Files that stay at `src/shared/` root (not moved):**
- `generated-tool-registry.ts` — codegen script hardcodes this output path
- `generated-tool-registry.test.ts` — stays with generated file
- `tool-registry.ts` — consumed by `src/background/index.ts`; low value in moving
- `types.ts` — neutral cross-cutting (D-06 locked: stays at root)
- `eval/` subfolder — already exists; unchanged
- `skills/` subfolder — already exists; unchanged

---

### Track 5: UX Modules Split (D-07 / D-08 / D-09)

#### Pattern: HTML entry point structure (unchanged after move)

**Analog** — `src/dashboard/index.html` (lines 1-12):
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LinkedIn Blocker — Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

The `<script type="module" src="./index.tsx">` is co-located relative (`./`). After the move to `src/modules/dashboard/index.html`, the `.tsx` file is co-located in the same new folder — the `src` attribute is unchanged.

**Analog** — `src/dashboard/evals.html` uses `src="./evals.tsx"` — also relative, also unchanged after move to `src/modules/evals/evals.html`.

#### Pattern: vite.config.ts — `additionalInputs` path relative to `root: 'src'`

**Current** `vite.config.ts` (lines 1-19):
```typescript
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [
    preact(),
    webExtension({
      manifest: 'manifest.json',
      additionalInputs: ['dashboard/evals.html'],
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
```

**After Track 5**, only `additionalInputs` changes (path is relative to `root: 'src'`):
```typescript
    webExtension({
      manifest: 'manifest.json',
      additionalInputs: ['modules/evals/evals.html'],
    }),
```

#### Pattern: manifest.json — three HTML entry point fields to repoint

**Current** `src/manifest.json` (relevant fields):
```json
{
  "action": {
    "default_popup": "popup/index.html"
  },
  "options_ui": {
    "page": "dashboard/index.html",
    "open_in_tab": true
  },
  "web_accessible_resources": [
    {
      "resources": ["dashboard/evals.html"],
      "matches": ["https://www.linkedin.com/*"]
    }
  ]
}
```

**After Track 5:**
```json
{
  "action": {
    "default_popup": "modules/popup/index.html"
  },
  "options_ui": {
    "page": "modules/dashboard/index.html",
    "open_in_tab": true
  },
  "web_accessible_resources": [
    {
      "resources": ["modules/evals/evals.html"],
      "matches": ["https://www.linkedin.com/*"]
    }
  ]
}
```

#### Pattern: import depth increases from `../shared/` to `../../shared/` for all module files

**Analog** — `src/dashboard/index.tsx` line 7 (current, `src/dashboard/`):
```typescript
import { storageSet } from '../shared/storage';
```

After move to `src/modules/dashboard/index.tsx`:
```typescript
import { storageSet } from '../../shared/memory/storage';
//                         ^^         ^^^^^^ (Track 4 new path, combine both)
```

**Analog** — `src/popup/index.tsx` line 4 (current):
```typescript
import type { FlaggedAccount, DailyStats, StoredPost, Settings } from '../shared/types';
```

After move to `src/modules/popup/index.tsx`:
```typescript
import type { FlaggedAccount, DailyStats, StoredPost, Settings } from '../../shared/types';
```

**Full internal repoint list for `src/modules/evals/evals.tsx`** (most complex — combines Track 1, 4, and 5 changes):
```typescript
// BEFORE (src/dashboard/evals.tsx lines 1-21):
import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { StoredPost, UnflaggedPost } from '../shared/types';
import { buildPostData, appendEvalRun, getEvalRuns, summarize, compareRuns } from '../shared/eval/index';
import { assembleRun } from './evalsRunEngine';
import { HeuristicDetector } from '../content/detector/heuristic';
import { MODEL_PRICING, computeCostUsd } from '../shared/pricing';
import { labelPost, seedLabels, countLabeled } from './evalsLabeling';

// AFTER (src/modules/evals/evals.tsx):
import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { StoredPost, UnflaggedPost } from '../../shared/types';
import { buildPostData, appendEvalRun, getEvalRuns, summarize, compareRuns } from '../../shared/eval/index';
import { assembleRun } from './evalsRunEngine';
import { HeuristicDetector } from '../../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
import { MODEL_PRICING, computeCostUsd } from '../../shared/llm/pricing';
import { labelPost, seedLabels, countLabeled } from './evalsLabeling';
```

**`src/modules/evals/evalsLabeling.ts`** (one import change, combines Track 4):
```typescript
// BEFORE:
import { ... } from '../shared/postStore';
// AFTER:
import { ... } from '../../shared/memory/postStore';
```

#### Target folder shapes after Track 5

```
src/modules/
  dashboard/
    index.html       (moved from src/dashboard/)
    index.tsx        (moved)
    SelectorView.tsx (moved)
    dataManagement.ts (moved)
    dataManagement.test.ts (moved)
  evals/
    evals.html       (moved from src/dashboard/)
    evals.tsx        (moved)
    evalsLabeling.ts (moved)
    evalsRunEngine.ts (moved)
    evals.test.ts    (moved)
  popup/
    index.html       (moved from src/popup/)
    index.tsx        (moved)
    AccountRow.tsx   (moved)
    BatchBlockBar.tsx (moved)
```

---

## Shared Patterns

### 1. Skill/Tool folder self-containment convention

**Source:** `src/tools/library/dom-selector-rederive/` (existing, post-32 shape)
**Apply to:** All files moved into `src/tools/library/dom-selector-rederive/` (Tracks 1+2)

The target convention: every file in a tool folder imports siblings with `./` relative paths, and imports from outside the tool folder using repo-rooted relative paths (e.g., `'../../../content/selector-registry'`, `'../../../shared/memory/storage'`). No barrel re-exports from within the tool folder to external consumers — callers import the specific tool file directly.

### 2. Co-located test discovery (no vitest config change)

**Source:** `vitest.config.ts` — `include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']`
**Apply to:** All moved test files (Tracks 1, 2, 4, 5)

All moved test files remain under `src/` so vitest auto-discovers them. No vitest config change needed. Test files must retain the `.test.ts` suffix.

### 3. Barrel deletion — no intermediate barrel left behind

**Source:** D-02 principle ("thin re-exports become direct imports at call sites — do not keep barrels")
**Apply to:** Track 1 barrel deletion

When a barrel file is deleted, all callers update to the direct import path. No replacement barrel is created at the old path.

### 4. Generated file regeneration after skill/tool moves

**Source:** `scripts/generate-skill-registry.ts` + `npm run check-skill-registry`
**Apply to:** After Tracks 1 and 2

After any move of a skill or tool file, run:
```bash
npm run generate-skill-registry
npm run check-skill-registry && npm run check-tool-registry
```
The generated files are committed. Never hand-edit them.

### 5. CLAUDE.md constraint #1 — selector-registry.ts must not move

**Source:** `CLAUDE.md` Critical Constraint #1
**Apply to:** Tracks 2 and 4

`src/content/selector-registry.ts` is the single-writer for selector strings. It MUST NOT be moved or have its write surface duplicated. The `src/tools/library/dom-selector-registry/` folder is a thin re-export for convention completeness only — the singleton stays in `src/content/`.

### 6. Zero-behavior-change gate (per track)

**Source:** All prior refactor phases (29–32) + CONTEXT.md guardrail
**Apply to:** Every track

Each track must pass before the next begins:
```bash
npm test && npm run type-check
```
After Tracks 1+2 also run:
```bash
npm run check-skill-registry && npm run check-tool-registry
```
After Track 5 also run:
```bash
npm run build
# Then verify dist/modules/{popup,dashboard,evals}/ all exist
```

---

## No Analog Found

No files in this phase lack a codebase analog. Every destination pattern exists in the current codebase:
- Tool folder convention: `src/tools/library/dom-selector-rederive/`
- Skill folder convention: `src/skills/library/detect-aiwriting-heuristic/`
- Module HTML entry: `src/dashboard/index.html` / `src/popup/index.html`
- Shared subfolder concern grouping: `src/shared/eval/`, `src/shared/skills/` (existing folders)

---

## Files Confirmed as NOT Moving (must not be forced)

| File | Reason |
|------|--------|
| `src/content/selector-registry.ts` | CLAUDE.md #1 single-writer invariant — must stay in content/ |
| `src/content/detector/signals/profile.ts` | Imports `resolve()` from selector-registry; called by content/index.ts; genuinely shared infra (D-02) |
| `src/content/detector/comment-expand.ts` | DOM I/O + page-scope state; content pipeline shared infra (D-02) |
| `src/content/detector/language.ts` | Shared by content/exclusions.ts AND exclude-non-english skill (D-02) |
| `src/content/detector/tombstone.ts` | DOM injection; content pipeline cross-cutting utility (D-02) |
| `src/shared/generated-tool-registry.ts` | Codegen script hardcodes output path; moving requires script update |
| `src/shared/generated-tool-registry.test.ts` | Stays co-located with generated file |
| `src/shared/tool-registry.ts` | Consumed by src/background/index.ts; low value in moving |
| `src/shared/types.ts` | D-06 locked: neutral cross-cutting; stays at shared root |
| `src/shared/eval/` | D-06: already a correctly-named subfolder; unchanged |
| `src/shared/skills/` | D-06: already a correctly-named subfolder; unchanged |

---

## Metadata

**Analog search scope:** `src/tools/library/`, `src/skills/library/`, `src/content/`, `src/dashboard/`, `src/popup/`, `src/shared/`, `vite.config.ts`, `src/manifest.json`
**Files read for pattern extraction:** 18 source files + 2 config files
**Pattern extraction date:** 2026-06-17
