---
phase: 30-skill-registry-architecture
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/content/detector/heuristic.ts
  - src/content/detector/llm.ts
  - src/content/detector/signals/ai-vocab.skill.ts
  - src/content/detector/signals/buzzword.skill.ts
  - src/content/detector/signals/em-dash.skill.ts
  - src/content/detector/signals/generic-comments.skill.ts
  - src/content/detector/signals/hook-story.skill.ts
  - src/content/detector/signals/impersonal.skill.ts
  - src/content/detector/signals/listicle-cta.skill.ts
  - src/content/detector/signals/motivational.skill.ts
  - src/content/exclusions.ts
  - src/content/exclusions/company-page.skill.ts
  - src/content/exclusions/exclusions.test.ts
  - src/content/exclusions/non-english.skill.ts
  - src/content/exclusions/open-to-work.skill.ts
  - src/content/exclusions/sponsored.skill.ts
  - src/content/index.ts
  - src/content/skill-registry.ts
  - src/shared/skills/pattern-runner.ts
  - src/shared/skills/types.ts
  - src/shared/types.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-06-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 30 introduced a SkillRegistry architecture to wrap eight signal skills and four exclusion skills in a pluggable registry pattern mirroring SelectorRegistry. The zero-behavior-change contract requires the registry runner to produce byte-identical scores to the original hand-wired pipeline.

The core pipeline wiring is correct: signal step-order is preserved in `CODE_SIGNAL_SKILLS`, the async generic-comments gate runs on post-sync-pass score, and the listicle-cta composite is correctly kept as a single skill. The exclusion short-circuit loop in `content/index.ts` faithfully replicates `checkExclusions()` priority order.

Two critical issues found: a storage–memory split that silently desynchronizes the skill registry on a failed write, and a schema type lie where `declarativeExclusionSkills` is typed as `ExclusionSkill[]` (containing a method) when chrome.storage cannot serialize functions. Four warnings cover a hardcoded debug flag shipping to production, dead `aiSignalsToday`/`botSignalsToday` counters, a misleading engine identity on LLM fallback, and a dead guard branch in the pattern-runner.

---

## Structural Findings (fallow)

No structural pre-pass was provided for this review.

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `addDeclarativeSkill` mutates in-memory cache before persisting — storage and memory can permanently diverge

**File:** `src/content/skill-registry.ts:185-188`

**Issue:** `_cache.declarativeSignalSkills.push(skill)` mutates the in-memory array on line 185 before the storage write. The write on line 188 uses `.catch(() => {})` which silently swallows storage failures. If `storageSet` throws (e.g., storage quota exceeded, extension context invalidated), the skill exists in `_cache` but was never persisted. No `onChanged` event fires on a failed write, so other tabs are not notified. On next load, `load()` reads from storage — the skill is gone. The in-memory state is now unrecoverably ahead of storage for the lifetime of this tab.

```typescript
// Current (line 185-188):
_cache.declarativeSignalSkills.push(skill);      // mutates before write
_cache.lastModifiedAt = new Date().toISOString();
await storageSet({ skillRegistry: _cache }).catch(() => {});  // failure silently swallowed
```

**Fix:** Write to storage first; only update `_cache` on success. This matches the single-writer contract's intent and mirrors how `SelectorRegistry.insertCandidate()` should be structured:

```typescript
export async function addDeclarativeSkill(skill: PatternSkill): Promise<void> {
  if (!_cache) return;
  const updated: SkillRegistrySchema = {
    ..._cache,
    declarativeSignalSkills: [..._cache.declarativeSignalSkills, skill],
    lastModifiedAt: new Date().toISOString(),
  };
  await storageSet({ skillRegistry: updated }); // let the error propagate to caller
  _cache = updated; // only update in-memory state after successful persist
}
```

---

### CR-02: `SkillRegistrySchema.declarativeExclusionSkills` typed as `ExclusionSkill[]` — `ExclusionSkill` contains a `check()` method, which `chrome.storage` cannot serialize

**File:** `src/shared/skills/types.ts:170` and `src/content/skill-registry.ts:107-108`

**Issue:** The `SkillRegistrySchema` interface declares `declarativeExclusionSkills: ExclusionSkill[]`. The `ExclusionSkill` interface (types.ts:122-127) includes a `check(postData, postNode)` method. `chrome.storage.local` silently strips functions when serializing — on write, all `check` methods are dropped; on read, objects without `check` are returned, and any code that calls `.check()` on them will throw `TypeError: skill.check is not a function` at runtime.

