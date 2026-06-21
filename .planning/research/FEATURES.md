# Feature Research — v10.0 LLM-Primary Detection & Eval-Driven Tuning

**Milestone:** v10.0
**Domain:** LLM-as-primary classifier, cost guardrail, data-derived config, regression gate, FP reduction
**Researched:** 2026-06-15
**Confidence:** HIGH for LLM-primary/fallback patterns (well-established ML serving practice); HIGH for threshold selection from labeled data (standard classification tuning); HIGH for regression gate contract (standard CI/eval practice); MEDIUM for per-session cost guardrail specifics (no established Chrome-extension standard — derived from first principles + the existing rederive rate-limit pattern already in the codebase)

---

## Feature Landscape

### Table Stakes (Users / System Expects These)

These are the minimum behaviors for v10.0 to be coherent. Missing any one makes the milestone feel broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **LLM-primary classification** — LLMDetector scores every eligible post (after hard exclusions); HeuristicDetector is called only on fallback | The milestone's stated goal; heuristic-primary was always the interim state | MEDIUM | `LLMDetector` already exists with fallback slot. Change is in `content/index.ts` instantiation order: `new LLMDetector(new HeuristicDetector())` becomes the single live detector. The `Detector` interface is already satisfied — no interface change needed. |
| **Silent fallback — no UX disruption** — when LLM is unavailable (no key, offline, HTTP error, timeout), heuristic runs transparently; user sees the same tombstone/hide behavior | Degraded-mode must not surface errors in the feed UI | LOW | Already partially implemented: `LLMDetector.detect()` catches all errors and calls `this.fallback.detect()`. The `engineUsed` field in `DetectionResult` records which path ran. No additional UX surface needed. |
| **`engineUsed` propagated to storage** — `StoredPost` and `UnflaggedPost` should carry which engine scored the post | Without this, eval runs on stored data cannot distinguish LLM-scored from heuristic-scored posts; the metric tables become meaningless for cross-engine comparison | LOW | `UnflaggedPost.engineUsed` already exists. `StoredPost` does NOT have `engineUsed` — needs adding. This is a type-only addition; no migration (field is optional, absent = heuristic implied for pre-v10 records). |
| **Per-session cost cap / rate limit** — a configurable hard ceiling on LLM calls per browser session; once hit, all remaining posts in that session fall through to heuristic | Prevents runaway API spend during long LinkedIn sessions or bulk feed scroll | MEDIUM | No session-scoped counter exists yet. Pattern to follow: the rederive rate-limiter in `background/index.ts` (storage-persisted latch + daily cap). Session boundary = SW restart (chrome.runtime.onStartup + onInstalled resets the counter). Implementation: `llbSessionPostsScored` counter in storage, reset on SW start; checked in `scorePost` before calling `classifyPost`; documented default (e.g. 50 posts/session). |
| **Precision-constrained threshold selection** — eval harness picks the operating threshold that maximises F1 subject to precision ≥ P_min (not raw best-F1) | This is an FP-averse use case: hiding a human-written post from the user's own feed is worse than missing an AI post. Raw best-F1 ignores that asymmetry. | LOW | Requires adding one function to `src/shared/eval/metrics.ts`: `selectThreshold(rows, minPrecision)` — filter sweep to rows where `precision >= minPrecision`, pick highest F1 among those; tie-break on higher precision. Default `minPrecision = 0.90`. Operates post-sweep, never inside scoring loop. |
| **Baked-in derived config** — after a tuning run the chosen threshold is written to a versioned config file/constant that the extension reads as its default; replaces the hard-coded `60` | Without baking in, the tuning run has no effect on actual extension behavior | LOW | Simplest form: `src/shared/derivedConfig.ts` exporting `DERIVED_THRESHOLD: number` and `DERIVED_HEURISTIC_WEIGHTS: Record<string, number>` as typed constants. Committing a file is simpler than a storage migration for a personal tool. A `npm run derive-config` script reads the best eval result JSON and overwrites the constants file. |
| **Regression gate as npm script** — `npm run eval:gate` exits non-zero if F1 or precision at the operating threshold drops below the blessed baseline | Standard CI quality gate for classifier changes | MEDIUM | Requires: (a) a `eval/baseline.json` file (an `EvalRun` or a lightweight subset of it) committed to the repo; (b) a `scripts/eval-gate.ts` script that loads the most recent `eval/results-*.json`, loads `eval/baseline.json`, and compares F1 and precision at the operating threshold with a tolerance epsilon. |
| **Baseline update workflow** — a command to bless the current eval result as the new baseline | Without a promotion path, the gate becomes either always-blocking or never-enforced | LOW | `npm run eval:bless` — copies the latest `eval/results-*.json` to `eval/baseline.json`. A single command, always human-initiated, never automated. |

