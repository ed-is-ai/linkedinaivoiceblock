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

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Chrome MV3 only (v1) | Mainstream browser, required for Web Store publishing | Proceed with MV3 |
| Heuristic detection first | Ship fast, private, no API cost — LLM pluggable later | Implement scoring rules, design for LLM upgrade |
| Extension popup for review | Least intrusive — doesn't inject permanent UI into LinkedIn | Popup as primary review surface |
| Local-only storage | No backend, no account, no privacy risk | chrome.storage.local |
| Block action | ToS risk with programmatic clicks | Deep-link to /overlay/report-or-block/ only |
| Icons in src/public/icons/ | Vite publicDir with root: 'src' — copied verbatim to dist/ | Required for vite-plugin-web-extension |

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

### Current Milestone: v7.0 Adaptive DOM Scraper

**Goal:** Make LinkedIn scraping resilient to LinkedIn's frequent DOM/class churn — store selectors as a dynamic, ranked candidate registry, and add a module that detects when scraping breaks and re-derives working selectors automatically.

**Target features:**
- Externalize all selector-registry entries into `chrome.storage.local` as ranked candidate lists with metadata (source, last-verified, last-matched), seeded from the current `selectors.ts` defaults
- Scraper reads candidates from storage at runtime (priority order); read-only view of active selectors + source
- Self-healing adapter: detect total breakage (zero post-card matches over an active-feed window), re-derive selectors via structural heuristics, fall back to LLM (Claude) only when heuristics fail; prepend winning candidate
- Fixture-DOM automated tests proving read-from-storage, breakage detection, and heuristic recovery

**Key context:**
- `selectors.ts` is reframed from runtime source-of-truth to the **seed/defaults** source; storage becomes the runtime source-of-truth (reconciles CLAUDE.md constraint #1).
- Manual selector editing is deferred to a Future Requirement (read-only this milestone).
- LLM fallback reuses the existing Anthropic API-key/mode + prompt-caching infra (v4.0); DOM samples sanitized before any API call.

### Planned: v8.0 Observability

**Goal:** Every LLM call is traced — model, prompts, token counts, USD cost — stored in chrome.storage.local, exportable from the dashboard, and summarized in the README by an npm script so practitioners can see exactly what the extension costs to run.

**Target features:**
- Trace capture for LLMDetector + LLMRederiver (same schema, source field distinguishes them)
- chrome.storage.local FIFO store (500-entry cap)
- "Export Traces" button on dashboard → JSON download
- `npm run trace-summary <file>` → cost breakdown table printed to stdout + `## LLM Cost Reference` section written into README.md

### Planned: v9.0 Eval Harness

**Goal:** Evaluate LLM classifier quality against a real labeled dataset — user annotates an extension post-export JSON with `"label": "ai" | "human"`, runs `npm run eval`, and gets precision/recall/F1/cost metrics.

**Target features:**
- No new export format — labels are added to the existing post-export JSON
- `npm run eval <labeled-posts.json>` → calls LLM classifier, compares to labels
- Precision, recall, F1, accuracy, total USD cost, avg cost/post printed as a table
- Results written to `eval/results-YYYY-MM-DD.json`

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
| v7.0 | Adaptive DOM Scraper — storage-backed candidate registry + self-healing selector adapter | In progress |
| v8.0 | Observability — per-call LLM traces, dashboard export, README cost table | Planned |
| v9.0 | Eval Harness — labeled-dataset eval runner, precision/recall/F1/cost metrics | Planned |

---
*Last updated: 2026-06-14 — Phase 25 complete: "Export Traces" dashboard button + `npm run trace-summary` cost report (TRACE-04/05/06 validated). v8.0 Observability feature set is now built (Phases 24–25). Note: Phase 22 (v7.0 Externalize Selectors to Storage) remains outstanding — milestones executed out of order.*
