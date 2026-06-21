# Requirements: LinkedIn Blocker — v10.0 Skill-Based Detection & Eval-Driven Tuning

**Defined:** 2026-06-15
**Core Value:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.

## v10.0 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Skill Registry Architecture

- [x] **SKILL-01**: Detection logic is organized as a two-level skill registry — DetectorSkill (heuristic, llm), SignalSkill (the scoring signals), and ExclusionSkill (sponsored / company / non-English) — replacing the hand-wired signal pipeline in `heuristic.ts` and the inline exclusion checks in the content script.
- [x] **SKILL-02**: A `SkillRegistry` seeds built-in skills in code and hydrates additional declarative (data-only, LLM-authorable) skills from `chrome.storage.local` with a code-seed fallback (mirroring `SelectorRegistry`); seeded with zero declarative skills so behavior is unchanged, and only `SkillRegistry` writes skill definitions to storage.
- [x] **SKILL-03**: Hard-exclusion ordering is preserved — ExclusionSkills run and can short-circuit before any DetectorSkill/SignalSkill (upholds the hard-exclusions-before-detection constraint).
- [x] **SKILL-04**: Zero behavior change — same posts excluded and flagged, same scores and breakdown; the Phase 29 golden-score snapshot stays byte-identical and exclusion parity is verified on a representative fixture set.

### Skill Library Alignment

- [x] **SKILL-05**: The detector, exclusion, and selector skills are each defined as a self-contained folder under `skills/library/<name>/` following the Anthropic Agent Skills convention — a `SKILL.md` manifest (name/description/metadata frontmatter) alongside the bundled TypeScript implementation — and `SkillRegistry` hydrates skill metadata from the bundled manifests at build time (static imports only; no runtime filesystem load, MV3-CSP-safe), with zero behavior change. Delivered tracer-bullet style: spike one skill kind (exclusion) end-to-end, then build out the rest.

### Tool Abstraction Layer

- [x] **TOOL-01**: A first-class `Tool` abstraction exists, distinct from the host-agnostic detection skills (`SignalSkill`/`ExclusionSkill`/`DetectorSkill`). A `Tool<I, O>` contract (`name`, `description`, `execute(input): Promise<O>`) is defined in the shared skill types with host I/O (network, `chrome.storage`) explicitly permitted, and a `skills/library/` tools folder convention is established (`SKILL.md` with `metadata.kind: tool`).
- [x] **TOOL-02**: `rederiveSelector` (+ helpers `REDERIVE_SYSTEM_PROMPT`, `RederiveCandidate`, `isRederiveModelOutput`) is migrated from `background/index.ts` into the library as the first tool (`dom-selector-rederive`), the `dom-selector-registry` `metadata.kind` mislabel is corrected, and existing skills are audited against a documented skill-vs-tool decision rule and reclassified where they are really imperative/I/O tools — with zero behavior change.

### Eval-Derived Config

- [x] **CFG-01**: One committed detection-config module (decision threshold + heuristic-fallback signal weights) is the single source of truth, imported by both the runtime (content script / service worker) and the eval CLI.

## Future Requirements

Deferred — tracked but not in this milestone's roadmap.

### Quality Gating

- **GATE-01**: Automated regression gate (`npm run eval:gate`) fails if F1 or precision drops more than epsilon below `eval/baseline.json`; runs the deterministic heuristic engine; human-initiated `bless` updates the baseline.

### False-Positive Reduction (prompt)

- **FP-01**: Observed false positives from eval FP analysis are fed back into `SYSTEM_PROMPT` as few-shot hard-negative examples (zero added cost via prompt cache).
- **FP-02**: Every prompt change is re-evaluated against a hard recall floor so cutting false positives does not silently collapse recall.

### Cost & Observability Polish

- **COST-02**: The per-session cap value is user-configurable in popup Settings.
- **COST-03**: A live "N posts scored this session" indicator is surfaced in the popup / dashboard.
- **COST-04**: A second daily ceiling (e.g. 500/day) sits on top of the per-session cap.
- **CFG-04**: `scripts/derive-config.ts` reads the best eval run and rewrites the config module automatically (no hand-editing).
- **DATA-01**: `engineUsed` (llm / heuristic) is recorded on every stored post so eval and analysis can distinguish primary results from fallback results.

## Post-v10.0 Requirements

Net-new scope captured after v10.0. Maps to Phase 34.

### Manual Self-Healing Trigger

