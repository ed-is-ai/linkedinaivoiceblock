# Requirements — Milestone v7.0: Adaptive DOM Scraper

**Status:** Active
**Milestone:** v7.0
**Last updated:** 2026-06-06

> Prior milestone requirements (v6.1 POPUP-04/05 and earlier) are validated and recorded in `PROJECT.md` → Requirements. This file scopes v7.0 only.

---

## Selector Registry (Wave 1 — externalize to storage)

- [x] **SELECTOR-01**: All selector-registry entries are stored in `chrome.storage.local` as rank-ordered candidate lists with metadata (`value`, `source`, `lastMatchedAt`, `lastVerifiedAt`, `matchCount`), seeded from `selectors.ts` defaults.
- [x] **SELECTOR-02**: At runtime the content script resolves every selector through the candidate registry in priority order; `selectors.ts` is reduced to the seed/defaults source (no direct selector imports remain in `observer.ts` / `exclusions.ts`).
- [x] **SELECTOR-03**: The registry is versioned; it seeds from defaults only when absent or on a version bump, and never overwrites adapted candidates on a normal page load.
- [x] **SELECTOR-04**: A successful match rotates the winning candidate to the front of its list and persists the change.
- [x] **SELECTOR-05**: Adapted candidates carry a timestamp and are demoted/expired after 30 days; each candidate list is capped (≤10 entries) and always retains the default seed.
- [x] **SELECTOR-06**: The user can reset selectors to bundled defaults from the popup/dashboard (escape hatch from a bad adaptation).
- [x] **SELECTOR-07**: A read-only view shows each target's active selector, its source (default/adapted/llm), and last-matched info, and warns when a critical selector has not matched recently on a feed page.
- [x] **SELECTOR-08**: The in-memory selector cache refreshes via `chrome.storage.onChanged` so healed selectors take effect within the session and stay consistent across tabs.
- [x] **SELECTOR-09**: After migration the extension behaves identically to v6.1 (regression-safe), verified by fixture-DOM tests covering seeding, runtime resolution, versioned migration, and reset-to-defaults.
- [x] **SELECTOR-10**: Project documentation (CLAUDE.md constraint #1) is updated to describe the seed-vs-runtime selector model (`selectors.ts` = defaults; `SelectorRegistry` = runtime source; only the registry writes selectors to storage).

## Adaptive Self-Healing (Wave 2 — recover broken selectors)

- [x] **ADAPT-01**: The system detects total scraping breakage — zero post-card matches over an active-feed window — guarded against false positives (feed-URL gate, feed-container present, minimum session activity, no-posts placeholder, auth check, rolling debounce) so skeleton/logged-out/non-feed/empty states do not trigger healing.
- [x] **ADAPT-02**: On breakage, structural heuristics re-derive candidate selectors locally (no API call) from stable DOM anchors (role/aria/semantic/href/structure).
- [x] **ADAPT-03**: No re-derived candidate is trusted or written until it passes a validation gate (minimum match count, author-link ratio, post-text presence, sponsored-contamination rejection, feed-context containment).
- [x] **ADAPT-04**: When heuristics produce no valid candidate and an API key is configured, an LLM (Claude) fallback proposes ranked candidates from a sanitized **structural** DOM skeleton (all text/href/src/aria-label stripped — no post content or PII leaves the browser), validated through the same gate.
- [x] **ADAPT-05**: LLM fallback is rate-bounded — single-flight latch, ≥5-minute cool-off persisted across service-worker restarts, and a per-day hard cap — and is only reached after heuristics fail.
- [x] **ADAPT-06**: LLM responses are strictly validated before use (reject overly-broad selectors such as `body`/`html`/`*`; bounded match count; selector treated as a plain string, never evaluated) to prevent prompt-injection via page content.
- [x] **ADAPT-07**: A recovered winning candidate is prepended and persisted, with the previously-active candidate retained so detection auto-recovers if LinkedIn reverts.
- [x] **ADAPT-08**: Candidates within a target are ordered by a confidence signal (match count × recency × source weight), not pure insertion order.
- [x] **ADAPT-09**: Fixture-DOM tests cover partial breakage, logged-out, skeleton-loader, heal-to-wrong-element rejection, and the reset round-trip; the LLM live-key path is verified by a manual (non-CI) test.
- [x] **ADAPT-10**: If the LLM fallback ships, `PRIVACY.md` discloses that a sanitized structural description of the feed layout (no text/PII) may be sent to the Anthropic API to repair broken selectors.

---

## Future Requirements (deferred)

- Manual selector editing / override UI (a power-user could paste a corrected selector; deferred to keep v7.0 read-only and avoid class-name input risk).
- Breakage event log surfaced in the health view ("recovered via heuristic 2 days ago").
- Auto-promotion of a non-active candidate after N consecutive matches.
- Full candidate-list management UI (reorder/delete individual candidates).
- Partial-breakage as an explicit healing *trigger* (v7.0 triggers on total breakage only; heuristics degrade gracefully on partial).
- Blocked-accounts manager page (carried over from v6.0 deferral: BLOCK-01/02/03).

## Out of Scope

- Sending post content / personal data to the LLM (structural skeleton only — hard rule).
- A per-selector manual "repair" button (not in scope; total-breakage auto-detection + reset cover v7.0).
- Bundling an Anthropic API key (LLM fallback uses the user's configured key only).
- Cross-device sync of the selector registry (`chrome.storage.sync`) — candidates are local-feed-derived.
- Any change to detection scoring, block/dismiss, dashboard stats, or export behavior.

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SELECTOR-01 | Phase 22 | Complete |
| SELECTOR-02 | Phase 22 | Complete |
| SELECTOR-03 | Phase 22 | Complete |
| SELECTOR-04 | Phase 22 | Complete |
| SELECTOR-05 | Phase 22 | Complete |
| SELECTOR-06 | Phase 22 | Complete |
| SELECTOR-07 | Phase 22 | Complete |
| SELECTOR-08 | Phase 22 | Complete |
| SELECTOR-09 | Phase 22 | Complete |
| SELECTOR-10 | Phase 22 | Complete |
| ADAPT-01 | Phase 23 | Complete |
| ADAPT-02 | Phase 23 | Complete |
| ADAPT-03 | Phase 23 | Complete |
| ADAPT-04 | Phase 23 | Complete |
| ADAPT-05 | Phase 23 | Complete |
| ADAPT-06 | Phase 23 | Complete |
| ADAPT-07 | Phase 23 | Complete |
| ADAPT-08 | Phase 23 | Complete |
| ADAPT-09 | Phase 23 | Complete |
| ADAPT-10 | Phase 23 | Complete |
| TRACE-01 | Phase 24 | Complete |
| TRACE-02 | Phase 24 | Complete |
| TRACE-03 | Phase 24 | Complete |
| TRACE-04 | Phase 25 | Planned |
| TRACE-05 | Phase 25 | Planned |
| TRACE-06 | Phase 25 | Planned |
| EVAL-01 | Phase 26 | Planned |
| EVAL-02 | Phase 26 | Planned |
| EVAL-03 | Phase 26 | Planned |
| EVAL-04 | Phase 26 | Planned |

---

# Requirements — Milestone v8.0: Observability

**Status:** Planned (builds after v7.0)
**Milestone:** v8.0
**Last updated:** 2026-06-07

---

## LLM Trace Capture (TRACE)

- [x] **TRACE-01**: Each `LLMDetector` call appends a trace entry to `chrome.storage.local` recording: model, system prompt, user prompt (truncated to 500 chars), input token count, output token count, computed USD cost, ISO timestamp, and source `"detector"`.
- [x] **TRACE-02**: Each `LLMRederiver` call appends a trace entry with the same schema and source `"rederiver"`.
- [x] **TRACE-03**: The trace store is capped at 500 entries; when full, the oldest entries are evicted (FIFO).
- [x] **TRACE-04**: The dashboard exposes an "Export Traces" button that downloads all stored trace entries as a `linkedin-blocker-traces-YYYY-MM-DD.json` file.
- [x] **TRACE-05**: `npm run trace-summary <file>` reads a trace export JSON and prints a cost breakdown table grouped by source and model (call count, total input tokens, total output tokens, total USD cost, avg cost per call).
- [x] **TRACE-06**: `npm run trace-summary <file>` writes/updates a `## LLM Cost Reference` section in `README.md` with the generated cost table so the README always reflects a real run.

---

## Future Requirements (deferred from v8.0)

- Per-session grouping: group traces into "sessions" (tab open → close) so per-session cost is queryable.
- Live trace count badge in the dashboard header.
- Trace retention policy UI (keep last N entries vs keep last N days).

## Out of Scope (v8.0)

- Any changes to detection scoring or selector logic.
- Trace data sent to a remote endpoint — local only.
- Automatic README updates on extension run (only on-demand via `npm run trace-summary`).

---

# Requirements — Milestone v9.0: Eval Harness

**Status:** Planned (builds after v8.0)
**Milestone:** v9.0
**Last updated:** 2026-06-07

---

## LLM Eval Runner (EVAL)

- [x] **EVAL-01**: The standard post-export JSON (existing extension export format) is the input to the eval runner; users annotate it by adding `"label": "ai" | "human"` to each post entry to create a labeled evaluation dataset.
- [x] **EVAL-02**: `npm run eval <labeled-posts.json>` reads the labeled dataset, feeds each post's text through the LLM classifier, and records the model's verdict alongside the ground-truth label.
- [x] **EVAL-03**: The eval runner computes and prints: precision, recall, F1 score, accuracy, total LLM cost, average cost per post, and total posts evaluated — as a formatted results table.
- [x] **EVAL-04**: Results are written to `eval/results-YYYY-MM-DD.json` (directory auto-created) and a compact summary line is printed suitable for pasting into a README or PR description.

## Eval Improvements (EVAL / Phase 27)

> Phase 27 makes the eval measure *shipped* detection and turns results into actionable output. Defined at planning time (finalized from the ROADMAP names EVAL-06–EVAL-09).

- [ ] **EVAL-06**: The eval scores each post through the same detector engine the extension ships — `HeuristicDetector` (imported directly from `src/content/detector/heuristic.ts`; already DOM-free) or the LLM path via `classifyPost` — selected by a `--engine heuristic|llm` flag (default `llm`, preserving Phase 26 behavior). The heuristic engine requires no API key and is free; its per-post `signalBreakdown` uses the heuristic signal vocabulary matching the stored `flaggedAccounts.signals` shape. (Source: `scripts/eval.ts`, `src/content/detector/heuristic.ts`.)
- [ ] **EVAL-07**: At the best-F1 threshold the eval surfaces false positives (true `human`, predicted AI) and false negatives (true `ai`, predicted `human`) with each post's score, `signalBreakdown`, optional reasoning, and `textPreview` — printed to the terminal (capped at top-5 each, full counts shown) and persisted under `results.errorAnalysis` in the results JSON. (Source: `scripts/eval.ts`.)
- [ ] **EVAL-08**: `npm run eval-label -- <export.json> [--auto]` reduces the manual JSON-editing burden of adding `"label": "ai" | "human"` to export entries, writing labels back into the existing export shape (`flaggedPosts[].label` / `unflaggedPosts[].label`) while preserving all other fields; `--auto` bulk-labels flaggedPosts as `ai` and unflaggedPosts as `human` idempotently, and an interactive per-post mode handles ambiguous cases. (Source: `scripts/eval-label.ts`.)
- [ ] **EVAL-09**: `npm run eval-compare -- <results-A.json> <results-B.json> [--format markdown]` reads two results files and prints a side-by-side comparison of engine, posts scored, best-F1 threshold, precision/recall/F1/accuracy, and cost (`free` for heuristic `cost: null` runs), in terminal or GitHub-markdown form. (Source: `scripts/eval-compare.ts`.)

---

## Eval Negatives Capture & Export (CAPTURE / Phase 25.1)

> Phase 25.1 supplies real human-negatives for the v9.0 eval (EVAL-*). The detector's below-`FLAG_THRESHOLD` posts are captured UNLABELED and exported so the Phase 26 eval has genuine "human" examples to score against.

- [x] **CAPTURE-01**: The detector's below-`FLAG_THRESHOLD` posts (the human-looking negatives dropped at the `content/index.ts` early return) are persisted UNLABELED to a new capped `unflaggedPosts` store in `chrome.storage.local` — a newest-first array, FIFO-capped at 200, deduped by `urn`, with post text truncated to 1000 chars, recording `seenAt`, `score`, and `engineUsed`; backed by an `UnflaggedPost` type, an `unflaggedPosts` `StorageSchema` key, and a `persistUnflaggedPost` helper. (Source: `src/shared/types.ts`, `src/shared/postStore.ts`.)
- [x] **CAPTURE-02**: Capture is gated behind a distinct opt-in `Settings.captureUnflaggedPosts`, OFF by default, deliberately separate from any other storage opt-in (it stores text the user never flagged — a broader privacy surface); the popup exposes a toggle for it and writes settings via a merge so the opt-in and `autoHideThreshold` do not clobber each other; the content-script capture call fires only when the opt-in is enabled. (Source: `src/content/index.ts`, `src/popup/index.tsx`.)
- [x] **EXPORT-04**: The dashboard "Export JSON" includes a top-level `unflaggedPosts[]` array (sibling of `flaggedAccounts[]`) so the Phase 26 eval has real human-negatives; the export builder adds the array additively (existing flagged-account nesting and CSV exports unchanged), and the Export JSON button is reachable whenever unflagged posts exist even with zero flagged accounts. EXPORT-04 is a **NEW** ID scoped to Phase 25.1 eval negatives and does **NOT** modify the archived v1.1 EXPORT-01 (flagged accounts + stored posts) nor the v1.2 EXPORT-03 (Posts CSV) definitions. (Source: `src/dashboard`, `buildJsonExport`.)
- [x] **EXPORT-05**: The dashboard "Export JSON" adds a NEW top-level post-centric `flaggedPosts[]` array (sibling of `flaggedAccounts[]` and `unflaggedPosts[]`), sourced from the existing `storedPosts` (hidden posts, score ≥ `autoHideThreshold`). Entry shape mirrors `unflaggedPosts` for symmetry — `{ urn, authorId, authorName, text, score, hiddenAt, label? }` — using the native `hiddenAt` timestamp (vs `unflaggedPosts`'s `seenAt`), OMITTING `engineUsed` (never recorded at hide time for `storedPosts`), and including an optional user-added `label` (`"ai" | "human"`) emitted only when present (identical UNLABELED-by-default discipline to Phase 25.1 D-06; the extension NEVER writes `label`). Each exported `flaggedAccounts[]` entry replaces its `status` enum with a derived `blocked: boolean` (`blocked = (status === 'blocked')`) with `status` dropped from the export output; `FlaggedAccount.status` in storage/types remains unchanged. The nested `flaggedAccounts[].posts[]` array is retained — the same hidden-post data therefore appears both in top-level `flaggedPosts[]` and nested under each account (intentional duplication per D-06 — the account→posts view is preserved alongside the new post-centric array). This change is **additive and transform-only** over already-stored data: no new capture, no storage-schema change, no new `chrome.storage.local` keys. The archived EXPORT-01/03 definitions and the Phase 25.1 EXPORT-04 definition are untouched. EXPORT-05 enriches the EVAL-01 downstream labeled dataset by giving the Phase 26 eval walker a richer, post-centric positive source (`flaggedPosts[]`) alongside the existing negative source (`unflaggedPosts[]`). (Source: `src/dashboard/dataManagement.ts` §`buildJsonExport`; `src/shared/types.ts` §`FlaggedPost`.)

---

## Traceability (v9.0)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| EVAL-01 | Phase 26 | Planned |
| EVAL-02 | Phase 26 | Planned |
| EVAL-03 | Phase 26 | Planned |
| EVAL-04 | Phase 26 | Planned |
| EVAL-06 | Phase 27 | Planned |
| EVAL-07 | Phase 27 | Planned |
| EVAL-08 | Phase 27 | Planned |
| EVAL-09 | Phase 27 | Planned |
| CAPTURE-01 | Phase 25.1 | Complete |
| CAPTURE-02 | Phase 25.1 | Complete |
| EXPORT-04 | Phase 25.1 | Complete |
| EXPORT-05 | Phase 25.2 | Planned |

---

## Future Requirements (deferred from v9.0)

- CI integration: run eval against a committed fixtures file on every push (costs real money — opt-in only).
- Heuristic-layer eval: measure heuristics-only precision/recall before LLM is called (free, fast).
- Confusion matrix output: per-class breakdown (AI detected as human, human detected as AI, etc.).

## Out of Scope (v9.0)

- Bundling a golden dataset in the repo (user provides their own labeled export).
- Any UI in the extension for labeling posts.
- Automated re-training or threshold adjustment from eval results.
