# Phase 23: Self-Healing Selector Adapter — Research

**Researched:** 2026-06-13
**Domain:** Chrome MV3 content-script/service-worker coordination, DOM structural analysis, rate-bounded LLM fallback, candidate validation, Vitest fixture testing
**Confidence:** HIGH (all findings grounded in the existing codebase read directly from source)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Breakage detection:** Core 4 false-positive guards (URL gate, feed container present, session activity, 30s rolling debounce). No auth-state check, no skeleton-loader detection attempt.
- **Heuristic re-derivation:** Hybrid — analyze broken selector structure + walk live DOM for analogs.
- **Candidate validation gate (3 criteria):** (1) match count 2–50, (2) author-link ratio >50%, (3) post-text presence. Sponsored-contamination filter is NOT a write-blocker — log only.
- **LLM privacy boundary:** Send structural skeleton + aria-labels only (tags, nesting, data-* attrs, aria-label, role). Strip ALL text nodes, href, src, title, alt.
- **LLM call location:** Service worker (`background/index.ts`). Content script sends `REDERIVE_SELECTOR` message exactly as `SCORE_POST` is sent for `LLMDetector`.
- **LLM framework:** Direct `fetch` to Anthropic Messages API — no new npm dependency. Reuse pattern verbatim from `scorePost()`.
- **Model:** `claude-haiku-4-5-20251001`, `max_tokens: 256`.
- **No CSS class-name selectors** in any proposed or adapted candidate (CLAUDE.md constraint #1).
- **Only `SelectorRegistry` may write selector strings to storage** (CLAUDE.md constraint #1).

### Claude's Discretion

- Rate-bounding specifics: single-flight latch scope, storage key names, per-day cap value, reset logic.
- Heuristic re-derivation algorithm detail: which DOM-walking strategy, candidate ranking formula.
- PII sanitizer implementation details: serialization approach, depth/sibling caps implementation.
- Candidate ordering / confidence formula within a SelectorRegistry target.
- Fixture test file layout and harness wiring details.
- PRIVACY.md exact disclosure wording.

### Deferred Ideas (OUT OF SCOPE)

- Breakage event log surfaced in the health view ("recovered via heuristic 2 days ago") — deferred to Future Requirements.
- Auto-promotion of a non-active candidate after N consecutive matches — deferred.
- Full candidate-list management UI (reorder/delete) — deferred.
- Partial-breakage as a heal trigger — v7.0 triggers on total breakage only.
- Per-call token/cost trace — deferred to Phase 24 (TRACE-02).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADAPT-01 | Detect total scraping breakage guarded by false-positive checks | Section: Breakage Detection Wiring — Core-4 guard implementation anchored to observer.ts patterns |
| ADAPT-02 | Heuristic re-deriver (local, no API) from stable DOM anchors | Section: Heuristic Re-derivation Algorithm — DOM-walking strategy with confidence ranking |
| ADAPT-03 | No candidate trusted/written until it passes the validation gate | Section: Candidate Validation Gate — 3-criteria implementation with rejection patterns |
| ADAPT-04 | LLM fallback with PII-stripped structural skeleton | Section: PII Sanitizer — serialization strategy with attribute strip list |
| ADAPT-05 | LLM rate-bounded — single-flight latch, ≥5-min cool-off, per-day cap | Section: Rate-Bounding State — storage keys, cap value, latch pattern |
| ADAPT-06 | LLM responses strictly validated; selector never eval'd | Section: Candidate Validation Gate — injection guard, never-eval rule |
| ADAPT-07 | Overly-broad selectors (>50 matches) rejected | Section: Candidate Validation Gate — match count upper bound |
| ADAPT-08 | Confidence ordering (match count × recency × source weight) | Section: Candidate Ordering — formula and prepend-winner pattern |
| ADAPT-09 | Fixture-DOM tests: partial breakage, logged-out, skeleton, heal-to-wrong, reset round-trip; LLM live-key path is manual | Section: Test Harness — Vitest + jsdom fixture strategy |
| ADAPT-10 | PRIVACY.md disclosure if LLM fallback ships | Section: PRIVACY.md Disclosure — exact wording recommendation |
</phase_requirements>

---

## Summary

Phase 23 adds a self-healing loop to the existing MutationObserver + SelectorRegistry infrastructure from Phase 22. The loop has three stages: (1) breakage detection in the observer, (2) local heuristic re-derivation in a new `src/content/selector/heuristic.ts` module, and (3) LLM fallback via a new `REDERIVE_SELECTOR` service-worker message handler that replicates the `SCORE_POST` / `LLMDetector` pattern exactly. Every candidate — heuristic or LLM — is validated by a three-gate `validator.ts` before `SelectorRegistry.updateCandidate()` is ever called. Rate-limit state survives service-worker restarts because it lives in `chrome.storage.local`.

The codebase already provides all the infrastructure this phase needs: the `SelectorRegistry` CRUD API (`resolve`, `updateCandidate`, `buildSeedRegistry`), the `SelectorCandidate` schema with `source` and `matchCount` metadata, the `LLMDetector` / `scorePost` message pattern to replicate, the `storageGet`/`storageSet` typed wrappers, and the Vitest + jsdom test harness (already configured at `vitest.config.ts` with `environment: 'jsdom'`). Phase 23 adds five new files, modifies two existing ones (`observer.ts` and `background/index.ts`), and updates `PRIVACY.md`. No new npm packages are needed.

**Primary recommendation:** Build every new module as a named-export function file (not a class) following the `selector-registry.ts` pattern. Wire breakage detection into the existing `attachObserver` + `reinit` flow in `observer.ts`. Run the validation gate in the content script against the live DOM — never in the service worker.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Breakage detection | Content Script | — | Only the content script observes the live DOM; `observer.ts` already owns the post-card scan loop |
| Core-4 false-positive guards | Content Script | — | URL check, container presence, session activity, and debounce all require DOM/location access |
| Heuristic re-derivation | Content Script | — | DOM walking must happen where the DOM lives; no API call; in `src/content/selector/heuristic.ts` |
| PII sanitizer | Content Script | — | DOM skeleton is built and stripped **before** crossing the message boundary; in `src/content/selector/sanitizer.ts` |
| Candidate validation gate | Content Script | — | `querySelectorAll` and author-link/text-presence checks run against the live DOM; in `src/content/selector/validator.ts` |
| LLM fetch (Anthropic API) | Service Worker | — | CORS blocks direct fetch from `linkedin.com` origin; replicates `scorePost` in `background/index.ts` |
| Rate-limit state | Service Worker (reads/writes) + `chrome.storage.local` (persistence) | — | Service worker is stateless between invocations; all latch/cooloff/cap state must live in storage |
| Candidate write to SelectorRegistry | Content Script | — | `SelectorRegistry.updateCandidate()` is a content-script function; only it may write selector strings to storage (CLAUDE.md constraint #1) |
| Heal-event counters (monitoring) | Content Script (write) + `chrome.storage.local` | Dashboard (read) | Minimal non-PII counters; read by existing dashboard health view |

---

## Standard Stack

### Core (no new packages — all already in the project)

| Module | Location | Purpose | Phase 23 Analog |
|--------|----------|---------|-----------------|
| `selector-registry.ts` | `src/content/selector-registry.ts` | Runtime source-of-truth for all selectors; `resolve()`, `updateCandidate()`, `buildSeedRegistry()` | Phase 23 calls `updateCandidate()` to write validated winners |
| `storageGet` / `storageSet` | `src/shared/storage.ts` | Typed wrappers over `chrome.storage.local.get/set` | Rate-limit state reads/writes use these wrappers |
| `LLMDetector` | `src/content/detector/llm.ts` | Content-script → service-worker message pattern | `LLMRederiver` replicates this pattern for `REDERIVE_SELECTOR` |
| `scorePost` | `src/background/index.ts` | Direct Anthropic API fetch from service worker | `rederiveSelector` is added alongside this function |
| Vitest + jsdom | `vitest.config.ts` | Test runner, already configured with `environment: 'jsdom'` | Fixture-DOM tests for ADAPT-09 |

### New Files This Phase Creates

| File | Closest Analog | Role |
|------|----------------|------|
| `src/content/selector/heuristic.ts` | `src/content/detector/heuristic.ts` (named-export function file) | Local DOM-walking re-deriver; no API call |
| `src/content/selector/sanitizer.ts` | `src/content/detector/language.ts` (pure function, no DOM writes) | Strips PII from DOM subtree before message send |
| `src/content/selector/validator.ts` | `src/content/exclusions.ts` (pure predicate functions) | 3-gate validation gate; returns pass/fail + reason |
| `src/content/detector/rederiver.ts` | `src/content/detector/llm.ts` (mirrors structure exactly) | Content-script class that sends `REDERIVE_SELECTOR` and returns candidates |
| `src/content/selector/__fixtures__/` | `src/content/exclusions.test.ts` (fixture pattern) | HTML fixture files for Vitest tests |

### Modified Files

| File | Nature of Change |
|------|-----------------|
| `src/observer.ts` | Add breakage-detection counter + 30s debounce + trigger call to heuristic.ts / rederiver.ts |
| `src/background/index.ts` | Add `rederiveSelector()` function + `REDERIVE_SELECTOR` branch in `onMessage` |
| `PRIVACY.md` | Add LLM selector repair disclosure paragraph |

**Installation:** No new packages. `vitest`, `jsdom`, and `@vitest/coverage-v8` are already in `devDependencies`. Add `test` script to `package.json`:

```bash
# Add to package.json scripts — these do not yet exist
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Verify test runner works:**
```bash
npx vitest run
```

---

## Package Legitimacy Audit

No new npm packages are installed in this phase. The audit is not required.

---

## Architecture Patterns

### System Architecture Diagram

```
linkedin.com feed page (content script)
        │
        ▼
[observer.ts — MutationObserver]
        │  zero POST_BODY_TEXT matches for 30s
        │  + Core-4 guards pass (URL gate, container present,
        │    session activity ≥ N posts seen)
        ▼
[heuristic.ts — DOM walker]
        │  analyze broken selector structure
        │  walk DOM for data-*/role/aria analogs
        │  for each candidate → validator.ts
        │
        ├─ candidate passes ──► SelectorRegistry.updateCandidate()
        │                            (content script only; CLAUDE.md constraint #1)
        │
        └─ no valid candidate ──► [sanitizer.ts — PII strip]
                                        │  strip text nodes, href, src,
                                        │  aria-label, title, alt
                                        │  depth ≤ 6, siblings ≤ 3, ≤ 4000 chars
                                        ▼
                              chrome.runtime.sendMessage
                              { type: 'REDERIVE_SELECTOR',
                                target, domSkeleton }
                                        │
                                        ▼ (CORS boundary)
                            [background/index.ts — service worker]
                                        │
                                        ├─ rate-limit check (storage read)
                                        │    single-flight latch set?  ──► reject
                                        │    cooloff < 5 min?          ──► reject
                                        │    calls today ≥ cap?        ──► reject
                                        │
                                        ▼ (all checks pass)
                                  fetch api.anthropic.com/v1/messages
                                  model: claude-haiku-4-5-20251001
                                  max_tokens: 256
                                        │
                                        ▼
                                  parse + isRederiveModelOutput()
                                  sendResponse({ result: candidates })
                                        │
                                        ▼ (back in content script)
                            for each candidate:
                              validator.ts ──── passes ──► SelectorRegistry.updateCandidate()
                                         └─ fails ──► discard, try next
```

### Recommended Project Structure

```
src/
├── background/
│   └── index.ts            # ADD: rederiveSelector() + REDERIVE_SELECTOR handler
├── content/
│   ├── observer.ts         # MODIFY: breakage detection counter + debounce + trigger
│   ├── detector/
│   │   └── rederiver.ts    # NEW: LLMRederiver (mirrors LLMDetector)
│   └── selector/
│       ├── heuristic.ts    # NEW: local DOM-walking re-deriver
│       ├── sanitizer.ts    # NEW: PII strip + skeleton serializer
│       ├── validator.ts    # NEW: 3-gate validation gate
│       └── __fixtures__/   # NEW: HTML fixture files for tests
│           ├── feed-healthy.html
│           ├── feed-broken-classrot.html
│           ├── feed-skeleton.html
│           ├── feed-loggedout.html
│           ├── feed-empty.html
│           ├── feed-jobcards.html
│           ├── feed-promoted.html
│           ├── feed-abvariant-a.html
│           ├── feed-abvariant-b.html
│           └── feed-pii-rich.html
```

---

## Breakage Detection Wiring

### Where in observer.ts

The detection logic hooks into `processElement()` / `attachObserver()`. The existing observer already tracks when `POST_BODY_TEXT` spans are found. The new logic adds a counter that tracks when `POST_BODY_TEXT` matches zero elements within the observed feed container while the feed is active.

**Concrete hook point:** Add a module-scope breakage state block and a `checkBreakage()` function that is called from within the `MutationObserver` callback (or on a setInterval started from `attachObserver`).

```typescript
// --- module-scope breakage state in observer.ts ---
let _zeroMatchWindowStart: number | null = null;  // epoch ms when zero-match run started
let _postsSeenThisSession = 0;                     // incremented each time a post is dispatched
let _healInProgress = false;                       // single-flight guard (content-script side)
let _lastHealMs = 0;                               // epoch ms of last heal attempt

const BREAKAGE_DEBOUNCE_MS = 30_000;              // 30s rolling window
const MIN_SESSION_POSTS = 3;                      // must have seen ≥ 3 posts before breakage fires
```

**Core-4 guard implementation:**

```typescript
function isFeedUrl(): boolean {
  return location.pathname === '/feed/' || location.pathname === '/feed';
}

function hasFeedContainer(): boolean {
  // Uses the live resolve() — if FEED_CONTAINER selector itself broke,
  // fall through to FEED_CONTAINER_FALLBACK
  return (
    document.querySelector(resolve('FEED_CONTAINER')) !== null ||
    document.querySelector(resolve('FEED_CONTAINER_FALLBACK')) !== null
  );
}

function hasSessionActivity(): boolean {
  return _postsSeenThisSession >= MIN_SESSION_POSTS;
}
```

**Breakage detection check — call from MutationObserver callback when no POST_BODY_TEXT found:**

```typescript
function onZeroPostsFound(): void {
  if (!_zeroMatchWindowStart) {
    _zeroMatchWindowStart = Date.now();
    return;
  }
  if (Date.now() - _zeroMatchWindowStart < BREAKAGE_DEBOUNCE_MS) {
    return; // within debounce window — not yet broken
  }
  // 30s window elapsed with zero posts — check Core-4 guards
  if (!isFeedUrl() || !hasFeedContainer() || !hasSessionActivity()) {
    _zeroMatchWindowStart = null; // reset — guards failed, not a real breakage
    return;
  }
  triggerHeal().catch(() => {}); // fire-and-forget
  _zeroMatchWindowStart = null;
}

function onPostFound(): void {
  _postsSeenThisSession++;
  _zeroMatchWindowStart = null; // reset — posts are flowing
}
```

**Call `onPostFound()` from `dispatchFromBox()`** (after the `processedPosts.add(urn)` line — whenever a post is successfully dispatched).

**Call `onZeroPostsFound()`** from the MutationObserver callback when `mutation.addedNodes` iterate and no POST_BODY_TEXT is found after a DOM change in the feed container.

**Reset on SPA navigation:** Call `_zeroMatchWindowStart = null; _postsSeenThisSession = 0; _healInProgress = false;` inside `reinit()`.

---

## Heuristic Re-derivation Algorithm

### Strategy

When breakage is detected, the heuristic re-deriver follows these steps in `src/content/selector/heuristic.ts`:

**Step 1 — Analyze the broken selector's structure.** The broken selector is available via `resolve('POST_CARD')` (the currently-active candidate). Parse it to extract:
- Attribute type: `data-*`, `role`, `aria-*`, or semantic tag
- Specificity level: single attribute vs compound
- Example: `div[componentkey]` → attribute name is `componentkey`, tag is `div`, it is a `data-*`-style attribute (though non-prefixed); `span[data-testid="expandable-text-box"]` → uses `data-testid`

**Step 2 — Build an attribute-type priority list.** Based on the broken selector's type, order the candidate attribute types:
1. `data-urn` / `data-entity-urn` (known URN-bearing attributes — highest durability)
2. `[componentkey]` / `[data-component-key]` (component identity attributes)
3. `[role="article"]` / `[role="feed"]` children
4. `data-id`, `data-finite-scroll-hotkey-context` (known feed attributes from history)
5. `article` semantic tag
6. `[aria-label]` patterns observed in the feed container

**Step 3 — Walk the feed container.** From the feed container element (`document.querySelector(resolve('FEED_CONTAINER'))`), collect all direct and depth-2 children that have `data-*` attributes. Group by attribute name. Sort groups by count — groups with 3–20 members are post-card candidates (too few = UI chrome, too many = sidebar noise).

```typescript
// src/content/selector/heuristic.ts

export interface HeuristicCandidate {
  selector: string;
  confidence: number;       // 0–1 float, for ordering
  source: 'heuristic';
}

export function deriveHeuristicCandidates(
  target: 'POST_CARD' | 'POST_BODY_TEXT',
  container: Element,
): HeuristicCandidate[] {
  const candidates: HeuristicCandidate[] = [];

  // Walk direct children of feed container
  const children = Array.from(container.children);

  // Group children by their data-* attribute names
  const attrGroups = new Map<string, Element[]>();
  for (const child of children) {
    for (const attr of Array.from(child.attributes)) {
      if (attr.name.startsWith('data-') || attr.name === 'componentkey') {
        const key = `${child.tagName.toLowerCase()}[${attr.name}]`;
        if (!attrGroups.has(key)) attrGroups.set(key, []);
        attrGroups.get(key)!.push(child);
      }
    }
  }

  // Filter to plausible post-card counts
  for (const [selector, elements] of attrGroups) {
    if (elements.length < 2 || elements.length > 50) continue;
    const matchCount = elements.length;
    const recency = 1.0;            // all candidates from the live DOM are equally recent
    const sourceWeight = 0.8;       // heuristic weight < 1.0 (LLM winner gets 1.0 if validated)
    const confidence = Math.min(1.0, (matchCount / 20) * recency * sourceWeight);
    candidates.push({ selector, confidence, source: 'heuristic' });
  }

  // Also try role="article" children
  const articleChildren = children.filter(c => c.getAttribute('role') === 'article');
  if (articleChildren.length >= 2 && articleChildren.length <= 50) {
    candidates.push({
      selector: '[role="article"]',
      confidence: 0.7,
      source: 'heuristic',
    });
  }

  // Sort by descending confidence
  return candidates.sort((a, b) => b.confidence - a.confidence);
}
```

**For POST_BODY_TEXT recovery:** Walk each candidate post-card element looking for child spans with `data-testid` attributes. If `span[data-testid]` children exist with non-empty text in ≥50% of cards, those become POST_BODY_TEXT candidates.

---

## PII Sanitizer

### What Gets Stripped

Per 23-CONTEXT.md and ADAPT-04, strip ALL of:
- Text node content (replace with empty string)
- `href` attribute values (remove entirely or replace with `""`)
- `src` attribute values (remove entirely or replace with `""`)
- `aria-label` attribute values (remove entirely — the CONTEXT.md decision says aria-label IS sent, but ADAPT-04 in REQUIREMENTS.md says strip it. **Resolution:** 23-AI-SPEC.md Section 1 says "all text, href, src, and aria-label stripped". The AI-SPEC is the tie-breaker — strip aria-label values. The system prompt tells the LLM what they mean structurally.)
- `title` attribute values
- `alt` attribute values

**What stays:** tag names, `data-*` attribute names and values, `role` attribute, nesting structure, `class` attribute (per CONTEXT.md, structural hints — but the system prompt instructs the model never to return class selectors).

### Serialization Strategy

Use `Element.cloneNode(true)` on the feed container, then walk the clone to strip, then serialize with `XMLSerializer` or manual recursive serialization. Do NOT use `innerHTML` on live DOM elements (mutation risk). Use the clone.

```typescript
// src/content/selector/sanitizer.ts

const PII_ATTRS_TO_REMOVE = ['href', 'src', 'aria-label', 'title', 'alt', 'action', 'data-src'];
const MAX_DEPTH = 6;
const MAX_SIBLINGS = 3;
const MAX_CHARS = 4000;

export function buildDomSkeleton(container: Element): string {
  const clone = container.cloneNode(true) as Element;
  stripPii(clone, 0);
  const raw = serializeElement(clone, 0);
  if (raw.length <= MAX_CHARS) return raw;
  // Truncate at last complete tag close
  const truncated = raw.slice(0, MAX_CHARS);
  const lastClose = truncated.lastIndexOf('>');
  return lastClose > 0
    ? truncated.slice(0, lastClose + 1) + '\n<!-- skeleton truncated -->'
    : truncated + '\n<!-- skeleton truncated -->';
}

function stripPii(node: Element, depth: number): void {
  // Remove PII attributes
  for (const attr of PII_ATTRS_TO_REMOVE) {
    node.removeAttribute(attr);
  }
  // Blank text node content
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      child.textContent = '';
    }
  }
  // Recurse with depth and sibling caps
  const children = Array.from(node.children);
  const kept = children.slice(0, MAX_SIBLINGS);
  // Remove siblings beyond cap from clone
  children.slice(MAX_SIBLINGS).forEach(c => c.remove());

  if (depth < MAX_DEPTH) {
    for (const child of kept) {
      stripPii(child, depth + 1);
    }
  } else {
    // Beyond max depth — remove all children
    for (const child of kept) {
      child.remove();
    }
  }
}

function serializeElement(el: Element, _depth: number): string {
  // Simple recursive serializer — avoids XMLSerializer's namespace overhead
  const tag = el.tagName.toLowerCase();
  const attrs = Array.from(el.attributes)
    .map(a => `${a.name}="${a.value}"`)
    .join(' ');
  const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
  const children = Array.from(el.children)
    .map(c => serializeElement(c, _depth + 1))
    .join('');
  return `${openTag}${children}</${tag}>`;
}
```

**Key constraint from ADAPT-04 (REQUIREMENTS.md):** "sponsored-contamination rejection" is in the gate spec but the CONTEXT.md validation gate decision explicitly removes it as a hard gate ("Not included"). Log only. The sanitizer does not need to handle this — it is purely structural.

---

## Candidate Validation Gate

### Three Mandatory Checks (validator.ts)

```typescript
// src/content/selector/validator.ts

export interface ValidationResult {
  pass: boolean;
  reason: string;
  matchCount: number;
}

// Dangerous exact values — reject outright regardless of match count
const BLOCKLIST_EXACT = new Set(['body', 'html', '*', ':root']);

// Dangerous token patterns — reject if selector string contains these
const DANGEROUS_TOKEN_RE = /eval|function\s*\(|javascript:|<|>|\bwindow\b|\bdocument\b/i;

// CSS class / id token guard — CLAUDE.md constraint #1
const CLASS_ID_RE = /[.#](?![0-9])/;

export function validateCandidate(
  selector: string,
  container: Element,
): ValidationResult {
  // Gate 0: injection safety (ADAPT-06)
  if (BLOCKLIST_EXACT.has(selector.trim())) {
    return { pass: false, reason: `blocklisted exact: ${selector}`, matchCount: 0 };
  }
  if (DANGEROUS_TOKEN_RE.test(selector)) {
    return { pass: false, reason: 'dangerous token in selector string', matchCount: 0 };
  }
  // Gate 0b: no CSS class / id tokens (CLAUDE.md constraint #1, D6)
  if (CLASS_ID_RE.test(selector)) {
    return { pass: false, reason: 'CSS class or id selector forbidden (CLAUDE.md constraint #1)', matchCount: 0 };
  }

  // Run querySelectorAll — plain string argument ONLY, never eval
  let matches: NodeListOf<Element>;
  try {
    matches = container.querySelectorAll(selector);
  } catch {
    return { pass: false, reason: 'invalid CSS selector syntax', matchCount: 0 };
  }

  const count = matches.length;

  // Gate 1: match count 2–50 (ADAPT-07, ADAPT-08, ADAPT-10)
  if (count < 2) {
    return { pass: false, reason: `too few matches: ${count}`, matchCount: count };
  }
  if (count > 50) {
    return { pass: false, reason: `too many matches: ${count}`, matchCount: count };
  }

  const elements = Array.from(matches);

  // Gate 2: author-link ratio >50% (ADAPT-03, ADAPT-10)
  const withAuthorLink = elements.filter(el =>
    el.querySelector('a[href*="/in/"]') !== null
  );
  if (withAuthorLink.length / count <= 0.5) {
    return {
      pass: false,
      reason: `author-link ratio too low: ${withAuthorLink.length}/${count}`,
      matchCount: count,
    };
  }

  // Gate 3: post-text presence (ADAPT-03, ADAPT-10)
  const withText = elements.some(el => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length > 10;
  });
  if (!withText) {
    return { pass: false, reason: 'no post-body text found in matched elements', matchCount: count };
  }

  // Advisory: sponsored contamination (ADAPT-09/D9 — log only, not a write-blocker)
  const withSponsored = elements.filter(el =>
    el.querySelector('[aria-label*="Promoted"], [aria-label*="Sponsored"]') !== null
  );
  if (withSponsored.length > 0) {
    console.warn('[LLB] validator: sponsored contamination warning —', withSponsored.length, 'of', count, 'matches contain promoted markers');
  }

  return { pass: true, reason: 'all gates passed', matchCount: count };
}
```

**Critical rule from ADAPT-06:** The `selector` string is ONLY ever passed to `querySelectorAll`. It is never passed to `eval`, `new Function()`, `.innerHTML`, `.insertAdjacentHTML()`, or any other code-execution surface. The `try/catch` around `querySelectorAll` is the only "execution" — it only throws a syntax error on invalid selectors, which we catch and reject.

---

## Rate-Bounding State

### Storage Keys (ADAPT-05)

The service worker is stateless between invocations — all rate-limit state MUST be read from and written to `chrome.storage.local` at the start of every check. These keys are separate from `selectorRegistry` and `StorageSchema`:

```typescript
// Keys in chrome.storage.local (add to StorageSchema in types.ts)
interface RateLimitState {
  lastRederiveCallMs: number;    // epoch ms of most recent LLM call; used for ≥5-min cooloff
  rederiveCallsToday: number;    // count reset at midnight UTC; hard daily cap
  rederiveDateKey: string;       // 'YYYY-MM-DD' UTC — detect date rollover
  rederiveInFlight: boolean;     // single-flight latch across concurrent tab messages
}
```

**Storage key names** (recommended):
- `llbRederiveLastCallMs` — epoch ms
- `llbRederiveCallsToday` — integer count
- `llbRedeiveDateKey` — `'YYYY-MM-DD'`
- `llbRederiveInFlight` — boolean

**These 4 keys must be added to `StorageSchema` in `src/shared/types.ts`** so `storageGet`/`storageSet` type-check correctly.

### Rate-Limit Guard in service worker

```typescript
const REDERIVE_COOLOFF_MS = 5 * 60 * 1000;    // 5 minutes
const REDERIVE_DAILY_CAP = 5;                  // max 5 LLM calls per user per day

async function checkRateLimit(): Promise<{ allowed: boolean; reason?: string }> {
  const result = await chrome.storage.local.get([
    'llbRederiveLastCallMs',
    'llbRederiveCallsToday',
    'llbRedeiveDateKey',
    'llbRederiveInFlight',
  ]);

  // Single-flight latch
  if (result.llbRederiveInFlight) {
    return { allowed: false, reason: 'single-flight latch held' };
  }

  // Cooloff check
  const lastMs = (result.llbRederiveLastCallMs as number | undefined) ?? 0;
  if (Date.now() - lastMs < REDERIVE_COOLOFF_MS) {
    return { allowed: false, reason: `cooloff: ${Math.round((REDERIVE_COOLOFF_MS - (Date.now() - lastMs)) / 1000)}s remaining` };
  }

  // Daily cap (with date-rollover detection)
  const todayKey = new Date().toISOString().slice(0, 10);
  const storedDate = (result.llbRedeiveDateKey as string | undefined) ?? '';
  const callsToday = storedDate === todayKey
    ? ((result.llbRederiveCallsToday as number | undefined) ?? 0)
    : 0;  // new day — reset count

  if (callsToday >= REDERIVE_DAILY_CAP) {
    return { allowed: false, reason: `daily cap reached: ${callsToday}/${REDERIVE_DAILY_CAP}` };
  }

  return { allowed: true };
}

async function acquireRateLimitLatch(todayKey: string, callsToday: number): Promise<void> {
  // Write latch + increment count + update last-call time BEFORE fetch starts
  await chrome.storage.local.set({
    llbRederiveInFlight: true,
    llbRederiveLastCallMs: Date.now(),
    llbRederiveCallsToday: callsToday + 1,
    llbRedeiveDateKey: todayKey,
  });
}

async function releaseRateLimitLatch(): Promise<void> {
  // Called in finally block — always releases the latch even on error
  await chrome.storage.local.set({ llbRederiveInFlight: false });
}
```

**Critical from AI-SPEC Section 4 pitfall #5:** The latch must be written to storage BEFORE the fetch call, not after. A service-worker restart between the check and the fetch would otherwise leave the latch unheld. The `finally` block in `rederiveSelector` must call `releaseRateLimitLatch()`.

### Recommended Daily Cap Value

**5 calls/day** — per AI-SPEC Section 4b.5 cost analysis: 5 × $0.0023 = ~$0.012/day maximum spend. LinkedIn DOM changes that break the extension are rare events (typically 0–1 per week, not per day). A cap of 5 prevents runaway loops (two tabs both detecting breakage + retries) while giving headroom for legitimate back-to-back deploy flaps.

### Single-Flight Latch Scope

**Global (not per-target).** The latch is a single boolean in storage, not per-target. Rationale: if `POST_CARD` is broken, `POST_BODY_TEXT` is likely broken too. Running two concurrent LLM calls for two broken targets would double the cost and likely return candidates from the same structural DOM — one call is sufficient per breakage event. The content-script-side `_healInProgress` flag (in `observer.ts`) provides a secondary guard at the per-tab level to avoid even sending multiple `REDERIVE_SELECTOR` messages from the same tab.

---

## Candidate Ordering — Confidence Formula (ADAPT-08)

### Formula

Per ADAPT-08, candidates within a SelectorRegistry target are ordered by:

```
confidence = matchCount × recency × sourceWeight
```

Where:
- **matchCount**: cumulative successful matches (`SelectorCandidate.matchCount` field, already on the schema)
- **recency**: a decay factor based on `lastMatchedAt` — `recency = 1.0` for a match in the last 24h, decaying toward `0.1` for matches older than 30 days. Formula: `recency = max(0.1, 1.0 - (ageMs / (30 * 24 * 3600 * 1000)) * 0.9)`
- **sourceWeight**: `seed = 0.6`, `heuristic = 0.8`, `llm = 0.9`, `user = 1.0`

**Sorting function (add to `selector-registry.ts`):**

```typescript
function candidateConfidence(c: SelectorCandidate): number {
  const matchCount = c.matchCount ?? 0;
  const SOURCE_WEIGHTS: Record<CandidateSource, number> = {
    seed: 0.6,
    heuristic: 0.8,
    llm: 0.9,
    user: 1.0,
  };
  const sourceWeight = SOURCE_WEIGHTS[c.source];
  let recency = 1.0;
  if (c.lastMatchedAt) {
    const ageMs = Date.now() - new Date(c.lastMatchedAt).getTime();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    recency = Math.max(0.1, 1.0 - (ageMs / THIRTY_DAYS_MS) * 0.9);
  } else {
    recency = 0.3;  // never matched — lower confidence
  }
  return (matchCount + 1) * recency * sourceWeight;  // +1 so zero-match new candidates rank above 0
}
```

### Prepend Winner, Retain Prior Active (ADAPT-07)

When a heal candidate passes validation:

1. **Build the new `SelectorCandidate` object** with `source: 'heuristic'` or `'llm'`, `addedAt: new Date().toISOString()`, `matchCount: 0`, `lastMatchedAt: null`, `failCount: 0`.
2. **Call `updateCandidate(target, newCandidateValue)`** — this already rotates to index 0.

BUT: `updateCandidate` currently only rotates an existing candidate. For a brand-new candidate value, we need a variant that **inserts** it at index 0 rather than rotating:

**Add `insertCandidate()` to `selector-registry.ts`:**

```typescript
/**
 * Insert a new adapted candidate at index 0 for a target.
 * Called after heal validation passes (Phase 23).
 * Preserves the prior index-0 candidate at index 1 (ADAPT-07: retain prior active for auto-recovery).
 * Enforces the 10-candidate cap (SELECTOR-05) and never evicts seed candidates.
 */
export async function insertCandidate(
  target: SelectorTarget,
  value: string,
  source: CandidateSource,
): Promise<void> {
  if (!_cache) return;

  const entry = _cache.targets[target];
  if (!entry) return;

  // Check if value already exists (avoid duplicates)
  const existing = entry.candidates.findIndex(c => c.value === value);
  if (existing === 0) {
    // Already at front — just update matchCount + lastMatchedAt via updateCandidate
    await updateCandidate(target, value);
    return;
  }
  if (existing > 0) {
    // Exists at a later position — rotate to front via existing updateCandidate
    await updateCandidate(target, value);
    return;
  }

  // Brand new value — insert at front
  const now = new Date().toISOString();
  const newCandidate: SelectorCandidate = {
    value,
    source,
    lastMatchedAt: null,
    lastVerifiedAt: now,
    addedAt: now,
    failCount: 0,
    matchCount: 0,
  };

  entry.candidates.unshift(newCandidate);

  // Enforce cap (<=10) — never evict seed
  if (entry.candidates.length > 10) {
    const seedIdx = entry.candidates.findIndex(c => c.source === 'seed');
    const truncated = entry.candidates.slice(0, 10);
    if (seedIdx >= 10 && seedIdx >= 0) {
      const seedCandidate = entry.candidates[seedIdx];
      if (seedCandidate) truncated[truncated.length - 1] = seedCandidate;
    }
    entry.candidates = truncated;
  }

  // Update lastAdaptedAt on registry
  _cache.lastAdaptedAt = now;

  await storageSet({ selectorRegistry: _cache }).catch(() => {});
}
```

**The prior active candidate (previously at index 0) automatically moves to index 1** when the new candidate is `unshift`ed. This satisfies ADAPT-07: "retained so detection auto-recovers if LinkedIn reverts."

---

## LLMRederiver (Content Script)

Mirrors `LLMDetector` exactly:

```typescript
// src/content/detector/rederiver.ts

export class LLMRederiver {
  async rederive(
    target: string,
    domSkeleton: string,
  ): Promise<Array<{ selector: string; rationale: string }>> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'REDERIVE_SELECTOR', target, domSkeleton },
        (response) => {
          if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
          if (response?.error) { reject(new Error(response.error as string)); return; }
          resolve(response.result as Array<{ selector: string; rationale: string }>);
        },
      );
    });
  }
}
```

The full `rederiveSelector()` function in `background/index.ts` is already specified verbatim in 23-AI-SPEC.md Section 3. The researcher does not re-derive it here — use the AI-SPEC pattern exactly.

---

## Test Harness — Fixture-DOM Tests (ADAPT-09)

### Infrastructure Already Present

`vitest.config.ts` is already configured with `environment: 'jsdom'`. The test include glob is `src/**/*.test.ts`. No new devDependencies needed.

Add `"test": "vitest run"` to `package.json` scripts (currently absent).

### Fixture File Strategy

Create `src/content/selector/__fixtures__/` with HTML files. Load them in tests using `import fs from 'fs'` and `document.body.innerHTML = fs.readFileSync(...)`. Each fixture is a minimal but realistic snippet of LinkedIn feed HTML — not the full page.

**Required fixtures (maps to AI-SPEC Section 5 reference dataset):**

| File | Tests (D-dimension) | What it covers |
|------|--------------------|-|
| `feed-healthy.html` | D1, D3, D5 | Healthy feed with 5–15 `div[componentkey]` cards, each with `a[href*="/in/"]` and post text |
| `feed-broken-classrot.html` | D1, D2, D3 | Post cards present but `div[componentkey]` replaced with `div[data-urn]`; heuristic should find the new attr |
| `feed-skeleton.html` | D5, D7 | Skeleton-loader placeholders: elements with no text, no author links — must fail D5 |
| `feed-loggedout.html` | D7 | Login wall — no feed container; Core-4 guard must suppress heal |
| `feed-empty.html` | D7 | Genuine empty feed — feed container present but zero post cards; guards must suppress |
| `feed-jobcards.html` | D3, D5 | Job recommendation cards in feed — author links but no `/in/` post-author shape; must fail D5 ratio check |
| `feed-promoted.html` | D9 | Promoted posts mixed with organic; D9 advisory warning logged; write still proceeds |
| `feed-abvariant-a.html` | D1, D5 | A/B variant with `data-activity-urn` instead of `componentkey` |
| `feed-abvariant-b.html` | D1, D5 | A/B variant B with different attribute name |
| `feed-pii-rich.html` | D4 | Real names in aria-labels, `/in/` hrefs, CDN src URLs — sanitizer must strip all |

**Adversarial LLM output fixture strings (no HTML file needed — inline in test):**

```typescript
const ADVERSARIAL_SELECTORS = [
  '*',
  'body',
  'html',
  ':root',
  '.feed-shared-update-v2',           // CSS class — violates CLAUDE.md constraint #1
  '#main-content',                     // id selector
  '");alert(1)//',                     // injection attempt
  '<script>alert(1)</script>',         // XSS string
  'div div div div div div div div',  // valid syntax but would match 200+ elements
];
```

### Test File Location

`src/content/selector/validator.test.ts`, `src/content/selector/heuristic.test.ts`, `src/content/selector/sanitizer.test.ts`

Mirror the existing pattern from `src/content/exclusions.test.ts` and `src/content/selector-registry.test.ts`.

### Critical Test Cases

**D4 (PII boundary — HIGHEST STAKES):**

```typescript
// sanitizer.test.ts
import { buildDomSkeleton } from './sanitizer';

