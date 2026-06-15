# Project Research Summary

**Project:** LinkedIn Blocker v10.0 - LLM-Primary Detection & Eval-Driven Tuning
**Domain:** Chrome MV3 extension - LLM classification, cost guardrails, eval-driven config, CI regression gate
**Researched:** 2026-06-15
**Confidence:** HIGH

## Executive Summary

LinkedIn Blocker v10.0 promotes LLMDetector from optional path to the primary per-post classifier, with HeuristicDetector demoting to a silent fallback. The existing codebase already has all the structural pieces: LLMDetector wraps HeuristicDetector as a constructor argument, classifyPost is transport-agnostic in src/shared/classifier.ts, and the v9.0 eval harness can sweep thresholds and report precision/recall/F1. v10.0 stitches those pieces into a coherent production loop: (1) cost-guardrailed LLM-primary detection, (2) an eval-derived config replacing hand-tuned constants, and (3) a regression gate that blocks config regressions before they ship. No new runtime dependencies are required; no new DOM scraping surfaces are introduced.

The recommended build order is config-foundation first (a shared detectionConfig.ts that all callers import), then LLM-primary promotion (always instantiate LLMDetector(heuristic), remove the API-key gate in init()), then the cost guardrail (session counter in chrome.storage.local, mirroring the existing rederive rate-limit pattern), then heuristic weights support, then the regression gate tooling, and finally the tuning run itself. The three cross-cutting must-ship-together couplings are: (a) LLM-primary promotion must include a scored-URN session cache (COST-1) plus an optimistic heuristic pre-hide (MV3-1); (b) eval-derived config must include a train/test split (EVAL-1) and a precision-constrained operating-point selector (EVAL-2); (c) the CI regression gate must run the deterministic heuristic engine.

The primary risk is cost overrun from SPA re-navigation re-triggering SCORE_POST on already-scored posts (COST-1), combined with the service worker ~30s idle termination resetting any in-memory counter (COST-2). Both have proven mitigations: the scored-URN session cache prevents re-scoring, and persisting all guardrail state to chrome.storage.local ensures the cap survives SW restarts. The secondary risk is an eval-derived config overfitted to its training set or optimised for raw F1 rather than precision - mitigated by a mandatory hold-out split and the precision-constrained operating-point selector (precision >= 0.90 floor).

---

## Key Findings

### Recommended Stack

No new runtime or build dependencies are required. The existing stack (TypeScript 5, Preact 10, Vite 5, vitest, tsx) covers every v10.0 capability. Three new hand-rolled modules: src/background/rateLimiter.ts (~60 lines), scripts/derive-config.ts (~40 lines), scripts/eval-gate.ts (~50 lines). Two new committed artifacts: src/shared/detectionConfig.ts (single source of truth for thresholds and session caps) and eval/baseline.json (accepted EvalRunSummary for regression comparison).

**Core technologies:**
- claude-sonnet-4-6 - per-post LLM classifier (primary); already in use; do NOT downgrade to Haiku for v10.0. Haiku requires a 4,096-token minimum for cache activation; the ~1,300-token SYSTEM_PROMPT does not meet this, so cache hits would never activate and per-call cost would exceed Sonnet cache reads.
- claude-haiku-4-5-20251001 - selector rederiver only; unchanged
- chrome.storage.local - all rate-limit state; SW is stateless, module-scope counters are silently zeroed on every restart
- tsx - existing devDep; reused for derive-config.ts and eval-gate.ts without any new dependencies
- Vite 5 native JSON import (resolveJsonModule: true) - allows a static detectionConfig.json import as alternative to a .ts module; ARCHITECTURE.md recommends the .ts module for compile-time type safety

**Prompt caching (verified 2026-06-15):** The default cache TTL changed from 1 hour to 5 minutes on 2026-03-06. The existing cache_control ephemeral setting is correct for interactive sessions; no code change needed. At ~1,300-token SYSTEM_PROMPT and 100-token post, a cache-hit call costs ~$0.00159 vs ~$0.007 for the first call in a 5-minute window.

**What NOT to add:** Anthropic SDK (200+ KB SW bundle bloat), Zod/AJV (overkill), Message Batches API (async 24h), structured outputs output_config.format (+497 tokens/call AND invalidates prompt cache), chrome.storage.session (cleared on browser close).

### Expected Features

