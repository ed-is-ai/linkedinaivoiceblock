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
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-06-16
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This phase introduces a skill-registry architecture: a host-agnostic skill type system
(`src/shared/skills/types.ts`), an eval-free declarative pattern executor
(`src/shared/skills/pattern-runner.ts`), a storage-backed registry singleton
(`src/content/skill-registry.ts`), and CodeSkill/ExclusionSkill wrappers around the
existing Phase 2 signal and exclusion functions. The stated invariant is "zero behavior
change at launch" because zero declarative skills are seeded (D-06).

The CodeSkill wrappers and the exclusion-runner refactor are clean and behavior-preserving;
the exclusion parity test (`exclusions/exclusions.test.ts`) exercises the new runner path
directly and covers the priority short-circuit correctly.

However, the central capability the phase claims to deliver — a runtime path for
LLM-authored declarative `PatternSkill`s — is **not wired in**. The `HeuristicDetector`
unconditionally treats every registered skill as a `CodeSkill` and calls `.run()` on it.
A `PatternSkill` has no `run()` method, so the moment any declarative skill is added through
the registry's own public `addDeclarativeSkill()` API, `detect()` throws. `runPatternSkill`
— the eval-free executor that is the entire point of the phase — has no caller anywhere in
`src/`. The "zero behavior change because zero declarative skills" framing hides a latent
crash rather than a working-but-empty feature.

Secondary findings: a live threshold-slider change does not affect freshly scored posts
(only pre-flagged authors); the pattern-runner's compiled-regex cache is never invalidated
when a same-id skill is replaced; `seedIfNeeded()` destructively wipes user/LLM-authored
skills on any version mismatch; and there is dead/inconsistent daily-stats state in
`content/index.ts`.

## Critical Issues

### CR-01: Declarative PatternSkills crash the detector — pattern-runner is never invoked

**File:** `src/content/detector/heuristic.ts:77-99`, `src/shared/skills/pattern-runner.ts:81`, `src/content/skill-registry.ts:153-156,183-189`

**Issue:**
`getSignalSkills()` returns `[...CODE_SIGNAL_SKILLS, ..._cache.declarativeSignalSkills]`,
where `declarativeSignalSkills` is typed `PatternSkill[]`. In `HeuristicDetector.detect()`,
both passes cast unconditionally to `CodeSkill` and call `run()`:

```typescript
const result = (skill as CodeSkill).run({ postData: post });   // Pass 1, L79
const r = await (skill as CodeSkill).run({ ... });             // Pass 2, L93
```

`PatternSkill` deliberately has **no** `run()` method (`types.ts:110` — "Deliberately NO run()").
The skill's `flavor` discriminant (`'code'` vs `'pattern'`) is never checked, and
`runPatternSkill()` from `pattern-runner.ts` has **zero callers** anywhere in `src/`
(verified by grep). Consequences:

1. The instant any declarative skill is persisted via `addDeclarativeSkill()` — a public,
   exported, single-writer API the phase ships and intends callers to use — the next
   `detect()` call hits `(skill as CodeSkill).run` === `undefined` and throws
   `TypeError: skill.run is not a function`. In `content/index.ts:319` this rejects the
   `detector.detect(post)` promise, landing in the `.catch` at L367 and silently dropping
   detection for that post (and every subsequent post, since the bad skill stays in cache).
2. The eval-free pattern executor — the headline deliverable and the entire justification
   for the MV3-CSP-safe DATA-not-code design (D-02) — is dead code. The phase cannot
   actually run a declarative skill end to end.

The "zero declarative skills at launch → zero behavior change" claim is technically true
only because the feature is inert. It is not a safe empty state; it is an unguarded crash
waiting on the first use of the registry's own write API.

**Fix:** Dispatch on `flavor` in the runner instead of blind-casting to `CodeSkill`. For
example, in `heuristic.ts` Pass 1:

```typescript
import { runPatternSkill } from '../../shared/skills/pattern-runner';

for (const skill of skills) {
  if (!skill.sync) continue;
  let result: number;
  if (skill.flavor === 'code') {
    result = (skill as CodeSkill).run({ postData: post }) as number;
  } else {
    // PatternSkill — eval-free executor (the whole point of the phase)
    result = runPatternSkill(skill, { postData: post });
  }
  if (result > 0) { breakdown[skill.id] = result; score += result; }
}
```

Pattern skills are synchronous, so they belong in Pass 1; the Pass 2 `(skill as CodeSkill)`
cast at L93 is safe only as long as `generic-comments` remains a CodeSkill, but it should
still guard `flavor === 'code'` before calling `run()`. Add a test that registers a
`PatternSkill` via `addDeclarativeSkill()` and asserts `detect()` returns a contributed
score rather than throwing — this is the test that would have caught the dead wiring.