it('strips all href values from anchor elements', () => {
  document.body.innerHTML = '<div><a href="/in/john-doe">John Doe</a></div>';
  const skeleton = buildDomSkeleton(document.body.firstElementChild as Element);
  expect(skeleton).not.toContain('/in/');
  expect(skeleton).not.toContain('John');
});

it('strips aria-label values', () => {
  document.body.innerHTML = '<div aria-label="Post by John Doe"><span>...</span></div>';
  const skeleton = buildDomSkeleton(document.body.firstElementChild as Element);
  expect(skeleton).not.toContain('John');
});

it('strips src URLs', () => {
  document.body.innerHTML = '<img src="https://media.licdn.com/photo.jpg" />';
  const skeleton = buildDomSkeleton(document.body.firstElementChild as Element);
  expect(skeleton).not.toContain('media.licdn.com');
});
```

**D2 (injection safety):**

```typescript
// validator.test.ts
for (const badSelector of ADVERSARIAL_SELECTORS) {
  it(`rejects "${badSelector}"`, () => {
    const result = validateCandidate(badSelector, document.body);
    expect(result.pass).toBe(false);
  });
}
```

**D3 (write-gate integrity) — using spied storage:**

```typescript
// Use vitest's vi.mock to mock chrome.storage.local
// Assert updateCandidate / insertCandidate is called 0 times when validation fails
// and exactly 1 time when it passes
```

**D8 (rate-bounding correctness):**

```typescript
// Use vitest fake timers and a mock chrome.storage.local
// Assert: second concurrent REDERIVE_SELECTOR call is rejected while latch is held
// Assert: call within 5 min cooloff is rejected
// Assert: call after simulated SW restart (storage cleared, re-read) correctly inherits latch state
```

### LLM Live-Key Path (ADAPT-09 — manual, non-CI)

Per 23-AI-SPEC.md and ADAPT-09: the LLM live path is executed once by the maintainer before any release, using a real Anthropic key, against a real or saved broken feed. This test is NOT in CI because it costs real money and depends on a user-supplied key. Document in verification notes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS selector syntax validation | Custom parser | `element.querySelectorAll(sel)` in try/catch | The browser's own selector engine validates for free; parse errors throw `SyntaxError` |
| DOM serialization | Custom XML writer | `element.cloneNode(true)` + recursive string builder | `cloneNode` gives a detached safe copy; XMLSerializer adds unnecessary namespace overhead |
| Storage typed access | Raw `chrome.storage.local.get/set` | `storageGet` / `storageSet` from `src/shared/storage.ts` | Already typed over `StorageSchema`; consistent with all existing storage calls in the project |
| Rate-limit state tracking | In-memory module-scope variables | `chrome.storage.local` via storage keys | Service workers restart after ~30s idle; in-memory variables are lost on restart |
| LLM response schema validation | Runtime validation library (zod, valibot) | Hand-written `isRederiveModelOutput()` type guard (AI-SPEC Section 4b.1) | One-off use case; adding zod for a single type guard is over-engineering |
| Candidate insertion/rotation | New ad-hoc storage write | `insertCandidate()` extension of existing `updateCandidate()` | Keeps storage writes in one place; enforces cap + seed-preservation rules consistently |
| PII stripping regex | Regex over serialized HTML | Walk clone DOM nodes, remove attrs before serialization | Regex on HTML is brittle; DOM attribute removal is exact and safe from edge cases |

---

## Common Pitfalls

### Pitfall 1: Service-Worker State Loss Between Rate-Limit Check and Fetch

**What goes wrong:** Rate-limit check reads `llbRederiveInFlight = false`, then the service worker is restarted (idle timeout) between the check and the fetch. A second `REDERIVE_SELECTOR` message arrives; the new worker instance reads `llbRederiveInFlight = false` (from storage, since it was never set) and launches a second fetch.

**Why it happens:** The latch was never written to storage before the worker was terminated.

**How to avoid:** Write the latch (`llbRederiveInFlight: true`) to `chrome.storage.local` BEFORE calling `fetch`. The `acquireRateLimitLatch()` function above does this in one `await chrome.storage.local.set(...)` call. Release in `finally`.

**Warning signs:** Multiple API calls showing up in browser network DevTools within seconds of each other for the same breakage event.

### Pitfall 2: Breakage Detection Fires on Skeleton-Loader

**What goes wrong:** LinkedIn renders skeleton-loader placeholders while the real feed loads. These have no `POST_BODY_TEXT` spans. The observer sees zero matches for 30+ seconds and fires a heal cycle.

**Why it happens:** The debounce window starts as soon as the observer attaches, before real posts appear.

**How to avoid:** The `MIN_SESSION_POSTS = 3` guard (hasSessionActivity check) blocks heal until at least 3 real posts have been dispatched in this session. Skeleton-loaders never dispatch posts, so this guard catches the scenario. If posts have been seen previously in this session, a subsequent zero-match window indicates real breakage.

**Warning signs:** Heal cycle fires immediately after page load, before any posts are processed.

### Pitfall 3: Treating `resolve()` Return Value as a Fresh DOM State

**What goes wrong:** `resolve('POST_CARD')` returns the current front-of-list candidate. After `insertCandidate()` writes a new candidate, the in-memory `_cache` is updated immediately. But if another tab wrote a different candidate to storage concurrently, the `onChanged` listener in `selector-registry.ts` will update `_cache` to the storage value. Two tabs could fight over the active candidate.

**Why it happens:** `chrome.storage.onChanged` is the cross-tab sync mechanism, but there is a brief window between one tab's write and the other tab's `onChanged` callback.

**How to avoid:** This is inherent in the design and acceptable. The `insertCandidate()` writes to storage via `storageSet`; the `onChanged` listener in all other tabs receives the update. The worst case is one extra heal cycle per other-tab write, which is bounded by the rate-limit.

### Pitfall 4: Heuristic Finds Only One Attribute Name → All Elements Match That Attribute

**What goes wrong:** The heuristic walks the feed container and finds `div[data-finiteScrollHotkeyContext]` applied to 3 elements — but those 3 elements are navigation wrappers, not post cards. They pass match-count (3 is in 2–50 range) but fail the author-link ratio check.

**Why it happens:** Not all `data-*` attributes on feed children are post-card identifiers.

**How to avoid:** The author-link ratio check (Gate 2 in `validator.ts`) catches this — if the matched elements have no `a[href*="/in/"]` children, the candidate fails. Rely on the validation gate; do not attempt to pre-filter heuristic candidates before validation.

### Pitfall 5: Serialized Skeleton Exceeds 4000 Chars Even After Depth/Sibling Trimming

**What goes wrong:** LinkedIn's feed container has deeply nested shadow-DOM-like structures. Even with depth ≤ 6 and siblings ≤ 3, the output exceeds 4000 chars.

**Why it happens:** Some `data-*` attribute values are long UUIDs or base64-encoded strings.

**How to avoid:** The sanitizer's truncation logic slices at the last complete `>` before 4000 chars. The AI-SPEC also recommends: if the skeleton still exceeds 4000 chars after all trimming, give heuristics one more pass before abandoning the LLM call for this cycle. Implement as a pre-flight check: if `buildDomSkeleton()` returns a string ending with `<!-- skeleton truncated -->`, log a warning and prefer heuristic output for this cycle.

### Pitfall 6: `return true` Omitted From onMessage Handler Branch

**What goes wrong:** The `REDERIVE_SELECTOR` branch in `onMessage` calls `rederiveSelector()` asynchronously but forgets to `return true`. Chrome closes the message channel immediately. The content script's `sendMessage` callback never fires — the `Promise` in `LLMRederiver.rederive()` hangs forever.

**Why it happens:** Copy-paste from a synchronous handler branch.

**How to avoid:** Every async branch in `onMessage` MUST `return true`. The existing `SCORE_POST` branch already does this correctly — use it as the direct template.

---

## Code Examples

### Pattern 1: Breakage Trigger in observer.ts

```typescript
// Add to module-scope declarations in observer.ts
let _zeroMatchStart: number | null = null;
let _sessionPostCount = 0;
let _healLock = false;

