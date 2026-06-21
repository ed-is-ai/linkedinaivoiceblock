# Phase 32: Tool Abstraction Layer - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Introduce a first-class `Tool` abstraction — imperative capabilities that may perform host I/O (network, `chrome.storage`, DOM) — that is **distinct** from the host-agnostic detection skills (`SignalSkill` / `ExclusionSkill` / `DetectorSkill`). Define a `Tool<I, O>` contract (`name`, `description`, `execute(input): Promise<O>`) in the shared skill types, establish a tools folder + `SKILL.md` (`metadata.kind: tool`) convention under `src/skills/library/`, and stand up a first-class **`ToolRegistry`** in `src/shared/` that mirrors the SkillRegistry codegen pattern.

Migrate `rederiveSelector` (+ `REDERIVE_SYSTEM_PROMPT`, `RederiveCandidate`, `isRederiveModelOutput`) out of `src/background/index.ts` into the library as the first tool, **`dom-selector-rederive`**; rewire `background/index.ts` to resolve it through `ToolRegistry` and call `.execute(input)`. Correct the `dom-selector-registry` `metadata.kind` mislabel (code-review CR-01: currently `exclusion`) to `tool`. Audit existing skills against the documented skill-vs-tool rule and document the rule in `AUTHORING.md`.

**Zero behavior change** is the operational definition of done: the full test suite + `check-skill-registry` stale-check pass, and the golden-score snapshot + exclusion parity remain byte-identical.

**Out of scope (this phase):** actually decomposing the composite detectors (`detect-llm`, `detect-generic-comments`) into separate skill+tool implementations — their I/O seams are DOCUMENTED as follow-ups, not refactored; any change to detection output; runtime/storage-hydration of LLM-authored tools; reviving the dropped eval-driven tuning track.

</domain>

<decisions>
## Implementation Decisions

### Skill-vs-Tool Decision Rule (drives the SC#5 audit; documented in AUTHORING.md)
- **D-01:** The discriminator is the **I/O boundary**. A **skill** is host-agnostic, deterministic, pure data→result (no network, no `chrome.*`, no runtime DOM query) — matching the existing `src/shared/skills/types.ts` invariant. A **tool** performs host I/O (network, `chrome.storage`, DOM read/write) and/or is non-deterministic. (Rejected: LLM-authorability as the axis; detection-vs-capability as the axis.)
- **D-02:** **Anything that does I/O is a tool — but `detect-llm` and `detect-generic-comments` are composite**: they have a pure host-agnostic scoring part (skill) and an I/O part (tool). The honest classification *separates the concerns* rather than forcing the whole detector into one bucket. This maps onto the existing code:
  - `detect-generic-comments` is **already decomposed** — the runner injects `fetchComments` (the DOM-read **tool**); `checkGenericComments(comments)` is the pure **skill**.
  - `detect-llm` — the network `fetch` (**tool**) already lives in the service worker (`scorePost`); `LLMDetector` is a thin relay and the prompt/parse/score logic is the **skill** part.

### Audit Aggressiveness (this phase)
- **D-03:** This phase fully builds **one** tool end-to-end (`dom-selector-rederive`) and reclassifies **one** existing skill (`dom-selector-registry` → `kind: tool`, the CR-01 fix). For the **composite detectors**, the audit **DOCUMENTS the skill/tool seam** (the `SCORE_POST` fetch and the `fetchComments` DOM read are I/O tools; the scoring is the skill) and records actual decomposition as a **follow-up** — it does NOT refactor the detector pipeline this phase. This honors D-01/D-02 while keeping zero-behavior-change tight (no pipeline surgery, no golden-snapshot risk). (Rejected: impl-keyed full reclassify of both composites; pragmatic split that reclassifies `detect-llm` now.)