### Differentiators (High Value, Not Strictly Required for Coherence)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **FP-targeted prompt refinement** — add few-shot hard-negative examples (human posts that scored high) directly into `SYSTEM_PROMPT`; driven by `errorAnalysis.falsePositives` from the latest eval run | Directly addresses the stated FP-reduction goal without any architectural change | MEDIUM | The FP cards in the Evals dashboard already surface the post text + signal breakdown. The workflow: review FP cards → identify pattern → add a counter-example to the "EDGE CASES" or "ADDITIONAL CONTEXT" section of `SYSTEM_PROMPT` in `classifier.ts`. 2–4 hard negatives in the prompt is the standard few-shot technique; more than ~6 can anchor the model too tightly. Requires a re-eval run after each addition to measure effect. |
| **Score confidence band in tombstone** — tombstone (the placeholder shown where a hidden post was) displays "high confidence" vs "review suggested" based on LLM confidence tier | Users can prioritize which tombstones to manually expand and check | LOW | `DetectionResult.confidence` already carries `'high' | 'medium' | 'low'`. Tombstone rendering in `tombstone.ts` can read this. No new data. |
| **Session cost display in popup** — running total of LLM spend this session shown in the Settings section | Makes the cost guardrail tangible and reassuring | LOW | Counter already needed for the cap. Displaying it is trivial once the storage key exists. |
| **Threshold displayed in dashboard** — shows the currently active detection threshold alongside whether it is "derived" or "default" | Closes the feedback loop: user can see that tuning had an effect | LOW | Dashboard already reads `settings.autoHideThreshold`. Adding a "source: derived / default" label requires one extra storage field or reading `derivedConfig.ts` constant vs settings value. |
| **Precision-recall tradeoff table in eval output** — display the full sweep table with a `*` marker on the selected operating point | Makes the operating-point selection transparent when reviewing eval runs | LOW | `computeMetrics` already produces the full `ThresholdRow[]`. Adding a marker column to the printed table is pure formatting. |

### Anti-Features (Explicitly Excluded)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Automatic threshold promotion to storage** — `npm run derive-config` writes directly to `chrome.storage.local` | Seems like a convenience (skip the commit step) | The extension runs in a browser context; CLI scripts cannot access `chrome.storage.local`. Even if they could, silently changing the active threshold without a commit breaks auditability. | Commit `derivedConfig.ts` instead; storage default reads from the constant on SW start. |
| **Re-scoring posts retroactively** — LLM rescores posts that were previously scored by heuristic and stored in `storedPosts` | Sounds like a free accuracy improvement | Those posts are already hidden; rescoring cannot un-hide them (element is gone from the DOM). It wastes API budget, complicates the eval baseline, and can cause confusing score drift in the popup. | Accept that pre-v10.0 stored posts carry heuristic scores. The `engineUsed` field makes this transparent. |
| **LLM abstention / "I don't know" response** — prompt the LLM to return `score: null` when uncertain | Reduces FPs at the cost of coverage gaps | Abstention creates a third outcome the content script doesn't handle: a null-score post is neither hidden nor released cleanly. The current binary (score → hide or not) is much simpler. | Use the precision-constrained threshold instead: a high-uncertainty post will naturally score in the middle range (35–59) and remain visible rather than hidden. |
| **Profile / engagement signals in the LLM prompt** — feed profile metadata (connections count, headshot URL) to the classifier | Could improve accuracy | No DOM scraping for profile/engagement data in v10.0 (explicitly out of scope per PROJECT.md). Adding it to the prompt without the data would degrade prompt quality; adding the scraping is a separate milestone. | Evaluate whether text-only LLM precision is sufficient; defer profile signals. |
| **Multiple LLM providers / model routing** — route to different models based on cost or capability | Seems like a cost optimization | Adds significant complexity (key management, fallback chains, response normalization) for a personal tool. Prompt caching is already cutting costs ~90% on cache hits. | Lock to claude-sonnet-4-6 for this milestone; revisit if cost tracking shows it's needed. |
| **Hard epsilon on regression gate** — gate fails if metrics change by ANY amount (epsilon = 0) | Seems rigorous | Real LLM eval runs have natural variance from token-level sampling and dataset composition. An epsilon of 0 will produce frequent false-alarm gate failures that train the developer to ignore the gate. | Use epsilon = 0.01 (1 percentage point) for both F1 and precision as the standard tolerance. |

---

## Detailed Behavioral Specifications

### (a) LLM-Primary + Fallback: Expected Behavior

