# Roadmap — LinkedIn Blocker

**Project:** LinkedIn Blocker (Chrome MV3)
**Created:** 2026-05-25

---

## Milestones

- ✅ **v1.0 Clean Feed** — Phases 1–6 (shipped 2026-05-30)
- ✅ **v1.1 UX & Data** — Phases 7–9 (shipped 2026-05-30)
- ✅ **v1.2 Feed Insights & Export** — Phases 10–11 (shipped 2026-05-30)
- ✅ **v2.0 Chrome Web Store Release** — Phases 12–14 (shipped 2026-05-31)
- ✅ **v3.0 Repo Rename Cleanup** — Phase 15 (shipped 2026-05-31)
- ✅ **v4.0 Prompt Caching** — Phase 16 (shipped 2026-05-31)
- ✅ **v5.0 Voice Pattern Detection** — Phase 17 (shipped 2026-05-31)
- ✅ **v6.0 UX Polish + Block Management** — Phases 18–20 (shipped 2026-06-06)
- ✅ **v6.1 Popup UX Tidy-up** — Phase 21 (shipped 2026-06-06)
- ✅ **v7.0 Adaptive DOM Scraper** — Phases 22–23 (shipped 2026-06-14)
- ✅ **v8.0 Observability** — Phases 24–25 (shipped 2026-06-14)
- ✅ **v9.0 Eval Harness** — Phases 25.1–28 (shipped 2026-06-15)
- ✅ **v10.0 Skill-Based Detection & Tool Abstraction** — Phases 29–32 (shipped 2026-06-16)
- 🚧 **v11.0 Modularity & Maintainability** — Phase 33 (in progress)

---

## Phases

<details>
<summary>✅ v1.0 Clean Feed (Phases 1–6) — SHIPPED 2026-05-30</summary>

- [x] Phase 1: Foundation — 4/4 plans — completed 2026-05-25
- [x] Phase 2: Detection Engine — 4/4 plans — completed 2026-05-29
- [x] Phase 3: Storage & Queue — 3/3 plans — completed 2026-05-29
- [x] Phase 4: Popup UI — 2/2 plans — completed 2026-05-29
- [x] Phase 5: User Decisions — 2/2 plans — completed 2026-05-29
- [x] Phase 6: Settings & Dashboard — 3/3 plans — completed 2026-05-30

</details>

<details>
<summary>✅ v1.1 UX & Data (Phases 7–9) — SHIPPED 2026-05-30</summary>

- [x] Phase 7: Post Storage — 2/2 plans — completed 2026-05-30
- [x] Phase 8: Popup Signal Detail & Post Preview — 2/2 plans — completed 2026-05-30
- [x] Phase 9: Export & Cleanse — 2/2 plans — completed 2026-05-30

</details>

<details>
<summary>✅ v1.2 Feed Insights & Export Completeness (Phases 10–11) — SHIPPED 2026-05-30</summary>

