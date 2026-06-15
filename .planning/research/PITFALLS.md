# Pitfalls Research — v10.0 LLM-Primary Detection & Eval-Driven Tuning

**Milestone:** v10.0 — LLM-Primary, Cost Guardrail, Eval-Derived Config, Regression Gate, FP Reduction
**Researched:** 2026-06-15
**Confidence:** HIGH — based on direct codebase inspection of src/background/index.ts, src/content/index.ts, src/content/detector/llm.ts, src/shared/classifier.ts, src/shared/eval/metrics.ts, src/shared/eval/runs.ts, and the existing ADAPT-CRIT pitfall set.

---

## Pitfall Map

| ID | Pitfall | Severity | Phase |
|----|---------|----------|-------|
| COST-1 | LLM called on every post re-render / SPA re-nav | Critical | LLM-Primary |
| COST-2 | Per-session guardrail counter lost on SW termination | Critical | Cost Guardrail |
| COST-3 | Prompt-cache misses from system-prompt drift | Critical | LLM-Primary |
| COST-4 | Model overpowered for the task | Moderate | LLM-Primary |
| COST-5 | Cap hit silently kills the whole feed | Moderate | Cost Guardrail |
| COST-6 | Guardrail cap never resets (wrong epoch) | Moderate | Cost Guardrail |
| EVAL-1 | Train/test leakage — threshold tuned on its own eval data | Critical | Eval-Derived Config |
| EVAL-2 | Best-F1 operating point tanks precision in a FP-averse feed | Critical | Eval-Derived Config |
| EVAL-3 | Config drift — runtime threshold diverges from eval threshold | Critical | Eval-Derived Config |
| EVAL-4 | Dataset too small — metrics are high-variance noise | Moderate | Eval-Derived Config |
| GATE-1 | LLM non-determinism makes the regression gate flaky | Critical | Regression Gate |
| GATE-2 | Baseline never re-blessed — gate permanently red | Moderate | Regression Gate |
| GATE-3 | Gate tests the wrong metric (F1 when precision is the priority) | Moderate | Regression Gate |
| FP-1 | Prompt edits cause silent recall collapse | Critical | FP Reduction |
| FP-2 | FP analysis driven by best-F1 threshold, not the deployed threshold | Moderate | FP Reduction |
| MV3-1 | Flash of bot content — post rendered before async LLM returns | Critical | LLM-Primary |
| MV3-2 | SW terminates mid-SCORE_POST — message channel closed | Critical | LLM-Primary |
| MV3-3 | Storage quota blown by trace + EvalRunStore growth | Moderate | Cost Guardrail |

---

## Critical Pitfalls

### COST-1 — LLM Called on Every Post Re-render / SPA Re-nav

**What goes wrong:**
LinkedIn re-renders posts during virtual scroll (LazyColumn replacement), comment expansion, and SPA navigation. Without dedup, every re-render sends a fresh SCORE_POST message to the service worker, multiplying cost by 3–10×. A user who scrolls back over 20 posts and then navigates away and back can trigger 60+ LLM calls instead of 20.

**Why it happens:**
The current `processedPosts` Set in `observer.ts` deduplicates by URN — which is correct. But the dedup set is cleared on `reinit()` (SPA nav). After a `history.pushState` back to `/feed`, previously-scored posts appear in the DOM again and URNs are re-added to the cleared set, triggering fresh SCORE_POST messages for posts already scored in this browser session.

**How to avoid:**
Maintain a **session-level scored-URN cache** that survives SPA navigation — separate from `processedPosts` (which must reset to catch new posts on re-navigation). Store: `Map<urn, DetectionResult>`. On any `dispatchFromBox`, check the scored cache first; if hit, re-apply the previous decision without contacting the service worker. The cache lives in content-script module scope (not storage — it should not persist across page reloads, only within the tab session).

Additionally, the per-session cost guardrail (see COST-2) provides a backstop, but the cache is the correct primary defence.

**Warning signs:**
- trace-summary output showing duplicate URNs in a single session's traces
- Per-session cost guardrail tripping much earlier than expected (after fewer visible posts than the cap)
- Console log `[LLB] detector: llm` repeated for the same `authorName` in a single scroll session

**Phase to address:** LLM-Primary (the phase that promotes LLMDetector to primary must introduce the scored-URN session cache at the same time).

---

### COST-2 — Per-Session Guardrail Counter Lost on SW Termination

**What goes wrong:**
The service worker terminates after ~30s idle (MV3 lifecycle). If the per-session LLM call counter is held in SW module-scope memory, it is zeroed on every SW restart — which happens multiple times per browsing session. The effective cap is never enforced: a user who scrolls in bursts (30s of activity, 30s of idle, repeat) resets the counter between each burst and the guardrail never fires.