// Add to dispatchFromBox() after processedPosts.add(urn):
_sessionPostCount++;
_zeroMatchStart = null;  // posts flowing — reset

// Add to MutationObserver callback in attachObserver():
// If mutations occurred but processElement found nothing:
if (addedNodeCount > 0 && noPostsFound) {
  if (!_zeroMatchStart) _zeroMatchStart = Date.now();
  else if (Date.now() - _zeroMatchStart >= 30_000 && !_healLock) {
    if (isFeedUrl() && hasFeedContainer() && _sessionPostCount >= 3) {
      _healLock = true;
      triggerHeal(container).catch(() => { _healLock = false; });
    }
  }
}
```

### Pattern 2: Service Worker — onMessage Addition

```typescript
// background/index.ts — add to the existing onMessage listener block
// (mirrors the existing SCORE_POST branch exactly)
if (message?.type === 'REDERIVE_SELECTOR') {
  const target = message.target as string;
  const domSkeleton = message.domSkeleton as string;

  checkRateLimit()
    .then(({ allowed, reason }) => {
      if (!allowed) {
        sendResponse({ error: `rate-limited: ${reason ?? 'unknown'}` });
        return;
      }
      const todayKey = new Date().toISOString().slice(0, 10);
      acquireRateLimitLatch(todayKey, /* callsToday from prior read */ 0)
        .then(() => rederiveSelector(target, domSkeleton))
        .then(result => sendResponse({ result: result.candidates }))
        .catch(err => sendResponse({ error: (err as Error).message }))
        .finally(() => releaseRateLimitLatch().catch(() => {}));
    })
    .catch(err => sendResponse({ error: (err as Error).message }));
  return true; // REQUIRED — keeps channel open for async response
}
```

### Pattern 3: Heal Orchestration in observer.ts (triggerHeal)

```typescript
// src/content/observer.ts
async function triggerHeal(container: Element): Promise<void> {
  // Step 1: heuristic pass (no API call)
  const heuristics = deriveHeuristicCandidates('POST_CARD', container);
  for (const h of heuristics) {
    const valid = validateCandidate(h.selector, container);
    if (valid.pass) {
      await insertCandidate('POST_CARD', h.selector, 'heuristic');
      console.info('[LLB] heal: heuristic candidate accepted:', h.selector);
      return;
    }
  }

  // Step 2: LLM fallback (API call, only if API key configured)
  const apiKeyResult = await storageGet(['anthropicApiKey']);
  if (!apiKeyResult.anthropicApiKey) {
    console.warn('[LLB] heal: no API key — LLM fallback skipped');
    return;
  }

  const skeleton = buildDomSkeleton(container);
  const rederiver = new LLMRederiver();
  let llmCandidates: Array<{ selector: string; rationale: string }>;
  try {
    llmCandidates = await rederiver.rederive('POST_CARD', skeleton);
  } catch (err) {
    console.warn('[LLB] heal: LLM fallback error:', err);
    return;
  }

  for (const c of llmCandidates) {
    const valid = validateCandidate(c.selector, container);
    if (valid.pass) {
      await insertCandidate('POST_CARD', c.selector, 'llm');
      console.info('[LLB] heal: LLM candidate accepted:', c.selector, '—', c.rationale);
      return;
    }
    console.warn('[LLB] heal: LLM candidate rejected:', c.selector, '—', valid.reason);
  }

  console.warn('[LLB] heal: all candidates failed validation — selector unchanged');
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-coded selector constants in observer.ts | Runtime resolution via `SelectorRegistry.resolve()` backed by `chrome.storage.local` | Phase 22 | Foundation for Phase 23 adaptation |
| Manual selector update on LinkedIn DOM changes (by maintainer) | Automatic heuristic + LLM re-derivation | Phase 23 | Eliminates extension downtime between LinkedIn deploys and maintainer patches |
| No candidate provenance tracking | `SelectorCandidate.source: 'seed' | 'heuristic' | 'llm' | 'user'` | Phase 22 types | Enables per-source confidence weighting and dashboard display |
| Winner rotation only (existing candidates) | `insertCandidate()` for brand-new adapted candidates | Phase 23 | New values can be prepended to the registry, not just rotated |

**Deprecated/outdated:**
- Direct import of selector constants from `selectors.ts` in consumer files — replaced by `resolve()` calls in Phase 22. Phase 23 must not reintroduce direct imports in new files.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MIN_SESSION_POSTS = 3` is sufficient to distinguish a loaded feed from a skeleton-loader | Breakage Detection Wiring | Too low: false heal triggers on half-loaded pages. Too high: breakage detection misses real breakage on low-traffic feeds. Tunable constant — 3 is a reasonable start. |
| A2 | `REDERIVE_DAILY_CAP = 5` balances cost and coverage | Rate-Bounding State | At 5 cap + $0.0023/call, daily cost is ~$0.012. If LinkedIn deploys multiple times in a day (rare), cap may prevent recovery for later deploys. Tunable. |
| A3 | The feed container's direct children or depth-2 children include the post-card root elements | Heuristic Re-derivation | If LinkedIn wraps post cards in additional layers, the heuristic's shallow walk may miss them. The `MAX_SIBLINGS` and `MAX_DEPTH` constants allow tuning without algorithm changes. |
| A4 | `a[href*="/in/"]` is a stable author-link pattern that survives LinkedIn DOM changes | Candidate Validation Gate — author-link check | If LinkedIn changes author link patterns (e.g., removes `/in/` from profile hrefs), the Gate 2 check would reject valid post-card selectors. This is the same constraint as CLAUDE.md's existing `POST_AUTHOR_LINK` selector and is noted as a verified pattern. |

**If this table were empty:** All claims were verified in source. The four assumptions above involve tunable constants or behavioral bets that the planner may want to flag for post-ship tuning.

---

## Open Questions

1. **Should `checkRateLimit()` read `callsToday` in the same call as the latch check, or in a separate read?**
   - What we know: `chrome.storage.local.get` accepts an array of keys — one call can fetch all four rate-limit keys atomically.
   - What's unclear: Whether to pass `callsToday` into `acquireRateLimitLatch()` (read-then-write pattern) or read again inside `acquireRateLimitLatch()` (double-read pattern for atomicity).
   - Recommendation: Read all four keys in `checkRateLimit()`, return them with the `allowed` result, and pass `callsToday` into `acquireRateLimitLatch()`. This is the same single-read pattern used in the existing `scorePost` function.

2. **Should `triggerHeal()` be in `observer.ts` or in a new `src/content/selector/healer.ts`?**
   - What we know: `observer.ts` already owns the session post count and the zero-match detection. Moving heal logic to a separate module would require passing `container` as a parameter and re-exporting `_healLock`.
   - What's unclear: Whether the planner wants to keep `observer.ts` as a pure observation layer.
   - Recommendation: Keep `triggerHeal()` in `observer.ts` as a private async function. It is called from one place and the container reference is already available. Extract to `healer.ts` only if `observer.ts` grows beyond ~350 lines.

3. **Does `insertCandidate()` belong in `selector-registry.ts` or should Phase 23 add it?**
   - What we know: Phase 22 added `updateCandidate()` (rotates existing) but not `insertCandidate()` (adds new). Phase 23 is the first phase to add truly new adapted candidates.
   - Recommendation: Add `insertCandidate()` as a new named export in the existing `selector-registry.ts` file in Phase 23. It shares the same `_cache` reference and cap/seed-preservation logic.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + test | ✓ | (project is running) | — |
| Vitest | ADAPT-09 fixture tests | ✓ | ^4.1.7 (in devDependencies) | — |
| jsdom | ADAPT-09 fixture tests | ✓ | ^29.1.1 (in devDependencies) | — |
| `vitest run` test script | CI gating | ✗ | — | Add `"test": "vitest run"` to package.json scripts |
| Anthropic API key | LLM fallback path | User-provided | n/a | Heuristic-only path (no key = no LLM call, extension degrades gracefully) |

**Missing dependencies with no fallback:**
- `"test"` script in package.json — must be added as Wave 0 task before CI can run.

**Missing dependencies with fallback:**
- Anthropic API key — heuristic-only healing is the fallback; extension continues to work.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 + jsdom 29.1.1 |
| Config file | `vitest.config.ts` (exists, environment: 'jsdom') |
| Quick run command | `npx vitest run src/content/selector/` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADAPT-01 | Core-4 guards suppress heal on logged-out/skeleton/non-feed | unit | `npx vitest run src/content/selector/heuristic.test.ts` | ❌ Wave 0 |
| ADAPT-02 | Heuristic re-deriver finds data-* analog after class-rot | unit | `npx vitest run src/content/selector/heuristic.test.ts` | ❌ Wave 0 |
| ADAPT-03 | Validation gate rejects skeleton / job cards / wrong-element | unit | `npx vitest run src/content/selector/validator.test.ts` | ❌ Wave 0 |
| ADAPT-04 | Sanitizer strips text, href, src, aria-label from PII-rich fixture | unit | `npx vitest run src/content/selector/sanitizer.test.ts` | ❌ Wave 0 |
| ADAPT-05 | Rate-limit latch/cooloff/cap survive simulated SW restart | unit | `npx vitest run src/background/ratelimit.test.ts` | ❌ Wave 0 |
| ADAPT-06 | Adversarial selector strings rejected before querySelectorAll | unit | `npx vitest run src/content/selector/validator.test.ts` | ❌ Wave 0 |
| ADAPT-07 | >50 match selector rejected | unit | `npx vitest run src/content/selector/validator.test.ts` | ❌ Wave 0 |
| ADAPT-08 | insertCandidate prepends + retains prior active at index 1 | unit | `npx vitest run src/content/selector-registry.test.ts` | ❌ Wave 0 (extend existing) |
| ADAPT-09 (CI) | Fixture set: partial breakage, skeleton, logged-out, heal-to-wrong | unit | `npx vitest run` (full suite) | ❌ Wave 0 |
| ADAPT-09 (manual) | LLM live-key path: real Anthropic call against broken feed | manual | Manual by maintainer before release | N/A |
| ADAPT-10 | PRIVACY.md contains LLM selector repair disclosure | manual | grep PRIVACY.md | ❌ Wave 0 (doc edit) |

### Sampling Rate

- **Per task commit:** `npx vitest run src/content/selector/`
- **Per wave merge:** `npm run type-check && npm run lint && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/content/selector/validator.test.ts` — covers ADAPT-03, ADAPT-06, ADAPT-07
- [ ] `src/content/selector/heuristic.test.ts` — covers ADAPT-01, ADAPT-02
- [ ] `src/content/selector/sanitizer.test.ts` — covers ADAPT-04
- [ ] `src/content/selector/__fixtures__/*.html` — 10 fixture HTML files
- [ ] `src/background/ratelimit.test.ts` — covers ADAPT-05
- [ ] `"test": "vitest run"` added to `package.json` scripts
- [ ] Extend `src/content/selector-registry.test.ts` — covers ADAPT-08 (`insertCandidate`)

---

## PRIVACY.md Disclosure (ADAPT-10)

### Current State of PRIVACY.md

The current `PRIVACY.md` (last updated 2026-05-30) already has a section "Optional AI-powered detection (opt-in)" that covers the `SCORE_POST` / `LLMDetector` data flow. Phase 23 must add a second paragraph to that section covering the selector repair data flow.

### Recommended Disclosure Wording

Add the following paragraph to the existing "Optional AI-powered detection (opt-in)" section, immediately after the existing paragraph about post text being sent to the Anthropic API:

```markdown
### Automatic selector repair (opt-in, same API key)

When an API key is configured, the extension may also use Anthropic's API to automatically
repair its feed-scraping logic if LinkedIn changes its page structure and the extension
stops detecting posts. In this case, a **structural description of the LinkedIn feed layout**
is sent to Anthropic — specifically the HTML tag names, nesting depth, and `data-*`
attribute names present in the feed. **No post text, author names, profile URLs, image
URLs, or any other user-identifiable information is included.** The structural skeleton
contains only the DOM structure needed to identify where post cards appear on the page.

This repair happens at most a few times per day (rate-bounded) and only when the extension
has completely stopped detecting posts. You can prevent this by not configuring an API key
— without a key, the extension uses local heuristics only and no data ever leaves your device.
```

**Note on table in current PRIVACY.md:** The existing "Third-party services" table row for Anthropic API says "Only when user has set an API key (opt-in)". This remains accurate — the selector repair path also requires a user-configured key. No change to the table is needed beyond the new paragraph.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not applicable — no user auth in this extension |
| V3 Session Management | No | No sessions managed |
| V4 Access Control | No | Single-user local extension |
| V5 Input Validation | Yes | Validation gate in `validator.ts` — selector string injection guard |
| V6 Cryptography | No | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via page content | Tampering | PII sanitizer strips all text nodes before DOM skeleton is built — page content cannot reach the system prompt |
| Selector-string code execution | Elevation of Privilege | `validateCandidate()` injection guard; selector string only ever passed to `querySelectorAll()`, never to `eval`/`Function`/`innerHTML` |
| LLM output used as code | Elevation of Privilege | Same as above — model output is a plain string, passed only to `querySelectorAll` |
| Runaway API cost (wallet draining) | Denial of Service | Rate-limit guard: single-flight latch + 5-min cooloff + 5-call daily cap, all persisted to storage across SW restarts |
| PII exfiltration to Anthropic | Information Disclosure | Sanitizer strips ALL text nodes, `href`, `src`, `aria-label`, `title`, `alt` before the skeleton leaves the content script |
| Bad adapted candidate persisted | Tampering | Three-gate validation (match count 2–50, author-link ratio >50%, post-text presence) blocks any write that would break detection |

---

## Sources

### Primary (HIGH confidence — read directly from source files in this session)

- `src/content/selector-registry.ts` — `resolve()`, `updateCandidate()`, `buildSeedRegistry()`, `_cache` pattern, `onChanged` listener registration, fire-and-forget `.catch(() => {})` pattern
- `src/content/observer.ts` — `processElement()`, `dispatchFromBox()`, `attachObserver()`, `reinit()`, `installSpaNavigationHandler()` — hook points for breakage detection
- `src/background/index.ts` — `scorePost()` function, `onMessage` handler pattern, `return true` for async branches
- `src/content/detector/llm.ts` — `LLMDetector` class, `scoreViaBackground()` message pattern
- `src/shared/types.ts` — `SelectorCandidate`, `SelectorTarget`, `SelectorRegistrySchema`, `CandidateSource`, `StorageSchema`
- `src/content/selectors.ts` — seed selector values, CLAUDE.md constraint #1 enforcement in comments
- `src/dashboard/SelectorView.tsx` — `source` badge rendering (`'heuristic'`, `'llm'`), existing style patterns
- `.planning/phases/22-externalize-selectors-to-storage/22-PATTERNS.md` — Phase 22 pattern map; all new modules follow its analog structure
- `vitest.config.ts` — confirms `environment: 'jsdom'`, include glob `src/**/*.test.ts`
- `PRIVACY.md` — current disclosure text; basis for ADAPT-10 additions
- `.planning/phases/23-self-healing-selector-adapter/23-CONTEXT.md` — locked decisions
- `.planning/phases/23-self-healing-selector-adapter/23-AI-SPEC.md` — LLM call shape, model config, sanitizer pipeline, rate-limit state keys, type guard pattern

### Secondary (MEDIUM confidence — from planning documents)

- `.planning/REQUIREMENTS.md` — ADAPT-01 through ADAPT-10 requirement text
- `.planning/STATE.md` — project key decisions table; LLM call location locked decision

### Tertiary (LOW confidence — none; all findings are grounded in source)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all modules identified by reading actual source files
- Architecture: HIGH — hook points in `observer.ts` and `background/index.ts` confirmed by reading line-by-line
- Heuristic algorithm: MEDIUM — strategy is sound but the exact DOM-walking output depends on LinkedIn's live DOM which cannot be verified without a live feed
- Pitfalls: HIGH — all pitfalls derived from reading the existing codebase patterns and the AI-SPEC failure mode analysis
- Test harness: HIGH — Vitest + jsdom already confirmed present and configured

**Research date:** 2026-06-13
**Valid until:** 2026-07-13 (30 days — stable codebase; LinkedIn DOM changes are external and not time-bounded)
