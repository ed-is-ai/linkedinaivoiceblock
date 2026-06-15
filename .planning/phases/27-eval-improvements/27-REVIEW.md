---
phase: 27-eval-improvements
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - scripts/eval.ts
  - scripts/eval.test.ts
  - scripts/eval-label.ts
  - scripts/eval-label.test.ts
  - scripts/eval-compare.ts
  - scripts/eval-compare.test.ts
  - src/shared/eval/metrics.ts
  - src/shared/eval/metrics.test.ts
  - src/shared/eval/runs.ts
  - src/shared/eval/runs.test.ts
  - src/shared/eval/index.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-06-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 27 implements a pure host-agnostic eval core (`src/shared/eval/`), a selectable detector engine in `scripts/eval.ts`, an interactive/auto labeling helper (`eval-label`), and a run-comparison CLI (`eval-compare`). The shared core is genuinely pure — `metrics.ts`, `runs.ts`, and `index.ts` contain no `fs`/`process`/`chrome`/DOM access and only type-only import `PostData`. Divide-by-zero guards and null-vs-NaN handling are well covered by tests.

The defects concentrate in the CLI argument parsing and file-I/O validation layer. The most consequential are: (1) `eval-compare` silently leaks the `--format` value into the positional file list unless the flag is placed last; (2) `eval-compare`'s `loadRun` validates JSON parse but not shape, so a well-formed-but-wrong-shape file crashes with an unhandled `TypeError` instead of the clean exit-1 the other two CLIs give; and (3) `eval.ts` accepts any non-`heuristic` `--engine` value and silently falls back to the *paid* LLM engine, so a typo bills the user. No security vulnerabilities or data-loss risks were found, and no Critical-tier issues.

## Warnings

### WR-01: `eval-compare` leaks the `--format` value into the file-path list

**File:** `scripts/eval-compare.ts:142-143`
**Issue:** `files` is computed as `args.filter(a => !a.startsWith('--'))`, which strips the `--format` flag but NOT its value token `markdown`. Unlike `eval.ts` (which excludes the flag-value index via `engineValueIdx`), `eval-compare` never excludes the `--format` value. If the flag is not placed strictly after both file args, `markdown` is treated as a positional file path:
- `eval-compare a.json --format markdown` → `files = ['a.json', 'markdown']` → `fileB = 'markdown'` → `loadRun('markdown')` fails → exits 1 with a misleading "Could not read or parse file: markdown" message.
- `eval-compare --format markdown a.json b.json` → `files = ['markdown', 'a.json', 'b.json']` → silently compares `markdown` (fails) — or in the absent-error variant, the wrong two files.

The passing test (`eval-compare.test.ts:282`) only ever places `--format markdown` *after* both files, where array destructuring `const [fileA, fileB]` discards the trailing `markdown`, masking the bug.
**Fix:** Exclude the flag value the same way `eval.ts` does, e.g.:
```ts
const fmtIdx = args.indexOf('--format');
const fmtValueIdx = fmtIdx !== -1 ? fmtIdx + 1 : -1;
const files = args.filter((a, i) => !a.startsWith('--') && i !== fmtValueIdx);
```

### WR-02: `eval-compare` `loadRun` does not validate shape — crashes on wrong-shape JSON

**File:** `scripts/eval-compare.ts:125-133`
**Issue:** `loadRun` wraps `readFileSync` + `JSON.parse` in try/catch and casts the result `as EvalRun` with no structural validation. A file containing valid JSON of the wrong shape (e.g. `{}`, `null`, an array, or an old/partial results file lacking `thresholds`) passes the try/catch, then `compareRuns` → `summarize` executes `run.thresholds.find(...)`, throwing an uncaught `TypeError: Cannot read properties of undefined (reading 'find')` and exiting with an ugly stack trace. This is inconsistent with `eval.ts` (`loadExport`) and `eval-label.ts`, which both validate top-level shape before use. The existing tests only feed fully-formed `makeRunJson()` fixtures, so this path is untested.
**Fix:** Add a shape guard after parse, mirroring `loadExport`:
```ts
const parsed = JSON.parse(raw) as unknown;
if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
    || !Array.isArray((parsed as Record<string, unknown>)['thresholds'])) {
  process.stderr.write(`Error: ${filePath} is not a valid EvalRun record.\n`);
  process.exit(1);
}
return parsed as EvalRun;
```

### WR-03: `--engine` silently falls back to the paid LLM engine on any invalid value

**File:** `scripts/eval.ts:152-156`
**Issue:** The engine is selected as `heuristic` only when `args[engineFlagIdx + 1] === 'heuristic'`, else `llm`. Any other value — a typo (`heuristik`), wrong case (`Heuristic`), or a missing value — silently selects the LLM engine, which makes real (billed) Anthropic API calls. A user who intended the free heuristic engine but mistyped the flag is charged for LLM scoring with no warning. The flag value is never validated against the known set.
**Fix:** Validate the value explicitly and error on anything unrecognized:
```ts
let engine: 'heuristic' | 'llm' = 'llm';
if (engineFlagIdx !== -1) {
  const val = args[engineFlagIdx + 1];
  if (val === 'heuristic' || val === 'llm') engine = val;
  else {
    process.stderr.write(`Error: invalid --engine "${String(val)}" — expected "heuristic" or "llm".\n`);
    process.exit(1);
  }
}
```

### WR-04: Interactive `eval-label` never restores raw mode / pauses stdin on quit-by-Ctrl-C, and `readKey` listener leaks

