# LinkedIn Blocker

## What This Is

A Chrome extension (Manifest V3) that detects and hides AI-generated posts on LinkedIn, surfaces suspicious accounts in a popup for review, and lets the user decide whether to block them permanently. The goal is a clean, human-authored feed.

## Core Value

**One thing that must work:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.

## Who It's For

Personal tool first (the author's own LinkedIn feed). Architecture supports publishing to the Chrome Web Store — v2.0 completes that path.

## The Problem

LinkedIn feeds are increasingly polluted with AI-generated content from fake or automated accounts — motivational fluff, listicles, generic inspiration, and accounts with no real history posting at high frequency. There is no native way to filter these out.

## How It Works

### Detection (heuristics-first, LLM-ready)

Three signal types are combined to produce a bot-probability score per account/post:

1. **Post content signals** — AI writing patterns: listicles, buzzwords, em-dash overuse, generic inspiration, no personal specificity
2. **Profile signals** — AI-generated headshot indicator, thin connection count, generic bio patterns
3. **Engagement signals** — identical or near-identical comments, unusual reaction-to-comment ratios

Detection starts as rule-based heuristics. The architecture allows plugging in an LLM API call (Claude) without a rewrite — the `Detector` interface is already in place.

### Actions

- **Auto-hide** posts that cross a suspicion threshold (user never sees them in the feed)
- **Flag** the source account and add it to the review queue
- **Extension popup** shows the queue of suspicious accounts with post counts and signals detected
- **User review** — from the popup, user can: confirm block (trigger LinkedIn block), dismiss (mark as false positive), or ignore for now

## Current Milestone: v10.0 LLM-Primary Detection & Eval-Driven Tuning

**Goal:** Make the LLM the primary per-post classifier, then use the v9.0 eval harness to tune and lock in detection quality — data-derived config, a regression gate, and measurable false-positive reduction.

**Target features:**
- LLM-primary classification — `LLMDetector` scores every eligible post (after hard exclusions); heuristic demotes to fallback (no API key / offline / error)
- Cost guardrail — per-session rate limit / cap so per-post LLM stays affordable (leans on existing prompt caching)
- Eval-derived config — use labeled data to pick the optimal decision threshold (+ heuristic-fallback weights); bake the winning config in, replacing hand-tuned values
- Regression gate — `npm` / CI check that fails if F1 or precision drops below the last accepted baseline
- False-positive reduction — driven by eval FP analysis; refine the LLM prompt + threshold to cut FPs (no new profile/engagement scraping)

**Key context:**
- Builds directly on the v9.0 eval harness + shared `src/shared/classifier.ts` / `src/shared/eval/` core
- Main risk is LLM cost; mitigated by prompt caching (v4.0) + the new per-session guardrail
- No new DOM scraping surface — profile/engagement signals stay deferred

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Chrome MV3 only (v1) | Mainstream browser, required for Web Store publishing | Proceed with MV3 |
| Heuristic detection first | Ship fast, private, no API cost — LLM pluggable later | Implement scoring rules, design for LLM upgrade |
| Extension popup for review | Least intrusive — doesn't inject permanent UI into LinkedIn | Popup as primary review surface |
| Local-only storage | No backend, no account, no privacy risk | chrome.storage.local |
| Block action | ToS risk with programmatic clicks | Deep-link to /overlay/report-or-block/ only |
| Icons in src/public/icons/ | Vite publicDir with root: 'src' — copied verbatim to dist/ | Required for vite-plugin-web-extension |
| Selector seed-vs-runtime split (v7.0) | `selectors.ts` = defaults seed; `SelectorRegistry` = runtime source-of-truth; only the registry writes selectors | ✓ Good — reconciles CLAUDE.md constraint #1 |
| LLM fetch in service worker (v7.0) | CORS blocks content-script fetch from linkedin.com; LLMRederiver follows the SCORE_POST relay pattern | ✓ Good |
| Shared classifier + eval core (v9.0) | Extract `classifyPost` to `src/shared/classifier.ts` and pure eval core to `src/shared/eval/` so service worker, CLI, and Evals dashboard share one implementation | ✓ Good — no forked logic across hosts |
| Symmetric export shape (v9.0) | Three top-level arrays (`flaggedAccounts` w/ `blocked` boolean, `flaggedPosts`, `unflaggedPosts`); additive, transform-only over stored data | ✓ Good — feeds eval without storage migration |
| Eval runs stored, not downloaded (v9.0) | `EvalRunStore` FIFO in `chrome.storage.local` (cap 50); pre-run cost-estimate + confirm modal, in-run Cancel persists partial run | ✓ Good |

## Requirements

### Validated (v1.0 complete)

- Extension detects AI-pattern posts using content heuristics ✓
- Suspicious posts are hidden automatically in the LinkedIn feed ✓
- Flagged accounts are queued for review ✓
- Extension popup displays the review queue with signals ✓
- User can confirm block from popup ✓
- User can dismiss false positives from popup ✓
- Detection thresholds are configurable ✓
- Detection engine is pluggable (heuristic → LLM swap) ✓
- Dedicated dashboard page with % flagged, signal categories, 7/30-day window ✓

### Validated (v1.1 complete)

- Post text and metadata are stored locally when a post is hidden ✓
- Popup account rows are expandable (signal score table + post snippets) ✓
- Stored posts viewable per account in popup ✓
- Export JSON (accounts + posts) and Export CSV (accounts) ✓
- Date-based cleanse with preview and confirm ✓

### Validated (v1.2 complete)

- Dashboard shows "profile bot rate": % of unique profiles seen in the time window that are flagged accounts ✓
- Posts CSV export: download stored hidden posts with their text as a CSV file ✓

### Validated (v2.0 complete)

- Branded extension icons at 16/48/128px ✓
- manifest.json v1.2.0 with all CWS-required fields ✓
- PRIVACY.md data policy accessible as raw GitHub URL ✓
- store/LISTING.md with name, short/long descriptions, permissions justification, screenshot checklist ✓
- npm run package → CWS-ready ZIP (27.6 KB) ✓
- store/SUBMISSION_GUIDE.md — 6-step first-time CWS submission walkthrough ✓

### Validated (v5.0 complete)

- `checkHookStory` signal (0–20 pts) — first-person anecdote opener detection ✓
- `checkMotivational` signal (0–15 pts) — inspirational punch-rhythm detection ✓
- `checkImpersonalVoice` signal (0–12 pts) — generic third-person authority framing detection ✓
- All three wired into `HeuristicDetector`; AI voice post scores 61 (≥ 60 threshold) ✓

### Validated (v6.0 complete)

- Clicking an account name opens their LinkedIn profile in a new tab ✓
- Block button marks the account blocked locally (no deep-link navigation) ✓
- Blocked accounts are visually distinct (greyed name + "Blocked" chip) ✓
- Batch block: one confirmed action marks all above-threshold flagged accounts as blocked ✓
- Bug fix: posts from accounts at/above the block threshold are hidden in the feed ✓

(Blocked-accounts manager page deferred — see Future Requirements.)

### Validated (v6.1 complete)

- "📊 View Dashboard" button surfaced at the top of the popup, visible without opening Settings ✓
- Settings disclosure retains only threshold + API key/mode + export/cleanse controls (dashboard link moved, not duplicated) ✓

### Validated (v7.0 complete)

- Selector-registry entries stored in `chrome.storage.local` as ranked candidate lists (source, last-verified, last-matched), seeded from `selectors.ts` ✓
- Runtime resolution via `SelectorRegistry` (priority order); read-only health view of active selectors + source; reset-to-defaults escape hatch ✓
- Self-healing adapter: total-breakage detection with 6 false-positive guards → heuristic re-derivation → LLM fallback on sanitized structural DOM (no PII), strictly validated before any write ✓
- Fixture-DOM tests covering seeding, runtime resolution, versioned migration, reset, and heuristic/LLM recovery; CLAUDE.md constraint #1 updated to the seed-vs-runtime model ✓

### Validated (v8.0 complete)

- Trace capture for `LLMDetector` + `LLMRederiver` (shared schema, `source` distinguishes them) ✓
- `chrome.storage.local` FIFO trace store (500-entry cap) ✓
- "Export Traces" button on dashboard → JSON download ✓
- `npm run trace-summary <file>` → cost breakdown table + idempotent `## LLM Cost Reference` section written into README.md ✓

### Validated (v9.0 complete)

- Below-threshold posts captured UNLABELED to a capped `unflaggedPosts` store behind an OFF-by-default opt-in ✓
- Symmetric Export JSON: `flaggedAccounts` (`status`→`blocked` boolean), post-centric `flaggedPosts[]`, and `unflaggedPosts[]` ✓
- Shared transport-agnostic `classifyPost` (`src/shared/classifier.ts`) used by both service worker and CLI ✓
- `npm run eval <labeled-posts.json>` → selectable `--engine heuristic|llm`, threshold sweep, precision/recall/F1/accuracy/cost, results to `eval/results-YYYY-MM-DD.json` ✓
- Best-F1 FP/FN error analysis; `npm run eval-label` + `npm run eval-compare`; pure host-agnostic eval core in `src/shared/eval/` ✓
- In-extension Evals dashboard (`evals.html`) reusing the eval core: click-to-label, cost-estimate confirm modal, FP/FN cards, run-over-run diffs persisted via `EvalRunStore` ✓

---

## Out of Scope (deferred post-v5)

- Firefox support — Chrome only; WebExtensions API differences deferred
- LLM-based detection — heuristics only; pluggable interface prepared for later
- Cloud sync or shared blocklists — local only
- Backend / user accounts — no server
- Posting frequency signals — excluded (scheduling tools cause too many false positives)
- LLM cost controls — heuristic pre-filter + per-session rate limiting

## Milestone History

| Milestone | Goal | Status |
|-----------|------|--------|
| v1.0 | Core detection, popup queue, block/dismiss, settings & dashboard | Complete 2026-05-30 |
| v1.1 | Post storage, signal detail view, export, date-based cleanse | Complete 2026-05-30 |
| v1.2 | Profile bot-rate stat, posts CSV export | Complete 2026-05-30 |
| v2.0 | Chrome Web Store release — icons, privacy policy, store listing, packaging | Complete 2026-05-31 |
| v3.0 | Repo rename cleanup — update all `linkedinblock` → `linkedinaivoiceblock` references | Complete 2026-05-31 |
| v4.0 | Prompt caching — reduce LLM API cost ~90% on cache hits | Complete 2026-05-31 |
| v5.0 | Voice pattern detection — hook-story, motivational, impersonal framing signals | Complete 2026-05-31 |
| v6.0 | UX Polish + Block Management — popup interaction fixes, batch block, threshold-hiding bug | Complete 2026-06-06 |
| v6.1 | Popup UX Tidy-up — surface the View Dashboard button at the top of the popup | Complete 2026-06-06 |
| v7.0 | Adaptive DOM Scraper — storage-backed candidate registry + self-healing selector adapter | Complete 2026-06-14 |
| v8.0 | Observability — per-call LLM traces, dashboard export, README cost table | Complete 2026-06-14 |
| v9.0 | Eval Harness — labeled-dataset eval runner, precision/recall/F1/cost metrics, in-extension Evals dashboard | Complete 2026-06-15 |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-15 after v9.0 milestone — Eval Harness shipped (Phases 25.1, 25.2, 26, 27, 28): opt-in negatives capture, symmetric labeled export, `npm run eval` (heuristic/LLM) with precision/recall/F1/cost, FP/FN error analysis, labeling/compare CLIs, and an in-extension Evals dashboard reusing the shared `src/shared/eval/` core. Audit passed 12/12. This close also retroactively validated v7.0 (Adaptive DOM Scraper) and v8.0 (Observability), which had shipped but not been recorded.*

*Milestone v10.0 started 2026-06-15 — LLM-Primary Detection & Eval-Driven Tuning: promote LLMDetector to the primary per-post classifier (heuristic → fallback), add a per-session cost guardrail, derive detection config (threshold + heuristic-fallback weights) from labeled eval data, add an F1/precision regression gate, and cut false positives via eval FP analysis. No new profile/engagement scraping.*