**Why it happens:**
This is the same root cause as ADAPT-CRIT-4 (cost loop) and ADAPT-05 (rederive rate limit). The v7.0 rederive rate limit solved it correctly: all counters go to `chrome.storage.local` on every write. The new per-session guardrail will likely be implemented with an in-memory counter if it is not explicitly designed for SW statelesness.

**How to avoid:**
All guardrail state — call count, session start timestamp, session ID — must be persisted to `chrome.storage.local` on every increment. The SW must read from storage (not a module-scope variable) on every SCORE_POST. Use the same pattern as the existing `checkRateLimit` / `acquireRateLimitLatch` functions in `background/index.ts`.

Define "session" carefully: a tab session (tied to a tab ID passed in the SCORE_POST message) is cleaner than a time-window because it doesn't require a reset-timer. A time-window approach (e.g. "reset every hour") must also persist the window-start timestamp to storage.

**Warning signs:**
- Guardrail never trips regardless of scroll volume
- Traces showing hundreds of calls per hour with no throttling
- `npm run trace-summary` cost table shows uncapped spending

**Phase to address:** Cost Guardrail (must be designed storage-first from day one, not retrofitted).

---

### COST-3 — Prompt-Cache Misses from System-Prompt Drift

**What goes wrong:**
Anthropic prompt caching (`anthropic-beta: prompt-caching-2024-07-31`) caches the system prompt block. Cache hits cut input-token cost by ~90% (verified from v4.0 trace data). The cache key is the exact byte content of the system block. Any edit to `SYSTEM_PROMPT` in `src/shared/classifier.ts` — including whitespace, punctuation, or a new example — invalidates the cache for all existing users until the new version propagates. A FP-reduction prompt edit (Pitfall FP-1) will cause a cache bust period during which every call is billed at full input-token price.

**Why it happens:**
`SYSTEM_PROMPT` is a long (~3000-token) string. The FP-reduction phase will involve iterative prompt edits tested against the eval harness. Each edit that improves metrics is then deployed, busting the cache for the ~24h TTL window.

