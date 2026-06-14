---
phase: 26-eval-runner
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/shared/classifier.ts
  - src/background/index.ts
  - scripts/eval.ts
  - scripts/eval.test.ts
  - src/shared/classifier.test.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-06-14
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 26 extracted the LLM classifier into a shared module (`src/shared/classifier.ts`) and built an eval CLI (`scripts/eval.ts`). The shared module is correctly transport-agnostic, the API key is never logged or returned, and the metric math (precision/recall/F1) correctly uses `null` rather than `NaN` for undefined denominators. Prompt-caching headers are preserved. The service worker refactor is behavior-preserving.

One blocker is present: the eval CLI will crash with an unhandled `TypeError` when the input JSON file contains valid JSON that is not an object (e.g. the file contains `null`). Four warnings cover: the unguarded `JSON.parse` in the shared classifier, a fragile `isMain` guard, silent acceptance of empty post text, and missing exit-code test coverage that the plan required but was not delivered.

---

## Critical Issues

### CR-01: Null JSON input causes unhandled TypeError crash in eval CLI

**File:** `scripts/eval.ts:166`

**Issue:** `JSON.parse` does not throw on valid-JSON-but-non-object values — it returns `null`, `[]`, a number, etc. The try/catch on lines 150–156 only catches parse errors. If the input file contains the literal string `null` (or any other non-object JSON), `JSON.parse` succeeds, `parsed` is assigned `null`, and execution continues to line 166 where `parsed.flaggedPosts` throws `TypeError: Cannot read properties of null (reading 'flaggedPosts')`. This TypeError is unhandled and crashes the process with a stack trace instead of the intended clean error message and `process.exit(1)`.

The same issue applies if the file contains a JSON array at the top level: `parsed` would be typed as `unknown[]`, `parsed.flaggedPosts` would be `undefined` (not throw), and the array guard at line 166 would catch it cleanly. The `null` case is the actual crash path.

**Fix:**
```typescript
// After JSON.parse succeeds, validate the shape before proceeding
let parsed: { exportedAt?: string; flaggedPosts: unknown[]; unflaggedPosts: unknown[] };
try {
  const raw = readFileSync(resolve(filePath), 'utf8');
  const json: unknown = JSON.parse(raw);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
    process.exit(1);
  }
  parsed = json as typeof parsed;
} catch {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}
```

---

## Warnings

### WR-01: `JSON.parse` on LLM response is unguarded in the shared classifier

**File:** `src/shared/classifier.ts:145`

**Issue:** `JSON.parse(jsonStr)` on line 145 has no try/catch. If the Anthropic API returns text that is not valid JSON after fence-stripping (e.g., the model outputs prose commentary, an error message, or a partial response), this throws `SyntaxError: Unexpected token...` with no context about what the raw response text was. Both callers (the service worker `.catch()` and the eval scoring loop) handle the thrown error, so the system remains functional — but diagnosing why a post failed requires checking raw error messages that contain no indication of what the model actually returned.

This also means that any response format deviation (model returning YAML, or adding a preamble before the JSON object) silently appears as a generic `SyntaxError` in traces and the eval `errored` count with no actionable detail.

**Fix:**
```typescript
let parsed: { score: number; signals: Record<string, number> };
try {
  parsed = JSON.parse(jsonStr) as typeof parsed;
} catch {
  throw new Error(`Failed to parse LLM response as JSON. Raw text: ${raw.slice(0, 200)}`);
}
```

### WR-02: `isMain` guard uses fragile `endsWith` filename check

**File:** `scripts/eval.ts:133`

**Issue:** The module-entry guard checks `process.argv[1].endsWith('eval.ts') || process.argv[1].endsWith('eval.js')`. This has two problems:

1. **False positive:** Any file ending in `eval.ts` (e.g. `src/lib-eval.ts`, a test runner shim named `eval.ts`) would trigger `main()` on import — potentially firing CLI side-effects in unexpected contexts.
2. **False negative (fragile):** Under some tsx compilation modes, tsx may rewrite `process.argv[1]` to a temp directory path that does not end in `eval.ts`. This would silently prevent the CLI from running at all when invoked via `npm run eval`.

The idiomatic ESM entry-point check avoids both problems.

**Fix:**
```typescript
import { fileURLToPath, pathToFileURL } from 'url';

// Replace lines 133-138 with:
const isMain = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();
}
```

