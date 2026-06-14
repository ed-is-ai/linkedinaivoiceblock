# Phase 27: Eval Improvements — Research

**Researched:** 2026-06-14
**Domain:** Node CLI eval harness extension — engine alignment, error analysis, labeling workflow, results viewer
**Confidence:** HIGH — all findings verified from live codebase source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Re-point the eval from `classifyPost` (raw LLM call) to the real detector pipeline the extension ships. The eval must exercise `HeuristicDetector` or `LLMDetector(heuristic)` — not the standalone `classifyPost` bypassing the detector interface.
- **D-02:** Engine must be **selectable** in the eval (heuristic vs LLM) so the two can be compared on the same labeled dataset. Exact mechanism and default are planning decisions.
- **D-03:** Engine alignment resolves the signal-name mismatch: LLM path emits its own vocabulary; heuristic engine emits names like `listicle-cta`, `buzzword`, `em-dash`, `cta`, `hook-story`, `motivational`, `impersonal`, `ai-vocab`, `generic-comments` — matching the `flaggedAccounts.signals` shape stored in the export.
- **D-04:** `HeuristicDetector` is **already DOM-free by design**. No `document.`/`chrome.`/selector literals present. `fetchComments` is an injectable optional (pass `[]` stub in eval). Whether to import from `src/content/detector/` directly or re-home to `src/shared/` is a planning/research decision — direct import is plausible since it is already pure.
- **D-05:** At the best-F1 threshold, list false positives (true `human`, predicted AI) and false negatives (true `ai`, predicted human) with score, `signalBreakdown`, optional reasoning, and `textPreview`. Persist alongside existing per-post `posts[]` detail and/or terminal output. Exact presentation is a planning decision.
- **D-06:** Reduce manual JSON-editing burden of adding `"label": "ai"|"human"` to export entries. Mechanism is open (CLI helper vs dashboard affordance) but must write labels back into the existing export shape. Lean CLI-first is the working assumption.
- **D-07:** Provide a way to read results beyond raw `results-YYYY-MM-DD.json` and diff runs over time (e.g. compare best-F1 / precision / recall / cost across two result files). Output format is a planning decision. Stays terminal/report-based — no charting UI.

### Claude's Discretion

Engine-selection flag naming/defaults, FP/FN output formatting, results-viewer rendering format, and the labeling-helper UX — all within the constraints above.

### Deferred Ideas (OUT OF SCOPE)

- Aggregate signal report across all posts (which signals discriminate AI vs human on average).
- Dashboard labeling UI (full in-extension click-to-label).
- Results charting UI.
- Changing detector scoring logic or thresholds.
- New extension UI surfaces beyond what labeling/results strictly need.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVAL-06 | Engine alignment: eval scores posts through `HeuristicDetector` or `LLMDetector` (engine selectable), not raw `classifyPost` | `HeuristicDetector` confirmed DOM-free; `LLMDetector` has chrome coupling — needs proxy; `PostData` shape vs export shape gap documented |
| EVAL-07 | Error analysis: at best-F1 threshold, surface FP/FN posts with score, signalBreakdown, reasoning, textPreview | Per-post `details[]` array already exists in results JSON; FP/FN filter is a post-hoc pass at threshold |
| EVAL-08 | Labeling workflow: reduce manual JSON-editing burden; labels written back into existing export shape | In-place JSON rewrite pattern with idempotent label merge documented below |
| EVAL-09 | Results viewer / run comparison: terminal-table or markdown format; diff two result files on key metrics | Diff is straightforward arithmetic on two parsed results JSONs; all metrics already present in results schema |

Note: EVAL-06 through EVAL-09 IDs are named in the ROADMAP but have no definition yet in REQUIREMENTS.md — they are to be finalized at planning time. The four deliverables map 1:1 to these IDs per the ROADMAP.
</phase_requirements>

---

## Summary

Phase 27 extends `scripts/eval.ts` in four largely independent areas. Engine alignment (EVAL-06) is foundational and sequences first because FP/FN analysis and results comparison are only meaningful when the eval measures the shipped detector. The core change is replacing the `classifyPost(text, key)` scoring call with `detector.detect(postData)` behind a `--engine` flag; `HeuristicDetector` is directly importable from `src/content/detector/heuristic.ts` without any re-homing because it is already completely DOM-free. `LLMDetector` in `src/content/detector/llm.ts` however communicates via `chrome.runtime.sendMessage` and therefore cannot be imported directly in Node — the eval's LLM path must continue to use `classifyPost` from `src/shared/classifier.ts`, wrapping the result to match the `DetectionResult` shape. This means the eval has two distinct engine implementations: (a) `HeuristicDetector` from its source location (direct import, free, no API key needed), and (b) the LLM path via `classifyPost` (existing, requires key). Building `PostData` from export entries requires mapping `text` → `postText` plus fabricated but stable author fields; no fields are missing that would block detection.