**Must have (table stakes for v10.0 coherence):**
- LLM-primary instantiation: new LLMDetector(new HeuristicDetector(...)) is always the detector; remove the anthropicApiKey ternary in init()
- Silent fallback on any error path: no API key, HTTP error, 429, timeout, or session cap all silently fall through to heuristic; engineUsed field records which path ran
- engineUsed added to StoredPost (optional field, no migration needed; absent = heuristic for pre-v10 records)
- Per-session LLM call counter with storage-persisted state; default cap is a calibration decision (see CALIBRATION DECISION section below)
- selectThreshold(rows, minPrecision) in src/shared/eval/metrics.ts - precision-constrained operating-point selector
- detectionConfig.ts as single committed source of truth
- eval/baseline.json committed EvalRunSummary
- npm run eval:gate - exits non-zero on precision or F1 regression
- npm run eval:bless - human-initiated baseline promotion
- FP-targeted prompt refinement: 2-4 hard-negative examples from errorAnalysis.falsePositives added to SYSTEM_PROMPT

**Should have (high value, add if time permits):**
- Session cost display in popup - makes the guardrail tangible; trivial once storage key exists
- Score confidence band in tombstone - DetectionResult.confidence already carries high/medium/low
- Threshold derived/default label in dashboard
- Precision-recall sweep table with * marker on selected operating point in eval output

**Defer (v10.x or v11+):**
- Collapsible tombstone for borderline-confidence posts (60-69 band)
- Profile/engagement signals fed to the LLM prompt (needs DOM scraping milestone first)
- Automated regression gate in GitHub Actions CI

**Anti-features (explicitly excluded):**
- Automatic threshold promotion to chrome.storage.local from CLI (browser storage is inaccessible from Node scripts)
- Retroactive re-scoring of stored posts (element already removed from DOM; wastes budget)
- LLM abstention (score: null) - creates a third outcome the content script does not handle
- Multiple LLM providers / model routing - unwarranted complexity for a personal tool

### CALIBRATION DECISION - Per-Session Cost Cap Default

**The two researchers diverge on this number and it should not be silently averaged.**

| Source | Session cap | Daily cap |
|--------|-------------|-----------|
| STACK.md | 200 posts/session + 500/day (30-min window) | 500/day |
| FEATURES.md + ARCHITECTURE.md | 50 posts/session (UTC-day reset) | not specified |

STACK.md grounds its 200-post figure in cost math: 50 posts is approximately $0.085, 200 posts is approximately $0.325 per session. FEATURES.md and ARCHITECTURE.md do not show their reasoning for 50. Both agree the cap values should be config-driven so the user can adjust from the popup without a rebuild.

**Recommendation:** Ship with a conservative default (50 posts/session), expose as user-configurable in popup Settings, and calibrate from real session trace data once live. The implementation cost of making it configurable is zero.

### CALIBRATION DECISION - Operating-Point Selection

The researchers broadly agree that operating-point selection must be precision-constrained, NOT raw best-F1. They differ only on the exact floor values.

| Source | Precision floor | Recall floor |
|--------|-----------------|--------------|
| FEATURES.md | precision >= 0.90 (hard); step down to >= 0.85 if no row qualifies | none stated |
| PITFALLS.md (EVAL-2) | precision >= 0.90 (hard) | recall >= 0.60 (soft floor) |

**Recommendation:** Implement selectThreshold(rows, minPrecision = 0.90, minRecall = 0.60). The 0.90/0.60 values are the open knobs. The precision floor is the hard gate (FP-averse use case: hiding a human post is worse than missing an AI post). The recall floor prevents a degenerate solution that achieves 100% precision by hiding nothing. Both floors should be named constants in detectionConfig.ts so they appear in git history when tuned.

### Architecture Approach

The architecture changes are surgical - three existing modules modified, three new files added. The structural support for LLM-primary already exists: LLMDetector wraps HeuristicDetector as a fallback constructor argument, classifyPost is the single shared implementation used by both the service worker and the eval CLI, and the rederive rate-limit in background/index.ts is the ready-made pattern for per-session storage-persisted guardrail state.

**Major components and their v10.0 changes:**

