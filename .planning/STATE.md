---
gsd_state_version: 1.0
milestone: v7.0
milestone_name: Adaptive DOM Scraper
status: planning
last_updated: "2026-06-14T00:12:04.670Z"
last_activity: 2026-06-13
progress:
  total_phases: 9
  completed_phases: 7
  total_plans: 17
  completed_plans: 17
  percent: 78
---

# State — LinkedIn Blocker

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-06)

**Core value:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.
**Current focus:** Phase 25 — dashboard export + readme script

---

## Current Position

Phase: 25
Plan: 2 plans (25-01 dashboard export button, 25-02 trace-summary script + README)
Status: Planned — ready to execute
Last activity: 2026-06-14

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

**Last updated:** 2026-06-14
**Last action:** Phase 25 planned. Skipped research + UI-SPEC (locked CONTEXT, trivial button clone). gsd-pattern-mapper produced 25-PATTERNS.md; gsd-planner produced 2 plans (25-01 Export Traces button + buildTracesExport pure builder, TRACE-04; 25-02 trace-summary tsx script + idempotent README ## LLM Cost Reference, TRACE-05/06), both wave 1, disjoint files. gsd-plan-checker PASSED (0 blockers); its lone warning — require() in node -e under "type":"module" — was empirically confirmed a false positive (Node defaults --eval to CJS), no edit made.
**Next action:** `/gsd-execute-phase 25`