Error analysis (EVAL-07) is a post-hoc filter pass on the already-accumulated `details[]` at the best-F1 threshold — no structural changes to the scoring loop. Labeling workflow (EVAL-08) is best implemented as a second CLI script (`scripts/eval-label.ts` / `npm run eval-label`) that reads an export JSON and writes labeled entries back in-place, idempotently. Results viewer (EVAL-09) is a third CLI script (`scripts/eval-compare.ts` / `npm run eval-compare`) that accepts two `results-*.json` paths and prints a diff table.

**Primary recommendation:** Implement in sequence — engine alignment first (changes the scoring loop, the `PostData` builder, the engine flag, and cost-reporting conditionalization), then FP/FN error analysis (adds a post-hoc section), then labeling helper (new script, no coupling to eval.ts changes), then results viewer (new script, standalone). All four can be planned as separate tasks in a single wave.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Heuristic scoring in eval | `scripts/eval.ts` (direct import of `HeuristicDetector`) | — | `HeuristicDetector` is DOM-free; no tier boundary needed |
| LLM scoring in eval | `scripts/eval.ts` via `classifyPost` from `src/shared/classifier.ts` | — | `LLMDetector` uses `chrome.runtime` — cannot run in Node; `classifyPost` is the established LLM path for Node |
| Engine selection | `scripts/eval.ts` argv parsing (`--engine` flag) | — | CLI owns configuration; no runtime chrome coupling |
| PostData construction | `scripts/eval.ts` (builder helper) | — | Eval owns its data mapping; no shared module needed |
| Error analysis (FP/FN) | `scripts/eval.ts` post-hoc filter | — | Uses already-accumulated `details[]`; no new pass needed |
| Labeling helper | `scripts/eval-label.ts` (new standalone script) | — | Separate concern; idempotent in-place rewrite; no dependency on eval.ts |
| Results viewer / diff | `scripts/eval-compare.ts` (new standalone script) | — | Reads two result JSONs; purely additive; no changes to eval.ts |
| Cost reporting | `scripts/eval.ts` (conditional on engine) | `src/shared/pricing.ts` | Heuristic engine has no `usage` — skip cost accumulation; LLM engine accumulates via `computeCostUsd` |

---

## Key Research Finding: HeuristicDetector Import Strategy (D-04)

**Verdict: Direct import from `src/content/detector/heuristic.ts` is safe and correct. No re-homing needed.**

### Evidence (verified from source)

`src/content/detector/heuristic.ts` (read in full):

- File header explicitly states: "This file intentionally contains NO references to `document.`, `chrome.`, or any LinkedIn selector literals."
- Imports are: `import type { PostData, DetectionResult, Detector } from '../../shared/types'` (type-only, zero runtime), plus 9 pure signal functions from `./signals/` submodules.
- The `fetchComments` constructor argument is an injectable optional (`fetchComments?: (post: PostData) => Promise<string[]>`). In the eval, pass no argument or `{ fetchComments: async () => [] }` to skip comment fetching.
- All 9 signal modules (`listicle.ts`, `buzzwords.ts`, `em-dash.ts`, `cta.ts`, `comments.ts`, `ai-vocab.ts`, `hook-story.ts`, `motivational.ts`, `impersonal.ts`) are pure functions — no DOM, no imports beyond primitive types.
- `profile.ts` exists in `signals/` but is NOT imported by `heuristic.ts` (profile scoring is a separate path).

**What direct import looks like in eval.ts:**
```typescript
// Source: verified from heuristic.ts imports and signal module structure
import { HeuristicDetector } from '../src/content/detector/heuristic.js';
```
This is an ESM import (`.js` extension required under tsx, per established pattern in `trace-summary.ts` L8). No `chrome.*` or `document.*` is pulled in transitively.

**Why NOT re-homing to `src/shared/`:**
The Phase 26 RESEARCH.md (classifier extraction D-01) moved `classifyPost` to `src/shared/` because the SERVICE WORKER also consumes it. `HeuristicDetector` is only consumed by the content script (in production) and now the eval CLI. Moving it to `src/shared/` would signal that service workers or other shared consumers use it — which is incorrect and could mislead future maintainers. Leave it in `src/content/detector/` where it belongs architecturally. [VERIFIED: live source read]

### LLMDetector Import Strategy — Cannot Use in Node

`src/content/detector/llm.ts` (read in full):

```typescript
// Source: src/content/detector/llm.ts — the problematic line
chrome.runtime.sendMessage({ type: 'SCORE_POST', postText }, (response) => { ... });
```

