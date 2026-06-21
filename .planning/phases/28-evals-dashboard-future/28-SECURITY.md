# SECURITY.md — Phase 28 Evals Dashboard

**Audit date:** 2026-06-15
**ASVS Level:** 1
**Phase:** 28 — Evals Dashboard
**Auditor:** gsd-security-auditor (claude-sonnet-4-6)

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-28-01 | Tampering | mitigate | CLOSED | `src/shared/postStore.ts:70` — `if (post.label === undefined)` guard in `bulkSeedLabels`; only mutates when `label` is absent |
| T-28-02 | Denial of Service | mitigate | CLOSED | `src/shared/eval/evalRunStore.ts:30,65` — `MAX_EVAL_RUNS = 50`; `if (updated.length > MAX_EVAL_RUNS) updated.pop()` |
| T-28-03 | Information Disclosure | accept | CLOSED | See accepted risks section below |
| T-28-04 | Repudiation | mitigate | CLOSED | `src/shared/eval/evalRunStore.ts:42` — module-level `let writeChain: Promise<void> = Promise.resolve()` serialized chain; each append enqueues on `writeChain` with `.catch(() => {})` |
| T-28-05 | Elevation of Privilege | mitigate | CLOSED | `src/manifest.json:38-43` — `web_accessible_resources` entry specifies `"matches": ["https://www.linkedin.com/*"]`; page reads/writes `chrome.storage.local` only, no privileged API exposed |
| T-28-06 | Tampering | mitigate | CLOSED | `src/dashboard/evalsLabeling.ts:32` — `seedLabels()` calls `bulkSeedLabels()`; idempotency enforced in `postStore.ts:70` (`label === undefined` guard); UI reflects result only |
| T-28-07 | Spoofing/XSS | mitigate | CLOSED | `src/dashboard/evals.tsx:699` — post text rendered as JSX children (`{post.text}`); `dangerouslySetInnerHTML` absent from entire file (grep: 0 matches in evals.tsx) |
| T-28-08 | Information Disclosure | mitigate | CLOSED | `src/dashboard/evals.tsx:203` — LLM path uses `chrome.runtime.sendMessage({ type: 'SCORE_POST', postText })`; no `fetch()` to Anthropic, no `apiKey` reference anywhere in evals.tsx or evalsRunEngine.ts; key stays in service worker (`src/background/index.ts:343-359`) |
| T-28-09 | Denial of Wallet | mitigate | CLOSED | `src/dashboard/evals.tsx:55,131-133,351-368` — LLM run gated by `phase:'confirm'` modal showing `postCount × AVG_USD_PER_POST` estimate; Cancel (`handleConfirmCancel`) aborts before scoring; in-run `cancelRef` (line 68,151,181) provides D-06 Cancel |
| T-28-10 | Tampering | mitigate | CLOSED | `src/dashboard/evals.tsx:272` — `incomplete: wasCancelled \|\| scored.length < total` passed to `assembleRun`; `src/dashboard/evalsRunEngine.ts:131` — `...(incomplete ? { incomplete: true } : {})`; partial badge rendered at `evals.tsx:423-425` and `evals.tsx:510` |
| T-28-11 | Spoofing/XSS | mitigate | CLOSED | `src/dashboard/evals.tsx:612-649` — `ErrorCard` renders `post.textPreview` and signal names as JSX children; comment at line 612 explicitly documents no `dangerouslySetInnerHTML`; grep confirms 0 uses of `dangerouslySetInnerHTML` in evals.tsx |
| T-28-SC | Tampering | accept | CLOSED | See accepted risks section below |

---

## Accepted Risks

### T-28-03 — Information Disclosure: label field leaking sensitive data

**Disposition:** Accept

Labels (`'ai'` / `'human'`) are user-authored ground-truth annotations stored in `chrome.storage.local`. This is local-only storage; no new network path, no export function, and no relay was added for the label field in Phase 28. The label is written by `setPostLabel` and `bulkSeedLabels` (both in `src/shared/postStore.ts`) and read by `src/dashboard/evals.tsx` and `src/dashboard/evalsLabeling.ts`. All reads remain within the extension process. No exfiltration path was introduced.

### T-28-SC — Tampering: supply-chain (npm installs)

**Disposition:** Accept

`package.json` was inspected. No new runtime or dev dependencies were added in Phase 28. The `dependencies` block contains only `fast-levenshtein` and `preact` (pre-existing). The `devDependencies` block contains no packages introduced in this phase (no `@testing-library/preact` or any other addition). The legitimacy gate is N/A because the dependency set did not change.

---

## Unregistered Flags

None. Both SUMMARY.md files (28-01, 28-02, 28-03) declare no new threat flags beyond the registered register. The executor explicitly documented this in each summary's `## Threat Flags` section.

---

## Audit Notes

- **T-28-04 serialized writeChain:** The chain is module-level (`let writeChain` at `evalRunStore.ts:42`) — this is the correct idiom for a single-module writer. However, Chrome MV3 service worker restart would reset the in-memory chain. The eval run store is called from the dashboard page (not the service worker), so the module instance is long-lived for the page session. Race risk from service worker restart does not apply here. Accepted as-is.

- **T-28-08 SCORE_POST relay:** `src/background/index.ts:343-359` confirms the relay signature: request `{ type:'SCORE_POST', postText }` → response `{ result } | { error }`. No token usage is returned. `evals.tsx` correctly documents this at lines 200-222 and accumulates cost as an estimate only. The API key lookup happens inside `scorePost()` in the service worker; the page never receives it.

- **T-28-09 cost modal gate:** The modal fires only for the `'llm'` engine path (`evals.tsx:130-138`). Heuristic runs bypass the modal by design (free, local computation). This is consistent with the plan's Claude's Discretion clause. No spend risk for heuristic.

- **XSS surface (T-28-07 / T-28-11):** Verified by grep that `dangerouslySetInnerHTML` does not appear in `evals.tsx` (the only match is a comment at line 612 stating it is NOT used). Text values are passed as JSX text children — Preact escapes these automatically.