Note: `fileURLToPath` is already imported on line 10, so only `pathToFileURL` needs to be added to the import.

### WR-03: Empty post text is silently accepted and sent to the LLM

**File:** `scripts/eval.ts:109`

**Issue:** In `collectLabeled`, when an entry has `text` that is not a string (missing field, `null`, number, etc.), the code defaults to `''` (empty string) on line 109:

```typescript
const text = typeof entry['text'] === 'string' ? entry['text'] : '';
```

An empty-string entry then passes all label checks and is added to `labeled`. When the scoring loop sends `classifyPost('', apiKey)`, the LLM receives an empty user message. This wastes API tokens, adds API cost to the run, and produces a score for an empty post that will skew metrics — the classifier is designed to score LinkedIn post text, and empty input is undefined behavior.

**Fix:** Skip (and warn about) entries with a non-string or empty text field:
```typescript
const text = typeof entry['text'] === 'string' ? entry['text'] : '';
if (!text) {
  process.stderr.write(`Warning: skipping entry with empty or missing "text" field.\n`);
  skipped++;
  continue;
}
```

### WR-04: Exit-code tests required by the plan are entirely absent from eval.test.ts

**File:** `scripts/eval.test.ts`

**Issue:** The plan (26-02-PLAN.md Task 3) and the EVAL-05 requirement explicitly call for unit tests covering the CLI's exit-code behavior:

> EVAL-05 exit codes (where feasible without live network — stub fetch and process.exit): no labeled posts path and missing-key path each trigger a non-zero exit / thrown sentinel. For the file-missing and argv-missing cases, assert the stderr message + exit-1 path.

The delivered `eval.test.ts` covers only `collectLabeled`, `computeMetrics`, and `safe()` — pure function tests. None of the five `process.exit(1)` branches in `main()` have any test coverage. The no-label guard, missing-key guard, missing-argv guard, unreadable-file guard, and invalid-array guard are all untested. This means any regression in the CLI's error handling (e.g., a code edit that accidentally moves the API-key guard after the scoring loop) would not be caught by the test suite.

**Fix:** Add tests that stub `process.exit`, mock `fs`, and call `main()` (once exported or made testable) for each exit guard, or at minimum test the derived `collectLabeled` zero-label path by asserting that the caller's no-label check fires. Example for the no-API-key path:
```typescript
it('exits 1 when ANTHROPIC_API_KEY is not set', async () => {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1'); });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  delete process.env['ANTHROPIC_API_KEY'];
  // ... mock fs readFileSync to return valid JSON
  await expect(main()).rejects.toThrow('exit:1');
  expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'));
  exitSpy.mockRestore();
  stderrSpy.mockRestore();
});
```
This requires `main` to be exported from `eval.ts`, which is a one-line change: `export async function main()`.

---

## Info

### IN-01: Markdown fence-stripping regex handles only the most common format

**File:** `src/shared/classifier.ts:144`

**Issue:** The fence-stripping regex:
```typescript
raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
```
handles `\`\`\`json\n...\n\`\`\`` and `` ``` `` (no language tag) but not:
- Backtick fences without a trailing newline: `` ```json{...}``` `` (no newlines)  
- Responses with prose before or after the fence block
- `~~~` fences (Markdown alternative)

Any of these causes `JSON.parse` to throw. This is inherited from the pre-extraction code and not newly introduced in Phase 26, but as the single source of truth it is worth hardening. Consider using a more robust extraction: find the first `{` and last `}` to extract the JSON object regardless of surrounding text.

### IN-02: Best-F1 default of threshold=35 when all posts error is misleading

**File:** `scripts/eval.ts:228`

**Issue:** When `scored.length === 0` (every post errored during LLM scoring), all `f1` values in `thresholdRows` are `null`. The best-F1 search finds no non-null f1, so `bestF1Threshold` stays at `THRESHOLDS[0]` = 35 and `bestF1Value` stays `null`. The compact summary line then prints:

```
Eval 2026-06-14 | 0 posts | best F1 @T=35 (P=n/a R=n/a F1=n/a) | cost $0.000000 total
```

The "best F1 @T=35" is meaningless here — no threshold was actually best. The summary would be clearer if it checked whether `bestF1Value === null` and substituted a message like `(no scored posts — all errored)` instead of a threshold reference.

This is a display-only issue; no data is lost or corrupted.

---

_Reviewed: 2026-06-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