`LLMDetector.detect()` delegates to `chrome.runtime.sendMessage`. This API does not exist in Node. Importing `LLMDetector` in eval.ts would fail at runtime when `detect()` is called (not even at import time, since `chrome` is only referenced inside the method body — but calling it throws "chrome is not defined").

**Conclusion:** The eval's "LLM engine" path uses `classifyPost` directly from `src/shared/classifier.ts` (already the Phase 26 pattern) wrapped to emit `DetectionResult`. This is architecturally correct: the eval's LLM path exercises the same `classifyPost` function the real `LLMDetector` calls (via the service worker), just without the chrome.runtime relay layer.

---

## Key Research Finding: PostData Fields vs Export Entry Fields

### PostData interface (verified from `src/shared/types.ts`)

```typescript
interface PostData {
  urn: string;
  authorId: string;
  authorName: string;
  authorProfileUrl: string;
  postText: string;
}
```

### Export entry shapes (verified from Phase 26 RESEARCH.md + types.ts)

`flaggedPosts[]` entries carry:
```typescript
{ urn, authorId, authorName, text, score, hiddenAt, label? }
```

`unflaggedPosts[]` entries carry:
```typescript
{ urn, authorId, authorName, text, score, seenAt, engineUsed?, label? }
```

### Field mapping

| PostData field | Export field | Gap? |
|----------------|--------------|------|
| `urn` | `urn` | None |
| `authorId` | `authorId` | None |
| `authorName` | `authorName` | None |
| `authorProfileUrl` | not present | **Gap — stub required** |
| `postText` | `text` | Rename only |

**Gap:** `authorProfileUrl` is not in the export entries. `HeuristicDetector.detect()` accepts `PostData` but does NOT use `authorProfileUrl` in any signal computation (verified: all 9 signal functions take only `postText: string` or `post: PostData` but only access `post.postText` or `comments`). The profile signals module (`profile.ts`) is not called by `HeuristicDetector`. A stub value is safe:

```typescript
// Source: inferred from HeuristicDetector.detect() signal pipeline — no signal uses authorProfileUrl
const postData: PostData = {
  urn: entry.urn ?? '',
  authorId: entry.authorId ?? '',
  authorName: entry.authorName ?? '',
  authorProfileUrl: `https://www.linkedin.com/in/${entry.authorId ?? 'unknown'}/`,
  postText: entry.text ?? '',
};
```

`fetchComments` stub: pass no `HeuristicDetectorOptions` (default is `{}`, meaning `fetchComments` is undefined) so the `score > 20 && this.options.fetchComments !== undefined` gate at step 4 never fires. This means `generic-comments` will never appear in the heuristic eval's `signalBreakdown` — document this as expected behavior. [VERIFIED: live source read]

---

## Key Research Finding: Engine Selection Mechanism (D-02)

### Recommended: `--engine heuristic|llm` CLI flag

The existing `scripts/eval.ts` arg parsing reads `process.argv[2]` as the file path. Adding `--engine` before or after the file path is the natural Node CLI pattern. Recommended parsing:

```typescript
// Recommended pattern — no new dependencies
const args = process.argv.slice(2);
const engineFlagIdx = args.indexOf('--engine');
const engine: 'heuristic' | 'llm' =
  engineFlagIdx !== -1 && args[engineFlagIdx + 1] === 'heuristic'
    ? 'heuristic'
    : 'llm';  // default: llm (preserves Phase 26 behavior)