**Instantiation (content/index.ts):**
```
new LLMDetector(fallback: new HeuristicDetector({ fetchComments }))
```
LLMDetector is the primary; HeuristicDetector is the fallback constructor argument.

**Fallback triggers (silent, no UX change):**
- No API key in storage (`anthropicApiKey` absent or empty string)
- SW returns `{ error: ... }` — any HTTP error, 429 rate-limit, 401 bad key
- SW fails to respond — `chrome.runtime.lastError` set
- SW response JSON parse failure
- Per-session cap reached (new in v10.0)

**What happens to posts scored while fallback is active:**
- They are scored by heuristic and stored/hidden normally.
- `StoredPost.engineUsed` = `'heuristic'` (new field in v10.0).
- No re-scoring attempt is made when LLM becomes available again (anti-feature; see above).
- The session counter does not increment for fallback-scored posts.

**Mode indicator:** No user-visible mode indicator is required. The popup/dashboard's trace log already provides visibility into which engine ran. Adding a real-time "LLM offline" banner in the feed would require DOM injection and a MV3 message relay — complexity not justified for a personal tool.

**Posts scored while offline vs. when LLM becomes available:**
Posts are processed by the detector at observation time (the MutationObserver fires). There is no re-queue or deferred scoring. An offline post stays heuristic-scored. This is the standard pattern for streaming classifiers: process once at event time, accept that mode may differ per-post.

### (b) Threshold Selection from Labeled Data: Operating-Point Rules

**Sweep mechanics (already implemented):**
`THRESHOLDS = [35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90]`
`computeMetrics(scored, threshold)` returns `ThresholdRow` with precision, recall, F1, accuracy.

**Operating-point selection for an FP-averse use case:**

Standard practice for precision-averse classifiers is to operate on the precision-recall tradeoff curve at a minimum acceptable precision, then maximize recall (or equivalently F1) within that constraint. For this tool:

1. Filter sweep rows to those where `precision >= 0.90` (i.e. at most 10% of flagged posts are human-written).
2. Among passing rows, select the one with the highest F1 (highest recall while maintaining precision floor).
3. If no row achieves `precision >= 0.90`, step down to `precision >= 0.85` and repeat — this prevents the gate from being useless when the dataset is small.
4. Tie-break on higher precision (prefer fewer FPs at equal F1).

This is NOT the same as "best F1 across all thresholds" — that approach ignores the asymmetric cost of FPs in a personal feed filter. The existing eval harness already selects `bestF1Threshold` without a precision floor; that constant should be kept as-is for backwards compat with stored EvalRuns, and the new `selectThreshold(rows, minPrecision)` is additive.

**Config representation:**
```typescript
// src/shared/derivedConfig.ts  — committed, machine-generated by npm run derive-config
export const DERIVED_THRESHOLD = 70;           // operating-point threshold
export const DERIVED_CONFIG_DATE = '2026-06-15';
export const DERIVED_CONFIG_ENGINE = 'llm';
// Heuristic fallback weights (signal name → point cap multiplier)
// Empty object = use HeuristicDetector's own defaults unchanged
export const DERIVED_HEURISTIC_WEIGHTS: Record<string, number> = {};
```

The SW reads `DERIVED_THRESHOLD` as the default for `settings.autoHideThreshold` when no user override is stored. The user can still manually override from the popup slider.

**Versioning:** The file is committed to git. The commit history IS the version history. No additional version field needed for a personal tool.

### (c) Regression Gate: Contract

**Baseline file:** `eval/baseline.json` — a minimal subset of `EvalRun` to avoid bloating the repo with full post arrays:

```json
{
  "id": "...",
  "runAt": "2026-06-15T...",
  "engine": "llm",
  "model": "claude-sonnet-4-6",
  "operatingThreshold": 70,
  "f1": 0.89,
  "precision": 0.92,
  "recall": 0.86,
  "fpCount": 3,
  "fnCount": 8,
  "datasetLabel": "labeled-export-2026-06-15.json",
  "datasetSize": 120
}
```

This is NOT the full `EvalRun` type (which includes `posts[]` — potentially large). It is a projection, analogous to `EvalRunSummary` but with `operatingThreshold` explicitly recorded.

**Gate logic (`scripts/eval-gate.ts`):**
1. Load `eval/baseline.json`.
2. Find the most recent `eval/results-*.json` (sorted by filename date, not mtime).
3. From the current run's `thresholds[]`, find the row at `baseline.operatingThreshold`.
4. Compare: `currentPrecision - baseline.precision < -EPSILON` → fail; `currentF1 - baseline.f1 < -EPSILON` → fail.
5. `EPSILON = 0.01` (1 percentage point).
6. Exit 0 on pass, exit 1 on fail, print a diff table either way.