1. src/shared/detectionConfig.ts (NEW) - single source of truth for autoHideThreshold, flagThreshold, maxPostsPerSession, maxCostUsdPerSession, heuristicWeights, and baselineEvalRunId; imported by content/index.ts, background/index.ts, heuristic.ts, scripts/eval.ts, scripts/eval-gate.ts
2. src/background/index.ts - scorePost() gains checkSessionCap() / incrementSessionCounters() helpers (mirrors checkRateLimit / acquireRateLimitLatch); reads 5 new storage keys in a single batched get at the top of SCORE_POST
3. src/content/index.ts - removes the anthropicApiKey ternary that picked bare heuristic; always instantiates LLMDetector(heuristic); replaces FLAG_THRESHOLD = 35 and autoHideThreshold = 60 hard-codes with DetectionConfig.*
4. src/content/detector/heuristic.ts - accepts optional weights in constructor; applies DetectionConfig.heuristicWeights multipliers to signal scores post-compute (non-destructive; all weights default to 1.0)
5. src/shared/types.ts - adds 5 session-guardrail keys to StorageSchema
6. scripts/eval-gate.ts (NEW) - regression gate; checks precision and F1 independently at DetectionConfig.autoHideThreshold; exits non-zero on regression; prints diff table
7. eval/baseline.json (NEW committed artifact) - EvalRunSummary projection; updated by npm run eval:bless

**Key data flow (runtime):** MutationObserver -> LLMDetector.detect() -> optimistic heuristic pre-hide (if score >= flagThreshold) -> SCORE_POST message -> background/index.ts checks session cap -> classifyPost() -> increment counters -> response -> confirm or revert hide decision.

**Key data flow (eval pipeline):** npm run eval -> eval/results-DATE.json -> human reviews -> updates detectionConfig.ts -> commits -> npm run eval:gate --promote -> updates eval/baseline.json -> extension rebuild picks up new config.

### Critical Pitfalls

1. **COST-1 - LLM called on SPA re-nav (MUST SHIP WITH LLM-PRIMARY)** - LinkedIn re-renders previously-scored posts after every history.pushState. The processedPosts Set resets on reinit(), so URNs are re-queued. Prevention: a module-scope Map<urn, DetectionResult> session cache in the content script that survives SPA navigation. This is a precondition for LLM-primary being cost-safe.

2. **COST-2 - Guardrail counter lost on SW termination (MUST USE STORAGE)** - The service worker terminates after ~30s idle; any in-memory counter resets to zero on restart. Prevention: all guardrail state in chrome.storage.local, read fresh on every SCORE_POST, same pattern as checkRateLimit / acquireRateLimitLatch.

3. **MV3-1 - Flash of bot content (MUST SHIP WITH LLM-PRIMARY)** - LLM round-trip is 800-2000ms; the post is visible in the DOM before the hide fires. Prevention: optimistic heuristic pre-hide before dispatching SCORE_POST; if score >= flagThreshold, apply .llb-hidden immediately; confirm or revert when LLM result arrives.

4. **EVAL-1 - Train/test leakage (MUST HAVE HOLD-OUT SPLIT)** - Selecting the threshold on the same posts it was evaluated against produces overfitted metrics. Prevention: reserve >= 20% of labeled posts as held-out test set; with < 100 posts, prefer 5-fold cross-validation.

5. **EVAL-2 - Best-F1 operating point tanks precision** - Raw F1-optimal threshold accepts more FPs in exchange for recall. Prevention: selectThreshold(rows, minPrecision = 0.90, minRecall = 0.60) - never use raw bestF1Threshold as the deployed threshold.

6. **GATE-1 - LLM non-determinism makes the CI gate flaky** - On a small dataset, a few near-threshold posts flip between runs. Prevention: CI regression gate MUST run the heuristic engine (deterministic, free, fast). LLM gate is an offline diagnostic run, not a CI check.

7. **FP-1 - Prompt edits cause silent recall collapse** - Every hard-negative example shifts the decision boundary; FPs recovered are offset by new FNs. Prevention: enforce recall >= 0.60 floor before accepting any prompt change; report FN_new/FN_old ratio alongside FP count.

---

## Implications for Roadmap

Research strongly suggests a 5-phase build order driven by dependency constraints and risk ordering.

### Phase A: Config Foundation

**Rationale:** Everything downstream imports from detectionConfig.ts. Creating it first with values identical to current hard-coded constants means zero behavior change - tests pass, the extension runs identically, and the import graph is established before anything is wired.

**Delivers:** src/shared/detectionConfig.ts with current constant values; 5 new session-guardrail keys in StorageSchema (src/shared/types.ts); content/index.ts and scripts/eval.ts importing from config (cosmetic, no logic change).

**Addresses features:** Sets up the single-source-of-truth required by all subsequent features.