const filePath = args.find(a => !a.startsWith('--') && a !== args[engineFlagIdx + 1]);
```

**Default: `llm`** — preserves backward compatibility with Phase 26 behavior and existing `eval-instructions.md`. A user who has already been running `npm run eval -- file.json` sees no change. The heuristic engine is the new opt-in.

**API key guard conditionalization:** The API key check currently exits non-zero if `ANTHROPIC_API_KEY` is not set. With engine selection, this check must be conditioned on `engine === 'llm'`. The heuristic engine is free — no key needed.

**Cost reporting conditionalization:** The `cost: { totalUsd, avgUsdPerPost }` section in the results JSON is LLM-only. For the heuristic engine, output `cost: null` (or omit / set to 0 with an `engine` field indicating "free"). The terminal summary line should omit cost for the heuristic engine or show `cost: free`.

**`engineUsed` field:** `HeuristicDetector.detect()` already returns `engineUsed: 'heuristic'` in `DetectionResult`. The eval's `details[]` records already capture this field — no change needed to the detail schema.

---

## Key Research Finding: Error Analysis (EVAL-07 / D-05)

### What already exists

The `details[]` array in `results-YYYY-MM-DD.json` already captures per-post:
```typescript
interface PostDetail {
  index: number;
  label: 'ai' | 'human';
  score: number;
  confidence: 'high' | 'medium' | 'low';
  signalBreakdown: Record<string, number>;
  reasoning?: string;        // LLM engine only
  textPreview: string;       // 80 chars
}
```

### Recommended approach: post-hoc filter in the existing results JSON + terminal section

After the threshold sweep, add a pass that filters `details` at `bestF1Threshold`:

```typescript
// Source: inferred from existing results schema and eval.ts threshold logic
const bestRow = thresholdRows.find(r => r.threshold === bestF1Threshold)!;
const falsePositives = details.filter(d => d.label === 'human' && d.score >= bestF1Threshold);
const falseNegatives = details.filter(d => d.label === 'ai'    && d.score <  bestF1Threshold);
```

**Persist:** Extend the results JSON object with:
```typescript
errorAnalysis: {
  threshold: bestF1Threshold,
  falsePositives: PostDetail[],   // true human, predicted AI
  falseNegatives: PostDetail[],   // true ai, predicted human
}
```

**Terminal output:** Print a dedicated section after the threshold table, listing each FP/FN with score, signalBreakdown (via existing `formatSignalBreakdown`), and textPreview. Reasoning is printed when present (LLM engine).

This is a zero-cost, zero-API-call addition — purely post-hoc filtering of already-computed data.

---

## Key Research Finding: Labeling Workflow (EVAL-08 / D-06)

### Problem

The user must open the downloaded export JSON in a text editor and manually add `"label": "ai"` or `"label": "human"` to each post entry. For dozens of posts this is error-prone (formatting errors break the JSON) and slow.

### Recommended approach: `scripts/eval-label.ts` (new interactive CLI)

A new script `npm run eval-label -- <export.json>` that:

1. Reads the export JSON
2. Iterates unlabeled posts (those missing `label` or with `label === undefined`)
3. For each, prints the `textPreview` (first 120 chars) + existing `score`
4. Reads a single keypress: `a` (ai), `h` (human), `s` (skip), `q` (quit)
5. After each decision, writes the updated JSON back in-place atomically
6. Reports a summary at the end

**In-place rewrite pattern (safe, idempotent):**

```typescript
// Source: Node.js fs — standard pattern
import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync(filePath, 'utf8'));
// ... mutate data.flaggedPosts[i].label = 'ai'
writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
```

Writing back on each decision (not just at quit) means partial progress is preserved if the user exits early. The original fields are preserved because we only add/update the `label` field — the shape contract from CONTEXT.md (labels written into the existing export shape) is satisfied. [ASSUMED: Node readline/keypress interaction — standard Node.js capability but specific API choice is a planning decision]

**Keypress reading in Node (no new packages):**
```typescript
// Source: Node.js readline — standard library, no npm package needed
import readline from 'readline';
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.once('data', (key) => { ... });
```

This requires no new npm dependencies. `readline` is a Node built-in. [VERIFIED: Node.js standard library]

**Alternative considered: non-interactive batch approach.** A `--label-all-flagged ai` flag that bulk-labels all `flaggedPosts[]` entries as `ai` and all `unflaggedPosts[]` as `human` with a single command — faster for the common case where flagged posts are truly AI and unflagged are truly human. This could be a second mode of `eval-label`. The interactive per-post mode remains valuable for reviewing ambiguous cases.

---

## Key Research Finding: Results Viewer / Run Comparison (EVAL-09 / D-07)

### Results schema (already comprehensive)

`eval/results-YYYY-MM-DD.json` already contains everything needed for comparison:
- `runAt`, `inputFile`, `model`
- `counts: { total, labeled, skipped, errored, scored }`
- `cost: { totalUsd, avgUsdPerPost }`
- `thresholds[]` — full sweep with tp/fp/tn/fn/precision/recall/f1/accuracy at each threshold
- `bestF1Threshold`
- `posts[]` — per-post detail

After Phase 27 engine alignment, `results` will also carry an `engine` field and (for heuristic runs) `cost: null`.

### Recommended approach: `scripts/eval-compare.ts` (new standalone CLI)

```
npm run eval-compare -- eval/results-2026-06-13.json eval/results-2026-06-14.json
```

Output:

```
Run comparison: results-2026-06-13 vs results-2026-06-14

Engine:            llm                    heuristic
Posts scored:      12                     12
Best F1 @T:        50                     45
  Precision:       0.900                  0.750
  Recall:          0.900                  0.833
  F1:              0.900                  0.789
  Accuracy:        0.917                  0.833
Total cost:        $0.0148                free
Avg cost/post:     $0.0012                free
```

**Implementation:**
```typescript
// Source: inferred from results JSON schema
const a = JSON.parse(readFileSync(fileA, 'utf8'));
const b = JSON.parse(readFileSync(fileB, 'utf8'));

