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

- [ ] **TOOL-01**: A first-class `Tool` abstraction exists, distinct from the host-agnostic detection skills (`SignalSkill`/`ExclusionSkill`/`DetectorSkill`). A `Tool<I, O>` contract (`name`, `description`, `execute(input): Promise<O>`) is defined in the shared skill types with host I/O (network, `chrome.storage`) explicitly permitted, and a `skills/library/` tools folder convention is established (`SKILL.md` with `metadata.kind: tool`).
- [ ] **TOOL-02**: `rederiveSelector` (+ helpers `REDERIVE_SYSTEM_PROMPT`, `RederiveCandidate`, `isRederiveModelOutput`) is migrated from `background/index.ts` into the library as the first tool (`dom-selector-rederive`), the `dom-selector-registry` `metadata.kind` mislabel is corrected, and existing skills are audited against a documented skill-vs-tool decision rule and reclassified where they are really imperative/I/O tools — with zero behavior change.

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
| TOOL-01 | Phase 32 | Pending |
| TOOL-02 | Phase 32 | Pending |

**Coverage:**
- v10.0 requirements: 8 total
- Mapped to phases: 8 (roadmap complete)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-16 — Phase 30 re-scoped from LLM-Primary Promotion to Skill Registry Architecture; LLM-01/02/03 dropped, SKILL-01..04 added; milestone retitled Skill-Based Detection*
*Last updated: 2026-06-16 — Phase 31 re-scoped from Cost Guardrail to Skill Library Alignment; COST-01 dropped, SKILL-05 added; Phase 32 dependency moved from Phase 31 → Phase 29 (eval tuning is independent of the skill-library work). Note: future COST-02/03/04 now presuppose a revived COST-01.*
*Last updated: 2026-06-16 — Eval-tuning phases dropped: removed Phase 32 (Eval Tuning Machinery) and Phase 33 (Detection Tuning Run) and their requirements CFG-02, CFG-03, TUNE-01. Tool Abstraction Layer (TOOL-01/02) renumbered 34 → 32. Milestone v10.0 now scopes Skill-Based Detection + the Tool abstraction; eval-driven tuning deferred.*
