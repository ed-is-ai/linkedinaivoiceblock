# Roadmap — LinkedIn Blocker

**Project:** LinkedIn Blocker (Chrome MV3)
**Created:** 2026-05-25

---

## Milestones

- ✅ **v1.0 Clean Feed** — Phases 1–6 (shipped 2026-05-30)
- ✅ **v1.1 UX & Data** — Phases 7–9 (shipped 2026-05-30)
- ✅ **v1.2 Feed Insights & Export** — Phases 10–11 (shipped 2026-05-30)
- ✅ **v2.0 Chrome Web Store Release** — Phases 12–14 (shipped 2026-05-31)
- ✅ **v3.0 Repo Rename Cleanup** — Phase 15 (shipped 2026-05-31)
- ✅ **v4.0 Prompt Caching** — Phase 16 (shipped 2026-05-31)
- ✅ **v5.0 Voice Pattern Detection** — Phase 17 (shipped 2026-05-31)
- ✅ **v6.0 UX Polish + Block Management** — Phases 18–20 (shipped 2026-06-06)
- ✅ **v6.1 Popup UX Tidy-up** — Phase 21 (shipped 2026-06-06)
- 🚧 **v7.0 Adaptive DOM Scraper** — Phases 22–23 (in progress)
- 📋 **v8.0 Observability** — Phases 24–25 (planned)
- 📋 **v9.0 Eval Harness** — Phase 26 (planned)

---

## Phases

<details>
<summary>✅ v1.0 Clean Feed (Phases 1–6) — SHIPPED 2026-05-30</summary>

- [x] Phase 1: Foundation — 4/4 plans — completed 2026-05-25
- [x] Phase 2: Detection Engine — 4/4 plans — completed 2026-05-29
- [x] Phase 3: Storage & Queue — 3/3 plans — completed 2026-05-29
- [x] Phase 4: Popup UI — 2/2 plans — completed 2026-05-29
- [x] Phase 5: User Decisions — 2/2 plans — completed 2026-05-29
- [x] Phase 6: Settings & Dashboard — 3/3 plans — completed 2026-05-30

</details>

<details>
<summary>✅ v1.1 UX & Data (Phases 7–9) — SHIPPED 2026-05-30</summary>

- [x] Phase 7: Post Storage — 2/2 plans — completed 2026-05-30
- [x] Phase 8: Popup Signal Detail & Post Preview — 2/2 plans — completed 2026-05-30
- [x] Phase 9: Export & Cleanse — 2/2 plans — completed 2026-05-30

</details>

<details>
<summary>✅ v1.2 Feed Insights & Export Completeness (Phases 10–11) — SHIPPED 2026-05-30</summary>