**What counts as a regression:**
- Precision drops by more than 1pp at the operating threshold → regression (more FPs).
- F1 drops by more than 1pp at the operating threshold → regression (net quality loss).
- Recall drop alone is NOT a gate failure — for an FP-averse tool, missing more AI posts is less harmful than hiding more human posts.

**Baseline update (blessing):**
`npm run eval:bless` — shell script or TS script that reads the latest `eval/results-*.json`, projects to the baseline schema, and writes `eval/baseline.json`. Always human-initiated. The script prints a diff vs. the previous baseline before writing, so accidental promotions are visible in git diff.

**Engine scope:** The gate runs on LLM eval results only (the operating engine). A heuristic eval result against the baseline is informational only (different engine, different operating point — direct comparison is meaningless).

### (d) LLM Prompt FP Reduction: Techniques

**Ranked by value/cost ratio for this codebase:**

1. **Few-shot hard negatives in the prompt (recommended first)** — Add 2–4 concrete human-post examples that previously scored high (from `errorAnalysis.falsePositives`) to the `ADDITIONAL CONTEXT AND EXAMPLES → Human-written post characteristics` section of `SYSTEM_PROMPT`. Include the specific signals that tripped (e.g. "this post uses a list but it's a genuine to-do, not a listicle CTA"). Expected FP reduction: significant (the model learns the decision boundary from real errors). Cost: zero API cost (cached in the ephemeral system prompt after the first call per session).

2. **Rubric refinement** — Tighten the HARD RULES section to cover patterns identified in FP analysis. Example pattern seen in eval FP cards: motivational posts from founders that are actually personal (specific project, named team) — add a rule "If the list or motivational structure is grounded in a specific named project or team, reduce score by 20–30 points." This is additive to the existing "genuine typos" rule.

3. **Threshold lift at operating point** — After adding hard negatives and rubric refinements, re-run eval. If precision at the current threshold is still under 0.90, raise the threshold by 5 points (e.g. 70 → 75). This is the last resort — increasing the threshold raises precision but lowers recall.

4. **Confidence-based secondary hold** — Posts scoring in the 60–69 band (just above the hide threshold) could be tombstoned with a weaker hide (e.g. collapsible rather than fully removed). This reduces the FP impact without changing the threshold. Medium complexity (new tombstone variant). Deferred as a differentiator, not table stakes.

**What NOT to do (anti-patterns):**
- Do not add NEGATIVE examples ("this IS AI") to the prompt unless they are clearly distinct from edge cases — the model's training already knows AI writing patterns; over-specifying narrows the concept.
- Do not add more than ~6 few-shot examples total — diminishing returns and prompt bloat (system prompt grows → cache miss on first call → higher cost).
- Do not tune on FP posts without also checking the FN list — it is easy to add a rule that reduces FPs but creates new FNs.

---

## Feature Dependencies

```
LLM-primary instantiation
    └──requires──> engineUsed in StoredPost (new field)
    └──requires──> per-session counter (new storage key)

Per-session cost cap
    └──requires──> SW session reset on onStartup/onInstalled
    └──enhances──> session cost display in popup (differentiator)

selectThreshold(rows, minPrecision)
    └──requires──> existing THRESHOLDS + computeMetrics (already in shared/eval/metrics.ts)
    └──feeds──> derive-config script
    └──feeds──> regression gate baseline operatingThreshold

derive-config script
    └──requires──> selectThreshold
    └──produces──> src/shared/derivedConfig.ts

Regression gate (eval-gate.ts)
    └──requires──> eval/baseline.json (committed)
    └──requires──> eval/results-*.json (from npm run eval)
    └──requires──> selectThreshold (to find the operating threshold row in the current run)

FP-targeted prompt refinement
    └──requires──> errorAnalysis.falsePositives (already in EvalRun — Phase 28 Evals dashboard)
    └──enhances──> regression gate (next eval run after prompt change tests the effect)

eval:bless
    └──requires──> eval/results-*.json (from npm run eval)
    └──produces──> eval/baseline.json
```

### Dependency Notes

- **engineUsed in StoredPost requires LLM-primary:** Without the field, stored positives from v10.0 onward cannot be distinguished from v9.0 heuristic-scored posts in eval analysis.
- **selectThreshold requires existing eval core:** The function is additive to `metrics.ts` — no interface changes.
- **derive-config feeds the regression gate:** The baseline `operatingThreshold` must match what `selectThreshold` would pick on the same dataset, otherwise the gate compares the wrong row.
- **FP prompt refinement enhances the gate:** Each prompt iteration should be followed by a re-eval + gate check to confirm no FN regression was introduced.