### Tool Wiring / Registration Model
- **D-04:** Tools are **first-class** with a runtime **`ToolRegistry`** (mirroring `SkillRegistry`), giving the abstraction a real consumer: `background/index.ts` does `toolRegistry.get('dom-selector-rederive').execute(input)` instead of calling `rederiveSelector` directly. (Rejected: convention-only folders with no codegen; codegen metadata bucket with no runtime registry.)
- **D-05:** **`ToolRegistry` lives in `src/shared/`** (host-neutral) so both the service worker (where rederive's fetch runs) and the content script can import it. It **mirrors the SkillRegistry codegen pattern**: codegen scans the tool entries, emits a **committed `generated-tool-registry.ts`** (static imports only, MV3-CSP-safe), stale-checked in CI. **Code-seeded only — no `chrome.storage` hydration / `migrate()` / declarative merge this phase** (no LLM-authored tools yet). (Rejected: hand-wired array with no codegen; full storage-hydration parity.)

### dom-selector-rederive Tool Boundary
- **D-06:** `execute({ target, domSkeleton })` encapsulates **the LLM call only** — exactly `rederiveSelector`'s current body: read the API key from `chrome.storage`, `fetch`, parse, schema-validate via `isRederiveModelOutput`, return candidates. It carries `REDERIVE_SYSTEM_PROMPT`, the `RederiveCandidate` type, and `isRederiveModelOutput`. The **rate-limit machinery** (`checkRateLimit` / `acquireRateLimitLatch` / `releaseRateLimitLatch`), the **pre-latch API-key check** (review finding #3), and the **`REDERIVE_SELECTOR` message handler** STAY in `background/index.ts` as host-side orchestration around the tool. (Rejected: pulling rate-limit policy into the tool; absorbing the whole handler.)
- **D-07:** **Trace recording is hoisted to `background/index.ts`.** Because the tool lives in `src/shared/` and `recordTrace` is a `background/` module, the tool must not import it (layering). `execute()` returns **`{ candidates, usage }`** (usage already read from the response); `background/index.ts` records the **success** trace at the call site — co-located with the error traces it already records. Behavior-neutral: same trace data written. (Rejected: injecting a `recordTrace` callback into the Tool contract; relocating the trace store to `src/shared/`.)
- **D-08:** The content-side **`LLMRederiver`** (`src/content/detector/rederiver.ts`) **stays in place** as the content-script relay (it only sends the `REDERIVE_SELECTOR` message). The currently-**duplicated** `RederiveCandidate` type (defined in BOTH `rederiver.ts` line 17 AND `background/index.ts` line 148) should be **deduped** — both call sites import it from the new `dom-selector-rederive` tool as the single definition.

### Claude's Discretion
- Exact `Tool<I, O>` interface placement within `src/shared/skills/types.ts` (or a sibling `tools` types module) and whether `Tool` joins/abstains from the `AnySkill` union (it is intentionally distinct — likely NOT in `AnySkill`).
- The `tools` bucket shape in `scripts/skill-order.json`, the codegen extension to validate `metadata.kind: tool` and emit the generated tool registry, the generated module's name/path under `src/shared/`, and the stale-check wiring (`check-skill-registry` or a sibling `check-tool-registry`).
- The exact folder name for the rederive tool (`dom-selector-rederive` per SC#3) and the prefix convention update in `AUTHORING.md` (a `tool` row alongside `detect-` / `exclude-` / `dom-selector-`).
- The precise `ToolRegistry` API surface (`get(name)`, registration/seed), so long as the consumer call site reads `toolRegistry.get('dom-selector-rederive').execute(input)`.
- Whether the `kind` discriminant set extension (`'tool'`) in `types.ts` is shared by the codegen validator + the kind-drift test (it must be).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — **TOOL-01** (`Tool<I, O>` contract distinct from host-agnostic skills; host I/O permitted; `skills/library/` tools folder convention, SKILL.md `metadata.kind: tool`) and **TOOL-02** (migrate `rederiveSelector` + helpers as `dom-selector-rederive`; fix `dom-selector-registry` kind mislabel; audit + reclassify skills that are really tools; zero behavior change).
- `.planning/ROADMAP.md` §"Phase 32: Tool Abstraction Layer" — goal + 6 success criteria (Tool contract; tools folder convention; rederive migration byte-identical; CR-01 kind fix; skill-vs-tool audit + AUTHORING.md rule; zero-behavior-change with stale-check + golden snapshot + exclusion parity).

### Code to refactor / migrate
- `src/background/index.ts` — `REDERIVE_SYSTEM_PROMPT` (L114), `RederiveCandidate` (L148), `RederiveModelOutput` (L152), `isRederiveModelOutput` (L161), `rederiveSelector` (L258–335), rate-limit helpers `checkRateLimit`/`acquireRateLimitLatch`/`releaseRateLimitLatch` (L180–249), and the `REDERIVE_SELECTOR` handler (L362–412). Move per D-06; the rate-limit + handler + `recordTrace` calls STAY here (D-06/D-07).
- `src/content/detector/rederiver.ts` — content-side `LLMRederiver` (stays in place, D-08); has the DUPLICATE `RederiveCandidate` type (L17) to dedup against the tool.
- `src/shared/skills/types.ts` — skill type contracts + `kind` discriminants. Add the `Tool<I, O>` contract here (or sibling) and extend the `kind` set with `'tool'` (D-01/D-04).
- `src/skills/library/dom-selector-registry/SKILL.md` — correct `metadata.kind: exclusion` → `tool` (CR-01, SC#4). NOTE: its body text already says "NOT wired into any skill array" — keep that accurate.
- `src/skills/library/AUTHORING.md` — add the skill-vs-tool decision rule (D-01/D-02) + a `tool` row in the type-prefix table + the tool authoring workflow.

### Patterns to mirror (codegen / registry)
- `src/content/skill-registry.ts` + `src/content/generated-skill-registry.ts` — the Phase 31 codegen + committed-generated-module + static-import + sync-getter pattern the `ToolRegistry` mirrors (D-05).
- `scripts/generate-skill-registry.ts` + `scripts/skill-order.json` — the codegen script + ordered-list config to extend with a `tools` bucket (D-05).
- `src/content/selector-registry.ts` — the single-writer / seed-with-code-fallback pattern; CLAUDE.md constraint #1 (only this module writes selector strings to storage) — the `dom-selector-registry` re-export must not violate it.

### Zero-behavior-change guards (do not break)
- `src/skills/library/detect-heuristic/` golden-score snapshot test (Phase 29, byte-identical) + exclusion parity fixtures — the operational guard for SC#6.
- `npm run check-skill-registry` stale-check — must stay green; extend coverage to the generated tool registry.
- `CLAUDE.md` — constraint #1 (selector single-writer), #3 (no programmatic block clicks), #4 (stateless service worker — all state to `chrome.storage` immediately; relevant to the rate-limit machinery that STAYS in background).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SkillRegistry codegen stack** (`scripts/generate-skill-registry.ts`, `scripts/skill-order.json`, `src/content/generated-skill-registry.ts`, the stale-check + order-pinning/kind-drift tests) — the `ToolRegistry` + `generated-tool-registry.ts` directly mirror this; it's an extension of proven machinery, not new invention.
- **`rederiveSelector` is already a self-contained async function** (read key → fetch → parse → validate → return candidates) — moving its body into `execute()` is relocation + a small return-shape change (`{ candidates, usage }`), not a rewrite.
- **`fetchComments` injection** (runner injects the DOM-read into `detect-generic-comments`) is a working example of the skill/tool seam D-02 describes — cite it in the AUTHORING.md rule as the canonical "composite already decomposed" case.
- `~/.claude/skills/graphify/SKILL.md` — concrete on-machine example of the SKILL.md frontmatter shape the tool manifest follows.

### Established Patterns
- Static-imports-only / no dynamic `import` / no `import.meta.glob` — MV3-CSP-safe (Phase 30 D-07). The generated tool registry MUST keep this.
- Committed generated module as single registration point + CI stale-check (Phase 31 D-05) — replicate for tools.
- Stateless service worker: all rate-limit state read/written to `chrome.storage.local` every invocation (CLAUDE.md #4) — the rate-limit machinery that stays in background must keep this.
- Type-prefixed library folder names (`detect-` / `exclude-` / `dom-selector-`) with UNPREFIXED export const + `id` (Phase 31 / AUTHORING.md) — add a `tool` prefix convention.

### Integration Points
- `src/background/index.ts` `REDERIVE_SELECTOR` handler — the one consumer that switches from a direct `rederiveSelector(...)` call to `toolRegistry.get('dom-selector-rederive').execute({ target, domSkeleton })`, then records the success trace from the returned `usage` (D-06/D-07).
- `src/shared/` — new host-neutral home for `ToolRegistry` + the `Tool<I, O>` contract; importable by both background and content.
- Build pipeline (Vite `root: 'src'`, `vite-plugin-web-extension`) — codegen runs as a prebuild step emitting a committed module; tool impl scripts must be inside the static-import graph; tool `SKILL.md` files must not need to ship in the production bundle.

</code_context>

<specifics>
## Specific Ideas

- **The I/O boundary is the rule, stated honestly:** "anything that does I/O is a tool." The composite detectors aren't exceptions to the rule — they're composites whose I/O portion *is* a tool and whose scoring portion *is* a skill. This phase documents that seam without paying the refactor cost yet.
- **One tool, fully end-to-end** (`dom-selector-rederive`) is the tracer that proves the whole path: folder + SKILL.md (`kind: tool`) → codegen → committed generated tool registry → `ToolRegistry.get(...).execute(...)` → background call site byte-identical. The rest of the audit is documentation.
- **`ToolRegistry` is first-class on purpose** — the user wants the Tool abstraction to have a real runtime registry + consumer, not just a folder convention, even though only one tool exists today.
- **Smallest safe seam for execute():** the LLM call only. Rate-limiting, single-flight latch, and tracing are host-side orchestration concerns that stay in background — keeping the tool host-light and the migration byte-identical.

</specifics>

<deferred>
## Deferred Ideas

- **Decompose the composite detectors** — extract `detect-llm`'s network call into an LLM-call/score-post tool and formalize `fetchComments` as a named comment-fetch tool, rewiring background + the signal runner. Documented as the audit's named follow-up (D-03); deferred to keep this phase zero-behavior-change.
- **Rate-limit policy as a tool/policy object** — the cool-off + daily-cap + single-flight latch could itself become a reusable host-side policy/tool later; stays inline in background this phase (D-06).
- **Runtime/storage-hydration of LLM-authored tools** — `ToolRegistry` is code-seeded only this phase; the `chrome.storage` hydration + `migrate()` + declarative-merge parity with SkillRegistry is deferred until there's an LLM-tool-authoring consumer (D-05).

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 32-tool-abstraction-layer*
*Context gathered: 2026-06-16*
