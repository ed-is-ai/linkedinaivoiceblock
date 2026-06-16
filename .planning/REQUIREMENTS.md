# Requirements: LinkedIn Blocker — v10.0 Skill-Based Detection & Eval-Driven Tuning

**Defined:** 2026-06-15
**Core Value:** AI-bot posts are hidden automatically before the user sees them, with a reviewable list of flagged accounts in the extension popup.

## v10.0 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Skill Registry Architecture

- [x] **SKILL-01**: Detection logic is organized as a two-level skill registry — DetectorSkill (heuristic, llm), SignalSkill (the scoring signals), and ExclusionSkill (sponsored / company / non-English) — replacing the hand-wired signal pipeline in `heuristic.ts` and the inline exclusion checks in the content script.
- [x] **SKILL-02**: A `SkillRegistry` seeds built-in skills in code and hydrates additional declarative (data-only, LLM-authorable) skills from `chrome.storage.local` with a code-seed fallback (mirroring `SelectorRegistry`); seeded with zero declarative skills so behavior is unchanged, and only `SkillRegistry` writes skill definitions to storage.
- [ ] **SKILL-03**: Hard-exclusion ordering is preserved — ExclusionSkills run and can short-circuit before any DetectorSkill/SignalSkill (upholds the hard-exclusions-before-detection constraint).
- [ ] **SKILL-04**: Zero behavior change — same posts excluded and flagged, same scores and breakdown; the Phase 29 golden-score snapshot stays byte-identical and exclusion parity is verified on a representative fixture set.

### Cost Guardrail

- [ ] **COST-01**: A storage-backed per-session cap (default 50 LLM-scored posts, persisted in `chrome.storage.local` so it survives service-worker termination, reset at the session boundary) falls back to heuristic scoring once the cap is exceeded.

### Eval-Derived Config

- [x] **CFG-01**: One committed detection-config module (decision threshold + heuristic-fallback signal weights) is the single source of truth, imported by both the runtime (content script / service worker) and the eval CLI.
- [ ] **CFG-02**: Threshold selection is precision-constrained (`selectThreshold` with `minPrecision = 0.90`, `minRecall = 0.60`) rather than raw best-F1 — the correct operating point for a false-positive-averse feed-hider.
- [ ] **CFG-03**: Tuning uses a held-out test split so the operating point is not selected and validated on the same labeled data (no train/test leakage).

### Detection Tuning Run

- [ ] **TUNE-01**: One real eval run selects the precision-constrained operating point, bakes the winning config into the config module, and commits the eval result as the accepted baseline artifact.

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
| SKILL-03 | Phase 30 | Pending |
| SKILL-04 | Phase 30 | Pending |
| COST-01 | Phase 31 | Pending |
| CFG-01 | Phase 29 | Complete |
| CFG-02 | Phase 32 | Pending |
| CFG-03 | Phase 32 | Pending |
| TUNE-01 | Phase 33 | Pending |

**Coverage:**
- v10.0 requirements: 9 total
- Mapped to phases: 9 (roadmap complete)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-16 — Phase 30 re-scoped from LLM-Primary Promotion to Skill Registry Architecture; LLM-01/02/03 dropped, SKILL-01..04 added; milestone retitled Skill-Based Detection*