const bestA = a.thresholds.find(r => r.threshold === a.bestF1Threshold);
const bestB = b.thresholds.find(r => r.threshold === b.bestF1Threshold);
// ... print aligned two-column table via padEnd/padStart
```

No new npm dependencies. This is purely string arithmetic. [VERIFIED: results schema from live eval.ts]

**Optional: markdown report mode.** `--format markdown` flag that emits a GitHub-flavored markdown table suitable for pasting into a PR description. Same data, different rendering. [ASSUMED: planning decision — include only if cheap]

---

## Architecture Patterns

### System Architecture (Phase 27 eval pipeline)

```
labeled-export.json
        |
        v
scripts/eval.ts
   --engine heuristic|llm
        |
   [heuristic]                   [llm]
        |                           |
        v                           v
HeuristicDetector               classifyPost()
(direct import,                 (src/shared/classifier.ts,
 no API key)                     ANTHROPIC_API_KEY env var)
        |                           |
        v                           v
DetectionResult                 DetectionResult
(score, signalBreakdown,        (score, signalBreakdown,
 engineUsed:'heuristic')         engineUsed:'llm',
                                 reasoning, usage)
        |                           |
        +-----------+---------------+
                    |
                    v
          ScoredEntry[]  +  PostDetail[]
                    |
                    v
          threshold sweep (post-hoc, no API calls)
                    |
                    v
          best-F1 identified
                    |
               [D-05 FP/FN filter]
                    |
                    v
          results-YYYY-MM-DD.json
          (thresholds, bestF1Threshold,
           posts[], errorAnalysis{})
                    |
          terminal table + summary line