**Gate:** npm test && npm run type-check - all green, behavior unchanged.

**Research flags:** Standard patterns - no research phase needed.

### Phase B: LLM-Primary Promotion (with mandatory couplings)

**Rationale:** The structural change is small (remove the anthropicApiKey ternary in init()), but it MUST ship together with COST-1 and MV3-1 mitigations as preconditions for acceptable cost and UX.

**Delivers:** LLMDetector(heuristic) always instantiated; scored-URN session cache in content script (COST-1 prevention); optimistic heuristic pre-hide (MV3-1 prevention); engineUsed optional field on StoredPost.

**Avoids:** COST-1 (SPA re-nav re-scoring), MV3-1 (flash of bot content).

**Gate:** Manual smoke test with and without API key; verify no duplicate URNs in trace after SPA nav; verify posts with heuristic score >= FLAG_THRESHOLD are hidden within 10ms of DOM insertion.

**Research flags:** No research phase needed - ARCHITECTURE.md provides exact implementation guidance from direct code reading.

### Phase C: Cost Guardrail

**Rationale:** Before LLM-primary is the default for all sessions, the cost cap must be enforced. Depends on Phase B being complete.

**Delivers:** checkSessionCap() / incrementSessionCounters() in background/index.ts; single batched chrome.storage.local.get reads API key + session counters + config together; popup heuristic-mode-active indicator when cap hit; epoch-ms session window (not date string, avoids COST-6); storage budget audit (unflaggedPosts capped at 500, systemPrompt removed from trace entries).

**Default cap:** 50 posts/session (conservative); expose as user-configurable in popup Settings; calibrate from trace data once live.

**Avoids:** COST-2 (counter lost on SW restart), COST-5 (silent cap kill), COST-6 (cap epoch mismatch), MV3-2 (SW terminates mid-fetch), MV3-3 (storage quota).

**Research flags:** No research phase needed - established pattern from existing rederive rate-limit.

### Phase D: Heuristic Weights + Eval-Derived Config (with mandatory couplings)

**Rationale:** These two capabilities must ship together. The eval-derived threshold is meaningless without heuristic weights governing the fallback path, and both require the train/test split and precision-constrained selector before any values are baked in.

**Delivers:** HeuristicDetector optional weights constructor (all 1.0 by default, backward-compatible); selectThreshold(rows, minPrecision = 0.90, minRecall = 0.60) in metrics.ts; scripts/derive-config.ts and npm run derive-config; hold-out split in eval CLI before any threshold selection; first tuning run executed; DetectionConfig.autoHideThreshold updated to precision-constrained operating point; 2-4 hard-negative examples added to SYSTEM_PROMPT (with recall-floor validation after each addition).

**Avoids:** EVAL-1 (leakage - hold-out split), EVAL-2 (wrong operating point), EVAL-3 (config drift - single shared constant), EVAL-4 (dataset minimum documented at 100 posts), FP-1 (recall collapse - floor enforced after each prompt edit), FP-2 (FP analysis at wrong threshold), COST-3 (batch prompt improvements into single deploy).

**Gate:** Hold-out test set eval: precision >= 0.90 at selected threshold, recall >= 0.60, FP count down from baseline, FN count not substantially increased; npm test green.

**Research flags:** No research phase needed - established ML classification tuning practice; PITFALLS.md provides specific detection criteria for each failure mode.

### Phase E: Regression Gate

**Rationale:** Requires Phase D completed tuning run for a meaningful baseline. A gate anchored to pre-tuning heuristic metrics would be immediately re-blessed and provide no value.

**Delivers:** eval/baseline.json committed EvalRunSummary from Phase D tuning run; scripts/eval-gate.ts checks precision AND recall independently (not F1 alone), prints diff table, exits 0/1; npm run eval:gate and npm run eval:bless scripts; CI gate runs heuristic engine; LLM gate is offline diagnostic only.

**Avoids:** GATE-1 (flaky gate - heuristic in CI, deterministic), GATE-2 (stale baseline - documented re-bless process), GATE-3 (wrong metric - precision checked independently of F1).

**Gate:** npm run eval:gate exits 0 against committed baseline; exits 1 when supplied deliberately degraded metrics; exits 1 on precision regression even when F1 holds.

**Research flags:** No research phase needed - STACK.md and ARCHITECTURE.md provide exact script shapes (~50 lines each).

### Phase Ordering Rationale

