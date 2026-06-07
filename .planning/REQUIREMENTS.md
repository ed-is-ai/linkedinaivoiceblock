# Requirements — Milestone v7.0: Adaptive DOM Scraper

**Status:** Active
**Milestone:** v7.0
**Last updated:** 2026-06-06

> Prior milestone requirements (v6.1 POPUP-04/05 and earlier) are validated and recorded in `PROJECT.md` → Requirements. This file scopes v7.0 only.

---

## Selector Registry (Wave 1 — externalize to storage)

- [ ] **SELECTOR-01**: All selector-registry entries are stored in `chrome.storage.local` as rank-ordered candidate lists with metadata (`value`, `source`, `lastMatchedAt`, `lastVerifiedAt`, `matchCount`), seeded from `selectors.ts` defaults.
- [ ] **SELECTOR-02**: At runtime the content script resolves every selector through the candidate registry in priority order; `selectors.ts` is reduced to the seed/defaults source (no direct selector imports remain in `observer.ts` / `exclusions.ts`).
- [ ] **SELECTOR-03**: The registry is versioned; it seeds from defaults only when absent or on a version bump, and never overwrites adapted candidates on a normal page load.
- [ ] **SELECTOR-04**: A successful match rotates the winning candidate to the front of its list and persists the change.
- [ ] **SELECTOR-05**: Adapted candidates carry a timestamp and are demoted/expired after 30 days; each candidate list is capped (≤10 entries) and always retains the default seed.
- [ ] **SELECTOR-06**: The user can reset selectors to bundled defaults from the popup/dashboard (escape hatch from a bad adaptation).
- [ ] **SELECTOR-07**: A read-only view shows each target's active selector, its source (default/adapted/llm), and last-matched info, and warns when a critical selector has not matched recently on a feed page.
- [ ] **SELECTOR-08**: The in-memory selector cache refreshes via `chrome.storage.onChanged` so healed selectors take effect within the session and stay consistent across tabs.
- [ ] **SELECTOR-09**: After migration the extension behaves identically to v6.1 (regression-safe), verified by fixture-DOM tests covering seeding, runtime resolution, versioned migration, and reset-to-defaults.
- [ ] **SELECTOR-10**: Project documentation (CLAUDE.md constraint #1) is updated to describe the seed-vs-runtime selector model (`selectors.ts` = defaults; `SelectorRegistry` = runtime source; only the registry writes selectors to storage).

## Adaptive Self-Healing (Wave 2 — recover broken selectors)

- [ ] **ADAPT-01**: The system detects total scraping breakage — zero post-card matches over an active-feed window — guarded against false positives (feed-URL gate, feed-container present, minimum session activity, no-posts placeholder, auth check, rolling debounce) so skeleton/logged-out/non-feed/empty states do not trigger healing.
- [ ] **ADAPT-02**: On breakage, structural heuristics re-derive candidate selectors locally (no API call) from stable DOM anchors (role/aria/semantic/href/structure).
- [ ] **ADAPT-03**: No re-derived candidate is trusted or written until it passes a validation gate (minimum match count, author-link ratio, post-text presence, sponsored-contamination rejection, feed-context containment).
- [ ] **ADAPT-04**: When heuristics produce no valid candidate and an API key is configured, an LLM (Claude) fallback proposes ranked candidates from a sanitized **structural** DOM skeleton (all text/href/src/aria-label stripped — no post content or PII leaves the browser), validated through the same gate.
- [ ] **ADAPT-05**: LLM fallback is rate-bounded — single-flight latch, ≥5-minute cool-off persisted across service-worker restarts, and a per-day hard cap — and is only reached after heuristics fail.
- [ ] **ADAPT-06**: LLM responses are strictly validated before use (reject overly-broad selectors such as `body`/`html`/`*`; bounded match count; selector treated as a plain string, never evaluated) to prevent prompt-injection via page content.
- [ ] **ADAPT-07**: A recovered winning candidate is prepended and persisted, with the previously-active candidate retained so detection auto-recovers if LinkedIn reverts.
- [ ] **ADAPT-08**: Candidates within a target are ordered by a confidence signal (match count × recency × source weight), not pure insertion order.
- [ ] **ADAPT-09**: Fixture-DOM tests cover partial breakage, logged-out, skeleton-loader, heal-to-wrong-element rejection, and the reset round-trip; the LLM live-key path is verified by a manual (non-CI) test.
- [ ] **ADAPT-10**: If the LLM fallback ships, `PRIVACY.md` discloses that a sanitized structural description of the feed layout (no text/PII) may be sent to the Anthropic API to repair broken selectors.

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
| SELECTOR-01 | Phase 22 | Pending |
| SELECTOR-02 | Phase 22 | Pending |
| SELECTOR-03 | Phase 22 | Pending |
| SELECTOR-04 | Phase 22 | Pending |
| SELECTOR-05 | Phase 22 | Pending |
| SELECTOR-06 | Phase 22 | Pending |
| SELECTOR-07 | Phase 22 | Pending |
| SELECTOR-08 | Phase 22 | Pending |
| SELECTOR-09 | Phase 22 | Pending |
| SELECTOR-10 | Phase 22 | Pending |
| ADAPT-01 | Phase 23 | Pending |
| ADAPT-02 | Phase 23 | Pending |
| ADAPT-03 | Phase 23 | Pending |
| ADAPT-04 | Phase 23 | Pending |
| ADAPT-05 | Phase 23 | Pending |
| ADAPT-06 | Phase 23 | Pending |
| ADAPT-07 | Phase 23 | Pending |
| ADAPT-08 | Phase 23 | Pending |
| ADAPT-09 | Phase 23 | Pending |
| ADAPT-10 | Phase 23 | Pending |
| TRACE-01 | Phase 24 | Planned |
| TRACE-02 | Phase 24 | Planned |
| TRACE-03 | Phase 24 | Planned |
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

- [ ] **TRACE-01**: Each `LLMDetector` call appends a trace entry to `chrome.storage.local` recording: model, system prompt, user prompt (truncated to 500 chars), input token count, output token count, computed USD cost, ISO timestamp, and source `"detector"`.
- [ ] **TRACE-02**: Each `LLMRederiver` call appends a trace entry with the same schema and source `"rederiver"`.
- [ ] **TRACE-03**: The trace store is capped at 500 entries; when full, the oldest entries are evicted (FIFO).
- [ ] **TRACE-04**: The dashboard exposes an "Export Traces" button that downloads all stored trace entries as a `linkedin-blocker-traces-YYYY-MM-DD.json` file.
- [ ] **TRACE-05**: `npm run trace-summary <file>` reads a trace export JSON and prints a cost breakdown table grouped by source and model (call count, total input tokens, total output tokens, total USD cost, avg cost per call).
- [ ] **TRACE-06**: `npm run trace-summary <file>` writes/updates a `## LLM Cost Reference` section in `README.md` with the generated cost table so the README always reflects a real run.

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

- [ ] **EVAL-01**: The standard post-export JSON (existing extension export format) is the input to the eval runner; users annotate it by adding `"label": "ai" | "human"` to each post entry to create a labeled evaluation dataset.
- [ ] **EVAL-02**: `npm run eval <labeled-posts.json>` reads the labeled dataset, feeds each post's text through the LLM classifier, and records the model's verdict alongside the ground-truth label.
- [ ] **EVAL-03**: The eval runner computes and prints: precision, recall, F1 score, accuracy, total LLM cost, average cost per post, and total posts evaluated — as a formatted results table.
- [ ] **EVAL-04**: Results are written to `eval/results-YYYY-MM-DD.json` (directory auto-created) and a compact summary line is printed suitable for pasting into a README or PR description.

---

## Future Requirements (deferred from v9.0)

- CI integration: run eval against a committed fixtures file on every push (costs real money — opt-in only).
- Heuristic-layer eval: measure heuristics-only precision/recall before LLM is called (free, fast).
- Confusion matrix output: per-class breakdown (AI detected as human, human detected as AI, etc.).

## Out of Scope (v9.0)

- Bundling a golden dataset in the repo (user provides their own labeled export).
- Any UI in the extension for labeling posts.
- Automated re-training or threshold adjustment from eval results.
