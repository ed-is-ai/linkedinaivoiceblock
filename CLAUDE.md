# LinkedIn Blocker — Project Guide

## What This Is

A Chrome Manifest V3 extension that detects and hides AI-generated posts on LinkedIn, surfaces suspicious accounts in an extension popup for review, and provides a dashboard showing feed health statistics.

## GSD Workflow

This project uses the GSD (Get Shit Done) planning framework. All planning artifacts live in `.planning/`.

### Current State

Check `.planning/STATE.md` for the active phase and what's in progress.

### Key Commands

```
/gsd-progress          — check where things stand
/gsd-discuss-phase N   — gather context before planning phase N
/gsd-plan-phase N      — create execution plan for phase N
/gsd-execute-phase N   — execute plans for phase N
/gsd-verify-work       — verify phase deliverables against requirements
```

### Phase Overview

| # | Phase | Goal |
|---|-------|------|
| 1 | Foundation | MutationObserver + selector registry + SPA navigation |
| 2 | Detection Engine | Heuristic scoring + CSS hiding + pluggable interface |
| 3 | Storage & Queue | Persist flagged accounts across sessions |
| 4 | Popup UI | Preact read-only review list with signal breakdown |
| 5 | User Decisions | Block deep link + dismiss false positives |
| 6 | Settings & Dashboard | Threshold config + rolling stats by signal category |

## Architecture

- **Content script** — owns all DOM interaction, MutationObserver, scoring, CSS hiding
- **Service worker** — badge updates only; thin message relay for block commands
- **Popup** — Preact UI, reads `chrome.storage.local` directly, stateless
- **Dashboard** — dedicated chrome extension page (`dashboard.html`)
- **Storage** — `chrome.storage.local` only; no backend

## Critical Constraints

1. **No CSS class names as selectors** — LinkedIn rebuilds class names on every deploy. Use `data-*` attributes, `aria-label`, `role`, and semantic elements exclusively. All hard-coded LinkedIn selector strings live in `selectors.ts` and only there. At runtime the content script reads selectors exclusively through `SelectorRegistry`, which hydrates from `chrome.storage.local` and falls back to the `selectors.ts` seed. Only `SelectorRegistry` may write selector strings to storage.
2. **No `element.remove()`** — breaks React's virtual DOM. Use CSS class toggle (`.llb-hidden { display: none !important }`).
3. **No programmatic block clicks** — ToS risk. Use LinkedIn's deep link: `linkedin.com/in/{slug}/overlay/report-or-block/`.
4. **Service worker is stateless** — it terminates after ~30s idle. All state to `chrome.storage.local` immediately.
5. **Hard exclusions before detection** — sponsored posts, company pages, and non-English posts must be excluded before any heuristic runs.

## Pluggable Detector Interface

```typescript
interface Detector {
  detect(postData: PostData): Promise<DetectionResult>;
}
```

Both `HeuristicDetector` (v1) and any future `LLMDetector` implement this. The call site never changes.

## Phase 1 Prerequisite

**Before writing any selector-dependent code**, inspect the live LinkedIn feed in DevTools to confirm which `data-*` attributes are present on post cards and the feed container. This is the single highest-risk unknown in the project.

## Research

Domain research is in `.planning/research/`:
- `STACK.md` — Preact, Vite, vite-plugin-web-extension, TypeScript
- `FEATURES.md` — Detection signals, scoring approach, false positive mitigations
- `ARCHITECTURE.md` — Component map, data flow, build order
- `PITFALLS.md` — LinkedIn DOM instability, MV3 gotchas, ToS considerations
- `SUMMARY.md` — Synthesised recommendations

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
