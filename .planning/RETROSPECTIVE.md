# Retrospective — LinkedIn Blocker

Living post-mortem. Each milestone section is appended after close. Cross-milestone trends updated each time.

---

## Milestone: v5.0 — Voice Pattern Detection

**Shipped:** 2026-05-31
**Phases:** 1 | **Plans:** 4

### What Was Built

- `checkHookStory` (0–20 pts): first-person anecdote opener patterns
- `checkMotivational` (0–15 pts): inspirational punch-rhythm paragraph detection
- `checkImpersonalVoice` (0–12 pts): generic third-person authority framing
- All three wired into `HeuristicDetector`; AI voice post scores 61

### What Worked

- Parallel Wave 1 (3 signal files, no cross-plan conflicts) kept execution fast
- Unit-first approach: signal functions tested in isolation before wiring
- The integration test (AI voice post ≥ 60) served as the natural acceptance criterion and caught a regex precision issue before the wave was closed

### What Was Inefficient

- The hook-story test text ("I was in a meeting") didn't trigger the regex — required iteration on the test post content rather than the implementation. More representative test content upfront would have avoided this round-trip.

### Patterns Established

- Signal scoring cap pattern: each signal has a hard max to prevent a single signal from dominating the composite score
- Progressive-form regex for first-person detection: `I was \w+ing` is more precise than `I was \w+` for distinguishing anecdote openers from meeting references

### Key Lessons

- When writing regex-based signal detectors, test against multiple negative examples (not just positive) before committing — "I was in a meeting" and "I was sitting" look identical at a glance but differ critically
- Small scope milestones (1 phase, 4 plans) don't need a formal audit; the integration test IS the audit

### Cost Observations

- Single-day execution
- 4 plans, parallel wave structure kept context lean

---

## Milestone: v4.0 — Prompt Caching

**Shipped:** 2026-05-31
**Phases:** 1 | **Plans:** 1

### What Was Built

- Anthropic prompt caching header (`anthropic-beta: prompt-caching-2024-07-31`)
- `system` field converted to array with `cache_control: { type: 'ephemeral' }`
- `SYSTEM_PROMPT` expanded from ~200 to 856 words to meet Sonnet ≥ 1024 token minimum

### What Worked

- Single-plan phase is efficient for well-scoped API changes
- Expanding the system prompt to meet the token minimum was a design forcing function — produced a more thorough detection guide as a side effect

### Key Lessons

- Anthropic's 1024-token minimum for cache eligibility applies per-model-family; always check the docs when adding caching to a new model tier
- Cache_control goes on the system array entry, not at the message level

---

## Milestone: v3.0 — Repo Rename Cleanup

**Shipped:** 2026-05-31
**Phases:** 1 | **Plans:** 1

### What Was Built

- 11-file URL sweep replacing `linkedinblock` → `linkedinaivoiceblock`
- Git remote URL updated
- ZIP rebuilt with corrected internal URLs

### Key Lessons

- Repo rename should happen before CWS submission; do it before publishing any store links
- `git grep` is the fastest way to find stale URL references across a project

---

## Milestone: v2.0 — Chrome Web Store Release

**Shipped:** 2026-05-31
**Phases:** 3 (12–14) | **Plans:** 6

### What Was Built

- PNG icons at 16/48/128px with correct Vite `publicDir` wiring
- `manifest.json` v1.2.0 with all CWS-required fields
- `PRIVACY.md` and `store/LISTING.md` store assets
- `npm run package` → 27.6 KB ZIP
- `store/SUBMISSION_GUIDE.md`

### What Worked

- Separating packaging script from store assets into two phases kept each plan focused
- Vite's `root: 'src'` + `publicDir` pattern worked cleanly once understood

### Key Lessons

- Icons must live in `src/public/icons/` (not `public/icons/`) because Vite's root is set to `src/`
- CWS short description hard limit is 132 characters — write this first, it constrains the long description

---

## Milestone: v1.2 — Feed Insights & Export Completeness

**Shipped:** 2026-05-30
**Phases:** 2 (10–11) | **Plans:** 4

### What Was Built

- `dailyStats.seenProfileIds` unique author tracking
- Dashboard "Profile bot rate" stat
- Posts CSV export

### Key Lessons

- Tracking unique profiles per day requires a Set in daily stats, not just counts — the data model needs to be designed before the UI

---

## Milestone: v1.1 — UX & Data

**Shipped:** 2026-05-30
**Phases:** 3 (7–9) | **Plans:** 6

### What Was Built

- Post storage (200-cap, 1000-char truncation, URN dedup)
- Accordion signal detail panel in popup
- JSON/CSV export and date-based cleanse

### What Worked

- Post storage as a standalone phase (Phase 7) before the UI phase (Phase 8) made the popup detail work straightforward — data was ready

### Key Lessons

- Export and cleanse naturally belong in the same phase (Phase 9) since they share the same data access patterns
- Accordion accordion state (one open at a time) is simpler with a single `expandedId: string | null` state than per-row booleans

---

## Milestone: v1.0 — Clean Feed

**Shipped:** 2026-05-30
**Phases:** 6 (1–6) | **Plans:** 18

### What Was Built

- Full v1 feature set: MutationObserver, heuristic scoring, flagged account queue, popup UI, block/dismiss actions, threshold config, feed health dashboard

### What Worked

- DOM inspection prerequisite (Phase 1, plan 02) as an explicit plan step prevented guessing at selectors
- Pluggable Detector interface designed in Phase 2 — no rewrite needed to add LLM later
- Wave-based plan structure (parallel where no file conflicts, sequential where blocked) kept execution efficient