Profile bot-rate stat on dashboard + Posts CSV export. → [v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

<details>
<summary>✅ v2.0 Chrome Web Store Release (Phases 12–14) — SHIPPED 2026-05-31</summary>

Icons, manifest compliance, privacy policy, store listing, packaging script, submission guide. → [v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

</details>

<details>
<summary>✅ v3.0 Repo Rename Cleanup (Phase 15) — SHIPPED 2026-05-31</summary>

Replace all `linkedinblock` → `linkedinaivoiceblock` refs (11 files + git remote + ZIP rebuild). → [v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md)

</details>

<details>
<summary>✅ v4.0 Prompt Caching (Phase 16) — SHIPPED 2026-05-31</summary>

Anthropic prompt caching on system prompt + expanded SYSTEM_PROMPT to 856 words. → [v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md)

</details>

<details>
<summary>✅ v5.0 Voice Pattern Detection (Phase 17) — SHIPPED 2026-05-31</summary>

Three new signal functions: hook-story, motivational, impersonal framing. AI voice post scores 61. → [v5.0-ROADMAP.md](milestones/v5.0-ROADMAP.md)

</details>

<details>
<summary>✅ v6.0 UX Polish + Block Management (Phases 18–20) — SHIPPED 2026-06-06</summary>

- [x] **Phase 18: Popup Interaction Fixes** - Bug fix (threshold hiding) + popup click wiring (account name, block button state) (completed 2026-06-05)
- [x] **Phase 20: Batch Block** - "Block all above threshold" popup action with confirmation step (completed 2026-06-06)

</details>

<details>
<summary>✅ v6.1 Popup UX Tidy-up (Phase 21) — SHIPPED 2026-06-06</summary>

- [x] **Phase 21: Dashboard Button Reposition** - Move "View Dashboard" button from inside Settings to the popup header region; remove the in-settings copy (completed 2026-06-06)

</details>

---

### 🚧 v7.0 Adaptive DOM Scraper (In Progress)

**Milestone Goal:** Make LinkedIn scraping resilient to DOM/class churn — store selectors as a dynamic ranked candidate registry and add a self-healing adapter that detects breakage and re-derives working selectors automatically.

- [x] **Phase 22: Externalize Selectors to Storage** - Storage-backed ranked candidate registry seeded from selectors.ts; runtime resolution via SelectorRegistry; zero behavior change (Wave 1) (completed 2026-06-14)
- [x] **Phase 23: Self-Healing Selector Adapter** - Breakage detection with 6 false-positive guards; heuristic re-derivation; LLM fallback on sanitized structural DOM; confidence-ranked candidates (Wave 2) (completed 2026-06-13)

---

### 📋 v8.0 Observability (Planned)

**Milestone Goal:** Every LLM call made by the extension is traced — model, prompts, token counts, USD cost — accumulated in chrome.storage.local, exportable from the dashboard, and summarized in the README by an npm script.

- [x] **Phase 24: Trace Capture & Storage** - LLM call interception in LLMDetector and LLMRederiver; trace schema; capped FIFO store in chrome.storage.local (completed 2026-06-13)
- [x] **Phase 25: Dashboard Export + README Script** - "Export Traces" button on dashboard; `npm run trace-summary` script that reads a trace export and updates the README cost table (completed 2026-06-14)

### 📋 v9.0 Eval Harness (Planned)

**Milestone Goal:** Evaluate LLM classifier quality against a labeled real-world dataset — user annotates an extension post-export JSON, runs an eval script, and gets precision/recall/F1/cost metrics.

- [ ] **Phase 26: Eval Runner** - Labeled-JSON input format (extends existing export); eval script feeding posts through LLM classifier; precision/recall/F1/cost metrics; results written to `eval/results-YYYY-MM-DD.json`

---

## Phase Details

### Phase 18: Popup Interaction Fixes

**Goal**: Posts from accounts at or above the block threshold are hidden in the feed, and popup interaction behaves correctly — account names link to LinkedIn profiles, Block marks accounts locally without navigation, and already-blocked accounts are visually distinguished
**Depends on**: Phase 17
**Requirements**: BUG-01, POPUP-01, POPUP-02, POPUP-03
**Success Criteria** (what must be TRUE):

  1. Loading a LinkedIn feed page hides posts from any account whose stored score meets or exceeds the configured threshold (verified with a known flagged account)
  2. New posts injected by the SPA (infinite scroll) from threshold-hitting accounts are also hidden by the MutationObserver handler
  3. Clicking an account name row in the popup opens that account's LinkedIn profile URL in a new browser tab
  4. Clicking Block on a popup account row stores the account as blocked in chrome.storage.local without opening any LinkedIn page
  5. A popup account row whose account is already in blocked storage shows a visually distinct state (greyed out label or "Blocked" indicator) instead of an active Block button**Plans**: 3 plans

**Wave 1**

- [x] 18-01-PLAN.md — BUG-01: thresholdAuthors map + observer hide branch + settings rebuild
- [x] 18-02-PLAN.md — POPUP-01/POPUP-02: anchor stopPropagation + remove window.open from handleBlock

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-03-PLAN.md — POPUP-03: collapsible Blocked section + AccountRow isBlocked variant

**UI hint**: yes

### Phase 18.1: Dashboard Data Display (INSERTED)

**Goal:** The dashboard presents feed-health data visually — flagged-post rate and bot-profile rate render as horizontal bar rows, a "Net AI voice posts in feed" line chart shows the daily clean-feed percentage, and the redundant signal-categories card is removed — with a build-clean codebase and no throwaway artifacts.
**Requirements**: DASH-DISPLAY-01
**Depends on:** Phase 18
**Plans:** 1 plan
Plans:

- [x] 18.1-01-PLAN.md — Fix dashboard TS error, delete mockup file, human-verify visual display changes

### Phase 20: Batch Block

**Goal**: The user can mark all flagged accounts at or above the detection threshold as blocked in a single popup action, with a confirmation step showing the affected count before any change is committed
**Depends on**: Phase 18.1
**Requirements**: BATCH-01, BATCH-02, BATCH-03
**Success Criteria** (what must be TRUE):

  1. The popup displays a "Block all above threshold" button (or equivalent action) when at least one flagged account's peak score meets or exceeds the configured threshold
  2. Activating the action shows a confirmation prompt that states how many accounts will be blocked before any write occurs
  3. Confirming the action writes all qualifying accounts to blocked storage; cancelling leaves storage unchanged
  4. After confirmation, previously-qualifying popup rows show the already-blocked visual state from Phase 18

**Plans**: 1 planPlans:

- [x] 20-01-PLAN.md — Batch-block popup action: BatchBlockBar + handleBatchBlock single-set write + inline confirmation (BATCH-01/02/03)

**UI hint**: yes

### Phase 21: Dashboard Button Reposition

**Goal**: The "View Dashboard" button is visible at the top of the popup without any interaction, making the dashboard immediately discoverable
**Depends on**: Phase 20
**Requirements**: POPUP-04, POPUP-05
**Success Criteria** (what must be TRUE):

  1. Opening the popup shows a "View Dashboard" control in the header region, above the pending account list, without the user needing to open Settings
  2. Clicking that top-of-popup button opens dashboard/index.html in a new tab (same behavior as before, new position)
  3. Opening the Settings disclosure no longer contains a "View Dashboard" button — only the threshold slider, export controls, and API key section remain
  4. The change is confined to src/popup/index.tsx; no other files are modified

**Plans**: 1 planPlans:

- [x] 21-01-PLAN.md — Relocate View Dashboard button to popup header region; remove in-settings copy (POPUP-04, POPUP-05)

**UI hint**: yes

### Phase 22: Externalize Selectors to Storage

**Goal**: All selector lookups at runtime route through a new SelectorRegistry module backed by chrome.storage.local, seeded once from selectors.ts defaults, with versioned migration, 30-day TTL on adapted candidates, a reset-to-defaults escape hatch, a read-only health view, and cross-tab cache refresh — while the extension behaves identically to v6.1 from a user perspective
**Depends on**: Phase 21
**Requirements**: SELECTOR-01, SELECTOR-02, SELECTOR-03, SELECTOR-04, SELECTOR-05, SELECTOR-06, SELECTOR-07, SELECTOR-08, SELECTOR-09, SELECTOR-10
**Success Criteria** (what must be TRUE):

  1. Selectors are resolved from storage at runtime, not imported directly from selectors.ts — observer.ts and exclusions.ts contain no direct selector string imports
  2. The extension behaves identically to v6.1 on a live LinkedIn feed: the same posts are hidden, the same accounts are flagged, and no new console errors appear (regression-safe)
  3. A winning selector match rotates its candidate to position 0 in its list and the change persists across page reloads
  4. Opening the popup or dashboard shows a read-only selector health view listing each target's active selector, source badge (seed/heuristic/llm), and a warning when a critical selector has not matched recently
  5. Triggering "Reset to defaults" from the popup/dashboard restores all registry entries to the selectors.ts seed values and the health view reflects the change immediately

**Plans**: TBD

**UI hint**: yes

### Phase 23: Self-Healing Selector Adapter

**Goal**: The extension detects when selector scraping has broken on an active LinkedIn feed and automatically re-derives working candidates — first via structural heuristics, then via an LLM fallback — with strict validation before any candidate is written, rate-bounding on LLM calls, and full privacy protection
**Depends on**: Phase 22
**Requirements**: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, ADAPT-05, ADAPT-06, ADAPT-07, ADAPT-08, ADAPT-09, ADAPT-10
**Success Criteria** (what must be TRUE):

  1. Breakage detection does not trigger on a logged-out LinkedIn page, a skeleton-loader state, a non-feed URL, or a genuinely empty feed — all 6 false-positive guards (URL gate, container present, minimum session activity, no-posts placeholder, auth check, 30s rolling debounce) are verified by fixture tests
  2. When total breakage is detected on an active feed, the heuristic re-deriver proposes candidates locally without any API call; no candidate is written to storage until it passes the full validation gate (minimum match count, author-link ratio, post-text presence, sponsored-contamination rejection, feed-context containment)
  3. No post content, user names, headlines, photo URLs, or any PII leaves the browser during the LLM fallback — only a structural DOM skeleton with all text/href/src/aria-label stripped is sent to the Anthropic API
  4. LLM fallback is only reached when heuristics produce no valid candidate and an API key is configured; it is rate-bounded by a single-flight latch, a minimum 5-minute cool-off persisted across service-worker restarts, and a per-day hard cap
  5. The LLM response is strictly validated before use: selectors matching body/html/* are rejected, overly-broad selectors (outside a 2–50 match range) are rejected, and the selector string is never passed to eval

**Plans**: TBD
**Note — open decision (resolve at plan time):** LLM call location is now confirmed: the Anthropic fetch must live in the **service worker** (background/index.ts) because CORS blocks content-script direct fetches from linkedin.com. The existing LLMDetector pattern (content script sends SCORE_POST message → service worker fetches and responds) must be replicated for LLMRederiver. This is a code-verified fact from src/content/detector/llm.ts and src/background/index.ts.

**UI hint**: yes

---

### Phase 24: Trace Capture & Storage

**Goal**: Every LLM call made by LLMDetector and LLMRederiver appends a structured trace entry to chrome.storage.local — model, prompts, token counts, cost, timestamp, source — with a 500-entry FIFO cap
**Depends on**: Phase 23
**Requirements**: TRACE-01, TRACE-02, TRACE-03
**Success Criteria** (what must be TRUE):

  1. Making an LLMDetector call on a post results in a new trace entry in chrome.storage.local with all required fields (model, systemPrompt, userPrompt truncated to 500 chars, inputTokens, outputTokens, costUsd, timestamp, source: "detector")
  2. Making an LLMRederiver call results in a trace entry with source: "rederiver" and the same schema
  3. After 501 LLM calls, the store contains exactly 500 entries (oldest evicted)
  4. tsc clean; existing detector and rederiver tests still pass

**Plans**: 2 plansPlans:
**Wave 1**

- [x] 24-01-PLAN.md — TraceEntry schema + cache-aware pricing.ts + FIFO traceStore (TRACE-01/02/03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 24-02-PLAN.md — Wire trace capture into scorePost/rederiveSelector SW handlers + refresh-on-load pricing (TRACE-01/02/03)

### Phase 25: Dashboard Export + README Script

**Goal**: The user can download all stored LLM traces from the dashboard as a JSON file, and `npm run trace-summary` reads that file, prints a cost breakdown table, and updates README.md with a LLM Cost Reference section
**Depends on**: Phase 24
**Requirements**: TRACE-04, TRACE-05, TRACE-06
**Success Criteria** (what must be TRUE):

  1. Opening the dashboard shows an "Export Traces" button; clicking it downloads a `linkedin-blocker-traces-YYYY-MM-DD.json` file containing all stored trace entries
  2. Running `npm run trace-summary linkedin-blocker-traces-*.json` prints a cost breakdown table to stdout grouped by source and model (call count, input tokens, output tokens, total USD, avg USD/call)
  3. After running the script, README.md contains an updated `## LLM Cost Reference` section with the generated table
  4. The script exits non-zero with a clear error message if the input file is missing or malformed

**Plans**: 2 plans

Plans:

**Wave 1**

- [x] 25-01-PLAN.md — Dashboard Export Traces button + buildTracesExport pure builder (TRACE-04)
- [x] 25-02-PLAN.md — trace-summary script: recompute costs via computeCostUsd, grouped table, idempotent README LLM Cost Reference section (TRACE-05, TRACE-06)

**UI hint**: yes

### Phase 25.1: Capture and export unflagged posts for eval negatives (INSERTED)

**Goal:** The detector's below-FLAG_THRESHOLD posts (the clear human-looking negatives dropped today at content/index.ts:323) are captured UNLABELED to a new capped `unflaggedPosts` store, gated behind a new opt-in (OFF by default), and included in the dashboard Export JSON as a new top-level `unflaggedPosts[]` array — supplying real human-negatives for the Phase 26 eval.
**Requirements**: CAPTURE-01, CAPTURE-02, EXPORT-01
**Depends on:** Phase 25
**Plans:** 4/4 plans complete

Plans:

**Wave 1**
- [x] 25.1-01-PLAN.md — UnflaggedPost type + unflaggedPosts StorageSchema key + captureUnflaggedPosts Settings field (CAPTURE-01)

**Wave 2** *(blocked on Wave 1)*
- [x] 25.1-02-PLAN.md — persistUnflaggedPost FIFO helper + gated below-threshold capture hook before the L323 early return (CAPTURE-01, CAPTURE-02)
- [x] 25.1-03-PLAN.md — Additive top-level unflaggedPosts[] in buildJsonExport + test (EXPORT-01)

**Wave 3** *(blocked on Wave 2)*
- [x] 25.1-04-PLAN.md — Dashboard load+export wiring; popup opt-in toggle + merge-safe settings; 26-CONTEXT unflaggedPosts[] amendment (EXPORT-01, CAPTURE-02)

### Phase 26: Eval Runner

**Goal**: `npm run eval <labeled-posts.json>` feeds labeled posts through the LLM classifier and prints precision, recall, F1, accuracy, total cost, and average cost per post — with results persisted to `eval/results-YYYY-MM-DD.json`
**Depends on**: Phase 25
**Requirements**: EVAL-01, EVAL-02, EVAL-03, EVAL-04
**Success Criteria** (what must be TRUE):

  1. A post-export JSON annotated with `"label": "ai" | "human"` fields is accepted as input without any format changes to the existing export schema
  2. Running `npm run eval <file>` calls the LLM classifier for each labeled post and records the verdict
  3. The script prints a results table showing precision, recall, F1, accuracy, total LLM cost (USD), and average cost per post
  4. Results are written to `eval/results-YYYY-MM-DD.json` (directory auto-created if absent)
  5. The script exits non-zero with a clear error if the input file is missing, has no label fields, or the API key is not configured

**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-05-25 |
| 2. Detection Engine | v1.0 | 4/4 | Complete | 2026-05-29 |
| 3. Storage & Queue | v1.0 | 3/3 | Complete | 2026-05-29 |
| 4. Popup UI | v1.0 | 2/2 | Complete | 2026-05-29 |
| 5. User Decisions | v1.0 | 2/2 | Complete | 2026-05-29 |
| 6. Settings & Dashboard | v1.0 | 3/3 | Complete | 2026-05-30 |
| 7. Post Storage | v1.1 | 2/2 | Complete | 2026-05-30 |
| 8. Popup Signal Detail | v1.1 | 2/2 | Complete | 2026-05-30 |
| 9. Export & Cleanse | v1.1 | 2/2 | Complete | 2026-05-30 |
| 10. Profile Insights | v1.2 | 2/2 | Complete | 2026-05-30 |
| 11. Posts Export | v1.2 | 2/2 | Complete | 2026-05-30 |
| 12. Manifest & Icons | v2.0 | 2/2 | Complete | 2026-05-30 |
| 13. Store Assets | v2.0 | 2/2 | Complete | 2026-05-31 |
| 14. Package & Submit | v2.0 | 2/2 | Complete | 2026-05-31 |
| 15. URL Reference Updates | v3.0 | 1/1 | Complete | 2026-05-31 |
| 16. Prompt Caching | v4.0 | 1/1 | Complete | 2026-05-31 |
| 17. Voice Signal Functions | v5.0 | 4/4 | Complete | 2026-05-31 |
| 18. Popup Interaction Fixes | v6.0 | 3/3 | Complete | 2026-06-05 |
| 18.1. Dashboard Data Display | v6.0 | 1/1 | Complete | 2026-06-06 |
| 20. Batch Block | v6.0 | 1/1 | Complete | 2026-06-06 |
| 21. Dashboard Button Reposition | v6.1 | 1/1 | Complete | 2026-06-06 |
| 22. Externalize Selectors to Storage | v7.0 | 5/5 | Complete    | 2026-06-14 |
| 23. Self-Healing Selector Adapter | v7.0 | 4/4 | Complete    | 2026-06-13 |
| 24. Trace Capture & Storage | v8.0 | 2/2 | Complete    | 2026-06-13 |
| 25. Dashboard Export + README Script | v8.0 | 2/2 | Complete    | 2026-06-14 |
| 25.1. Capture & Export Unflagged Posts | v9.0 | 4/4 | Gaps Found | 2026-06-14 |
| 26. Eval Runner | v9.0 | 0/TBD | Planned | - |