Profile bot-rate stat on dashboard + Posts CSV export. → [v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

<details>
<summary>✅ v2.0 Chrome Web Store Release (Phases 12–14) — SHIPPED 2026-05-31</summary>

Icons, manifest compliance, privacy policy, store listing, packaging script, submission guide. → [v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

</details>

<details>
<summary>✅ v3.0 Repo Rename Cleanup (Phase 15) — SHIPPED 2026-05-31</summary>

Replace all `linkedinblock` → `linkedinaivoiceblock` refs (11 files + git remote + ZIP rebuild). → [v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md)

</details>

<details>
<summary>✅ v4.0 Prompt Caching (Phase 16) — SHIPPED 2026-05-31</summary>

Anthropic prompt caching on system prompt + expanded SYSTEM_PROMPT to 856 words. → [v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md)

</details>

<details>
<summary>✅ v5.0 Voice Pattern Detection (Phase 17) — SHIPPED 2026-05-31</summary>

Three new signal functions: hook-story, motivational, impersonal framing. AI voice post scores 61. → [v5.0-ROADMAP.md](milestones/v5.0-ROADMAP.md)

</details>

<details>
<summary>✅ v6.0 UX Polish + Block Management (Phases 18–20) — SHIPPED 2026-06-06</summary>

- [x] **Phase 18: Popup Interaction Fixes** - Bug fix (threshold hiding) + popup click wiring (account name, block button state) (completed 2026-06-05)
- [x] **Phase 20: Batch Block** - "Block all above threshold" popup action with confirmation step (completed 2026-06-06)

</details>

<details>
<summary>✅ v6.1 Popup UX Tidy-up (Phase 21) — SHIPPED 2026-06-06</summary>

- [x] **Phase 21: Dashboard Button Reposition** - Move "View Dashboard" button from inside Settings to the popup header region; remove the in-settings copy (completed 2026-06-06)

</details>

---

<details>
<summary>✅ v7.0 Adaptive DOM Scraper (Phases 22–23) — SHIPPED 2026-06-14</summary>

- [x] Phase 22: Externalize Selectors to Storage — storage-backed ranked candidate registry, runtime resolution via SelectorRegistry, zero behavior change — completed 2026-06-14
- [x] Phase 23: Self-Healing Selector Adapter — breakage detection (6 FP guards), heuristic re-derivation, LLM fallback on sanitized structural DOM — completed 2026-06-13

</details>

<details>
<summary>✅ v8.0 Observability (Phases 24–25) — SHIPPED 2026-06-14</summary>

- [x] Phase 24: Trace Capture & Storage — LLM call interception, trace schema, capped FIFO store in chrome.storage.local — completed 2026-06-13
- [x] Phase 25: Dashboard Export + README Script — "Export Traces" button + `npm run trace-summary` README cost table — completed 2026-06-14

</details>

<details>
<summary>✅ v9.0 Eval Harness (Phases 25.1–28) — SHIPPED 2026-06-15</summary>

Labeled-dataset eval of classifier quality: opt-in negatives capture, symmetric export, `npm run eval` (heuristic/LLM) for precision/recall/F1/cost, error analysis, labeling/compare CLIs, and an in-extension Evals dashboard. → [v9.0-ROADMAP.md](milestones/v9.0-ROADMAP.md)

- [x] Phase 25.1: Capture & export unflagged posts — completed 2026-06-14
- [x] Phase 25.2: Symmetric export redesign — completed 2026-06-14
- [x] Phase 26: Eval Runner — completed 2026-06-14
- [x] Phase 27: Eval Improvements — completed 2026-06-15
- [x] Phase 28: Evals Dashboard — completed 2026-06-15

</details>

---

**v10.0 Skill-Based Detection & Tool Abstraction (Phases 29–32)**

- [x] **Phase 29: Config Foundation** — Single-source `detectionConfig.ts`, zero behavior change (completed 2026-06-15)
- [x] **Phase 30: Skill Registry Architecture** — Two-level skill registry (detectors/signals/exclusions); storage-hydrated declarative skills; zero behavior change (completed 2026-06-16)
- [x] **Phase 31: Skill Library Alignment** — Restructure detector/exclusion/selector skills into the Anthropic Agent Skills folder convention under `skills/library/`; tracer-bullet (spike exclusion, then build out); zero behavior change (completed 2026-06-16)
- [x] **Phase 32: Tool Abstraction Layer** — Introduce a `Tool` contract + tools folder convention; migrate `rederiveSelector` as the first tool; reclassify skills that are really tools (completed 2026-06-16)

---

**v11.0 Modularity & Maintainability (Phase 33)**

- [x] **Phase 33: Improve Modularity** — Finish the skill/tool migration the Phase 29–32 refactors started: pull skill/tool-owned logic out of `src/content/`, finish the `dom-selector-registry` tool migration, unify the registry codegen, reorganize `src/shared/` by concern, and split the UX surfaces into self-contained `src/modules/` modules; zero behavior change (completed 2026-06-17)

---

## Phase Details

### Phase 33: Improve Modularity

**Goal**: Every detection skill, tool, and UX surface is genuinely self-contained — skill/tool-owned logic lives with its skill/tool, `src/shared/` is grouped by concern, and the dashboard/evals/popup apps are peer modules — with zero behavior change (the existing test suite stays green and detection outcomes are byte-identical)
**Depends on**: Phase 32
**Requirements**: MOD-01, MOD-02, MOD-03, MOD-04, MOD-05
**Success Criteria** (what must be TRUE):

  1. Skill/tool-owned logic that lived in `src/content/detector/` and `src/content/selector/` lives with its owning skill/tool; only genuinely cross-cutting DOM/content pipeline utilities remain in `src/content/`
  2. `dom-selector-registry` follows the same tool convention as `dom-selector-rederive` (`TOOL.md` + `.tool.ts`); selector internals (heal/sanitizer/validator/heuristic) are co-located in the tool folders
  3. One shared codegen mechanism generates both the skill and tool registry modules; `SkillRegistry` and `ToolRegistry` remain distinct runtime contracts
  4. `src/shared/` is grouped into concern-based subfolders — `memory/` (storage cluster), `llm/`, `eval/`, `skills/`
  5. `src/modules/{dashboard,evals,popup}/` exist as self-contained peer modules with their own entry points; build config resolves all three
  6. Zero behavior change — the full test suite passes green and the detection golden-score snapshot / exclusion parity holds

**Plans**: 4 plans

Plans:

**Wave 1**

- [x] 33-01-PLAN.md — Track 1+2 (coupled): delete heuristic/llm barrels + repoint; move rederiver/heal/heuristic/sanitizer/validator into dom-selector-rederive tool; rename dom-selector-registry SKILL.md->TOOL.md / .skill.ts->.tool.ts (MOD-01, MOD-02)

**Wave 2** *(blocked on Wave 1)*

- [x] 33-02-PLAN.md — Track 4: regroup src/shared/ into memory/ (storage cluster) + llm/ (pricing, signals); repoint all importers (MOD-04)

**Wave 3** *(blocked on Wave 2)*

- [x] 33-03-PLAN.md — Track 3: verify unified codegen emits both registries (D-05 already satisfied); regenerate clean; fix stale tools-folder comment (MOD-03)

**Wave 4** *(blocked on Wave 3)*

- [x] 33-04-PLAN.md — Track 5: split src/dashboard + src/popup into src/modules/{dashboard,evals,popup}; repoint manifest.json + vite.config.ts; human-verify all 3 pages load (MOD-05)

**UI hint**: no

---

### Phase 18: Popup Interaction Fixes

**Goal**: Posts from accounts at or above the block threshold are hidden in the feed, and popup interaction behaves correctly — account names link to LinkedIn profiles, Block marks accounts locally without navigation, and already-blocked accounts are visually distinguished
**Depends on**: Phase 17
**Requirements**: BUG-01, POPUP-01, POPUP-02, POPUP-03
**Success Criteria** (what must be TRUE):

  1. Loading a LinkedIn feed page hides posts from any account whose stored score meets or exceeds the configured threshold (verified with a known flagged account)
  2. New posts injected by the SPA (infinite scroll) from threshold-hitting accounts are also hidden by the MutationObserver handler
  3. Clicking an account name row in the popup opens that account's LinkedIn profile URL in a new browser tab
  4. Clicking Block on a popup account row stores the account as blocked in chrome.storage.local without opening any LinkedIn page
  5. A popup account row whose account is already in blocked storage shows a visually distinct state (greyed out label or "Blocked" indicator) instead of an active Block button**Plans**: 3 plans

**Wave 1**

- [x] 18-01-PLAN.md — BUG-01: thresholdAuthors map + observer hide branch + settings rebuild
- [x] 18-02-PLAN.md — POPUP-01/POPUP-02: anchor stopPropagation + remove window.open from handleBlock

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-03-PLAN.md — POPUP-03: collapsible Blocked section + AccountRow isBlocked variant

**UI hint**: yes

### Phase 18.1: Dashboard Data Display (INSERTED)

**Goal:** The dashboard presents feed-health data visually — flagged-post rate and bot-profile rate render as horizontal bar rows, a "Net AI voice posts in feed" line chart shows the daily clean-feed percentage, and the redundant signal-categories card is removed — with a build-clean codebase and no throwaway artifacts.
**Requirements**: DASH-DISPLAY-01
**Depends on:** Phase 18
**Plans:** 1 plan
Plans:

- [x] 18.1-01-PLAN.md — Fix dashboard TS error, delete mockup file, human-verify visual display changes

### Phase 20: Batch Block

**Goal**: The user can mark all flagged accounts at or above the detection threshold as blocked in a single popup action, with a confirmation step showing the affected count before any change is committed
**Depends on**: Phase 18.1
**Requirements**: BATCH-01, BATCH-02, BATCH-03
**Success Criteria** (what must be TRUE):

  1. The popup displays a "Block all above threshold" button (or equivalent action) when at least one flagged account's peak score meets or exceeds the configured threshold
  2. Activating the action shows a confirmation prompt that states how many accounts will be blocked before any write occurs
  3. Confirming the action writes all qualifying accounts to blocked storage; cancelling leaves storage unchanged
  4. After confirmation, previously-qualifying popup rows show the already-blocked visual state from Phase 18

**Plans**: 1 planPlans:

- [x] 20-01-PLAN.md — Batch-block popup action: BatchBlockBar + handleBatchBlock single-set write + inline confirmation (BATCH-01/02/03)

**UI hint**: yes

### Phase 21: Dashboard Button Reposition

**Goal**: The "View Dashboard" button is visible at the top of the popup without any interaction, making the dashboard immediately discoverable
**Depends on**: Phase 20
**Requirements**: POPUP-04, POPUP-05
**Success Criteria** (what must be TRUE):

  1. Opening the popup shows a "View Dashboard" control in the header region, above the pending account list, without the user needing to open Settings
  2. Clicking that top-of-popup button opens dashboard/index.html in a new tab (same behavior as before, new position)
  3. Opening the Settings disclosure no longer contains a "View Dashboard" button — only the threshold slider, export controls, and API key section remain
  4. The change is confined to src/popup/index.tsx; no other files are modified

**Plans**: 1 planPlans:

- [x] 21-01-PLAN.md — Relocate View Dashboard button to popup header region; remove in-settings copy (POPUP-04, POPUP-05)

**UI hint**: yes

### Phase 22: Externalize Selectors to Storage

**Goal**: All selector lookups at runtime route through a new SelectorRegistry module backed by chrome.storage.local, seeded once from selectors.ts defaults, with versioned migration, 30-day TTL on adapted candidates, a reset-to-defaults escape hatch, a read-only health view, and cross-tab cache refresh — while the extension behaves identically to v6.1 from a user perspective
**Depends on**: Phase 21
**Requirements**: SELECTOR-01, SELECTOR-02, SELECTOR-03, SELECTOR-04, SELECTOR-05, SELECTOR-06, SELECTOR-07, SELECTOR-08, SELECTOR-09, SELECTOR-10
**Success Criteria** (what must be TRUE):

  1. Selectors are resolved from storage at runtime, not imported directly from selectors.ts — observer.ts and exclusions.ts contain no direct selector string imports
  2. The extension behaves identically to v6.1 on a live LinkedIn feed: the same posts are hidden, the same accounts are flagged, and no new console errors appear (regression-safe)
  3. A winning selector match rotates its candidate to position 0 in its list and the change persists across page reloads
  4. Opening the popup or dashboard shows a read-only selector health view listing each target's active selector, source badge (seed/heuristic/llm), and a warning when a critical selector has not matched recently
  5. Triggering "Reset to defaults" from the popup/dashboard restores all registry entries to the selectors.ts seed values and the health view reflects the change immediately

**Plans**: 2 plans

Plans:

- [x] 26-01-PLAN.md — Extract classifier into src/shared/classifier.ts + refactor service worker (wave 1)
- [x] 26-02-PLAN.md — Eval CLI: threshold sweep, metrics, cost, results persistence, npm run eval (wave 2)

**UI hint**: yes

### Phase 23: Self-Healing Selector Adapter

**Goal**: The extension detects when selector scraping has broken on an active LinkedIn feed and automatically re-derives working candidates — first via structural heuristics, then via an LLM fallback — with strict validation before any candidate is written, rate-bounding on LLM calls, and full privacy protection
**Depends on**: Phase 22
**Requirements**: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, ADAPT-05, ADAPT-06, ADAPT-07, ADAPT-08, ADAPT-09, ADAPT-10
**Success Criteria** (what must be TRUE):

  1. Breakage detection does not trigger on a logged-out LinkedIn page, a skeleton-loader state, a non-feed URL, or a genuinely empty feed — all 6 false-positive guards (URL gate, container present, minimum session activity, no-posts placeholder, auth check, 30s rolling debounce) are verified by fixture tests
  2. When total breakage is detected on an active feed, the heuristic re-deriver proposes candidates locally without any API call; no candidate is written to storage until it passes the full validation gate (minimum match count, author-link ratio, post-text presence, sponsored-contamination rejection, feed-context containment)
  3. No post content, user names, headlines, photo URLs, or any PII leaves the browser during the LLM fallback — only a structural DOM skeleton with all text/href/src/aria-label stripped is sent to the Anthropic API
  4. LLM fallback is only reached when heuristics produce no valid candidate and an API key is configured; it is rate-bounded by a single-flight latch, a minimum 5-minute cool-off persisted across service-worker restarts, and a per-day hard cap
  5. The LLM response is strictly validated before use: selectors matching body/html/* are rejected, overly-broad selectors (outside a 2–50 match range) are rejected, and the selector string is never passed to eval

**Plans**: TBD
**Note — open decision (resolve at plan time):** LLM call location is now confirmed: the Anthropic fetch must live in the **service worker** (background/index.ts) because CORS blocks content-script direct fetches from linkedin.com. The existing LLMDetector pattern (content script sends SCORE_POST message → service worker fetches and responds) must be replicated for LLMRederiver. This is a code-verified fact from src/content/detector/llm.ts and src/background/index.ts.

**UI hint**: yes

---

### Phase 24: Trace Capture & Storage

**Goal**: Every LLM call made by LLMDetector and LLMRederiver appends a structured trace entry to chrome.storage.local — model, prompts, token counts, cost, timestamp, source — with a 500-entry FIFO cap
**Depends on**: Phase 23
**Requirements**: TRACE-01, TRACE-02, TRACE-03
**Success Criteria** (what must be TRUE):

  1. Making an LLMDetector call on a post results in a new trace entry in chrome.storage.local with all required fields (model, systemPrompt, userPrompt truncated to 500 chars, inputTokens, outputTokens, costUsd, timestamp, source: "detector")
  2. Making an LLMRederiver call results in a trace entry with source: "rederiver" and the same schema
  3. After 501 LLM calls, the store contains exactly 500 entries (oldest evicted)
  4. tsc clean; existing detector and rederiver tests still pass

**Plans**: 2 plansPlans:
**Wave 1**

- [x] 24-01-PLAN.md — TraceEntry schema + cache-aware pricing.ts + FIFO traceStore (TRACE-01/02/03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 24-02-PLAN.md — Wire trace capture into scorePost/rederiveSelector SW handlers + refresh-on-load pricing (TRACE-01/02/03)

### Phase 25: Dashboard Export + README Script

**Goal**: The user can download all stored LLM traces from the dashboard as a JSON file, and `npm run trace-summary` reads that file, prints a cost breakdown table, and updates README.md with a LLM Cost Reference section
**Depends on**: Phase 24
**Requirements**: TRACE-04, TRACE-05, TRACE-06
**Success Criteria** (what must be TRUE):

  1. Opening the dashboard shows an "Export Traces" button; clicking it downloads a `linkedin-blocker-traces-YYYY-MM-DD.json` file containing all stored trace entries
  2. Running `npm run trace-summary linkedin-blocker-traces-*.json` prints a cost breakdown table to stdout grouped by source and model (call count, input tokens, output tokens, total USD, avg USD/call)
  3. After running the script, README.md contains an updated `## LLM Cost Reference` section with the generated table
  4. The script exits non-zero with a clear error message if the input file is missing or malformed

**Plans**: 2 plans

Plans:

**Wave 1**

- [x] 25-01-PLAN.md — Dashboard Export Traces button + buildTracesExport pure builder (TRACE-04)
- [x] 25-02-PLAN.md — trace-summary script: recompute costs via computeCostUsd, grouped table, idempotent README LLM Cost Reference section (TRACE-05, TRACE-06)

**UI hint**: yes

---

### Phase 29: Config Foundation

**Goal**: A single committed `src/shared/detectionConfig.ts` module is the sole source of detection constants — thresholds, session cap, heuristic weights — imported by both runtime and eval CLI, with zero behavior change to the running extension
**Depends on**: Phase 28
**Requirements**: CFG-01
**Success Criteria** (what must be TRUE):
  1. `src/shared/detectionConfig.ts` exists and exports all detection constants (autoHideThreshold, flagThreshold, maxPostsPerSession, heuristicWeights) that previously appeared as hard-coded literals in content/index.ts and heuristic.ts
  2. `content/index.ts`, `background/index.ts`, `heuristic.ts`, and `scripts/eval.ts` import their threshold/weight values exclusively from `detectionConfig.ts` — no numeric literals remain at call sites
  3. `npm test && npm run type-check` pass green with no behavior change to detection output (same posts flagged, same scores produced)
  4. The eval CLI (`npm run eval`) uses the same threshold value as the running extension without any manual synchronization step
**Plans**: 2 plans

Plans:

**Wave 1**

- [x] 29-01-PLAN.md — Golden-score snapshot baseline (D-06): pin exact score + breakdown before extraction (CFG-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 29-02-PLAN.md — Create detectionConfig.ts + refactor content/index.ts, heuristic.ts, eval.ts; snapshot byte-identical (CFG-01)

---

### Phase 30: Skill Registry Architecture

**Goal**: Detection logic is reorganized into a two-level skill registry — DetectorSkills (heuristic, llm), SignalSkills (the scoring signals), and ExclusionSkills (sponsored / company / non-English) — fronted by a SkillRegistry that seeds built-ins in code and is ready to hydrate declarative, LLM-authorable skills from `chrome.storage.local` (mirroring SelectorRegistry); zero behavior change to detection output
**Depends on**: Phase 29
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04
**Success Criteria** (what must be TRUE):
  1. Every scoring signal is a registered SignalSkill executed through a single registry runner inside HeuristicDetector; adding a signal is one skill module + one registry entry with its weight read from `detectionConfig` — no hand-wired signal pipeline remains in `heuristic.ts`
  2. Hard exclusions (sponsored, company, non-English) are ExclusionSkills that the runner executes — and short-circuits on — before any DetectorSkill/SignalSkill runs; the hard-exclusions-before-detection ordering (CLAUDE.md constraint #5) is preserved
  3. A SkillRegistry seeds built-in skills from code and hydrates additional declarative (data-only, LLM-authorable) skills from `chrome.storage.local` with a code-seed fallback (SelectorRegistry pattern); with zero declarative skills seeded, behavior is unchanged, and only SkillRegistry writes skill definitions to storage
  4. `npm test && npm run type-check` pass green with zero behavior change — the Phase 29 golden-score snapshot stays byte-identical and exclusion outcomes (which posts are excluded) are unchanged on a representative fixture set
**Plans**: 5 plans

Plans:

**Wave 1**

- [x] 30-01-PLAN.md — Skill type contracts (DetectorSkill/SignalSkill/CodeSkill/PatternSkill/ExclusionSkill) + StorageSchema skillRegistry key (SKILL-01, SKILL-02)

**Wave 2** *(blocked on Wave 1)*

- [x] 30-02-PLAN.md — 8 CodeSkill signal wrappers (incl. listicle-cta composite, async generic-comments) + MV3-CSP-safe PatternSkillRunner (SKILL-01, SKILL-02)
- [x] 30-03-PLAN.md — 4 ExclusionSkill modules (sponsored/company-page/non-english/open-to-work) extracted from checkExclusions (SKILL-01, SKILL-03)

**Wave 3** *(blocked on Wave 2)*

- [x] 30-04-PLAN.md — SkillRegistry singleton mirroring SelectorRegistry: ordered code seeds, empty declarative lists, single-writer storage (SKILL-02)

**Wave 4** *(blocked on Wave 3)*

- [x] 30-05-PLAN.md — HeuristicDetector registry runner + exclusion runner wiring + LLMDetector DetectorSkill + exclusion parity test; golden-score snapshot byte-identical (SKILL-01, SKILL-03, SKILL-04)

---

### Phase 31: Skill Library Alignment

**Goal**: The detector, exclusion, and selector skills are restructured into the Anthropic Agent Skills folder convention — each a self-contained `skills/library/<name>/` folder with a `SKILL.md` manifest (name/description/metadata frontmatter) alongside its bundled TypeScript implementation — and the `SkillRegistry` hydrates skill metadata from those bundled manifests, with zero behavior change. Built tracer-bullet style: the exclusion skill is spiked end-to-end as wave 1, then the detector and selector skills follow.
**Depends on**: Phase 30
**Requirements**: SKILL-05
**Success Criteria** (what must be TRUE):
  1. (Wave 1 tracer) One ExclusionSkill lives at `skills/library/<name>/` with a `SKILL.md` whose frontmatter (`name`, `description`) parses per the Anthropic Agent Skills standard, plus its bundled TS implementation; the `SkillRegistry` resolves it from the library and the content-script exclusion run is byte-identical on the fixture set
  2. After build-out, every DetectorSkill (heuristic, llm), every ExclusionSkill (sponsored, company-page, non-english, open-to-work), and the selector registry has a `skills/library/<name>/SKILL.md` + bundled implementation; no skill definition remains outside `skills/library/`
  3. All skills are bundled at build time via static imports — no dynamic `import`, no `eval`/`new Function`, no runtime filesystem access (MV3-CSP-safe); the production build runs with no new CSP violations
  4. Zero behavior change — the Phase 29 golden-score snapshot stays byte-identical and exclusion parity holds on the representative fixture set (same posts excluded/flagged, same scores)
  5. Adding a new skill is "drop a `skills/library/<name>/` folder (SKILL.md + impl) + one registry entry" — captured in a short skill-authoring note
**Plans**: 4 plans

Plans:

**Wave 1** *(tracer bullet — standalone end-to-end slice)*

- [x] 31-01-PLAN.md — Spike sponsored exclusion end-to-end: library folder + SKILL.md + moved impl, codegen script + skill-order.json, committed generated module, SkillRegistry rewire, exclusion parity byte-identical (SKILL-05)

**Wave 2** *(blocked on Wave 1)*

- [x] 31-02-PLAN.md — Move remaining 3 exclusions + all 8 signal skills into library folders; regenerate full ordered module; SkillRegistry sources both arrays from it; golden snapshot byte-identical (SKILL-05)

**Wave 3** *(blocked on Wave 2)*

- [x] 31-03-PLAN.md — Move heuristic + llm DetectorSkills into library folders (re-export barrels); selector-registry thin wrapper (single-writer preserved); emit detector metadata (SKILL-05)

**Wave 4** *(blocked on Wave 3)*

- [x] 31-04-PLAN.md — Order-pinning + kind-drift-guard tests; check-skill-registry stale-check wired into CI; skill-authoring note (SKILL-05)

---

### Phase 32: Tool Abstraction Layer

**Goal**: A first-class `Tool` abstraction exists, separate from the host-agnostic detection skills. Tools are imperative capabilities that may perform host I/O (network, `chrome.storage`) and expose a typed `name` / `description` / `execute(input)` contract; they live under the `skills/library/` folder convention with a `SKILL.md` manifest (`metadata.kind: tool`). `rederiveSelector` is migrated out of `background/index.ts` into the library as the first tool, the `dom-selector-registry` mislabel is corrected, and existing "skills" that are really imperative/I/O capabilities are audited and reclassified as tools — with zero behavior change.
**Depends on**: Phase 31 (skill-library folder convention)
**Requirements**: TOOL-01, TOOL-02
**Success Criteria** (what must be TRUE):

  1. A `Tool<I, O>` contract is defined in the shared skill types (`name`, `description`, `execute(input): Promise<O>`) — host I/O explicitly permitted — and is distinct from `SignalSkill` / `ExclusionSkill` / `DetectorSkill` (which keep their host-agnostic invariant)
  2. A tools folder convention exists under `src/skills/library/`: each tool is a self-contained folder with a `SKILL.md` manifest declaring `metadata.kind: tool` alongside its bundled implementation
  3. `rederiveSelector` and its tightly-coupled helpers (`REDERIVE_SYSTEM_PROMPT`, `RederiveCandidate`, `isRederiveModelOutput`) move into the library as `dom-selector-rederive`; `background/index.ts` imports it from the new location and the self-healing selector flow behaves byte-identically
  4. The `dom-selector-registry` `metadata.kind` mislabel (code-review CR-01: currently `exclusion`) is corrected to an accurate kind
  5. Existing skills are audited against the skill-vs-tool decision rule; any imperative/I/O capability masquerading as a detection skill is reclassified as a tool, and the decision rule is documented in `AUTHORING.md`
  6. Zero behavior change: full test suite + `check-skill-registry` stale-check pass; golden-score snapshot and exclusion parity remain byte-identical

**Plans:** 3/3 plans complete

**Wave 1**

- [x] 32-01-PLAN.md — Tool<I, O> contract in shared types + migrate rederiveSelector into dom-selector-rederive tool (TOOL-01/TOOL-02)

**Wave 2** *(blocked on Wave 1)*

- [x] 32-02-PLAN.md — Extend codegen with tools bucket + ToolRegistry + generated-tool-registry + check-tool-registry stale-check (TOOL-01)

**Wave 3** *(blocked on Wave 2)*

- [x] 32-03-PLAN.md — Rewire background to ToolRegistry, dedup RederiveCandidate, CR-01 kind fix, AUTHORING.md skill-vs-tool rule, zero-behavior-change guard sweep (TOOL-02)

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-05-25 |
| 2. Detection Engine | v1.0 | 4/4 | Complete | 2026-05-29 |
| 3. Storage & Queue | v1.0 | 3/3 | Complete | 2026-05-29 |
| 4. Popup UI | v1.0 | 2/2 | Complete | 2026-05-29 |
| 5. User Decisions | v1.0 | 2/2 | Complete | 2026-05-29 |
| 6. Settings & Dashboard | v1.0 | 3/3 | Complete | 2026-05-30 |
| 7. Post Storage | v1.1 | 2/2 | Complete | 2026-05-30 |
| 8. Popup Signal Detail | v1.1 | 2/2 | Complete | 2026-05-30 |
| 9. Export & Cleanse | v1.1 | 2/2 | Complete | 2026-05-30 |
| 10. Profile Insights | v1.2 | 2/2 | Complete | 2026-05-30 |
| 11. Posts Export | v1.2 | 2/2 | Complete | 2026-05-30 |
| 12. Manifest & Icons | v2.0 | 2/2 | Complete | 2026-05-30 |
| 13. Store Assets | v2.0 | 2/2 | Complete | 2026-05-31 |
| 14. Package & Submit | v2.0 | 2/2 | Complete | 2026-05-31 |
| 15. URL Reference Updates | v3.0 | 1/1 | Complete | 2026-05-31 |
| 16. Prompt Caching | v4.0 | 1/1 | Complete | 2026-05-31 |
| 17. Voice Signal Functions | v5.0 | 4/4 | Complete | 2026-05-31 |
| 18. Popup Interaction Fixes | v6.0 | 3/3 | Complete | 2026-06-05 |
| 18.1. Dashboard Data Display | v6.0 | 1/1 | Complete | 2026-06-06 |
| 20. Batch Block | v6.0 | 1/1 | Complete | 2026-06-06 |
| 21. Dashboard Button Reposition | v6.1 | 1/1 | Complete | 2026-06-06 |
| 22. Externalize Selectors to Storage | v7.0 | 5/5 | Complete    | 2026-06-14 |
| 23. Self-Healing Selector Adapter | v7.0 | 4/4 | Complete    | 2026-06-13 |
| 24. Trace Capture & Storage | v8.0 | 2/2 | Complete    | 2026-06-13 |
| 25. Dashboard Export + README Script | v8.0 | 2/2 | Complete    | 2026-06-14 |
| 25.1. Capture & Export Unflagged Posts | v9.0 | 6/6 | Complete    | 2026-06-14 |
| 25.2. Symmetric Export Redesign | v9.0 | 2/2 | Complete    | 2026-06-14 |
| 26. Eval Runner | v9.0 | 2/2 | Complete    | 2026-06-14 |
| 27. Eval Improvements | v9.0 | 3/3 | Complete    | 2026-06-15 |
| 28. Evals Dashboard | v9.0 | 3/3 | Complete    | 2026-06-15 |
| 29. Config Foundation | v10.0 | 2/2 | Complete    | 2026-06-15 |
| 30. Skill Registry Architecture | v10.0 | 5/5 | Complete    | 2026-06-16 |
| 31. Skill Library Alignment | v10.0 | 4/4 | Complete    | 2026-06-16 |
| 32. Tool Abstraction Layer | v10.0 | 3/3 | Complete    | 2026-06-16 |
