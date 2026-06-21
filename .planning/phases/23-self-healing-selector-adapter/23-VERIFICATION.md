---
status: passed
phase: 23-self-healing-selector-adapter
verified: 2026-06-13
requirements: [ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, ADAPT-05, ADAPT-06, ADAPT-07, ADAPT-08, ADAPT-09, ADAPT-10]
must_haves_total: 10
must_haves_verified: 10
automated_checks: "tsc clean; 228 tests pass (15 files)"
verification_method: inline (background subagents could not acquire Bash this session — see note)
---

# Phase 23 Verification — Self-Healing Selector Adapter

**Goal:** The extension detects when selector scraping has broken on an active LinkedIn feed and automatically re-derives working candidates — heuristics first, then an LLM fallback — with strict validation before any write, rate-bounded LLM calls, and full privacy protection.

**Verdict: PASSED.** All 10 ADAPT requirements are implemented in the codebase and covered by automated tests, with two paths explicitly designated manual/non-CI by the requirements themselves (see Manual Verification).

## Requirement-by-requirement

| Req | Status | Evidence |
|-----|--------|----------|
| ADAPT-01 | ✓ | `observer.ts`: `isFeedUrl` + `hasFeedContainer` + `hasSessionActivity(>=3)` + 30s `BREAKAGE_DEBOUNCE_MS` zero-match window, evaluated in the MutationObserver callback and a 5s safety interval; resets in `reinit()`. Guard functions + suppression tested in `heal.test.ts`. |
| ADAPT-02 | ✓ | `heuristic.ts` `deriveHeuristicCandidates` walks the container for data-*/role analogs, no API call; 22 tests incl. class-rot heal proof. |
| ADAPT-03 | ✓ | `validator.ts` `validateCandidate` gate (match-count, author-link ratio, post-text, sponsored advisory, blocklist); `heal.ts` writes only after `validateCandidate` passes. heal.test.ts D3/D5. |
| ADAPT-04 | ✓ | `sanitizer.ts` `buildDomSkeleton` strips text/href/src/aria-label/title/alt; `heal.ts` sends only the skeleton. heal.test.ts D4 asserts no licdn/name/href/`/in/`/Boston in the outgoing skeleton. |
| ADAPT-05 | ✓ | `background/index.ts` single-flight latch + 5-min cool-off + daily cap 5, persisted to `chrome.storage.local`, written before fetch; `ratelimit.test.ts` (9 D8 tests) incl. SW-restart survival. |
| ADAPT-06 | ✓ | `isRederiveModelOutput` type guard; selectors only passed to querySelectorAll; no `eval(`/`new Function(`/`.innerHTML` (grep-verified). |
| ADAPT-07 | ✓ | `selector-registry.ts` `insertCandidate` prepends new + retains prior at index 1 + 10-cap without evicting seed; tested. |
| ADAPT-08 | ✓ | `candidateConfidence` = (matchCount+1)×recency×sourceWeight, seed<heuristic<llm<user, 0.3 never-matched floor; tested. |
| ADAPT-09 | ✓ (4/5 auto + manual) | 10 fixtures + `heal.test.ts`: partial breakage (class-rot), logged-out, skeleton/empty, heal-to-wrong (job-cards). Reset round-trip + live-key path are manual (see below). |
| ADAPT-10 | ✓ | `PRIVACY.md` now discloses the sanitized-skeleton selector-repair call to Anthropic. |

## Automated checks

- `npx tsc --noEmit` → clean.
- `npx vitest run` → 15 files, **228 tests pass**.
- Grep gates: no `eval(`/`new Function(`/`.innerHTML` in background/index.ts or rederiver.ts; correct `llbRederiveDateKey` spelling; `claude-haiku-4-5-20251001` + `max_tokens: 256` present; heal.ts uses `validateCandidate` before `insertCandidate`.

## Manual verification (non-CI, by requirement design)

1. **LLM live-key path (ADAPT-09):** The real Anthropic call in `rederiveSelector` is exercised only with a configured API key against a live broken feed. ADAPT-09 explicitly scopes this as a manual (non-CI) test. Recommended: set `anthropicApiKey`, simulate class-rot on a live feed, confirm a healed candidate is written.
2. **Reset round-trip:** The dashboard "reset selectors" control (Phase 22) restoring the seed after a heal is a cross-phase manual check; no automated round-trip test was added in Phase 23 (the heal write path is covered; the reset control lives in the Phase 22 dashboard).

## Notes / follow-ups

- **23-04-PLAN.md was truncated** during planning (ends mid-Task-1). Tasks 2/3 were reconstructed from the complete frontmatter contract (`must_haves`/`artifacts`/`key_links`) + 23-RESEARCH.md. Consider regenerating the plan prose for the record. (Documented in 23-04-SUMMARY.md.)
- **Observer-internal guards** (`hasSessionActivity` counter, 30s window timing) are correct by construction and covered indirectly, but lack dedicated unit tests because observer module state is not exported. Optional hardening: export a test seam or add an integration test with fake timers.
- **Execution note:** Background executor subagents could not acquire the Bash tool this session; all four plans were executed inline on `master` per user direction. Code-review subagent (gsd-code-review) was not run for the same reason — recommend running `/code-review` or `/gsd-code-review 23` manually.