## Warnings

### WR-01: Live auto-hide threshold change does not affect newly scored posts

**File:** `src/content/index.ts:73,166,217,309-311,338`

**Issue:** `currentThreshold` is maintained as a module-scope mirror and updated by the
`settings` `onChanged` handler (L166), but it is **never read** in the scoring path
(verified by grep — it has no readers). The detect callback computes `effectiveHideThreshold`
from `autoHideThreshold` (L309-311), which is a `const` captured in the `init()` closure at
L215 and never reassigned. Result: when the user moves the auto-hide slider,
`thresholdAuthors` is rebuilt for already-flagged authors (L167-174), but every freshly
scored post continues to use the stale init-time threshold until a full page reload. The
comment at L162-163 ("moving the slider takes effect on the next scrolled-in post without a
page reload") is contradicted by the code for the common case of a not-yet-flagged author.

**Fix:** Read the live mirror in the hide decision rather than the closure constant:

```typescript
const baseThreshold = currentThreshold; // live mirror, updated by onChanged
const effectiveHideThreshold = exclusionResult.openToWork
  ? baseThreshold + detectionConfig.thresholds.openToWorkPenalty
  : baseThreshold;
```

### WR-02: Pattern-runner regex cache is never invalidated on same-id skill replacement

**File:** `src/shared/skills/pattern-runner.ts:26,102-108`; `src/content/skill-registry.ts:183-189`

**Issue:** `_compiledPatterns` is a module-scope `Map<string, RegExp[]>` keyed by `skill.id`,
populated lazily and never cleared. `addDeclarativeSkill()` pushes new `PatternSkill`s into
the registry at runtime, and the `onChanged` listener (`skill-registry.ts:215-217`) replaces
`_cache` wholesale from other tabs. If a declarative skill with an existing `id` is ever
re-added or updated with different `rule.patterns`, the runner returns the **stale** compiled
regexes from first use and silently ignores the new patterns. (`addDeclarativeSkill` only
appends, so duplicate ids can also accumulate — see WR-04 — compounding this.) The cache
assumes `skill.id` → patterns is immutable for process lifetime, but the registry's own write
path does not enforce that.

**Fix:** Key the cache by skill identity that includes the rule (e.g. invalidate on add), or
have `addDeclarativeSkill()` / the `onChanged` handler clear the relevant cache entry. Minimum:
export a `clearCompiledCache(id?)` from the runner and call it from the registry on every write.

### WR-03: seedIfNeeded() destructively discards declarative skills on any version mismatch

**File:** `src/content/skill-registry.ts:122-129`

**Issue:** `seedIfNeeded()` overwrites storage with `buildSeedRegistry()` (empty arrays)
whenever `skillRegistry.version !== SKILL_REGISTRY_VERSION` — including a version *downgrade*
or any non-equal mismatch. The seed deliberately wipes `declarativeSignalSkills` and
`declarativeExclusionSkills`. Those arrays are LLM-authored / user-accumulated data (the
phase's whole premise). The class comment and `SelectorRegistry` (which this file claims to
mirror) perform *additive* migration that preserves adapted candidates; this implementation
silently destroys user data on the first `SKILL_REGISTRY_VERSION` bump. Latent today (version
`1.0.0`, empty arrays), but it becomes data loss the moment both (a) the version is bumped
and (b) any declarative skill exists.

**Fix:** Make the version-mismatch branch migrate additively — preserve existing
`declarativeSignalSkills` / `declarativeExclusionSkills` and only update `version` (and apply
any field migrations), mirroring `SelectorRegistry`'s additive migration rather than a
destructive reset.

### WR-04: addDeclarativeSkill() appends without dedup and mutates cache in place against onChanged

**File:** `src/content/skill-registry.ts:183-189,215-217`

**Issue:** `addDeclarativeSkill()` does `_cache.declarativeSignalSkills.push(skill)` with no
check for an existing skill of the same `id`, so repeated calls (e.g. an LLM re-authoring the
same skill, or a retried write) produce duplicate entries that all run on every post —
double-counting that skill's weight into the composite score. Additionally it mutates the
shared `_cache` object in place *before* the async `storageSet`; the `onChanged` listener
(L216) can concurrently replace `_cache` with a fresh object from another tab's write,
producing a lost-update / inconsistent-cache race. The persisted write also swallows all
errors with `.catch(() => {})` (L188), so a failed persist leaves the in-memory cache ahead
of storage with no signal to the caller.

**Fix:** Dedup by `id` (replace existing or reject duplicates) before pushing; build the new
array immutably and reassign `_cache` rather than mutating in place; and surface persist
failures (or at least roll back the in-memory mutation) instead of silently dropping them.

### WR-05: LLMDetector dereferences response without null guard

**File:** `src/content/detector/llm.ts:30-34`

**Issue:** In `scoreViaBackground`, after the `lastError` and `response?.error` guards, the
code does `resolve(response.result as DetectionResult)` with no check that `response` is
defined or that `result` exists. If the background worker terminates mid-flight or replies
with `undefined` / a malformed object (no `lastError` set), `response.result` is `undefined`
and the promise resolves to `undefined`. That `DetectionResult` then flows into
`content/index.ts:319` where `result.score` (L322) dereferences `undefined` and throws inside
the `.then` — defeating the deliberate `fallback` design (the throw lands in `.catch` at L367,
not in the LLMDetector fallback at `llm.ts:23`). The optional-chaining on `response?.error`
at L32 acknowledges `response` may be nullish, but L33 then assumes it is not.

**Fix:** Validate the shape before resolving and route failures through the fallback:

```typescript
if (!response || typeof response.result?.score !== 'number') {
  reject(new Error('malformed SCORE_POST response'));
  return;
}
resolve(response.result as DetectionResult);
```

## Info

### IN-01: Dead and inconsistently-reset daily-stats counters

**File:** `src/content/index.ts:80-81,250-251,260-263`

**Issue:** `aiSignalsToday` and `botSignalsToday` are declared (L80-81) and reset in the
`popstate` handler (L250-251) but are **never incremented** and never written by
`writeDailyStats()` (which only persists `seen`, `hidden`, `seenProfileIds`) — pure dead
state. Separately, the `pushState` override (L255-263) resets `seenProfileIdsToday` but omits
`botSignalsToday` (and `aiSignalsToday`), so the two SPA-navigation paths diverge. Since the
counters are unused the divergence is currently harmless, but it is a latent bug if either
counter is ever wired to `DailyStats.aiSignals` / `botSignals`.

**Fix:** Either remove `aiSignalsToday` / `botSignalsToday` entirely, or wire them into
`writeDailyStats()` and reset them identically in both the `popstate` and `pushState` paths.

### IN-02: Pattern-runner numeric extractors silently diverge from CodeSkill semantics

**File:** `src/shared/skills/pattern-runner.ts:56-61,119-133`

**Issue:** `extractEmDashDensity` lacks the 30-word floor and the tiered `>2`/`>1` scoring
that the real `checkEmDash` applies (`em-dash.ts:18,23-24`), and the `numeric-threshold` rule
only supports operator `'>'` (any other operator falls through to `return 0` at L132). A
declarative em-dash skill authored against `detectionConfig.weights.emDash.max` would score
differently from the code skill and produce false positives on very short posts. This is only
a latent concern because the declarative path is unreachable today (CR-01), but it means the
"declarative flavor is expressible" claim (file header L15-16) is not equivalent to the code
skills it purports to mirror.

**Fix:** Document that declarative extractors are intentionally simplified, or align
`extractEmDashDensity` with `checkEmDash` (word floor + tiers) so the two flavors are
genuinely interchangeable.

### IN-03: Detector-failure path is silent — no fallback score, lost detection

**File:** `src/content/index.ts:367-369`

**Issue:** The top-level `.catch` for `detector.detect(post)` only `console.warn`s. Any
detector throw (including the CR-01 crash and the WR-05 malformed-response path) results in
the post being neither scored, flagged, nor hidden, with no user-visible signal and no
metric. Combined with CR-01, a single bad declarative skill silently disables detection for
the remainder of the session.

**Fix:** On detector failure, fall back to a safe default result (e.g. score 0) or at minimum
increment a health counter so silent total-detection-loss is observable.

### IN-04: Two same-named exclusion test files invite confusion

**File:** `src/content/exclusions/exclusions.test.ts` (and sibling `src/content/exclusions.test.ts`)

**Issue:** The phase adds `src/content/exclusions/exclusions.test.ts` (new runner-path parity
test) alongside the pre-existing `src/content/exclusions.test.ts` (legacy `checkExclusions()`
test). Two files named `exclusions.test.ts` differing only by directory is a maintenance trap —
easy to edit the wrong one. The new file is correct and well-scoped; this is purely a naming
clarity note.

**Fix:** Rename the new file to something path-distinct, e.g. `exclusion-runner.test.ts`, to
make the runner-vs-legacy distinction obvious in editor tabs and test output.

---

_Reviewed: 2026-06-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