### What Was Inefficient

- LinkedIn DOM selector research took multiple rounds; a real browser session would have been faster

### Patterns Established

- Selector registry pattern (all selectors in one file) — single-file fix when LinkedIn redeploys
- CSS hiding with `.llb-hidden { display: none !important }` — never `element.remove()` to protect React's vDOM
- EMA rolling score on the account queue — avoids outlier inflation from single anomalous posts

### Key Lessons

- LinkedIn rebuilds CSS class names on every deploy; `data-*` attributes and `aria-label` are the only stable hooks
- Service worker terminates after ~30s idle; all state must be in `chrome.storage.local` immediately on change
- Never simulate clicks on LinkedIn UI; ToS risk — always use deep links

---

## Milestone: v9.0 — Eval Harness

**Shipped:** 2026-06-15
**Phases:** 5 (25.1, 25.2, 26, 27, 28) | **Plans:** 16

> Note: v6.0, v6.1, v7.0, and v8.0 shipped without retrospective entries (the living doc lapsed after v5.0). v9.0 resumes it; the milestone-close also retroactively recorded v7.0/v8.0 in ROADMAP/PROJECT.

### What Was Built

- Opt-in capture of below-threshold human-negatives to a capped `unflaggedPosts` store (25.1)
- Symmetric Export JSON — `flaggedAccounts` (`blocked` boolean), `flaggedPosts[]`, `unflaggedPosts[]` (25.2)
- `npm run eval` with shared `classifyPost`, threshold sweep, precision/recall/F1/cost → `eval/results-*.json` (26)
- `--engine heuristic|llm`, best-F1 FP/FN error analysis, `eval-label` + `eval-compare`, pure `src/shared/eval/` core (27)
- In-extension Evals dashboard reusing that core: click-to-label, cost-confirm modal, FP/FN cards, run diffs via `EvalRunStore` (28)

### What Worked

- Extracting the eval core to `src/shared/eval/` (pure, no fs/process/chrome/DOM) meant the CLI and the Phase 28 dashboard share ONE implementation — the integration audit confirmed zero forked logic (THRESHOLDS, computeMetrics, compareRuns all single-source).
- Sequencing engine alignment (27) before the dashboard (28) meant the data model (`EvalRun`) was settled before the UI consumed it — Phase 28 was a pure UI addition with no migration.
- Additive, transform-only export redesign (25.2) gave the eval a richer dataset without any storage-schema change.

### What Was Inefficient

- Phase 25.1 needed two gap-closure plans (25.1-05/06) after initial verification found the Export JSON button gated on `accounts.length > 0` only, and a requirements-ID mismatch (EXPORT-01 vs EXPORT-04). Checking the export-button reachability and REQ-ID uniqueness at plan time would have avoided the round-trip.
- SUMMARY `requirements-completed` frontmatter went largely unpopulated across the milestone, weakening the 3-source audit cross-reference (evidence had to come from VERIFICATION.md tables instead).

### Patterns Established

- **Shared pure core for cross-host reuse:** host-agnostic logic in `src/shared/` (no fs/process/chrome/DOM imports) consumed by CLI, service worker, and extension pages alike.
- **FIFO capped store idiom:** `EvalRunStore` mirrors `llbTraces`/`unflaggedPosts` — newest-first, fixed cap, write-chain eviction.
- **Cost guardrail before LLM batch:** pre-run estimate + confirm modal + in-run Cancel that persists a partial run flagged `incomplete`.

### Key Lessons

- A newest-first store plus `.at(-1)` is a latent "last item" bug — the milestone integration audit caught exactly this in the Evals "Last run" footer (fixed fc92b40). When ordering is documented as newest-first, "most recent" is index 0.
- Run a milestone integration audit even when every phase passed in isolation — the only defect found was at a cross-phase/display seam, not inside any single phase.

### Cost Observations

- Two-day execution (2026-06-14 → 2026-06-15), 16 plans across 5 phases.
- Heuristic eval engine added in 27 makes the most common eval path free (no API spend) — only LLM-engine runs cost money.

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Notes |
|-----------|--------|-------|------|-------|
| v1.0 | 6 | 18 | 5 | Core feature set, most complex milestone |
| v1.1 | 3 | 6 | 1 | UX polish on top of solid foundation |
| v1.2 | 2 | 4 | 1 | Incremental dashboard features |
| v2.0 | 3 | 6 | 1 | CWS packaging and assets |
| v3.0 | 1 | 1 | 1 | Maintenance/rename |
| v4.0 | 1 | 1 | 1 | Performance optimization |
| v5.0 | 1 | 4 | 1 | Detection capability expansion |
| v9.0 | 5 | 16 | 2 | Eval harness + in-extension Evals dashboard (largest since v1.0; v6.0–v8.0 retros not recorded) |

**Recurring pattern:** Each milestone after v1.0 has been a focused single-day effort on one concern. The v1.0 foundation investment paid off — every subsequent milestone has been additive with minimal rework. v9.0 was the first multi-day milestone since v1.0, reflecting a larger 5-phase scope (eval runner → improvements → dashboard).

**Recurring lesson:** Test content quality matters as much as implementation quality for regex-based detectors. Write both positive and negative examples before finalising patterns.

**Emerging lesson (v9.0):** Cross-phase/display seams are where defects hide when each phase passes in isolation — run a milestone integration audit before close. Extracting shared logic into a pure host-agnostic core (`src/shared/eval/`) prevents the forked-implementation drift that otherwise accumulates when CLI and UI grow the same feature.