- **HEAL-01**: The dashboard Selector Health section presents a "Heal selectors now" button, enabled only when a LinkedIn feed tab is open and otherwise disabled with a hint to open LinkedIn (the heal pipeline requires a live feed DOM, which the dashboard page does not have).
- **HEAL-02**: Clicking the button runs the heal pipeline against the live feed tab's DOM via a `TRIGGER_HEAL` message handled by a content-script listener; healing is never attempted from the dashboard's own DOM.
- **HEAL-03**: The heal attempt covers all currently-stale selectors, not only `POST_CARD` — `triggerHeal` is generalized to accept a target; card-shaped targets use the heuristic deriver and sub-element targets use the LLM fallback when an API key is configured; non-DOM targets (e.g. `COMPANY_PAGE_MARKER`) are excluded from the heal set.
- **HEAL-04**: The dashboard reports a per-selector outcome (healed / unchanged / failed) and refreshes the Selector Health rows to reflect any newly-active selector.
- **HEAL-05**: No selector string is written except through `SelectorRegistry.insertCandidate` after `validateCandidate` passes (ADAPT-06 preserved); the manual trigger respects the existing single-flight / cool-off guard so it cannot stampede the automatic trigger.
- **HEAL-06**: Redundant Selector Health entries are removed — the dead selectors `POST_AUTHOR_NAME` and `POST_URN_ATTR_FALLBACK` (no `resolve()` consumers; their logic is covered by `POST_AUTHOR_LINK` and `POST_URN_ATTR` respectively) are deleted from `selectors.ts`, the `SEED_MAP`/imports in `selector-registry.ts`, and the `SelectorTarget` union in `types.ts`, so they no longer appear as rows in the Selector Health tab.

## v11.2 Requirements — Dashboard Polish & Feed Health

Net-new scope for milestone v11.2. Pure dashboard/observability polish — no detection-logic or new-scraping changes. Each maps to exactly one roadmap phase.

### Selector Health Accuracy

- [ ] **SHA-01**: Contextual selectors record a real `lastMatchedAt` when they match a live element during normal browsing — `SPONSORED_MARKER` and `COMPANY_PAGE_MARKER` from their exclusion-check match sites, and `CONNECTION_DEGREE`, `AUTHOR_HEADLINE`, `OPEN_TO_WORK_MARKER`, `COMMENT_TEXT`, `COMMENT_EXPAND_BUTTON` from their signal match sites — via the existing fire-and-forget `SelectorRegistry.updateCandidate()` pattern (off the critical path; only `SelectorRegistry` writes selectors, CLAUDE.md #1). The Selector Health "Last matched" column then shows an actual date for these targets instead of a permanent "—".
- [ ] **SHA-02**: The Selector Health table rows are visually aligned across all columns, including the long `COMMENT_EXPAND_BUTTON` target name which currently nudges its row out of alignment.

### Data Management Labels

- [ ] **EXPORT-01**: The data-management "Export JSON" button is labeled "Export matching behaviour" (label-only change — export contents and behavior unchanged).
- [ ] **EXPORT-02**: The "Export Posts CSV" button is labeled "Export Posts seen (N)", where N is the live count of stored posts; clicking still downloads the same stored-posts CSV.

### Header Branding

- [ ] **BRAND-01**: The dashboard header shows the title "LinkedIn AIVoice blocker - Feed Health" and the subtitle "because your brain deserves better".

## Out of Scope

Explicitly excluded for v10.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New profile signals (AI headshot, thin connections, generic bio) | Requires scraping the profile page / hovercard — no new DOM surface this milestone |
| New engagement signals (near-identical comments, reaction ratios) | Requires comment-thread DOM + cross-post aggregation — deferred |
| Message Batches API for live scoring | Async (up to 24h) — incompatible with real-time feed hiding |
| Structured output / tool-use for classification | Adds ~497 tokens per request and invalidates the prompt cache — net more expensive than the existing JSON-in-system-prompt pattern |
| Haiku-tier model as the classifier | Haiku's 4,096-token cache minimum exceeds the ~1,300-token system prompt, so caching never activates — more expensive per post than cached Sonnet |
| Posting-frequency signals | Scheduling tools cause too many false positives (carried over from prior milestones) |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SKILL-01 | Phase 30 | Complete |
| SKILL-02 | Phase 30 | Complete |
| SKILL-03 | Phase 30 | Complete |
| SKILL-04 | Phase 30 | Complete |
| SKILL-05 | Phase 31 | Complete |
| CFG-01 | Phase 29 | Complete |
| TOOL-01 | Phase 32 | Complete |
| TOOL-02 | Phase 32 | Complete |

**Coverage:**
- v10.0 requirements: 8 total
- Mapped to phases: 8 (roadmap complete)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-16 — Phase 30 re-scoped from LLM-Primary Promotion to Skill Registry Architecture; LLM-01/02/03 dropped, SKILL-01..04 added; milestone retitled Skill-Based Detection*
*Last updated: 2026-06-16 — Phase 31 re-scoped from Cost Guardrail to Skill Library Alignment; COST-01 dropped, SKILL-05 added; Phase 32 dependency moved from Phase 31 → Phase 29 (eval tuning is independent of the skill-library work). Note: future COST-02/03/04 now presuppose a revived COST-01.*
*Last updated: 2026-06-16 — Eval-tuning phases dropped: removed Phase 32 (Eval Tuning Machinery) and Phase 33 (Detection Tuning Run) and their requirements CFG-02, CFG-03, TUNE-01. Tool Abstraction Layer (TOOL-01/02) renumbered 34 → 32. Milestone v10.0 now scopes Skill-Based Detection + the Tool abstraction; eval-driven tuning deferred.*