scripts/eval-label.ts  <-- separate script, reads/writes export.json
scripts/eval-compare.ts <-- separate script, reads two results JSONs
```

### Recommended Project Structure Changes

```
scripts/
├── eval.ts              # MODIFIED: engine flag, PostData builder, FP/FN section
├── eval.test.ts         # MODIFIED: add tests for new code paths
├── eval-label.ts        # NEW: interactive/batch labeling helper
├── eval-label.test.ts   # NEW: unit tests for label-write logic
├── eval-compare.ts      # NEW: results viewer / run diff
└── eval-compare.test.ts # NEW: diff computation tests
```

```
eval/
├── results-YYYY-MM-DD.json   # existing format, extended with engine + errorAnalysis
└── labeled.json              # user-managed; in .gitignore (contains post text)
```

### Anti-Patterns to Avoid

- **Importing `LLMDetector` from `src/content/detector/llm.ts` in Node** — it calls `chrome.runtime.sendMessage` at runtime; will throw "chrome is not defined". Use `classifyPost` from `src/shared/classifier.ts` for the LLM path.
- **Re-homing `HeuristicDetector` to `src/shared/`** — architecturally incorrect; it belongs in content-script territory. Direct import from `src/content/detector/heuristic.ts` is the right pattern (file is already DOM-free).
- **Making API key required for heuristic engine** — heuristic is free; the API key guard must be conditioned on `engine === 'llm'`.
- **Computing FP/FN during the scoring loop** — FP/FN depends on the best-F1 threshold, which is only known AFTER the full threshold sweep. Always filter post-hoc.
- **Overwriting the export JSON without preserving shape** — `eval-label.ts` must read the full JSON object and write it back with only the `label` field added/changed per entry. Never reconstruct the JSON from scratch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM scoring in Node | A new `LLMDetector` shimmed for Node | `classifyPost` from `src/shared/classifier.ts` | Already established, tested, has cost instrumentation |
| Cost calculation | Custom per-engine rate math | `computeCostUsd` from `src/shared/pricing.ts` (conditional on engine) | Cache-aware, rate-table maintained in one place |
| Signal formatting | New formatter | Existing `formatSignalBreakdown` from `eval.ts` | Already exported and tested; handles `(no signals)` case |
| FP/FN identification | New scoring pass | Post-hoc filter of `details[]` at `bestF1Threshold` | Zero extra API calls; all data already in memory |
| Keypress input | Third-party readline library | Node built-in `readline` / `process.stdin.setRawMode` | No new npm dependency; standard Node capability |
| JSON pretty-print | Custom serializer | `JSON.stringify(data, null, 2)` | Established project pattern |

---

## Common Pitfalls

### Pitfall 1: `LLMDetector` pulled into Node via `src/content/index.ts` import chain
**What goes wrong:** If any import transitively pulls in `src/content/index.ts` or `src/content/detector/llm.ts`, the `chrome.runtime.sendMessage` call will throw at runtime.
**Why it happens:** `src/content/index.ts` instantiates both detector types. Avoid importing it.
**How to avoid:** Import `HeuristicDetector` directly from `src/content/detector/heuristic.ts` only. Never import from `src/content/index.ts` in scripts/.

### Pitfall 2: Missing `.js` extension on ESM imports
**What goes wrong:** `import { HeuristicDetector } from '../src/content/detector/heuristic'` fails at runtime under tsx ESM.
**Why it happens:** ESM requires explicit file extensions; tsx does not add them.
**How to avoid:** `import { HeuristicDetector } from '../src/content/detector/heuristic.js'` (per established pattern in `trace-summary.ts`).

### Pitfall 3: API key guard firing for heuristic engine
**What goes wrong:** A user running `npm run eval -- file.json --engine heuristic` gets "Error: ANTHROPIC_API_KEY environment variable is not set" even though heuristic needs no key.
**Why it happens:** The current key guard is unconditional (eval.ts L224–227).
**How to avoid:** Move the API key check inside an `if (engine === 'llm')` block.

### Pitfall 4: FP/FN computed at wrong threshold
**What goes wrong:** FP/FN list uses a hard-coded threshold (e.g., 60) instead of the best-F1 threshold, making it inconsistent with the table callout.
**Why it happens:** The best-F1 threshold is determined post-sweep; it is tempting to use the default hide threshold (60) as a shortcut.
**How to avoid:** Always compute FP/FN AFTER the sweep, using `bestF1Threshold`.

### Pitfall 5: `generic-comments` absent from heuristic eval breakdown
**What goes wrong:** Users are surprised that `generic-comments` never appears in heuristic eval results even for posts that scored it in the extension.
**Why it happens:** The `fetchComments` gate (`score > 20 && this.options.fetchComments !== undefined`) never fires when no `fetchComments` function is injected.
**How to avoid:** Document this in `eval-instructions.md` — "The heuristic eval does not expand comments (no DOM access); `generic-comments` scores will always be 0." No code change needed, just documentation.

### Pitfall 6: In-place JSON rewrite corrupting label values
**What goes wrong:** `eval-label.ts` writes an invalid JSON string (e.g., writes a JS object that has been mutated without proper serialization), or a crash mid-write leaves a truncated file.
**Why it happens:** Direct string manipulation or `writeFile` without `JSON.stringify`.
**How to avoid:** Always serialize with `JSON.stringify(data, null, 2)` and write atomically. Consider writing to a `.tmp` file then renaming — though on the same filesystem this is equivalent to an atomic rename.

### Pitfall 7: Signal name vocabulary mismatch in documentation
**What goes wrong:** `eval-instructions.md` notes in a callout that "these signal names come from the LLM classifier — not the heuristic engine." After engine alignment, the heuristic engine IS the primary path, and its signal names (`listicle-cta`, `buzzword`, `em-dash`, etc.) must be documented instead.
**Why it happens:** The existing documentation (Step 5a note) was written when LLM was the only path.
**How to avoid:** Update `eval-instructions.md` with a table of heuristic signal names and note that LLM signals differ.

---

## Engine Behavior Differences — Decision Table

| Aspect | `--engine heuristic` | `--engine llm` (default) |
|--------|----------------------|--------------------------|
| API key required | No | Yes (`ANTHROPIC_API_KEY`) |
| Cost | Free (0) | `computeCostUsd(usage)` per post |
| Signal names | `listicle-cta`, `buzzword`, `em-dash`, `ai-vocab`, `hook-story`, `motivational`, `impersonal`, `generic-comments` | LLM vocabulary (`hook-story`, `listicle-cta`, `buzzword`, `em-dash`, `ai-vocab`, `motivational`, `generic-cta`, `template`, `impersonal-framing`, `no-specificity`) |
| `reasoning` field | Absent (heuristic has no reasoning text) | Present when LLM returns it |
| `generic-comments` | Never fires (no DOM in eval) | N/A — LLM uses its own signal |
| `engineUsed` in result | `'heuristic'` | `'llm'` |
| Scoring speed | Synchronous-fast (no I/O) | ~1–2s per post (API call) |
| `cost` in results JSON | `null` or `{ totalUsd: 0, avgUsdPerPost: 0, engine: 'heuristic' }` | `{ totalUsd: N, avgUsdPerPost: N }` |

---

## Results JSON Schema — Extended for Phase 27

The current Phase 26 results shape must gain:
- `engine: 'heuristic' | 'llm'` at the top level (which engine produced the run)
- `cost: null` for heuristic runs (or `{ totalUsd: 0, avgUsdPerPost: 0 }` — `null` is cleaner for programmatic comparison)
- `errorAnalysis: { threshold: number; falsePositives: PostDetail[]; falseNegatives: PostDetail[] }` — new section

```typescript
// Source: inferred from eval.ts results object (L316-334) + Phase 27 additions
const results = {
  runAt: string,
  inputFile: string,
  engine: 'heuristic' | 'llm',         // NEW
  model: string,                        // 'claude-sonnet-4-6' for llm; 'heuristic' for heuristic
  counts: { total, labeled, skipped, errored, scored },
  cost: { totalUsd: number, avgUsdPerPost: number } | null,  // null for heuristic
  thresholds: ThresholdRow[],
  bestF1Threshold: number,
  posts: PostDetail[],
  errorAnalysis: {                      // NEW
    threshold: number,                  // === bestF1Threshold
    falsePositives: PostDetail[],
    falseNegatives: PostDetail[],
  },
};
```

---

## Test Extension Strategy

The existing `eval.test.ts` tests are structured around pure exported functions (`collectLabeled`, `computeMetrics`, `safe`, `loadExport`, `formatSignalBreakdown`) and the `main()` function for exit-code paths. Phase 27 should extend this with:

### New exported functions to add (for testability)

```typescript
// New pure functions to export from eval.ts for testing:
export function buildPostData(entry: Record<string, unknown>): PostData
export function filterErrors(details: PostDetail[], threshold: number, label: 'ai' | 'human'): PostDetail[]
```

### New test coverage needed

| New code path | Test type | What to test |
|---------------|-----------|-------------|
| `buildPostData` | unit | `text` → `postText` mapping; `authorProfileUrl` stub; missing fields default to `''` |
| `filterErrors` (FP filter) | unit | Returns entries where `label === 'human' && score >= threshold` |
| `filterErrors` (FN filter) | unit | Returns entries where `label === 'ai' && score < threshold` |
| `--engine heuristic` flag parsing | unit | Parses argv correctly; defaults to `llm` when absent |
| Heuristic engine API key guard | unit (main) | `--engine heuristic` + no `ANTHROPIC_API_KEY` → does NOT exit 1 |
| `eval-label.ts` label write | unit | `flaggedPosts[i].label` set correctly; file written; idempotent on re-run |
| `eval-compare.ts` diff | unit | Two results objects → correct diff output; handles null cost |

**HeuristicDetector stub pattern for eval tests:**
```typescript
// No need to mock HeuristicDetector — it is pure synchronous logic with no I/O.
// Pass a real HeuristicDetector instance with no fetchComments in unit tests.
// OR mock the detect() method on the prototype if integration isolation is needed.
```

---

## `eval-instructions.md` Update Scope

The following sections require updates after Phase 27:

| Section | Change Required |
|---------|-----------------|
| "What you need" table | Add row: "Engine choice: `--engine heuristic` (free) or `--engine llm` (default, costs money)" |
| Step 3 (API key) | Qualify: "Only required when using `--engine llm` (the default)" |
| Step 4 (Run the eval) | Add `--engine heuristic` example |
| Step 5a (Terminal output) | Update signal-name note: heuristic signals listed; LLM signals different |
| New section: "Error analysis" | Document FP/FN terminal section and `errorAnalysis` field in results JSON |
| New section: "Labeling helper" | Document `npm run eval-label` workflow |
| New section: "Comparing runs" | Document `npm run eval-compare` usage |
| Exit codes table | Add: heuristic engine runs without API key (key guard conditioned on engine) |

---

## Package Legitimacy Audit

No new npm packages are required for Phase 27.

| Capability | Package | Decision |
|------------|---------|----------|
| Interactive keypress (labeling helper) | Node built-in `readline` / `process.stdin` | No new package |
| Terminal table formatting | String `padEnd`/`padStart` | No new package |
| JSON diff | Arithmetic on parsed results objects | No new package |
| File I/O | Node built-in `fs` | No new package |

**Packages removed due to slopcheck:** none (no new packages).
**Packages flagged as suspicious:** none.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 18+ | Native fetch (LLM path), `readline` (labeling) | Implied by tsx@^4.0.0 already working | — | — |
| `tsx` | All scripts | Already in devDependencies | `^4.0.0` | — |
| `ANTHROPIC_API_KEY` | LLM engine only | User-supplied | — | Heuristic engine path requires no key |
| `api.anthropic.com` | LLM engine only | Internet access | — | Use `--engine heuristic` for offline runs |

---

## Open Questions (RESOLVED)

> All four resolved during planning (Phase 27 plans 27-01/02/03):
> Q1 → default `--engine llm` (27-01); Q2 → `--auto` bulk mode (27-02);
> Q3 → `--format markdown` (27-03); Q4 → cap terminal FP/FN at top-5, full list in JSON (27-01).

1. **Heuristic engine as default vs LLM?** — RESOLVED: default `llm` (27-01).
   - What we know: `--engine llm` (default) preserves Phase 26 behavior and the existing `eval-instructions.md`. Heuristic is free and fast. The user's motivation was to see heuristic signals matching `flaggedAccounts.signals`.
   - What's unclear: Whether the user now primarily wants heuristic results (making it the better default) or still values LLM accuracy comparison (keeping LLM as default with heuristic opt-in).
   - Recommendation: Default to `--engine llm` to not break existing usage. Document `--engine heuristic` prominently as the "free" mode in `eval-instructions.md`. Planner may override.

2. **Batch-label mode in `eval-label.ts`?**
   - What we know: Many use cases label all `flaggedPosts[]` as `'ai'` and all `unflaggedPosts[]` as `'human'`.
   - Recommendation: Add `--auto` flag that does this bulk assignment in one pass, with a dry-run count printed first. Interactive mode remains for ambiguous cases.

3. **Markdown export from `eval-compare.ts`?**
   - What we know: Terminal table is sufficient per D-07. Markdown is a small addition.
   - Recommendation: Include `--format markdown` as a second output mode — trivial to add, high value for PR descriptions.

4. **FP/FN terminal output verbosity?**
   - What we know: For large datasets, printing every FP/FN in full detail may produce very long terminal output.
   - Recommendation: Cap terminal output at top-5 FP and top-5 FN by score proximity to threshold, with total counts shown. Full list always in the JSON.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `authorProfileUrl` is not used by any signal in `HeuristicDetector` | PostData Fields section | If a future signal uses it, stubs would produce wrong scores — but verified from current source |
| A2 | Node `process.stdin.setRawMode` is available in the developer's terminal context | Labeling Workflow section | If running in a non-TTY context (CI, piped input), setRawMode throws; add TTY guard |
| A3 | `npm run eval-label` (new script) writing JSON back in-place is safe without atomic rename | Labeling Workflow section | Power failure mid-write could corrupt the file; for robustness, planner may choose write-to-tmp then rename |

All other claims in this research were verified from live source files.

---

## Sources

### Primary (HIGH confidence — verified from live codebase)

- `scripts/eval.ts` (read in full 2026-06-14) — complete scoring loop, PostDetail schema, results JSON shape, formatSignalBreakdown, collectLabeled
- `scripts/eval.test.ts` (read in full 2026-06-14) — test structure, stub patterns, exit-code testing approach
- `src/content/detector/heuristic.ts` (read in full 2026-06-14) — DOM-free confirmation, signal pipeline, fetchComments injection, constructor options
- `src/content/detector/llm.ts` (read in full 2026-06-14) — `chrome.runtime.sendMessage` coupling confirmed; not importable in Node
- `src/content/detector/signals/*.ts` (glob confirmed 2026-06-14) — 10 signal files; all pure functions
- `src/shared/types.ts` (read in full 2026-06-14) — `PostData`, `DetectionResult`, `UnflaggedPost`, `FlaggedPost` interfaces
- `src/shared/classifier.ts` (read in full 2026-06-14) — `classifyPost`, `SYSTEM_PROMPT`, `AnthropicUsage`, `ClassifyResult`
- `src/content/index.ts` L225-243 (read 2026-06-14) — engine selection pattern: `HeuristicDetector({fetchComments})` + `new LLMDetector(heuristic)`
- `.planning/phases/26-eval-runner/26-RESEARCH.md` (read in full 2026-06-14) — all Phase 26 patterns, pitfalls, and schema decisions
- `.planning/phases/26-eval-runner/26-PATTERNS.md` (read in full 2026-06-14) — file-to-analog map
- `.planning/phases/27-eval-improvements/27-CONTEXT.md` (read in full 2026-06-14) — locked decisions D-01 through D-07
- `eval-instructions.md` (read in full 2026-06-14) — current user-facing doc; update scope identified
- `.planning/config.json` (read 2026-06-14) — `nyquist_validation: false` confirmed

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — EVAL-01 through EVAL-04 (complete), EVAL-06 through EVAL-09 (names only, not yet defined)
- `.planning/ROADMAP.md` L329-337 — Phase 27 goal text confirming four deliverables

---

## Metadata

**Confidence breakdown:**
- `HeuristicDetector` import strategy: HIGH — read source; DOM-free header + signal imports verified
- `LLMDetector` Node incompatibility: HIGH — `chrome.runtime.sendMessage` confirmed in source
- `PostData` field gap analysis: HIGH — both interfaces read; `authorProfileUrl` absence confirmed
- Engine selection mechanism: HIGH — existing argv parsing pattern understood; `--engine` flag is standard
- Error analysis implementation: HIGH — existing schema supports it; purely post-hoc
- Labeling helper: MEDIUM — approach is correct; exact readline/TTY behavior is [ASSUMED] without running it
- Results viewer: HIGH — results schema is complete; diff is straightforward arithmetic
- Test extension strategy: HIGH — existing test structure fully understood

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable codebase; detector signal modules unlikely to change)
