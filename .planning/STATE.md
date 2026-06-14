---
gsd_state_version: 1.0
milestone: v9.0
milestone_name: Eval Harness
status: executing
last_updated: "2026-06-14T17:42:25.796Z"
last_activity: 2026-06-14 -- Phase 25.1 planning complete
progress:
  total_phases: 10
  completed_phases: 8
  total_plans: 25
  completed_plans: 23
  percent: 80
---

# State — LinkedIn Blocker

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-06)

**Core value:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.
**Current focus:** Phase 25.1 — capture-and-export-unflagged-posts-for-eval-negatives

---

## Current Position

Phase: 25.1 (capture-and-export-unflagged-posts-for-eval-negatives) — COMPLETE
Plan: 4 of 4 (all executed)
Status: Ready to execute
Last activity: 2026-06-14 -- Phase 25.1 planning complete
Note: Phase 25.1 inserted between 25 and 26 (capture & export unflagged posts → supplies human negatives for the Phase 26 eval). Phase 26 already has 26-CONTEXT.md. Recommended order: plan+execute 25.1, then plan 26.

## Accumulated Context

### Roadmap Evolution

- Phase 18.1 inserted after Phase 18: Dashboard Data Display (URGENT)
- Phases 22–23 added: v7.0 Adaptive DOM Scraper
- Phase 25.1 inserted after Phase 25: Capture and export unflagged posts for eval negatives (URGENT)

### Key Decisions

| Decision | Outcome | Phase |
|----------|---------|-------|
| Selector strategy | data-* attribute selectors + semantic HTML only; no CSS class names | Phase 1 |
| Service worker state | All durable state in chrome.storage.local; service worker is stateless | Phase 1 |
| SPA navigation | Observe document.body subtree:true; re-init on pushState/popstate | Phase 1 |
| Block action | Deep link to /overlay/report-or-block/ only; never simulate clicks | Phase 5 |
| Detector interface | detect(post: PostData): Promise<DetectionResult> — swappable heuristic/LLM | Phase 2 |
| CSS hiding | Single injected <style> with .llb-hidden { display: none !important } | Phase 2 |
| Storage schema | Flat-keyed account-centric; cap 500 entries | Phase 3 |
| Popup framework | Preact 10 + JSX; stateless on every open | Phase 4 |
| Post text storage | Stored on hide (user opt-in, v1.1); 200-post cap, 1000-char truncation | Phase 7 |
| Prompt caching | System prompt only; anthropic-beta header; SYSTEM_PROMPT ≥ 1024 tokens | Phase 16 |
| Voice signal placement | Inserted after ai-vocab block (Step 3b), before engagement gate (Step 4) | Phase 17 |
| Hook-story regex | `I was \w+ing` form required (not "I was in a meeting") to avoid false positives | Phase 17 |
| Popup inline styles | All popup styling via inline style objects (styles record); no CSS class selectors | Phase 4 |
| Selector runtime model | selectors.ts = seed/defaults only; SelectorRegistry = runtime source-of-truth; only SelectorRegistry writes selectors to storage | Phase 22 |
| LLM call location (v7.0) | Anthropic fetch lives in service worker (background/index.ts); content script sends chrome.runtime.sendMessage — CORS blocks direct fetch from linkedin.com. LLMRederiver must follow the same SCORE_POST message pattern. | Phase 23 |
| unflaggedPosts export shape | Top-level sibling of flaggedAccounts in buildJsonExport JSON; defaulted third param keeps all existing callers unchanged; label forwarded only when user-supplied | Phase 25.1 |

### Todos

None.

### Blockers

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260614-g58 | UI tweaks — remove account-level Export CSV button/code; enlarge Selector Health status dot | 2026-06-14 | b229376 | [260614-g58-ui-tweaks-remove-export-csv-button-and-c](./quick/260614-g58-ui-tweaks-remove-export-csv-button-and-c/) |
| 260614-g9t | Put all Data-management export buttons on one inline row | 2026-06-14 | f7f2afa | [260614-g9t-put-all-export-buttons-in-one-inline-row](./quick/260614-g9t-put-all-export-buttons-in-one-inline-row/) |
| 260614-gb8 | Rename "Export Traces" button to "Export LLM call traces" | 2026-06-14 | fe94f0e | [260614-gb8-rename-export-traces-button-to-export-ll](./quick/260614-gb8-rename-export-traces-button-to-export-ll/) |

---

## Session Continuity

**Last updated:** 2026-06-14
**Last action:** Executed 25.1-04 — dashboard unflaggedPosts wiring, popup captureUnflaggedPosts toggle with merge-safe settings, 26-CONTEXT amendment (f3fec92 / 0453090 / ac36508). 251 tests pass, tsc clean.
**Next action:** Plan and execute Phase 26 (eval runner). Phase 25.1 complete.

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 25 P02 | 900 | 2 tasks | 4 files |
| Phase 25.1 P03 | 102s | 1 task | 2 files |
| Phase 25.1 P04 | 6m | 3 tasks | 3 files |