**File:** `scripts/eval-label.ts:118-205`
**Issue:** In interactive mode `process.stdin.setRawMode(true)` is set, but the matching `setRawMode(false)`/`pause()` at lines 198-199 only runs after the `for` loop completes normally or via `break`. The `key === ''` branch (line 178) is documented as "q or Ctrl-C", but in raw mode Ctrl-C delivers `''`, not `''` — so a real Ctrl-C does not hit this branch, leaves the terminal in raw mode (no echo, no line buffering) on exit, and the process may hang because `stdin` is still resumed. Additionally, each `readKey()` registers a `stdin.once('data', …)`; if a keypress delivers multiple characters or the promise is created but the loop breaks, the listener handling is fragile. There is no `SIGINT` handler to restore the TTY.
**Fix:** Handle `''` (Ctrl-C) explicitly in the key switch, and register a cleanup that restores cooked mode on process exit:
```ts
process.on('SIGINT', () => { process.stdin.setRawMode(false); process.exit(130); });
// in the key switch:
if (key === 'q' || key === '') { /* quit */ break; }
```

### WR-05: `eval-label --auto` writes the file before printing, with no write-failure handling

**File:** `scripts/eval-label.ts:104, 184, 189`
**Issue:** Every `writeFileSync(resolve(filePath), …)` call (both `--auto` and the per-keypress interactive writes) is unguarded. A write failure (read-only file, ENOSPC, permission error) throws an uncaught exception, producing a raw stack trace and — in interactive mode — leaving the terminal in raw mode (see WR-04). The read path is carefully wrapped in try/catch but the write path is not, an asymmetry that undermines the "reject malformed input before any mutation" intent. Interactive mode also re-serializes and rewrites the *entire* file on every single keypress (lines 184/189), so a mid-session write error corrupts or truncates the user's only labeled dataset.
**Fix:** Wrap writes in try/catch with a clear stderr message and non-zero exit; restore raw mode first. Consider writing once at session end (or to a temp file + rename) instead of on every keystroke to avoid partial-write corruption.

### WR-06: `eval.ts` writes results file before flushing output, and `writeFileSync`/`mkdirSync` are unguarded

**File:** `scripts/eval.ts:326-328`
**Issue:** `mkdirSync(EVAL_DIR, { recursive: true })` and `writeFileSync(outFile, …)` are not wrapped in try/catch. If the `eval/` directory is unwritable or the disk is full, the run throws after all (potentially paid) LLM scoring has completed — losing the entire run's results and cost with an uncaught stack trace, even though the data is fully computed in memory. Given LLM runs incur real cost, a failed persist after a successful scoring loop is a meaningful loss.
**Fix:** Wrap the persist in try/catch; on failure, still print the full table + summary to stdout (so the user can recover the numbers) before exiting non-zero:
```ts
try {
  mkdirSync(EVAL_DIR, { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
} catch (err) {
  process.stderr.write(`Warning: could not write ${outFile}: ${String(err)}\n`);
}
```

## Info

### IN-01: `readline` is imported solely to satisfy a `void readline` no-op

**File:** `scripts/eval-label.ts:7, 202`
**Issue:** `import readline from 'readline'` is never used; line 202 `void readline;` exists only to suppress the unused-import lint, with a misleading comment ("Use readline.clearLine…"). This is dead code.
**Fix:** Remove the import and the `void readline;` statement; the interactive reader uses `process.stdin` directly.

### IN-02: `--auto` mode duplicates label-mutation logic instead of using `applyLabel`

**File:** `scripts/eval-label.ts:91-102`
**Issue:** The `--auto` loop inlines `(entry as Record<string, unknown>)['label'] = 'ai'|'human'` rather than calling the tested, exported `applyLabel` helper. This duplicates the null/object guard and risks drift if the labeling contract changes.
**Fix:** Reuse `applyLabel(data, 'flaggedPosts', i, 'ai')` / `(…, 'unflaggedPosts', i, 'human')` in the auto loop for a single source of truth.

### IN-03: `score` variable in interactive `eval-label` is computed but only used in a header line; type is `number | '?'`

**File:** `scripts/eval-label.ts:170-172`
**Issue:** `const score = typeof entry['score'] === 'number' ? entry['score'] : '?'` mixes `number` and string `'?'`. This is benign for display but is a loose-typing smell that could mask a real missing-score case. Minor.
**Fix:** Keep as display-only, or normalize to a formatted string up front for clarity.

### IN-04: `MODEL` constant duplicated across CLI and tests; cost depends on a hardcoded model id

**File:** `scripts/eval.ts:38`
**Issue:** `const MODEL = 'claude-sonnet-4-6'` is hardcoded and also restated in test fixtures (`eval-compare.test.ts`, `runs.test.ts`). If `classifyPost` ever changes the model it actually calls, the cost computation (`computeCostUsd(MODEL, …)`) would silently use the wrong pricing while the API used a different model.
**Fix:** Source the model id from a single shared constant consumed by both `classifyPost` and `eval.ts`, so cost pricing and the actual call can never diverge.

### IN-05: `fmt2` formatter duplicated between `eval.ts` and `eval-compare.ts`

**File:** `scripts/eval.ts:334`, `scripts/eval-compare.ts:24`
**Issue:** The null-safe number formatter is copy-pasted in both CLIs (the eval-compare copy even notes "copied from eval.ts §fmt2 — one-liner, no import"). Two independent copies of an output-format helper can drift (e.g. `' n/a'` vs `'n/a'` — they already differ in leading space).
**Fix:** Move `fmt2` into `src/shared/eval/metrics.ts` (it is pure and host-agnostic) and import it in both CLIs.

---

_Reviewed: 2026-06-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
