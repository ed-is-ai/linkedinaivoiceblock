---
phase: 30
slug: skill-registry-architecture
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-16
---

# Phase 30 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| chrome.storage.local → content script | `skillRegistry` key hydrated into `SkillRegistry._cache` and merged into the runner's skill lists | `SkillRegistrySchema` — declarative `PatternSkill[]` DATA only (no executable code); empty arrays at launch |
| LLM-authored declarative skill → pattern-runner | A future-authored `PatternSkill.rule` (keyword/regex string/numeric-threshold) executed by `runPatternSkill()` | Pattern strings compiled via `new RegExp(str)` — same trust model as SelectorRegistry; no eval/new Function |
| SelectorRegistry → ExclusionSkill | `resolve()` returns the active LinkedIn selector string used by `querySelector`/`includes` | Selector strings (never inlined in skill files; CLAUDE.md #1) |
| content script → service worker | `SCORE_POST` message for LLM scoring (LLMDetector) | `postText`; unchanged this phase (DetectorSkill discriminant is additive only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-30-01 | Tampering | PatternSkill.rule schema + pattern-runner regex compilation | mitigate | `rule.patterns: string[]` compiled via `new RegExp(p, 'gi')` (pattern-runner.ts:124); no `eval`/`new Function` in types.ts or pattern-runner.ts (only in doc comments). CR-01 fix routes declarative skills through `runPatternSkill()` in the eval-free dispatch branch (heuristic.ts:80-89). | closed |
| T-30-02 | Elevation of Privilege | SkillRegistrySchema storage hydration into getSignalSkills() | accept | Seed builder returns empty `declarativeSignalSkills: []` and `declarativeExclusionSkills: []` (skill-registry.ts:106-111); merged list equals `CODE_SIGNAL_SKILLS` at launch. Stored skills are PatternSkill DATA only, executed by eval-free runner; MV3 CSP forbids eval regardless. | closed |
| T-30-03 | Tampering | weightKey dotted-path resolver | accept | `resolveWeight()` returns 0 for any unknown path (fail-closed) (pattern-runner.ts:60-61, 66); an untrusted weightKey cannot escalate a score. | closed |
| T-30-04 | Tampering | ExclusionSkill selector usage | mitigate | All selector usage goes through `resolve()` (sponsored.skill.ts:23, company-page.skill.ts:24, open-to-work.skill.ts:35); non-english.skill.ts reads no selector strings (delegates to `isNonEnglish`). No inline LinkedIn selector literals in any of the four files. | closed |
| T-30-05 | Spoofing | open-to-work passthrough | accept | `openToWorkExclusionSkill.check()` always returns `excluded: false` (open-to-work.skill.ts:33-36); a spoofed marker only sets `openToWork: true`, which raises the auto-hide threshold by `openToWorkPenalty` (index.ts:313-315) — fail-safe toward showing content. | closed |
| T-30-06 | Tampering | skillRegistry storage key writes | mitigate | Single-writer confirmed: `storageSet({ skillRegistry: ... })` appears ONLY in skill-registry.ts (L159 seed, L246 addDeclarativeSkill). Grep across `src/` found no other writer. | closed |
| T-30-07 | Tampering | Exclusion short-circuit ordering in content/index.ts | mitigate | Runner loop iterates `getExclusionSkills()` in priority order and `break`s on first `excluded:true` (index.ts:299-304). Parity test present (exclusions/exclusions.test.ts) including the priority case proving sponsored short-circuits before open-to-work (L110-125). | closed |
| T-30-08 | Information Disclosure | LLMDetector unchanged behavior | accept | llm.ts adds only the `kind` discriminant (L13) to satisfy DetectorSkill; the `SCORE_POST` message path and SW fetch are untouched. No new network/egress surface. | closed |
| T-30-SC | Tampering | npm installs | mitigate | No `package.json` / `package-lock.json` changes in the Phase 30 commit range (last dependency change was Phase 27). Pure TypeScript refactor — zero new packages. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-30-02 | T-30-02 | Zero declarative skills seeded this phase; merged skill list equals `CODE_SIGNAL_SKILLS` at launch. Stored skills are PatternSkill DATA only (no `run()`), executed by the eval-free pattern-runner. MV3 CSP forbids eval regardless. Rationale holds against the code: `buildSeedRegistry()` emits empty arrays. | gsd-security-auditor | 2026-06-16 |
| AR-30-03 | T-30-03 | `weightKey` resolves only into the trusted code-committed `detectionConfig.weights`; an unknown dotted path returns 0 (fail-closed). Rationale holds: `resolveWeight()` returns 0 on missing key or non-numeric leaf. | gsd-security-auditor | 2026-06-16 |
| AR-30-05 | T-30-05 | A spoofed open-to-work marker can only raise the auto-hide threshold by the open-to-work penalty (fail-safe toward showing content), never exclude a post. Rationale holds: the skill never returns `excluded:true`. | gsd-security-auditor | 2026-06-16 |
| AR-30-08 | T-30-08 | The DetectorSkill discriminant is additive (`kind` only); the LLM scoring message path and service-worker fetch are unchanged, so no new egress surface is introduced. Rationale holds: llm.ts diff is the `kind` field only. | gsd-security-auditor | 2026-06-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. Every `## Threat Flags` / `## Threat Surface Scan` section across 30-01 through 30-05 SUMMARY.md maps each new surface to an existing threat ID (T-30-01 through T-30-08). No new attack surface appeared during implementation without a threat mapping.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-16 | 9 | 9 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-16
