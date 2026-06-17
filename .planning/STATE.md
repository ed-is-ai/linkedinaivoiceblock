---
gsd_state_version: 1.0
milestone: v10.0
milestone_name: Skill-Based Detection & Tool Abstraction
status: executing
last_updated: "2026-06-17T19:06:33.178Z"
last_activity: 2026-06-17
progress:
  total_phases: 13
  completed_phases: 12
  total_plans: 37
  completed_plans: 36
  percent: 92
---

# State — LinkedIn Blocker

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15 after v9.0)

**Core value:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.
**Current focus:** Phase 33 — improve-modularity

---

## Current Position

Phase: 33 (improve-modularity) — EXECUTING
Plan: 4 of 4
Status: Ready to execute
Last activity: 2026-06-17

### Progress Bar

```
v10.0: [███████████████░░░░░] 75% (3/4 phases)
```

## Accumulated Context

### Roadmap Evolution

- Phase 18.1 inserted after Phase 18: Dashboard Data Display (URGENT)
- Phases 22–23 added: v7.0 Adaptive DOM Scraper
- Phase 25.1 inserted after Phase 25: Capture and export unflagged posts for eval negatives (URGENT)
- Phase 25.2 inserted after Phase 25: Symmetric export redesign (blockedAccounts + flaggedPosts + unflaggedPosts) (URGENT)
- Phases 29–33 added: v10.0 LLM-Primary Detection & Eval-Driven Tuning
- Phase 31 re-scoped (2026-06-16): Cost Guardrail → Skill Library Alignment (COST-01 dropped, SKILL-05 added); Phase 32 dep moved 31 → 29
- Phase 32 added (2026-06-16) as Tool Abstraction Layer (TOOL-01/02) — Tool contract distinct from host-agnostic skills, migrate rederiveSelector as first tool, fix dom-selector-registry CR-01 mislabel, audit skills for tool reclassification; depends on Phase 31
- Eval-tuning phases dropped (2026-06-16): removed Phase 32 (Eval Tuning Machinery) and Phase 33 (Detection Tuning Run) + reqs CFG-02/CFG-03/TUNE-01; Tool Abstraction renumbered 34 → 32
- Post-32 refactor (2026-06-16): tools relocated from `src/skills/library/` to a dedicated `src/tools/library/` tree (commit 58b74d9) — reverses the Phase 32 D-02/D-05 "tools under skills/library" path choice; both `dom-selector-rederive` and `dom-selector-registry` moved; codegen + consumers + AUTHORING.md updated; zero behavior change (433 tests green). Phase 32 SUMMARY/VERIFICATION/SECURITY cite the old paths as point-in-time records.
- Post-32 refactor (2026-06-16): detection skills made self-contained (commit 901ce95) — each `detect-*` folder now owns its pure function + co-located unit test; 9 signal functions moved out of `src/content/detector/signals/` into their skill folders, wrappers import via `./`, the 263-line aggregate `signals.test.ts` split into 6 per-signal tests. Zero behavior change (36 test files / 433 tests).
- Post-32 refactor (2026-06-16): `detect-llm` → `detect-aiwriting-llm` (commit da0ee5c) — moved `classifier.ts`+test into the LLM skill folder; relocated `AnthropicUsage` to `src/shared/types.ts` (neutral, so the rederive tool/background don't import from a skill). `detectionConfig` deliberately left in shared at that time.
- Post-32 refactor (2026-06-17): `detect-heuristic` → `detect-aiwriting-heuristic` (commit aaf3aa1) — the heuristic detector now owns its config (`detectionConfig.ts` moved into the folder root; consumers content/index, pattern-runner, eval repointed by full path) and the 8 signal skills it orchestrates (collapsed under `detect-aiwriting-heuristic/signals/<name>/`, since signals are only invoked via the registry, never directly). Codegen extended to resolve nested skill-order entries (leaf-name derivation). `exclude-*` stay top-level. Zero behavior change (36 files / 433 tests).

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
| listicle-cta composite skill (v10.0) | Single CodeSkill with id 'listicle-cta' calls both checkListicle+checkCta; reads tier weight from detectionConfig.weights.listicleCta — never split into two skills | Phase 30 |
| generic-comments gate placement (v10.0) | score>20 gate stays in the runner, not in the skill's run(); skill just fetches+scores; only sync:false skill in registry | Phase 30 |
| Tool folder location (v10.0) | Tools live in a dedicated `src/tools/library/<name>/` tree, separate from `src/skills/library/` (skills). Import depth to `src/` stays 3 levels so tool internals are unchanged; codegen `parseSkillMd` takes a per-bucket baseDir, tool importPath = `../tools/library/<n>/<n>.tool`. Supersedes Phase 32 D-02/D-05. | Post-32 (2026-06-16) |
| Self-contained skills (v10.0) | Each `detect-*` skill folder owns its pure function(s) + co-located unit test; wrappers import via `./`. Shared infra used by >1 skill stays in `src/content/` (selector-registry — CLAUDE.md #1 single-writer; detector/language — also used by content/exclusions.ts; skill-registry; signals/profile.ts). Vitest discovers co-located tests via `src/**/*.test.ts`. | Post-32 (2026-06-16) |
| Detector-owned hierarchy (v10.0) | The two AI-writing detectors are `detect-aiwriting-heuristic` (owns `detectionConfig.ts` + the 8 signal skills nested under `signals/`) and `detect-aiwriting-llm` (owns `classifier.ts`). Signals are nested because they're only invoked via the registry/HeuristicDetector, never directly. `exclude-*` stay top-level (run by content/index.ts). Codegen `skill-order.json` signal entries are nested paths; importVarName/importPath/metadata-key derive from the leaf folder. `AnthropicUsage` lives in `src/shared/types.ts`. | Post-32 (2026-06-16/17) |

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

**Last updated:** 2026-06-16
**Last action:** Phase 31 Plan 04 complete — order-pinning + kind-drift-guard tests, CI stale-check workflow, AUTHORING.md; 29 test files 422 tests all pass. Phase 31 fully complete.
**Next action:** Execute Phase 32.

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
| Phase 30 P01 | 8m | 2 tasks | 3 files |
| Phase 30-skill-registry-architecture P02 | 10m | 2 tasks | 9 files |
| Phase 30-skill-registry-architecture P03 | 145s | 2 tasks | 4 files |
| Phase 30-skill-registry-architecture P04 | 4m | 1 tasks | 1 files |
| Phase 30-skill-registry-architecture P05 | 8m | 3 tasks | 4 files |
| Phase 31-skill-library-alignment P01 | 18m | 3 tasks | 7 files |
| Phase 31-skill-library-alignment P02 | 17m | 3 tasks | 35 files |
| Phase 31-skill-library-alignment P03 | 8m | 3 tasks | 10 files |
| Phase 31-skill-library-alignment P04 | 11m | 3 tasks | 3 files |
| Phase 33-improve-modularity P01 | 531 | 3 tasks | 30 files |
| Phase 33-improve-modularity P02 | 18min | 2 tasks | 22 files |
| Phase 33-improve-modularity P03 | 8min | 2 tasks | 1 file |

## Operator Next Steps

- `/gsd-execute-phase 32` — execute Phase 32

## Decisions

- [Phase ?]: PATTERNS.md stated 2-level paths but correct depth from src/skills/library/<name>/ to src/ is 3 levels
