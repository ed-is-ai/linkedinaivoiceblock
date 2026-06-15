# Milestones — LinkedIn Blocker

## v9.0 — Eval Harness

**Shipped:** 2026-06-15
**Phases:** 25.1, 25.2, 26, 27, 28 (5 phases) | **Plans:** 16
**Audit:** passed (12/12 requirements) — [v9.0-MILESTONE-AUDIT.md](milestones/v9.0-MILESTONE-AUDIT.md)

### Delivered

Evaluate LLM classifier quality against a labeled real-world dataset: capture human-negatives, export a symmetric labeled JSON, run an eval (heuristic or LLM) for precision/recall/F1/cost, analyze errors, and review it all from an in-extension Evals dashboard.

### Accomplishments

1. **Eval negatives capture** (25.1) — below-threshold posts captured UNLABELED to a capped `unflaggedPosts` store behind an OFF-by-default opt-in (`Settings.captureUnflaggedPosts`); exported as a top-level `unflaggedPosts[]` array.
2. **Symmetric export redesign** (25.2) — `buildJsonExport` restructured into three symmetric arrays: `flaggedAccounts` (`status`→`blocked` boolean, nested `posts[]` retained), new post-centric `flaggedPosts[]`, and `unflaggedPosts[]`.
3. **Eval runner** (26) — shared transport-agnostic `classifyPost` extracted to `src/shared/classifier.ts` (used by both service worker and CLI); `npm run eval` re-scores labeled posts, sweeps thresholds, reports precision/recall/F1/accuracy/cost, and writes `eval/results-YYYY-MM-DD.json`.
4. **Engine alignment + error analysis** (27) — selectable `--engine heuristic|llm` (heuristic needs no API key); best-F1 FP/FN surfacing; pure host-agnostic eval core in `src/shared/eval/`; `npm run eval-label` and `npm run eval-compare`.
5. **In-extension Evals dashboard** (28) — standalone `evals.html` reusing the shared eval core: run heuristic/LLM evals from `chrome.storage.local`, click-to-label, cost-estimate confirm modal, FP/FN cards, and run-over-run diffs persisted via `EvalRunStore`.

### Notes

- One display-only bug found by the milestone integration audit (Evals "Last run" footer showed the oldest run) was fixed before close — commit fc92b40.
- Deferred tech debt: SUMMARY `requirements-completed` frontmatter was largely unpopulated (evidence lives in VERIFICATION.md tables instead).

---

## v1.0 — Clean Feed

**Shipped:** 2026-05-30
**Phases:** 1–6 | **Plans:** 18

### Delivered

Core detection, popup review queue, block/dismiss actions, configurable threshold, and feed health dashboard — the full v1 feature set.

### Accomplishments

1. MutationObserver + selector registry anchored to `data-*` attributes (not CSS class names)
2. Heuristic scoring across 5 content signals: listicles, buzzwords, em-dash, CTA, generic comments
3. Flagged accounts persisted to `chrome.storage.local` with EMA rolling scores
4. Preact popup with real-time `chrome.storage.onChanged` updates
5. Block deep-link + dismiss false positive with badge decrement + unhide
6. Configurable threshold slider + dashboard with 7/30-day signal breakdown

---

## v1.1 — UX & Data

**Shipped:** 2026-05-30
**Phases:** 7–9 | **Plans:** 6

### Delivered

Post text storage, expandable signal detail rows in popup, JSON/CSV export, and date-based cleanse.

### Accomplishments

1. `persistStoredPost` — 200-post cap, 1000-char truncation, URN dedup
2. Accordion signal detail panel: per-signal score table + 3 post snippets per account
3. Export JSON (accounts + posts) and Export CSV (accounts only)
4. Date-based cleanse with record count preview and confirmation step

---

## v1.2 — Feed Insights & Export Completeness

**Shipped:** 2026-05-30
**Phases:** 10–11 | **Plans:** 4

### Delivered

Profile bot-rate stat on dashboard, posts CSV export.

### Accomplishments

1. `dailyStats.seenProfileIds` tracking unique author profiles per day
2. Dashboard "Profile bot rate" stat — % of unique profiles seen that are flagged
3. Posts CSV export (`linkedin-blocker-posts-YYYY-MM-DD.csv`) with post text, author, score, timestamp

---

## v2.0 — Chrome Web Store Release

**Shipped:** 2026-05-31
**Phases:** 12–14 | **Plans:** 6

### Delivered

Icons, manifest compliance, privacy policy, store listing assets, packaging script, and CWS submission guide.

### Accomplishments

1. PNG icons at 16/48/128px in `src/public/icons/`, correctly wired via Vite `publicDir`
2. `manifest.json` v1.2.0 with `action.default_icon`, `homepage_url`, all CWS-required fields
3. `PRIVACY.md` — data inventory, local-only storage declaration, opt-in LLM disclosure
4. `store/LISTING.md` — 132-char short description, 340-word long description, permissions justification
5. `npm run package` → `dist/linkedin-blocker-v1.2.0.zip` (27.6 KB, CWS-ready)
6. `store/SUBMISSION_GUIDE.md` — 6-step first-time CWS submission walkthrough

---

## v3.0 — Repo Rename Cleanup

**Shipped:** 2026-05-31
**Phases:** 15 | **Plans:** 1

### Delivered

All `linkedinblock` → `linkedinaivoiceblock` URL references updated across 11 files + git remote + ZIP rebuild.

### Accomplishments

1. 11-file URL sweep: manifest, privacy policy, store assets, README, packaging script
2. Git remote URL updated to match renamed repository
3. ZIP rebuilt as `linkedin-blocker-v1.2.0.zip` (unchanged name, correct internal URLs)

---

## v4.0 — Prompt Caching

**Shipped:** 2026-05-31
**Phases:** 16 | **Plans:** 1

### Delivered

Anthropic prompt caching on system prompt — reduces LLM API cost ~90% on cache hits.

### Accomplishments

1. `anthropic-beta: prompt-caching-2024-07-31` header added to LLM scorer
2. `system` field converted from plain string to `[{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]`
3. `SYSTEM_PROMPT` expanded to 856 words (≥ 1024 Sonnet token minimum for cache eligibility)
4. tsc clean, existing tests passing

---

## v5.0 — Voice Pattern Detection

**Shipped:** 2026-05-31
**Phases:** 17 | **Plans:** 4

### Delivered

Three new heuristic signal functions that detect AI-generated posts written in the distinctive "LinkedIn voice" — hook-story openers, motivational punch-rhythm, and impersonal third-person framing.

### Accomplishments

1. `checkHookStory` (0–20 pts) — first-person anecdote opener patterns ("I was sitting...", "My mentor told me...")
2. `checkMotivational` (0–15 pts) — inspirational punch-rhythm ("Most people...", "Stop X. Start Y.")
3. `checkImpersonalVoice` (0–12 pts) — generic third-person authority ("The best leaders...", "Teams that succeed...")
4. All three wired into `HeuristicDetector` after existing ai-vocab block
5. Integration test: AI voice post scores 61 (≥ 60 threshold) — PASS; genuine post scores 0
6. 12/12 tests passing, tsc clean
