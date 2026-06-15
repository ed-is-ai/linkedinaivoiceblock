---
gsd_state_version: 1.0
milestone: v10.0
milestone_name: LLM-Primary Detection & Eval-Driven Tuning
status: planning
last_updated: "2026-06-15T22:36:09.046Z"
last_activity: 2026-06-15
progress:
  total_phases: 13
  completed_phases: 9
  total_plans: 21
  completed_plans: 21
  percent: 69
---

# State — LinkedIn Blocker

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15 after v9.0)

**Core value:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.
**Current focus:** Phase 30 — llm primary promotion

---

## Current Position

Phase: 30
Plan: Not started
Status: Ready to plan
Last activity: 2026-06-15

### Progress Bar

```
v10.0: [░░░░░░░░░░░░░░░░░░░░] 0% (0/5 phases)
```

## Accumulated Context

### Roadmap Evolution

- Phase 18.1 inserted after Phase 18: Dashboard Data Display (URGENT)
- Phases 22–23 added: v7.0 Adaptive DOM Scraper
- Phase 25.1 inserted after Phase 25: Capture and export unflagged posts for eval negatives (URGENT)
- Phase 25.2 inserted after Phase 25: Symmetric export redesign (blockedAccounts + flaggedPosts + unflaggedPosts) (URGENT)
- Phases 29–33 added: v10.0 LLM-Primary Detection & Eval-Driven Tuning

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
| detectionConfig module (v10.0) | Use .ts module (not .json) for compile-time type safety via `as const`; resolveJsonModule already true in tsconfig so either would work, but .ts prevents drift | Phase 29 |
| LLM-primary coupling (v10.0) | LLM-01/02/03 ship together — scored-URN dedup cache (LLM-02) and optimistic pre-hide (LLM-03) are preconditions for LLM-primary being cost-safe and UX-safe; splitting risks 3-10x cost blowup and flash-of-bot-content | Phase 30 |
| Session cap default (v10.0) | 50 posts/session (conservative); expose as user-configurable later (COST-02 deferred); calibrate from real trace data once live | Phase 31 |
| Precision-constrained threshold (v10.0) | selectThreshold(rows, minPrecision = 0.90, minRecall = 0.60) — hard precision floor (FP-averse use case: hiding human posts is worse than missing AI posts); recall floor prevents degenerate zero-hide solution | Phase 32 |
| Regression gate engine (v10.0) | CI gate runs heuristic engine only (deterministic, free, fast); LLM gate is offline diagnostic only — LLM non-determinism makes a live-LLM CI gate flaky on small datasets | Phase 33 |

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

**Last updated:** 2026-06-15
**Last action:** v10.0 roadmap written — 5 phases (29–33), 8 requirements mapped, 100% coverage.
**Next action:** `/gsd-plan-phase 29` — Config Foundation (detectionConfig.ts, zero behavior change).

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 25 P02 | 900 | 2 tasks | 4 files |
| Phase 25.1 P03 | 102s | 1 task | 2 files |
| Phase 25.1 P04 | 6m | 3 tasks | 3 files |
| Phase Phase 25.1 PP06 | 4m | 2 tasks tasks | 2 files files |
| Phase 25.1 P05 | 3m | 1 tasks | 1 files |
| Phase 26-eval-runner P01 | 8m | 3 tasks | 3 files |
| Phase 26-eval-runner P02 | 15m | 3 tasks | 4 files |

## Operator Next Steps

- `/gsd-plan-phase 29` — plan Config Foundation