**How to avoid:**
(1) Track `cache_read_input_tokens` vs `input_tokens` in traces. After any prompt deploy, watch for a spike in full-input-token calls; cost normalises after the first warm-up call per user. (2) Batch prompt improvements into a single release rather than iterating live — each deploy incurs one cache-bust episode. (3) Keep the system prompt text as stable as possible between releases; prefer threshold changes (which don't touch the prompt) to wording changes.

**Warning signs:**
- `cache_read_input_tokens` drops to 0 in traces immediately after a deploy
- Per-call cost spikes to full input-token price in `npm run trace-summary`
- Cost estimate in the Evals dashboard pre-run modal is suddenly much higher than the baseline

**Phase to address:** FP Reduction (where prompt edits happen). Flag this cost implication in every prompt-edit decision.

---

### EVAL-1 — Train/Test Leakage: Threshold Tuned on Its Own Eval Data

**What goes wrong:**
The v9.0 eval harness runs a threshold sweep (35→90, step 5) over the labeled dataset and picks `bestF1Threshold`. If that threshold is then baked into the extension config and evaluated against the same dataset to measure improvement, the reported metrics are optimistically inflated — you have fit the threshold to the noise in that specific dataset. On unseen production posts the real F1/precision will be lower, sometimes dramatically so.

**Why it happens:**
The `filterErrors` function (src/shared/eval/metrics.ts) is explicitly documented: "Always call with `bestF1Threshold` AFTER the full threshold sweep — never inside the scoring loop." This prevents in-loop leakage. But the milestone-level workflow leakage is different: running `npm run eval` on a dataset, observing that threshold=65 is best, setting `FLAG_THRESHOLD=65` in `content/index.ts`, then re-running eval on the same dataset to confirm improvement — this is a closed loop with no independent test signal.

**How to avoid:**
Mandatory train/test split before any threshold is selected for deployment:
- Reserve ≥20% of labeled posts as a held-out test set (not used during the sweep).
- Select `bestF1Threshold` on the training split only.
- Report metrics on the test split.
- The regression gate (see GATE-1) must evaluate against the test split, not the full dataset.

With a small dataset (e.g. 50–100 labeled posts), a 5-fold cross-validation is better than a single split — it gives a less variance-dominated estimate of the true threshold. The eval harness does not yet implement this; it should be added in the Eval-Derived Config phase.

**Warning signs:**
- Threshold sweep results look suspiciously clean (precision ≈ recall at every candidate threshold)
- F1 improves every time the threshold is adjusted and the same dataset is re-evaluated
- Production users report more FPs after a "tuning" release than before

**Phase to address:** Eval-Derived Config (the cross-validation / hold-out split must be in place before any threshold is baked in from eval data).

---

### EVAL-2 — Best-F1 Operating Point Tanks Precision in a FP-Averse Feed

**What goes wrong:**
`bestF1Threshold` maximises the harmonic mean of precision and recall. For a feed-hiding use case where **false positives are worse than false negatives** (hiding a human's post is worse than not catching an AI post), the F1-optimal threshold will be too aggressive — it accepts more FPs in exchange for recall. Users see their own content disappear and lose trust in the extension.

Concretely: if the dataset has 60% AI / 40% human, F1 is maximised at a threshold of 55. At threshold 55, precision might be 0.78 and recall 0.85. At threshold 70, precision is 0.92 and recall 0.71. The F1-best choice is wrong for this use case.

**Why it happens:**
The eval harness was designed around F1 as the primary metric (standard ML practice). The FP-averse use case requires a custom operating-point selection rule, not the default bestF1 selector.

**How to avoid:**
Replace "pick bestF1Threshold" with "pick the highest threshold at which recall ≥ R_min AND precision ≥ P_min". For this extension, suggested constraints: **precision ≥ 0.90** (hard floor — never hide more than 10% human posts), recall ≥ 0.60 (soft floor — catch at least 60% of AI posts). Add this operating-point selector to `src/shared/eval/metrics.ts` alongside `bestF1Threshold` so it is shared between CLI and dashboard. The threshold baked into config must come from this precision-constrained selector, not from raw F1.

The FP Reduction phase should measure success by "precision improved, recall held above floor" not "F1 improved."

**Warning signs:**
- The chosen threshold is at the lower end of the sweep (55 or 60) when precision at 70–75 would be substantially higher
- FP count in eval error analysis is high even at the "best" threshold
- User feedback skews toward "hid my post" rather than "missed an AI post"

**Phase to address:** Eval-Derived Config. Also validate during FP Reduction that the precision floor is maintained after prompt changes.

---

### EVAL-3 — Config Drift: Runtime Threshold Diverges from Eval Threshold

**What goes wrong:**
The eval harness derives an optimal threshold (e.g. 65). The developer updates `FLAG_THRESHOLD` in `src/content/index.ts` but forgets to update `autoHideThreshold` in the default settings object, or vice versa. The extension ships with threshold 65 in content script but the settings UI defaults to 60, and the popup's "threshold" display shows 60. Users who have never changed their settings are running at 60 while the eval assumed 65.

There are currently two threshold-like constants in play: `FLAG_THRESHOLD = 35` (the lower flagging boundary, below which a post is not flagged at all) and `autoHideThreshold` (read from settings, defaults to 60, controls hiding). These have different semantics. The eval sweep covers 35–90 and produces a single bestF1Threshold — but which constant does it map to?

**Why it happens:**
The eval harness uses a threshold sweep abstracted from the runtime hiding logic. There is no single-source-of-truth mapping from "eval threshold" to "the constant that controls hiding in production." Each phase that touches detection config must know which constant to update.

**How to avoid:**
Introduce a single exported constant (e.g. `DERIVED_HIDE_THRESHOLD`) in a shared config module, imported by both `src/content/index.ts` and referenced in the settings default. The eval CLI and dashboard should compare sweep results against this value to show whether the currently-deployed threshold is optimal. Document explicitly in the phase plan: "the eval threshold maps to `autoHideThreshold`, not `FLAG_THRESHOLD`."

**Warning signs:**
- `npm run eval` reports optimal threshold 65 but `settings.autoHideThreshold` defaults to 60
- Debug console shows `[LLB] score: 62 | below threshold` when user expects that score to hide
- Regression gate passes but production FP rate is higher than eval predicted

**Phase to address:** Eval-Derived Config.

---

### GATE-1 — LLM Non-Determinism Makes the Regression Gate Flaky

**What goes wrong:**
The regression gate runs `npm run eval --engine llm` against the labeled dataset and fails if F1 or precision drops below the baseline. LLM scoring is non-deterministic: the same post text run twice may score 58 one time and 63 the next. With a small dataset (50–100 posts), a few score fluctuations near the threshold boundary flip TP→FP or FN→TN, changing precision by ±0.03 or more. The gate fails on a green codebase simply due to stochastic variation.

**Why it happens:**
Anthropic models have temperature > 0 by default; even with temperature=0, small floating-point differences across API server instances produce occasional output variation. The eval harness scores each post independently with no seed or retry averaging.

**How to avoid:**
Two mitigations, both needed:
1. **Gate on heuristic engine only for the CI check.** The heuristic is deterministic and fast (no API cost). Gate: `npm run eval --engine heuristic` must not regress F1 or precision below baseline. Use the LLM eval as an offline diagnostic run before a release, not as a CI gate.
2. **For LLM regression checks, use a tolerance band.** If the LLM gate is desired: require that F1 and precision remain within ±0.03 of baseline (not just "not below"). Require ≥3 runs and average the metrics before comparing to baseline.

The `compareRuns` function in `src/shared/eval/runs.ts` produces exact deltas — add a `meetsGate(comparison, tolerance)` helper rather than a raw `>=` comparison.

**Warning signs:**
- Gate fails in CI but passes when re-run immediately with no code change
- Gate results differ between local and CI even with the same input file
- Consecutive eval runs on the same dataset produce different `bestF1Threshold`

**Phase to address:** Regression Gate.

---

### FP-1 — Prompt Edits Cause Silent Recall Collapse

**What goes wrong:**
The FP Reduction phase involves editing `SYSTEM_PROMPT` to be less aggressive on human-written posts. Prompt edits that reduce FPs almost always reduce recall (they make the model less likely to flag borderline posts as AI-generated). The danger is that the eval harness shows FP count dropped by 5 (good) but FN count increased by 15 (silent recall collapse) — and this is accepted as a win because the milestone goal is "cut false positives."

**Why it happens:**
Prompt changes that add hedges ("prefer a lower score when uncertain"), expand the human-writing exceptions, or raise the score required for AI signals all shift the model's decision boundary toward lower scores. Every FP that is recovered is offset by FNs gained. If the eval dataset has few AI examples relative to human examples, the FN increase may look small in absolute terms but be severe in relative recall.

**How to avoid:**
After every prompt edit, report ALL of: FP count, FN count, precision, recall, AND the ratio FN_new/FN_old. Set a hard recall floor (e.g. recall ≥ 0.65) that must not be broken by any prompt change, even if FP count improves. The eval dashboard already shows FP/FN cards — add a "recall floor met" indicator to the run comparison view. Treat a prompt edit that passes the precision floor but breaks the recall floor as a regression, not an improvement.

The current SYSTEM_PROMPT already contains "When uncertain, prefer a lower score. False positives (hiding human posts) are worse than false negatives." — this is correct calibration. New hard rules or examples added to the prompt must be validated against the FN rate, not just the FP rate.

**Warning signs:**
- Eval run shows "FPs: 3 → 1" (good) while FNs go from "8 → 18" (bad) — often the FN column is overlooked
- `recall` metric drops from 0.78 to 0.54 across two prompt versions
- Users start reporting "the extension stopped catching anything" after a FP-reduction release

**Phase to address:** FP Reduction. Add a hard recall-floor gate to the eval comparison before any prompt change is accepted.

---

### MV3-1 — Flash of Bot Content: Post Rendered Before Async LLM Returns

**What goes wrong:**
In LLM-primary mode, `detector.detect(post)` dispatches `SCORE_POST` to the service worker and `await`s the response. The LLM round-trip is 800–2000ms. LinkedIn renders the post into the DOM immediately when the MutationObserver fires. The user sees the post for up to 2 seconds before the extension hides it — exactly the "flash of bot content" problem. At 20 posts per scroll, some will flash before hide, creating an inconsistent experience and allowing the user to read AI content before it disappears.

**Why it happens:**
The content script's `detector.detect()` call is async (by design — the Detector interface returns `Promise<DetectionResult>`). The existing code hides the post in the `.then()` callback, after the network round-trip. The heuristic path is fast enough (< 5ms) that this is invisible; the LLM path makes the delay perceptible.

**How to avoid:**
Introduce an **optimistic heuristic pre-hide**: before sending SCORE_POST, run the heuristic synchronously (or as a fast async path). If the heuristic score ≥ `FLAG_THRESHOLD`, apply `.llb-hidden` immediately and inject a provisional tombstone. When the LLM result arrives, either confirm the hide (keep hidden) or unset it (show the post). This is already the architecture the `LLMDetector` wraps — the fallback heuristic is present. The new step is calling heuristic first for the pre-hide, then LLM for the final decision.

For posts where the heuristic score is below FLAG_THRESHOLD, accept that there will be a flash — this is unavoidable for posts the heuristic would not have caught. This is the acceptable tradeoff.

**Warning signs:**
- User reports posts "flickering" (appear then vanish)
- Debug log shows `[LLB] hid | authorName` 1500ms after `[LLB] 0 | heuristic | authorName` on the same post
- LLM latency > 1000ms in traces (common under Anthropic load)

**Phase to address:** LLM-Primary (must be addressed in the same phase that promotes LLM to primary, not deferred).

---

### MV3-2 — SW Terminates Mid-SCORE_POST: Message Channel Closed

**What goes wrong:**
The service worker can terminate while a `classifyPost` fetch is in flight. When this happens, `chrome.runtime.lastError` fires with "Extension context invalidated" or "Could not establish connection." The `scoreViaBackground` promise rejects, `LLMDetector.detect()` falls back to the heuristic, and the post is scored heuristically with no trace written. In practice this is handled today (LLMDetector already catches and falls back). The new risk is the **per-session guardrail**: if the SW terminates between acquiring the latch and completing the fetch, the latch remains set to `true` in storage and no further SCORE_POST calls can proceed (unlike the rederive path, which has a `finally { releaseRateLimitLatch() }`).

**Why it happens:**
The existing `scorePost` function in `background/index.ts` does NOT use a latch. If the new per-session guardrail introduces a latch (counter increment before fetch, release after), a SW termination mid-fetch will leave the counter incremented and latch held, blocking future calls. The rederive path (background/index.ts line 407) explicitly releases in `finally` — the SCORE_POST path must do the same.

**How to avoid:**
The per-session guardrail for SCORE_POST must follow the exact same acquire-increment-finally-release pattern as `acquireRateLimitLatch` / `releaseRateLimitLatch`. Do not hold a boolean latch for SCORE_POST calls (they are high-volume and concurrent across multiple posts); use only a counter with no in-flight lock. The counter increment and decrement must both be persisted to storage immediately. Test with a mock that simulates SW restart mid-fetch.

**Warning signs:**
- After a browser suspend/resume, no SCORE_POST messages are processed even though the extension looks active
- `llbRederiveInFlight` (or the equivalent SCORE_POST latch) remains `true` in storage indefinitely
- Users report the extension "stopped working" after their laptop came back from sleep

**Phase to address:** Cost Guardrail.

---

## Moderate Pitfalls

### COST-4 — Model Overpowered for the Task

**What goes wrong:**
`classifier.ts` uses `claude-sonnet-4-6` for every post classification. Sonnet is ~5× more expensive than Haiku per token. The FP-reduction prompt edits (adding examples, hard rules, calibration text) will make the system prompt longer, increasing per-call cost. The eval harness was designed with Sonnet but the production cost at scale (20 posts/session × multiple sessions/day) may make Haiku the better choice.

**How to avoid:**
Run a head-to-head eval (`--engine llm` with Haiku vs Sonnet) on the labeled dataset before locking in the deployed model. If Haiku's F1/precision is within ±0.03 of Sonnet's, prefer Haiku. The model is a parameter of `classifyPost` — it is not hardcoded in the interface, just in the body of the function. A single-line change to model selection is low risk.

**Warning signs:**
- `npm run trace-summary` shows average cost per call > $0.005 (Sonnet with cache miss)
- Per-session guardrail cap is reached after fewer posts than expected
- Cost estimate modal in the Evals dashboard shows eval runs costing >$1

**Phase to address:** LLM-Primary.

---

### COST-5 — Cap Hit Silently Kills the Whole Feed

**What goes wrong:**
When the per-session guardrail cap is reached, `SCORE_POST` starts returning `{ error: 'rate-limited' }`. `LLMDetector.detect()` catches the error and falls back to the heuristic. The user sees no visible change — posts continue to be shown, some get hidden by heuristic, but the LLM is not scoring. If the heuristic is intentionally weaker (it is the fallback now, not the primary), users may notice fewer posts being hidden but have no explanation.

**How to avoid:**
When the cap is hit, update a storage key (`llbSessionCapHit: true`). The popup should surface a non-alarming indicator: "LLM quota used for this session — heuristic mode active." Clear the indicator when the cap resets. Do not surface this as an error; treat it as expected throttling behaviour.

**Warning signs:**
- User files a bug "extension stopped working" but traces show heuristic scores only after a certain time
- `llbSessionCapHit` is truthy in chrome.storage.local with no UI feedback

**Phase to address:** Cost Guardrail.

---

### COST-6 — Guardrail Cap Never Resets (Wrong Epoch)

**What goes wrong:**
If the per-session guardrail uses a session-start timestamp to bound the window and that timestamp is stored as a UTC date string (YYYY-MM-DD), it will reset at midnight UTC rather than at a natural session boundary. A user who browses LinkedIn from 11:55 PM to 12:05 AM gets two independent caps in one logical sitting. Conversely, if the cap is per-calendar-day and the user has two heavy sessions in one day, they run out of LLM calls mid-afternoon with no relief until midnight UTC.

**How to avoid:**
Define "session" as a tab activation + time-window (e.g. 60 minutes of inactivity resets the counter). Use the tab ID passed in the message as the session identifier. Persist `{ tabId, windowStart, callsInWindow }` to storage. This is more robust than a date-key approach. If a time-window is preferred, use an epoch-ms timestamp (`Date.now()`) not a date string, and compare `Date.now() - windowStart > WINDOW_DURATION_MS`.

**Warning signs:**
- Users in non-UTC timezones report cap resetting at unexpected times
- A user with a long browsing session is blocked from LLM scoring before their workday ends

**Phase to address:** Cost Guardrail.

---

### EVAL-4 — Dataset Too Small: Metrics Are High-Variance Noise

**What goes wrong:**
With a labeled dataset of 50 posts (30 AI, 20 human), a single FP or FN swap changes precision by ±0.05. The threshold sweep will appear to identify a clear winner (threshold 65: precision 0.90) but re-running on a slightly different labeling of the same posts — or adding 10 new posts — shifts the winner to threshold 70 with precision 0.88. The "eval-derived config" is noise masquerading as signal.

**How to avoid:**
Require a minimum labeled dataset size before deriving a production threshold: at minimum 100 posts (60+ AI, 40+ human). Document this requirement in the milestone plan. Use bootstrap confidence intervals (resample with replacement 1000×) to report ±CI alongside each metric — if the 95% CI for precision at the candidate threshold overlaps with adjacent thresholds, the threshold selection is not significant. The eval CLI should warn when the dataset is below the minimum.

**Warning signs:**
- Threshold sweep results show the "best" threshold jumping between 55 and 70 on consecutive runs with the same data
- Adding or removing 5 posts changes the recommended threshold
- Confidence intervals (if computed) are ±0.10 or wider

**Phase to address:** Eval-Derived Config.

---

### GATE-2 — Baseline Never Re-Blessed: Gate Permanently Red

**What goes wrong:**
The regression gate compares a current eval run against a stored baseline `EvalRun`. The baseline was set when heuristic precision was 0.75. The new LLM-primary path genuinely achieves precision 0.92 — a big improvement. But the regression gate file still references the heuristic baseline. On every subsequent eval run, the gate reports a "regression" in recall (because the LLM path at threshold 65 catches fewer easy-win posts than the heuristic at threshold 35). The gate is permanently red and engineers start ignoring it.

**How to avoid:**
After each milestone that intentionally changes the detection profile (threshold, engine, prompt), run `npm run eval` to produce a new baseline and commit it. Document the re-blessing process in the milestone plan. The gate script should fail loudly if the baseline file is older than N days (configurable) — forcing a periodic re-blessing.

**Warning signs:**
- Gate has been red in CI for more than one sprint with no action taken
- Different engineers interpret the red gate as "expected" vs "blocking"
- The baseline EvalRun references `engine: 'heuristic'` but the current run uses `engine: 'llm'`

**Phase to address:** Regression Gate.

---

### GATE-3 — Gate Tests the Wrong Metric

**What goes wrong:**
The initial regression gate checks F1 ≥ baseline_F1. F1 can improve while precision collapses (if recall improves enough). For a FP-averse use case, a gate that only watches F1 will allow a release that adds new FPs as long as recall improves proportionally. The metric guarded must be **precision**, not F1.

**How to avoid:**
The gate must check BOTH precision ≥ baseline_precision AND recall ≥ recall_floor independently. Do not gate on F1 alone. The `compareRuns` function returns `precision: MetricDelta` and `recall: MetricDelta` — use both. The gate script should exit non-zero if either falls below its floor, with a clear error message distinguishing which metric failed.

**Warning signs:**
- Gate passes, but inspecting the comparison shows precision dropped from 0.91 to 0.86 while F1 held at 0.80 due to recall gain
- Users report more hidden human posts after a "passing" gate release

**Phase to address:** Regression Gate.

---

### FP-2 — FP Analysis Driven by Wrong (Best-F1) Threshold

**What goes wrong:**
`filterErrors` in `src/shared/eval/metrics.ts` takes a threshold parameter and returns FPs at that threshold. If the analyst uses `bestF1Threshold` to drive the FP analysis but the extension is deployed at a higher precision-optimised threshold, the FPs surfaced in the analysis don't match what production users are experiencing. Prompt improvements are tuned to the wrong operating point.

The function docstring already warns: "Always call with `bestF1Threshold` AFTER the full threshold sweep" — but this is about when to call it (post-sweep, not in-loop). The separate concern is which threshold value to pass.

**How to avoid:**
When doing FP analysis to drive prompt edits, always use the **deployed threshold** (or the precision-constrained operating-point threshold) rather than `bestF1Threshold`. Add a `deployedThreshold` parameter to the eval CLI `--analyze-fps-at <threshold>` flag. The evals dashboard's FP card should display which threshold it's analysing and whether it matches the deployed config.

**Warning signs:**
- FP analysis shows posts scoring 57–63 as FPs, but the deployed threshold is 70 (those posts would not be hidden in production)
- After a prompt edit that "fixes" the surfaced FPs, production users still report FPs with different characteristics

**Phase to address:** FP Reduction.

---

### MV3-3 — Storage Quota Blown by Trace + EvalRunStore Growth

**What goes wrong:**
`chrome.storage.local` has a 10 MB quota. The trace store (`traceStore.ts`) is capped at 500 entries. Each entry includes `systemPrompt` (the full `SYSTEM_PROMPT` ~3000 chars) truncated, but `userPrompt` is stored up to 500 chars. 500 entries × ~1 KB average ≈ 500 KB for traces. The `EvalRunStore` is capped at 50 runs. Each run includes `posts: PostDetail[]` (full per-post details). A 100-post eval run with all signal breakdowns can be 20–40 KB. 50 runs × 30 KB = 1.5 MB. Add `flaggedAccounts`, `flaggedPosts`, `unflaggedPosts` (if opt-in capture is on), and `dailyStats` — total storage can approach or exceed 10 MB over months of use.

LLM-primary mode exacerbates this: every eligible post generates a trace. At 20 posts/session × 3 sessions/day, the 500-entry trace store rolls over in ~8 days. The FIFO cap prevents runaway growth, but the other stores don't have equivalent caps.

**How to avoid:**
(1) Do not store `systemPrompt` in each trace entry — it is a constant, available from `SYSTEM_PROMPT` in the code. Save only a hash or version identifier. This cuts trace entry size by ~50%. (2) Audit `unflaggedPosts` store size — it is opt-in but uncapped in the current implementation; add a cap (suggested: 500 entries, same as traces). (3) Add a storage-usage indicator to the dashboard or settings page. (4) Test total storage size with a realistic dataset before shipping LLM-primary.

**Warning signs:**
- `chrome.storage.local.getBytesInUse` (available in the debugging console) approaching 9 MB
- `storageSet` calls start throwing "QUOTA_BYTES exceeded" errors in the console
- EvalRunStore silently drops runs (FIFO cap silent failure)

**Phase to address:** Cost Guardrail (review storage budget alongside rate-limit state additions).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline threshold constants in content/index.ts | No new files | Config drift when eval derives a new threshold (EVAL-3) | Never — move to a shared config module in Eval-Derived Config |
| Gate on F1 only (fastest to implement) | One metric to maintain | Misses precision regressions (GATE-3) | Never in a FP-averse use case |
| Skip train/test split on first eval-derived config | Faster to ship | Overfitted threshold (EVAL-1) | Never — add hold-out split before the first bake-in |
| Store systemPrompt in every trace entry | Simple serialization | Storage quota risk (MV3-3) | Only acceptable during early debugging; remove before scale |
| Per-session counter in SW module scope | Easy to implement | Lost on SW restart (COST-2) | Never — use chrome.storage.local |
| Run LLM eval in CI without tolerance band | Simple pass/fail | Flaky gate from non-determinism (GATE-1) | Never — heuristic eval in CI, LLM eval offline with tolerance |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic prompt caching | Treating cache as free/guaranteed | Track `cache_read_input_tokens` in traces; plan for cache-bust cost spikes after prompt edits (COST-3) |
| chrome.storage.local in SW | Reading rate-limit state from module-scope variable | Read from storage on every SCORE_POST invocation; SW is stateless (COST-2) |
| Threshold sweep → deployed threshold | Mapping bestF1Threshold directly to autoHideThreshold | Use precision-constrained operating-point selector, not raw F1 (EVAL-2, EVAL-3) |
| EvalRun comparison | Comparing LLM run against heuristic baseline | Baseline engine must match current engine; re-bless on engine change (GATE-2) |
| filterErrors | Calling with bestF1Threshold when analysing production FPs | Use deployed threshold, not eval-optimal threshold (FP-2) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No scored-URN session cache | Cost multiplied 3–10× during scroll-back + SPA nav | Module-scope `Map<urn, DetectionResult>` in content script (COST-1) | From first LLM-primary session |
| Heuristic not run before LLM dispatch | 800–2000ms post flash | Optimistic heuristic pre-hide before SCORE_POST (MV3-1) | Every post scored by LLM |
| LLM eval in CI | Gate flaky — fails on green code | Heuristic eval in CI; LLM eval offline (GATE-1) | First eval run with stochastic output |
| unflaggedPosts store uncapped with LLM-primary | Storage quota blown faster | Cap at 500 entries, same as trace store (MV3-3) | After ~2 weeks of LLM-primary use with opt-in capture |

---

## "Looks Done But Isn't" Checklist

- [ ] **LLM-Primary:** Scored-URN session cache implemented — verify that a post scored on first render does not trigger another SCORE_POST after SPA navigation back to the feed.
- [ ] **Cost Guardrail:** Counter stored in chrome.storage.local — verify by simulating SW restart (navigate away, wait 35s, return) and confirming cap is still enforced.
- [ ] **Cost Guardrail:** Popup shows "heuristic mode" indicator when cap is hit — verify by setting counter to cap value in storage manually.
- [ ] **Eval-Derived Config:** Hold-out split used for threshold selection — verify that the threshold was not chosen using the same rows it was evaluated on.
- [ ] **Eval-Derived Config:** Threshold maps to `autoHideThreshold` not `FLAG_THRESHOLD` — verify by checking which constant controls hiding in content/index.ts.
- [ ] **Regression Gate:** Gate checks precision AND recall independently — verify exit code differs when precision alone regresses even if F1 holds.
- [ ] **Regression Gate:** Baseline uses same engine as current run — verify the baseline EvalRun's `engine` field matches the gate invocation.
- [ ] **FP Reduction:** Recall floor maintained after every prompt edit — verify by running eval after each prompt change and checking recall column.
- [ ] **FP Reduction:** FP analysis uses deployed threshold, not bestF1Threshold — verify the `--analyze-fps-at` value matches the production config.
- [ ] **MV3:** Optimistic heuristic pre-hide implemented — verify that posts with heuristic score ≥ FLAG_THRESHOLD are hidden within 10ms of DOM insertion.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| COST-1 (dedup miss) | LOW | Add scored-URN cache; no data migration needed |
| COST-2 (counter lost) | LOW | Move counter to storage; test with SW restart simulation |
| EVAL-1 (train/test leakage) | MEDIUM | Re-label + split dataset; re-run sweep; may change deployed threshold |
| EVAL-2 (wrong operating point) | LOW | Add precision-constrained selector; re-evaluate; update deployed threshold |
| EVAL-3 (config drift) | LOW | Single-source threshold constant; audit all usages |
| GATE-1 (flaky gate) | LOW | Switch CI gate to heuristic engine; add tolerance band to LLM gate |
| GATE-2 (stale baseline) | LOW | Re-bless baseline; commit updated EvalRun |
| FP-1 (recall collapse) | HIGH | Revert prompt to previous version; requires new labeled data to recover recall |
| MV3-1 (flash of content) | MEDIUM | Add optimistic pre-hide path; requires LLMDetector refactor |
| MV3-3 (storage quota) | MEDIUM | Remove systemPrompt from trace entries; add unflaggedPosts cap; requires migration |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| COST-1 (dedup miss) | LLM-Primary | Trace shows no duplicate URNs within a session |
| COST-2 (counter lost on SW restart) | Cost Guardrail | Cap enforced after simulated SW restart |
| COST-3 (cache miss on prompt edit) | FP Reduction | Monitor cache_read_input_tokens in traces after each prompt deploy |
| COST-4 (model too expensive) | LLM-Primary | Head-to-head Haiku vs Sonnet eval before model lock |
| COST-5 (cap silently kills feed) | Cost Guardrail | Popup indicator when cap hit |
| COST-6 (cap never resets) | Cost Guardrail | Time-window epoch-ms not date-string |
| EVAL-1 (train/test leakage) | Eval-Derived Config | Hold-out split documented in commit |
| EVAL-2 (wrong operating point) | Eval-Derived Config | Precision ≥ 0.90 at deployed threshold |
| EVAL-3 (config drift) | Eval-Derived Config | Single shared threshold constant |
| EVAL-4 (small dataset) | Eval-Derived Config | ≥100 labeled posts before baking threshold |
| GATE-1 (flaky gate) | Regression Gate | CI gate uses heuristic engine; passes 5 consecutive runs |
| GATE-2 (stale baseline) | Regression Gate | Baseline engine matches current run engine |
| GATE-3 (wrong metric) | Regression Gate | Gate exits non-zero on precision regression alone |
| FP-1 (recall collapse) | FP Reduction | Recall ≥ floor after every prompt edit |
| FP-2 (wrong FP analysis threshold) | FP Reduction | FP card shows deployed threshold, not bestF1Threshold |
| MV3-1 (flash of content) | LLM-Primary | Posts hidden within 10ms of DOM insertion for heuristic-flagged cases |
| MV3-2 (SW terminates mid-fetch) | Cost Guardrail | No latch held in storage after simulated SW restart |
| MV3-3 (storage quota) | Cost Guardrail | Total storage < 5 MB after 2 weeks of LLM-primary use |

---

## Preserved Pitfalls (v7.0–v9.0, still valid)

The following pitfalls from prior milestones remain relevant and are not superseded:

- **ADAPT-CRIT-4 (LLM cost loop / no latch on rederive)** — the per-session SCORE_POST guardrail must implement the same acquire-finally-release pattern.
- **ADAPT-CRIT-5 (prompt injection via page content)** — the classifyPost user prompt is raw post text. LinkedIn posts can contain adversarial content. The LLM-primary path increases exposure since every post is now classified. Mitigation: structured output mode + response validation already in place; monitor for anomalous scores near threshold boundaries.
- **ADAPT-MOD-5 (multi-tab race)** — multiple tabs now each send SCORE_POST; the guardrail counter must be atomic-enough for concurrent tab activity (chrome.storage has no compare-and-swap; accept the known narrow race window per the rederive implementation).
- **COMMON (SW channel must remain open)** — the `return true` in the `SCORE_POST` handler must be preserved; removing it closes the channel before the async response returns.

---

## Sources

- Direct inspection: `src/background/index.ts`, `src/content/index.ts`, `src/content/detector/llm.ts`, `src/shared/classifier.ts`, `src/shared/eval/metrics.ts`, `src/shared/eval/runs.ts`, `src/content/observer.ts`
- Prior pitfall research: `.planning/research/PITFALLS.md` (v7.0 Adaptive DOM Scraper)
- MV3 SW lifecycle: Chrome Extensions documentation (service worker ~30s idle termination, stateless restart)
- Anthropic prompt caching: `anthropic-beta: prompt-caching-2024-07-31` header, cache TTL ~24h
- ML evaluation: standard train/test leakage literature; precision-recall tradeoffs for imbalanced classification

---
*Pitfalls research for: Chrome MV3 extension — LLM-Primary Detection & Eval-Driven Tuning*
*Researched: 2026-06-15*
