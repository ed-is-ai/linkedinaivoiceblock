# Phase 32: Tool Abstraction Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 32-tool-abstraction-layer
**Areas discussed:** Skill-vs-tool rule, Audit aggressiveness, Tool wiring model, Rederive tool boundary

---

## Skill-vs-Tool Decision Rule

| Option | Description | Selected |
|--------|-------------|----------|
| I/O boundary | Skill = host-agnostic, deterministic, pure data→result; Tool = performs host I/O / non-deterministic | ✓ |
| LLM-authorability | Skill = declaratively LLM-authorable as data; Tool = requires imperative/privileged code | |
| Detection-vs-capability | Skill = participates in scoring/exclusion pipeline; Tool = capability outside the per-post pipeline | |

**User's choice:** I/O boundary
**Notes:** Matches the existing `src/shared/skills/types.ts` host-agnostic invariant and the Anthropic "tool = side-effecting capability" framing.

---

## Audit Aggressiveness

### Sub-decision 1 — contract vs implementation keying

| Option | Description | Selected |
|--------|-------------|----------|
| Contract-keyed | Rule keys on contract not impl; only dom-selector-registry reclassified; composites stay skills | |
| Impl-keyed, full reclassify | detect-llm + detect-generic-comments ARE tools and get restructured | |
| Pragmatic split | Reclassify dom-selector-registry + detect-llm; keep generic-comments | |

**User's choice (free text):** "Anything that does I/O is a tool, but some elements of detect-llm, detect-generic-comments are skills."
**Notes:** The user reframed the question: the I/O rule applies honestly (I/O = tool), but the composite detectors have a pure scoring part (skill) and an I/O part (tool). Resolution is to *separate concerns conceptually* — and this maps onto existing code (generic-comments already injects `fetchComments`; detect-llm's fetch already lives in the SW).

### Sub-decision 2 — how far to go this phase

| Option | Description | Selected |
|--------|-------------|----------|
| Document the seam, migrate only rederive | Build dom-selector-rederive end-to-end + fix dom-selector-registry; DOCUMENT composite seams as follow-up | ✓ |
| Decompose generic-comments too | Also formalize fetchComments as a named tool this phase | |
| Full decomposition now | Extract tool portions from both composites, rewiring background + runner | |

**User's choice:** Document the seam, migrate only rederive
**Notes:** Keeps zero-behavior-change tight; honors the I/O rule without risky pipeline surgery against the golden snapshot.

---

## Tool Wiring Model

### Sub-decision 1 — registration approach

| Option | Description | Selected |
|--------|-------------|----------|
| In codegen, separate bucket | `tools` array in skill-order.json + generated metadata + stale-check; no runtime registry; direct imports | |
| Convention-only, no codegen | Tool folders + SKILL.md for discoverability; codegen ignores them | |
| Full ToolRegistry | Runtime ToolRegistry mirroring SkillRegistry, dispatches by name | ✓ |

**User's choice:** Full ToolRegistry
**Notes:** User wants the Tool abstraction first-class with a real runtime registry + consumer, not just a folder convention — even though only one tool exists today.

### Sub-decision 2 — registry location + codegen reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Shared module + codegen-generated | ToolRegistry in src/shared/; mirrors SkillRegistry codegen; committed generated module; code-seeded only | ✓ |
| Shared module, hand-wired | ToolRegistry in src/shared/ but hand-written static array, no codegen | |
| Mirror storage-hydration too | Full SkillRegistry parity incl. chrome.storage hydration + migrate() + declarative merge | |

**User's choice:** Shared module + codegen-generated
**Notes:** `src/shared/` is host-neutral (rederive runs in the service worker). MV3-CSP-safe static imports; CI stale-checked; no storage hydration this phase (no LLM-authored tools yet).

---

## Rederive Tool Boundary

### Sub-decision 1 — what execute() encapsulates

| Option | Description | Selected |
|--------|-------------|----------|
| The LLM call only | execute = rederiveSelector body (key+fetch+parse+validate); rate-limit, key pre-check, handler, trace stay in background | ✓ |
| Call + rate-limit policy | execute also absorbs checkRateLimit/acquire/release | |
| Whole handler | execute = entire REDERIVE_SELECTOR async handler; background becomes a relay | |

**User's choice:** The LLM call only
**Notes:** Matches SC#3's literal move list; smallest, safest seam; rate-limiting stays a host-side policy concern.

### Sub-decision 2 — trace seam

| Option | Description | Selected |
|--------|-------------|----------|
| Hoist trace to background | execute returns { candidates, usage }; background records the success trace at the call site | ✓ |
| Inject recordTrace callback | background passes recordTrace into execute()'s context | |
| Move trace store to shared | Relocate recordTrace/trace store into src/shared/ | |

**User's choice:** Hoist trace to background
**Notes:** Tool lives in src/shared/, recordTrace in background/ — hoisting avoids a layering violation; behavior-neutral (same trace data, co-located with existing error traces).

---

## Claude's Discretion

- Exact `Tool<I, O>` interface placement in `src/shared/skills/types.ts` (or sibling) and whether `Tool` joins the `AnySkill` union (intentionally distinct).
- The `tools` bucket shape in `scripts/skill-order.json`, the codegen extension for `metadata.kind: tool`, the generated tool-registry module path/name, and the stale-check wiring.
- The rederive tool folder name (`dom-selector-rederive`) and the `AUTHORING.md` prefix-table update.
- The precise `ToolRegistry` API (`get(name)`, seed/registration) so long as the call site is `toolRegistry.get('dom-selector-rederive').execute(input)`.
- Extending the `kind` discriminant with `'tool'` shared by the codegen validator + kind-drift test.

## Deferred Ideas

- Decompose the composite detectors (LLM-call/score-post tool + comment-fetch tool) — the audit's named follow-up.
- Rate-limit policy as a reusable host-side tool/policy object — stays inline in background this phase.
- Runtime/storage-hydration of LLM-authored tools — ToolRegistry is code-seeded only this phase.
