---
phase: 31-skill-library-alignment
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - .github/workflows/ci.yml
  - package.json
  - scripts/generate-skill-registry.ts
  - scripts/skill-order.json
  - src/content/detector/heuristic.ts
  - src/content/detector/llm.ts
  - src/content/generated-skill-registry.test.ts
  - src/content/generated-skill-registry.ts
  - src/content/skill-registry.ts
  - src/skills/library/AUTHORING.md
  - src/skills/library/ai-vocab/SKILL.md
  - src/skills/library/ai-vocab/ai-vocab.skill.ts
  - src/skills/library/buzzword/SKILL.md
  - src/skills/library/buzzword/buzzword.skill.ts
  - src/skills/library/company-page/SKILL.md
  - src/skills/library/company-page/company-page.skill.ts
  - src/skills/library/em-dash/SKILL.md
  - src/skills/library/em-dash/em-dash.skill.ts
  - src/skills/library/generic-comments/SKILL.md
  - src/skills/library/generic-comments/generic-comments.skill.ts
  - src/skills/library/heuristic/SKILL.md
  - src/skills/library/heuristic/heuristic.skill.ts
  - src/skills/library/hook-story/SKILL.md
  - src/skills/library/hook-story/hook-story.skill.ts
  - src/skills/library/impersonal/SKILL.md
  - src/skills/library/impersonal/impersonal.skill.ts
  - src/skills/library/listicle-cta/SKILL.md
  - src/skills/library/listicle-cta/listicle-cta.skill.ts
  - src/skills/library/llm/SKILL.md
  - src/skills/library/llm/llm.skill.ts
  - src/skills/library/motivational/SKILL.md
  - src/skills/library/motivational/motivational.skill.ts
  - src/skills/library/non-english/SKILL.md
  - src/skills/library/non-english/non-english.skill.ts
  - src/skills/library/open-to-work/SKILL.md
  - src/skills/library/open-to-work/open-to-work.skill.ts
  - src/skills/library/selector-registry/SKILL.md
  - src/skills/library/selector-registry/selector-registry.skill.ts
  - src/skills/library/sponsored/SKILL.md
  - src/skills/library/sponsored/sponsored.skill.ts
findings:
  critical: 1
  warning: 6
  info: 3
  total: 10
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-06-16
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

## Summary

Reviewed the skill-library migration: 14 skill folders (8 signals, 4 exclusions, 2 detectors, plus a selector-registry convention folder), the codegen script, the committed generated module, the rewired `skill-registry.ts`, the order-pinning tests, the CI wiring, and the authoring guide.