The schema comment in `skill-registry.ts` (lines 14-15) says "Code skills are NEVER written to storage — only declarative (PatternSkill) skills live in storage." This comment is correct in intent but the TypeScript type directly contradicts it: `declarativeExclusionSkills` is typed `ExclusionSkill[]` not `PatternSkill[]` (or a new declarative-only type).

Currently the array is always empty (seeded as `[]` in `buildSeedRegistry`) and `addDeclarativeSkill` only appends to `declarativeSignalSkills`, so no runtime crash occurs today. But the type is wrong and any future code that adds an entry to `declarativeExclusionSkills` will silently produce broken skills after a round-trip through storage.

**Fix:** Change the type to `PatternSkill[]` (matching `declarativeSignalSkills`) and update `getExclusionSkills()` to call `runPatternSkill` for each declarative entry, or define a new `DeclarativeExclusionSkill` type that carries only serializable data and extend `getExclusionSkills()` to execute them via the pattern-runner:

```typescript
// In SkillRegistrySchema (types.ts):
declarativeExclusionSkills: PatternSkill[]; // PatternSkill is pure data — no functions

// In getExclusionSkills() (skill-registry.ts), declarative entries must be
// wrapped in an adapter that calls runPatternSkill() if they are to function as ExclusionSkill.
// The simplest fix at this phase: keep the field empty and assert the type is PatternSkill[].
```

---

## Warnings

### WR-01: `DEBUG = true` hardcoded — every scored post logs author name, signals, and post text to console in the shipped extension

**File:** `src/content/index.ts:22`

**Issue:** `const DEBUG = true;` is hardcoded unconditionally. The `if (DEBUG)` block on lines 325-328 logs `authorName`, all scored signals, and the raw `postText` for every post that enters the scoring pipeline. In a production Chrome extension this output is visible to anyone who opens DevTools on LinkedIn. This constitutes an information disclosure of post text and author identity, and produces significant console noise in production.

**Fix:** Gate behind a build-time constant or use a production-false default:

```typescript
// Option A — Vite build-time constant (preferred for MV3 extensions):
const DEBUG = import.meta.env.DEV;

// Option B — manual toggle (safe fallback):
const DEBUG = false;
```

---

### WR-02: `aiSignalsToday` and `botSignalsToday` are tracked, reset, and never written to storage

**File:** `src/content/index.ts:80-81, 250-251`

**Issue:** `aiSignalsToday` and `botSignalsToday` are declared as module-scope counters (lines 80-81), reset in the `popstate` handler (line 250-251), but never incremented with signal data and never written to `writeDailyStats()`. The `DailyStats` interface has optional `aiSignals` and `botSignals` fields (shared/types.ts:163-164) that remain permanently `undefined` in storage. This is dead code that signals an incomplete feature — the counters exist in the pre-Phase-30 codebase but were apparently never wired up. They could mislead future developers who add increment calls expecting them to be flushed.

**Fix:** Either wire the counters (increment them when the merged breakdown contains AI/bot signals, then include them in `writeDailyStats`) or remove the declarations and reset calls until the feature is complete:

```typescript
// Remove from index.ts if deferring:
// let aiSignalsToday = 0;   // line 80
// let botSignalsToday = 0;  // line 81

// Remove from popstate handler:
// aiSignalsToday = 0;   // line 250
// botSignalsToday = 0;  // line 251
```

---

### WR-03: `LLMDetector` no-fallback error path returns `engineUsed: 'heuristic'` for a failed LLM attempt

**File:** `src/content/detector/llm.ts:24`

**Issue:** When `LLMDetector.detect()` catches an error and has no `fallback` detector, it returns a zero-score `DetectionResult` with `engineUsed: 'heuristic'` (line 24). This falsely attributes a failed LLM call to the heuristic engine. Any downstream consumer (popup, dashboard, trace log) that reads `engineUsed` will see `'heuristic'` and assume heuristic scoring was performed, when in fact no detection occurred and the score is 0 because of an error.

```typescript
// Current (line 24):
return { score: 0, signals: [], signalBreakdown: {}, confidence: 'low', engineUsed: 'heuristic' };
```

**Fix:** Use `'llm'` as the engine identifier (the actual engine that was attempted), or introduce a third literal like `'none'` to signal that no scoring was performed:

```typescript
return { score: 0, signals: [], signalBreakdown: {}, confidence: 'low', engineUsed: 'llm' };
```

---

### WR-04: `extractEmDashDensity` divide-by-zero guard is dead code — `"".split(/\s+/)` returns `[""]`, not `[]`

**File:** `src/shared/skills/pattern-runner.ts:57-60`

**Issue:** The guard `if (words === 0) return 0` on line 59 can never be reached. `"".trim().split(/\s+/)` returns `[""]` (an array with one empty string), so `words` is always at least 1 regardless of whether the input is empty. The function produces the numerically correct result (0/1 * 100 = 0) for empty input by coincidence, but the guard does not protect what it appears to protect. The same pattern appears in `extractWordCount` (line 65) and in the `keyword-set`/`density` branch (lines 94-95 of the runner), where `extractWordCount` would return 1 for empty strings instead of 0, meaning the density check could fire on a single empty-string "word."

**Fix:** Use a non-empty-string-aware split:

```typescript
function extractEmDashDensity(postText: string): number {
  const trimmed = postText.trim();
  if (!trimmed) return 0;  // empty-string guard that actually works
  const words = trimmed.split(/\s+/).length;
  const emDashes = (postText.match(/—/g) ?? []).length;
  return (emDashes / words) * 100;
}

function extractWordCount(postText: string): number {
  const trimmed = postText.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
```

Apply the same fix to the `matchMode === 'density'` branch (line 94):

```typescript
const words = text.trim() ? text.trim().split(/\s+/).length : 0;
if (words === 0) return 0;
```

---

## Info

### IN-01: `PatternRule` operator union is locked to `'>'` only — `>=`, `<`, `<=` are inexpressible

**File:** `src/shared/skills/types.ts:96`

**Issue:** The `numeric-threshold` rule's `operator` field is typed as the single literal `'>'`. A LLM-authored skill requiring `>=`, `<`, or `<=` comparisons cannot express them in the schema. The pattern-runner would return 0 for any unknown operator (the `if (rule.operator === '>')` check on line 128 only handles `>`). This is not a current bug (the operator union is enforced by TypeScript), but is a design limitation that would require a type change and a runner update to extend.

**Fix (future):** Expand the union and add corresponding runner branches:

```typescript
// In types.ts:
operator: '>' | '>=' | '<' | '<=';

// In pattern-runner.ts:
if (rule.operator === '>') return extracted > rule.value ? resolveWeight(skill.weightKey) : 0;
if (rule.operator === '>=') return extracted >= rule.value ? resolveWeight(skill.weightKey) : 0;
if (rule.operator === '<') return extracted < rule.value ? resolveWeight(skill.weightKey) : 0;
if (rule.operator === '<=') return extracted <= rule.value ? resolveWeight(skill.weightKey) : 0;
return 0;
```

---

### IN-02: `getExclusionSkills()` appends `declarativeExclusionSkills` after code skills — but `ExclusionSkill` entries from storage will have no `check()` method after deserialization

**File:** `src/content/skill-registry.ts:167`

**Issue:** Directly related to CR-02. `getExclusionSkills()` returns `[...CODE_EXCLUSION_SKILLS, ..._cache.declarativeExclusionSkills]`. The spread will include any objects loaded from storage, which are plain JSON without methods. This is currently safe because `declarativeExclusionSkills` is always `[]`, but the logic path is pre-wired for failure: the caller in `content/index.ts` iterates and calls `skill.check(...)` on every element. If any entry were ever added, `TypeError: skill.check is not a function` would be thrown inside the `startObserving` callback, silently caught by the `.catch((err) => console.warn(...))` at line 367, and the post would receive no scoring.

This is a companion note to CR-02; fixing CR-02's type resolves the root cause.

---

### IN-03: `console.log` in production path of `content/index.ts` line 114

**File:** `src/content/index.ts:114`

**Issue:** `console.log('[LLB] content script starting on', location.href, 'selectors v', SELECTORS_VERSION)` runs unconditionally at module top level on every page load. This is a startup log rather than a debug log and its value is limited in production. Minor but logs the visited URL, which could be surprising to privacy-conscious users who inspect the console.

**Fix:** Gate behind `DEBUG` or remove it from the production build via Vite define:

```typescript
if (DEBUG) console.log('[LLB] content script starting on', location.href, 'selectors v', SELECTORS_VERSION);
```

---

_Reviewed: 2026-06-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