- Config first: zero behavior change, establishes the import graph before anything is wired.
- LLM-primary before guardrail: the guardrail is meaningless without an active LLM code path; scored-URN cache and optimistic pre-hide are preconditions for enabling LLM-primary safely.
- Guardrail before tuning run: the first tuning run should be cost-capped so accidental overrun during experimentation does not happen.
- Eval-derived config after guardrail: hold-out split and precision-constrained selector must be in place before any values are baked in.
- Regression gate last: requires a meaningful baseline from the first tuning run.

### Research Flags

**Phases needing deeper research during planning:** None. All four research documents are grounded in direct codebase inspection plus live Anthropic API docs verified 2026-06-15.

**Phases with standard patterns (skip research-phase):** All five phases - A through E - use patterns already proven in the existing codebase.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Model IDs and pricing verified from live Anthropic docs 2026-06-15; codebase read directly; no new dependencies means no version-resolution risk |
| Features | HIGH | All table-stakes features grounded in direct codebase inspection; classification tuning approach is standard ML practice |
| Architecture | HIGH | ARCHITECTURE.md read every relevant source file; build order derived from actual import graph and existing patterns; no inferred dependencies |
| Pitfalls | HIGH | Pitfalls derived from direct code reading of SW lifecycle, storage patterns, and eval harness; MV3 SW termination and prompt-cache TTL change are verified facts |

**Overall confidence:** HIGH

### Gaps to Address

- **Session cap default (50 vs 200):** Ship with 50 (conservative), make it user-configurable, calibrate from trace data after the first live LLM-primary sessions. This is a config-only question with no implementation uncertainty.

- **Recall floor value (0.60):** PITFALLS.md suggests 0.60; FEATURES.md does not specify. Treat as a directional guide until the labeled dataset grows beyond 100 posts - with fewer posts the recall estimate has high variance.

- **Hold-out split feasibility:** If the labeled dataset is currently < 100 posts, the phase plan should document the current size and whether 5-fold cross-validation is needed in lieu of a single 80/20 split.

- **detectionConfig.ts vs detectionConfig.json:** STACK.md recommends static JSON import; ARCHITECTURE.md recommends .ts module with as const for compile-time type safety. The .ts module is preferred; check tsconfig.json for resolveJsonModule: true before implementing.

- **Optimistic pre-hide revert UX:** ARCHITECTURE.md cautions against optimistic hide (React reconciler interference); PITFALLS.md recommends it for the heuristic-pre-hide path only (posts above flagThreshold). Validate with a manual smoke test that LinkedIn React reconciler does not fight the early llb-hidden class before the LLM result arrives.

---

## Sources

### Primary (HIGH confidence)
- platform.claude.com/docs/en/about-claude/models/overview - model IDs, pricing, context windows (fetched 2026-06-15)
- platform.claude.com/docs/en/about-claude/pricing - full pricing table, cache write 5m/1h multipliers, cache read rates (fetched 2026-06-15)
- platform.claude.com/docs/en/build-with-claude/prompt-caching - TTL options, minimum token requirements per model (fetched 2026-06-15)
- platform.claude.com/docs/en/build-with-claude/structured-outputs - token overhead for output_config.format (fetched 2026-06-15)
- Direct codebase inspection: src/content/index.ts, src/content/detector/llm.ts, src/content/detector/heuristic.ts, src/background/index.ts, src/shared/classifier.ts, src/shared/types.ts, src/shared/eval/metrics.ts, src/shared/eval/runs.ts, src/shared/eval/evalRunStore.ts, src/content/observer.ts, scripts/eval.ts, package.json

### Secondary (MEDIUM confidence)
- dev.to/whoffagents/anthropic-silently-dropped-prompt-cache-ttl-from-1-hour-to-5-minutes-16ao - TTL change 2026-03-06 (confirmed by official pricing page)
- Standard ML classification tuning practice - precision-constrained operating-point selection for FP-averse use cases (medical NLP, content moderation, spam filtering)
- Standard CI/eval practice - regression gate epsilon 1pp avoids noise-driven false failures while catching meaningful regressions
- MV3 SW lifecycle - Chrome Extensions documentation (SW ~30s idle termination, stateless restart)

### Tertiary (inferred, needs live validation)
- Session cap default (50 vs 200 posts) - calibrate from live trace data once LLM-primary is deployed
- Recall floor value (0.60) - validate against actual labeled dataset distribution

---
*Research completed: 2026-06-15*
*Ready for roadmap: yes*