The core architecture is sound and the high-value invariants hold:
- **Single-writer invariant (CLAUDE.md #1) is preserved.** Only `src/content/skill-registry.ts` calls `storageSet({ skillRegistry })`. The `selector-registry` library folder is a pure re-export wrapper with no `storageSet` and no selector literals — it does not introduce a second writer.
- **MV3-CSP safety holds.** The generated module uses only static `import` statements (no dynamic import, no `import.meta.glob`, no `eval`). No `import '...SKILL.md'` exists anywhere in TS source (D-01).
- **Array order is preserved** end-to-end: `skill-order.json` -> generated arrays -> `CODE_SIGNAL_SKILLS`/`CODE_EXCLUSION_SKILLS`, and the order-pinning tests guard it.
- All underlying `signals/*.ts` and the import paths in the generated module resolve to real files.

However, the codegen's validation/robustness story is weaker than its D-08 "fail on invalid frontmatter" contract claims, and one manifest carries a semantically wrong `kind` that is a latent build-break trap. Findings below.

## Critical Issues

### CR-01: `selector-registry/SKILL.md` declares `kind: exclusion` — false discriminant that becomes a build break if the folder is ever ordered

**File:** `src/skills/library/selector-registry/SKILL.md:5`
**Issue:** The manifest declares:
```yaml
metadata:
  kind: exclusion
```
This is factually wrong. `selector-registry.skill.ts` is a thin re-export of named functions (`resolve`, `insertCandidate`, etc.) from `src/content/selector-registry.ts` — it exports **no** `ExclusionSkill` object, never returns an `ExclusionResult`, and (per its own header + AUTHORING.md) is "NOT wired into any skill array."

Today this is inert only because `selector-registry` is absent from `scripts/skill-order.json`. But the contract documented in AUTHORING.md is "all skill definitions live in `src/skills/library/<name>/`" and skills are activated by adding the folder name to `skill-order.json`. The moment anyone follows that documented workflow and appends `"selector-registry"` to the `exclusions` array, the codegen will:
1. Read this manifest, see `kind: exclusion`, pass validation.
2. Emit `import { selectorRegistryExclusionSkill } from '../skills/library/selector-registry/selector-registry.skill';`
3. Push `selectorRegistryExclusionSkill` into `GENERATED_EXCLUSION_SKILLS`.

That symbol does not exist, producing a hard type-check/build failure — and if it somehow resolved, a non-`ExclusionSkill` would land in the exclusion pipeline. The manifest is a primed trap: it asserts a kind the implementation does not honor.

**Fix:** This folder is a convention-only re-export and must never be code-generated into a skill array. Either (a) give it a non-activatable kind and have the codegen explicitly refuse to array-ize it, or (b) drop the `SKILL.md` entirely since it is not a real skill manifest. If the folder must keep a manifest for "Agent Skills convention completeness," gate it in the codegen:
```typescript
// In parseSkillMd / main: hard-fail if a non-array folder is listed in skill-order.json,
// and never emit imports for folders whose .skill.ts exports no matching <var>Skill symbol.
const NON_ACTIVATABLE = new Set(['selector-registry']);
if (NON_ACTIVATABLE.has(folderName)) {
  process.stderr.write(`ERROR: '${folderName}' is a convention-only folder and must not be ordered\n`);
  process.exit(1);
}
```
At minimum, change `metadata.kind` away from `exclusion` so the manifest does not assert a contract the code cannot satisfy.

## Warnings

### WR-01: Codegen silently drops missing skill folders — a deleted/renamed/typo'd folder produces a shorter behavior-critical pipeline instead of failing

**File:** `scripts/generate-skill-registry.ts:79-89, 140-142`
**Issue:** `parseSkillMd` returns `null` (and only logs `INFO` to stderr) when a folder's `SKILL.md` is missing, and `main()` filters nulls out of the arrays:
```typescript
const signalEntries = order.signals.map(parseSkillMd).filter((e): e is SkillEntry => e !== null);
```
The comment calls this "TRACER-PHASE-ONLY" behavior for not-yet-migrated folders. But all folders listed in `skill-order.json` now exist, so the only way this branch fires today is an *accident*: a typo in `skill-order.json`, a renamed folder, or a deleted `SKILL.md`. In every such case the codegen silently emits a pipeline with a missing signal/exclusion — a behavior-critical change — and exits 0. This directly contradicts the D-08 contract advertised in AUTHORING.md ("exits non-zero if any SKILL.md ... is missing"). The order-pinning test would eventually catch a *signal* drop, but the codegen itself is the documented gate and it does not gate.

**Fix:** Remove the tracer-phase skip now that all folders are migrated. Make a missing `SKILL.md` for a folder listed in `skill-order.json` a hard error:
```typescript
if (!fs.existsSync(skillMdPath)) {
  process.stderr.write(`ERROR: ${folderName}: SKILL.md not found at ${skillMdPath}\n`);
  process.exit(1);
}
```

### WR-02: `check-skill-registry` relies on `git diff` over a hand-written-LF file with `core.autocrlf=true` and no `.gitattributes` — fragile CI/local diff behavior

**File:** `package.json:11`, `.github/workflows/ci.yml:26-27`
**Issue:** `check-skill-registry` is `generate-skill-registry && git diff --exit-code src/content/generated-skill-registry.ts`. The codegen always writes LF (`lines.join('\n')`, no EOL normalization). The repo has `core.autocrlf=true` and no `.gitattributes` (confirmed at review time). On a Windows checkout the working-tree copy is CRLF while regeneration rewrites it as LF, so a Windows contributor running `npm run check-skill-registry` locally sees a spurious whole-file diff that has nothing to do with skill changes. Conversely, relying on git's autocrlf normalization to "absorb" the EOL difference means a genuine content change could in principle be masked depending on the contributor's config. The stale-check correctness should not depend on per-machine git EOL settings.

**Fix:** Pin the generated file's EOL deterministically. Add a `.gitattributes` entry:
```
src/content/generated-skill-registry.ts text eol=lf
```
and/or normalize before comparison. The CI runner is Linux so CI itself is fine today, but the local-vs-CI mismatch is a real developer-experience and stale-check-integrity hazard.

### WR-03: Description escaping in the codegen handles `\` and `'` but not newlines/control chars — a YAML block-scalar description emits invalid TS

**File:** `scripts/generate-skill-registry.ts:206-207, 220-221`
**Issue:** Descriptions are emitted as single-quoted TS string literals with only two escapes:
```typescript
const escapedDesc = entry.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
```
Today every `SKILL.md` uses a single-line double-quoted YAML description, so this works. But the validator (`validateFrontmatter`) accepts *any* non-empty string. A future author using a YAML block scalar (`description: |` / `>`) — perfectly valid YAML and not rejected by validation — yields a string containing literal `\n`. Emitted into a single-quoted JS literal, a raw newline is a syntax error, breaking the generated module and the whole build. The escaping is incomplete relative to what validation permits.

**Fix:** Serialize descriptions safely instead of hand-rolling escapes. `JSON.stringify(entry.description)` produces a valid double-quoted literal that escapes newlines, quotes, and backslashes correctly:
```typescript
lines.push(`  '${entry.folder}': { name: ${JSON.stringify(entry.name)}, description: ${JSON.stringify(entry.description)}, kind: '${entry.kind}' as const },`);
```

### WR-04: Frontmatter regex requires the file to *start* with `---\n` and silently mis-parses a leading-whitespace/BOM file

**File:** `scripts/generate-skill-registry.ts:94-98`
**Issue:** `normalised.match(/^---\n([\s\S]*?)\n---/)` anchors the opening fence to byte 0. A `SKILL.md` saved with a UTF-8 byte-order-mark (common on Windows editors) or a stray leading blank line will not match `^---`, and the script reports "no valid YAML frontmatter block" and `process.exit(1)` — even though the frontmatter is present and well-formed. This is a confusing hard-fail for a benign, easy-to-introduce condition, and the error message points the author at the wrong problem.

**Fix:** Strip a leading BOM (code point U+FEFF) and tolerate leading whitespace before the fence, or use the already-installed `gray-matter` (see IN-01) which handles these cases:
```typescript
const normalised = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const match = normalised.match(/^\s*---\n([\s\S]*?)\n---/);
```

### WR-05: `validateFrontmatter` does not reject extra/unknown frontmatter fields, undermining the "no runtime fields in SKILL.md" rule

**File:** `scripts/generate-skill-registry.ts:47-70`, `src/skills/library/AUTHORING.md:41-46`
**Issue:** AUTHORING.md states SKILL.md must NOT contain runtime fields (`flavor`, `inputs`, `sync`, `id`, `weightKey`, etc.) — those belong only in `.skill.ts`, and weights must never appear in the manifest (D-04). The validator checks only that `name`, `description`, and `metadata.kind` are present and well-typed; it ignores everything else. An author who copies runtime fields or a `weightKey` into SKILL.md passes validation silently, defeating the documented invariant and inviting two sources of truth that can drift.

**Fix:** Either whitelist allowed top-level keys and fail on unknown ones, or at least warn:
```typescript
const ALLOWED = new Set(['name', 'description', 'metadata']);
for (const k of Object.keys(f)) {
  if (!ALLOWED.has(k)) {
    process.stderr.write(`ERROR: ${skillName}: SKILL.md has disallowed field '${k}' (runtime fields belong in .skill.ts)\n`);
    process.exit(1);
  }
}
```

### WR-06: Order-pinning test only pins IDs, not membership uniqueness — a duplicated signal in skill-order.json double-counts weight

**File:** `src/content/generated-skill-registry.test.ts:19-37`
**Issue:** The D-06 guard asserts `GENERATED_SIGNAL_SKILLS.map(s => s.id)` `toStrictEqual` a fixed array, which pins order and length for the *current* set. But there is no dedicated assertion that IDs are unique. If a folder were accidentally listed twice in `skill-order.json`, the same skill object would appear twice in `GENERATED_SIGNAL_SKILLS`, double-counting its weight into the heuristic score — the exact failure mode that `addDeclarativeSkill` (WR-04 in `skill-registry.ts`) guards against for declarative skills, but the *code-seed* path has no equivalent guard. The hardcoded-list test happens to fail in that case today, but only incidentally; the intent should be explicit and robust to future expected-list edits.

**Fix:** Add an explicit duplicate-ID guard independent of the hardcoded order list:
```typescript
it('signal skill IDs are unique', () => {
  const ids = GENERATED_SIGNAL_SKILLS.map(s => s.id);
  expect(new Set(ids).size).toBe(ids.length);
});
```
Apply the same to exclusions.

## Info

### IN-01: `gray-matter` is a declared dependency but unused — the codegen reinvents frontmatter parsing with a hand-rolled regex

**File:** `package.json:28`, `scripts/generate-skill-registry.ts:91-100`
**Issue:** `gray-matter` (a battle-tested frontmatter parser that handles BOM, leading whitespace, both EOLs, and multiple delimiters) is in `dependencies`, but no file imports it (confirmed via search). The codegen instead hand-rolls a fragile regex + `js-yaml`, which is the root cause of WR-03 and WR-04. Either adopt `gray-matter` here (it solves both warnings cleanly) or remove the unused dependency.
**Fix:** Replace the manual parse with `import matter from 'gray-matter'; const { data } = matter(raw);` and validate `data`, or drop `gray-matter` from `package.json`.

### IN-02: `GENERATED_DETECTOR_SKILLS` and `GENERATED_SKILL_METADATA` duplicate the detector entries verbatim

**File:** `src/content/generated-skill-registry.ts:48-71`
**Issue:** The two detector entries (`heuristic`, `llm`) are emitted identically into both `GENERATED_DETECTOR_SKILLS` and `GENERATED_SKILL_METADATA` (the latter being `[...signal, ...exclusion, ...detector]`). The long descriptions are repeated byte-for-byte. Neither export is consumed at runtime (both are documentation-only), so this is harmless, but it bloats the committed module and creates two copies that must stay in sync. Consider having `GENERATED_DETECTOR_SKILLS` be a derived slice of `GENERATED_SKILL_METADATA` rather than a second literal — though as generated code this is low priority.

### IN-03: `LLMDetector` no-fallback path reports `engineUsed: 'heuristic'` despite no heuristic having run

**File:** `src/skills/library/llm/llm.skill.ts:24`
**Issue:** On error with no fallback configured, `detect()` returns `{ score: 0, ..., engineUsed: 'heuristic' }`. No heuristic detector actually ran — the label is inaccurate and could mislead the dashboard/stats attribution by category. Out of strict Phase 31 scope (this file is a moved-not-modified barrel target), but flagged since it was in the review set.
**Fix:** Return a truthful engine label (e.g., `engineUsed: 'llm'` or a dedicated `'none'`/error marker) for the failed-with-no-fallback case, matching whatever the `DetectionResult.engineUsed` union permits.

---

_Reviewed: 2026-06-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