---

## MVP Definition for v10.0

### Launch With (v10.0)

- [x] LLM-primary instantiation (`LLMDetector` wraps `HeuristicDetector` as fallback)
- [x] `engineUsed` added to `StoredPost` (optional field, no migration needed)
- [x] Per-session LLM call counter (storage key, reset on SW start, configurable cap default 50)
- [x] `selectThreshold(rows, minPrecision)` in `src/shared/eval/metrics.ts`
- [x] `npm run derive-config` → writes `src/shared/derivedConfig.ts`
- [x] `eval/baseline.json` committed (after first tuning run)
- [x] `npm run eval:gate` — reads latest results + baseline, exits non-zero on regression
- [x] `npm run eval:bless` — promotes latest results to baseline
- [x] FP analysis → prompt hard negatives (2–4 examples added to `SYSTEM_PROMPT`)

### Add After Validation (v10.x)

- [ ] Session cost display in popup — wait to see if the cap itself is confusing first
- [ ] Confidence band in tombstone — requires UX decision on what "review suggested" means
- [ ] Threshold "derived / default" label in dashboard — low risk, low priority

### Future Consideration (v11+)

- [ ] Collapsible tombstone for borderline-confidence posts (60–69 band)
- [ ] Profile/engagement signals fed to the LLM prompt (needs DOM scraping milestone first)
- [ ] Automated regression gate in CI (GitHub Actions — only relevant if the project is collaborative)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| LLM-primary instantiation | HIGH | LOW | P1 |
| Silent fallback (already works) | HIGH | LOW (wiring only) | P1 |
| engineUsed in StoredPost | MEDIUM | LOW | P1 |
| Per-session cost cap | HIGH | MEDIUM | P1 |
| selectThreshold (precision-constrained) | HIGH | LOW | P1 |
| derive-config script + derivedConfig.ts | HIGH | LOW | P1 |
| eval:gate script + baseline.json | HIGH | MEDIUM | P1 |
| eval:bless script | HIGH | LOW | P1 |
| FP prompt hard negatives | HIGH | MEDIUM (requires eval run + review) | P1 |
| Session cost display in popup | MEDIUM | LOW | P2 |
| Confidence band in tombstone | MEDIUM | MEDIUM | P2 |
| Threshold source label in dashboard | LOW | LOW | P2 |

**Priority key:** P1 = required for v10.0 milestone; P2 = add if time permits; P3 = future.

---

## Existing Harness Integration Points

The v9.0 eval harness provides these hooks that v10.0 features plug into directly:

| Harness Component | v10.0 Usage |
|-------------------|-------------|
| `THRESHOLDS` constant (shared/eval/metrics.ts) | `selectThreshold` operates on the same sweep array |
| `computeMetrics(scored, threshold)` | Called as-is; `selectThreshold` filters its output |
| `EvalRun.errorAnalysis.falsePositives[]` | Source for FP prompt hard-negative identification |
| `EvalRun.thresholds[]` (full sweep) | `eval-gate.ts` reads the row at `operatingThreshold` |
| `EvalRunStore` (dashboard) | Stores runs in-extension; gate reads CLI `eval/results-*.json` (separate path — no conflict) |
| `classifyPost` (shared/classifier.ts) | Unchanged; LLM-primary just moves its call site |
| `HeuristicDetector` | Unchanged; becomes the fallback argument in `LLMDetector` constructor |
| `LLMDetector.fallback` | Already exists as a constructor parameter — promotion to primary requires no interface change |

---

## Sources

- Codebase analysis: `src/shared/classifier.ts`, `src/shared/eval/metrics.ts`, `src/shared/eval/runs.ts`, `src/content/detector/llm.ts`, `src/content/detector/heuristic.ts`, `src/background/index.ts`, `src/shared/types.ts`
- Established classification tuning practice: precision-constrained threshold selection is standard for recall-precision tradeoff in high-precision-required settings (medical NLP, content moderation, spam filtering)
- Few-shot hard-negative prompting: standard technique documented in Anthropic prompt engineering guides
- Regression gate epsilon: 1pp tolerance is common in ML CI systems (avoids noise-driven false failures while catching meaningful regressions)
- Rate-limit pattern: modeled on the existing `checkRateLimit` / `acquireRateLimitLatch` / `releaseRateLimitLatch` in `src/background/index.ts` (ADAPT-05)

---
*Feature research for: v10.0 LLM-Primary Detection & Eval-Driven Tuning*
*Researched: 2026-06-15*
