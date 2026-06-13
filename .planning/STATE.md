---
gsd_state_version: 1.0
milestone: v7.0
milestone_name: Adaptive DOM Scraper
status: ready_to_plan
last_updated: 2026-06-13T22:12:01.882Z
last_activity: 2026-06-13 -- Phase 23 execution started
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 15
  completed_plans: 15
  percent: 56
stopped_at: Phase 23 complete (4/4) — ready to discuss Phase 24
---

# State — LinkedIn Blocker

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-06)

**Core value:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.
**Current focus:** Phase 24 — trace capture & storage

---

## Current Position

Phase: 24
Plan: Not started
Status: Ready to plan
Last activity: 2026-06-13

## Accumulated Context

### Roadmap Evolution

- Phase 18.1 inserted after Phase 18: Dashboard Data Display (URGENT)
- Phases 22–23 added: v7.0 Adaptive DOM Scraper

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

### Todos

None.

### Blockers

None.

---

## Session Continuity

**Last updated:** 2026-06-13
**Last action:** Phase 22 closed out. All 5 plans executed; 22-04 (dashboard Selector Health panel + inline-confirm reset) human-verified and approved, 22-04-SUMMARY.md written. Phase 23 (Self-Healing Selector Adapter) is fully planned (23-01..23-04 + 23-AI-SPEC) and ready to execute. Phase 23 groundwork committed: full updateCandidate runtime match-tracking in observer.ts + collapsible/traffic-light health-staleness UI in SelectorView.tsx.
**Next action:** `/gsd-execute-phase 23`
