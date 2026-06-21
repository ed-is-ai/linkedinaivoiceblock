---
phase: 32-tool-abstraction-layer
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/shared/skills/types.ts
  - src/shared/skills/tool-contract.test-types.ts
  - src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts
  - src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts
  - src/skills/library/dom-selector-rederive/SKILL.md
  - scripts/generate-skill-registry.ts
  - scripts/skill-order.json
  - src/shared/generated-tool-registry.ts
  - src/shared/tool-registry.ts
  - src/shared/generated-tool-registry.test.ts
  - src/background/index.ts
  - src/content/detector/rederiver.ts
  - src/skills/library/dom-selector-registry/SKILL.md
  - src/skills/library/AUTHORING.md
  - package.json
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-06-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 32 introduces a `Tool<I, O>` contract, migrates `rederiveSelector` into the `dom-selector-rederive` tool, stands up a codegen-backed `ToolRegistry`, corrects the `dom-selector-registry` kind mislabel (CR-01), and documents the skill-vs-tool rule. The overall structure is sound: import paths are correct, MV3 static-import constraint is respected, the single-writer invariant is undisturbed, and the latch/rate-limit/key-check ordering in `background/index.ts` is preserved (D-06).

Two behavioral deviations from the "byte-identical" goal are identified:

1. **WR-01 (Warning):** The success-trace `userPrompt` field now always records the bare first-attempt prompt even when the actual successful API call was the second attempt (which includes a `retryHint` prefix). The original code recorded the real prompt that was sent on the successful attempt. This is a traceability regression.

2. **WR-02 (Warning):** The HTTP-error branch of `execute()` (lines 160–163) has no unit test. A 401 or 429 response from the Anthropic API exercises an untested code path, weakening the zero-behavior-change guarantee.

Two informational findings are also noted.

---

## Warnings

### WR-01: Success-trace `userPrompt` does not reflect the actual prompt sent on retry

**File:** `src/background/index.ts:262-268`

**Issue:** When `tool.execute()` succeeds on the **second** attempt (after a first attempt that produced an unparseable response), the tool internally prepends a `retryHint` prefix to `userContent` before sending it to the API. The success trace recorded in `background/index.ts` always assembles the prompt as `Target: ${message.target}\n\nDOM skeleton:\n${message.domSkeleton}` — the bare first-attempt form — regardless of which attempt actually succeeded.

The original `rederiveSelector` at `background/index.ts` (pre-Phase 32) recorded `userContent` at line 323 — the variable that held the actual prompt sent to the API, including the `retryHint` on attempt 2. After the migration, `execute()` returns only `{ candidates, usage }` (D-07 decision), so the caller has no access to which attempt string was sent.

Impact: if the retry path is ever used in production, the stored trace contains a misleading userPrompt that does not match what the LLM actually received, making debugging harder.

**Fix:** Have `execute()` return the `userPrompt` that was actually sent alongside `{ candidates, usage }`:

```typescript
// dom-selector-rederive.tool.ts — change return type and return statement
export const domSelectorRederiveTool: Tool<
  { target: string; domSkeleton: string },
  { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined; userPrompt: string }
> = {
  // ...
  async execute({ target, domSkeleton }) {
    // ...
    for (let attempt = 1; attempt <= 2; attempt++) {
      const retryHint = ...;
      const userContent = `${retryHint}Target: ${target}\n\nDOM skeleton:\n${domSkeleton}`;
      // ...
      try {
        // on success:
        return { candidates: parsed.candidates, usage: data.usage, userPrompt: userContent };
      } catch (err) { ... }
    }
    throw lastErr ?? new Error('rederive failed');
  },
};
```

```typescript
// background/index.ts — use returned userPrompt in the trace
const { candidates, usage, userPrompt } = await tool.execute({ target, domSkeleton });
recordTrace({
  source: 'rederiver',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: REDERIVE_SYSTEM_PROMPT,
  userPrompt,
  usage,
});
```

Alternatively, accept the traceability loss as a known and documented deviation from the original behavior.

---

### WR-02: HTTP-error branch in `execute()` is untested

**File:** `src/skills/library/dom-selector-rederive/dom-selector-rederive.test.ts` — missing test; code under test at `src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts:160-163`

**Issue:** When the Anthropic API returns a non-2xx response (e.g., `401 Unauthorized`, `429 Too Many Requests`), `execute()` calls `response.text()` and throws `Error('API ${response.status}: ${body}')`. There is no test in `dom-selector-rederive.test.ts` that exercises this branch. The test suite covers the no-API-key rejection, malformed JSON, and schema validation failures — but not HTTP errors.

This matters for the zero-behavior-change guarantee: any subtle deviation from the original behavior in this path (e.g., a response status included in the error message) would be undetected.

**Fix:** Add a test case for the HTTP error path:

```typescript
// dom-selector-rederive.test.ts
describe('domSelectorRederiveTool.execute — HTTP error (T-32-01)', () => {
  it('throws immediately on a non-ok response (no retry)', async () => {
    store['anthropicApiKey'] = 'sk-ant-test';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"type":"error","error":{"type":"authentication_error"}}',
    });

    await expect(
      domSelectorRederiveTool.execute({ target: 'T', domSkeleton: '<div></div>' }),
    ).rejects.toThrow('API 401');

    // HTTP errors do NOT retry — only one fetch call
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

---

## Info

### IN-01: `isRederiveModelOutput` does not reject an empty `candidates` array

**File:** `src/skills/library/dom-selector-rederive/dom-selector-rederive.tool.ts:86-97`

**Issue:** `Array.prototype.every()` returns `true` for an empty array. A response of `{"candidates":[]}` passes `isRederiveModelOutput`, causing `execute()` to return `{ candidates: [], usage }`. The heal orchestrator would receive an empty candidates list, which it likely handles gracefully (no candidates to try), but the schema guard does not enforce the system prompt's stated requirement of "Return 1-3 candidates."

This is a pre-existing behavior from the original `background/index.ts` (line 165 pre-Phase 32) — the validation was relocated verbatim. It is not a regression introduced by Phase 32.

**Fix (optional):** Add a minimum-length check inside `isRederiveModelOutput`:

```typescript
if (!Array.isArray(obj['candidates']) || obj['candidates'].length === 0) return false;
```

---

### IN-02: Codegen does not cross-validate that a folder in `tools` array has `metadata.kind: tool`

**File:** `scripts/generate-skill-registry.ts:154-164`

**Issue:** The codegen parses each folder's SKILL.md and validates that `metadata.kind` is one of the four permitted values. It does NOT assert that a folder listed in `skill-order.json`'s `tools` array must have `kind: tool`. If a skill folder (e.g., a `signal` skill) were accidentally added to the `tools` array, the codegen would emit an import using `importVarName(folder, 'tool')` (producing a `...Tool` suffix), but the actual export has a `...Skill` suffix — causing a TypeScript compile error caught by `npm run type-check`, not by the codegen itself.

The compile-time catch is adequate for now (one tool, active team), but the mismatch could cause confusion during authoring.

**Fix (optional):** Add a kind-consistency check after parsing `toolEntries`:

```typescript
for (const entry of toolEntries) {
  if (entry.kind !== 'tool') {
    process.stderr.write(`ERROR: '${entry.folder}' is listed in tools[] but SKILL.md metadata.kind is '${entry.kind}' (expected 'tool')\n`);
    process.exit(1);
  }
}
```

---

## Structural Findings (fallow)

No structural pre-pass was provided.

---

_Reviewed: 2026-06-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
