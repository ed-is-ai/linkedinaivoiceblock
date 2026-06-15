---
phase: 23-self-healing-selector-adapter
phase_name: "Self-Healing Selector Adapter"
phase_slug: 23
phase_goal: "The extension detects when selector scraping has broken on an active LinkedIn feed and automatically re-derives working candidates — first via structural heuristics, then via an LLM fallback — with strict validation before any candidate is written, rate-bounding on LLM calls, and full privacy protection."
depends_on: ["22"]
depends_on_milestone: "v7.0"
created: "2026-06-13"
updated: "2026-06-13"
status: "Ready for research & planning"
---

# Phase 23 Context — Self-Healing Selector Adapter

## Vision

When LinkedIn's DOM structure changes (a common occurrence), the extension's selectors stop matching posts. Phase 23 adds automatic detection and repair: when breakage is detected on an active feed, the extension re-derives working selectors through heuristics first, then LLM fallback if needed — all with strict privacy, rate-bounding, and validation gates to ensure adapted candidates are safe before writing to storage.

## Locked Decisions

### Breakage Detection Strategy

**Decision:** Core 4 false-positive guards (URL gate, container present, session activity, 30s rolling debounce)

**Rationale:** Auth check and no-posts placeholder detection are unreliable on LinkedIn's dynamic UI. The core 4 guards provide a strong false-positive baseline without over-engineering.

**Why it matters:** Breakage detection must NOT fire on logged-out pages, skeleton-loader states, genuine empty feeds, or non-feed URLs. The 30s debounce prevents thrashing.

**Implementation implication:** No auth-state check, no attempt to detect skeleton-loader. Container presence check is mandatory.

### Heuristic Re-derivation Approach

**Decision:** Hybrid strategy — analyze broken selector structure + walk DOM for patterns

**Approach:**
1. When breakage detected, analyze the selector that failed (what was its structure? data-* attributes? aria-labels?)
2. Walk the live DOM looking for post elements with similar structural patterns
3. For each candidate found, validate against the validation gate (see below)
4. Return the best candidate without any API call

**Why it matters:** Analyzing the broken selector gives us hints about what LinkedIn is likely to use (similar hierarchy, attribute types). Walking the DOM validates those hints locally.

**Example:** If `span[data-testid="expandable-text-box"]` worked before but is now empty, we know LinkedIn favors `data-testid` attributes. Walk the DOM looking for other `data-testid` values that find post bodies.

### Candidate Validation Gate

**Decision:** Three mandatory validation criteria before writing to storage

1. **Match count in safe range (2-50 matches)**
   - Too few (<2): selector is too specific, will miss posts
   - Too many (>50): selector is too broad, will catch non-post elements
   
2. **Author-link ratio check**
   - Proposed selector must find author links in >50% of matched elements
   - Ensures we're matching actual post cards, not sidebar/ads
   
3. **Post-text presence check**
   - Proposed selector must find post body text in matched elements
   - Confirms the element contains post content

**Not included:** Sponsored content filter (unreliable on LinkedIn's dynamic ad structure)

**Why it matters:** These three checks catch the most common false positives without over-constraining.

### LLM Fallback Privacy Boundary

**Decision:** Send structural skeleton + aria-labels only

**What IS sent to Claude:**
- HTML structure (tags, nesting, data-* attributes)
- aria-label values (for accessibility context)
- CSS classes (for structural hints)

**What is NOT sent:**
- Text content (post bodies, names, headlines)
- href/src URLs (no profile links, image URLs)
- Name fields (author names, profile identifiers)
- Any user-visible content

**Why it matters:** aria-labels provide semantic hints (e.g., `aria-label="Comment"`, `aria-label="Like"`) without exposing PII. Maximum privacy while still giving LLM structural context.

**Example prompt structure:**
```
You are analyzing a broken post-scraping selector.
Here is the current DOM structure of a LinkedIn post (PII stripped):

<div data-component-key="..." aria-label="Post">
  <div data-testid="..." aria-label="Post author">
    <span aria-label="Name" />
  </div>
  <div aria-label="Post text">
    [text stripped]
  </div>
</div>

What CSS selector would match the post body element?
```

### LLM Call Location (Confirmed from ROADMAP)

**Decision:** Anthropic fetch lives in **service worker** (background/index.ts)

**Why:** CORS blocks direct fetch from linkedin.com content script. The existing `LLMDetector` pattern (content script sends SCORE_POST message → service worker fetches and responds) must be replicated for `LLMRederiver`.

**Implementation note:** Phase 23 will add a new message type: `REDERIVE_SELECTOR` (analogous to `SCORE_POST`).

## Requirements Overview

Phase 23 delivers on 10 requirements (ADAPT-01 through ADAPT-10):

- **ADAPT-01:** Breakage detection with 6 false-positive guards (we use Core 4)
- **ADAPT-02:** Heuristic re-deriver (hybrid: analyze + walk)
- **ADAPT-03:** LLM fallback without PII (structural + aria-labels)
- **ADAPT-04:** Rate-bounding on LLM calls (TBD in planning: single-flight latch, 5-min cooloff, per-day cap)
- **ADAPT-05:** Validation before write (3 validation criteria locked)
- **ADAPT-06:** Selector strings never passed to eval
- **ADAPT-07:** Overly-broad selectors rejected (>50 matches)
- **ADAPT-08:** Overly-specific selectors rejected (<2 matches)
- **ADAPT-09:** Session activity tracking (use breakage detection guards as proxy)
- **ADAPT-10:** Strict validation gates + match count bounds

## Key Unknowns (For Planning Phase)

1. **Rate-bounding specifics:** Single-flight latch per target? Shared across targets? 5-min cooloff restarts? Per-day hard cap (how many calls/day)?
2. **Persistence of rate-limit state:** Does cooloff survive service-worker restart? Use chrome.storage.local or session cache?
3. **Rollback strategy:** If an adapted candidate later stops working, can we detect and revert? Keep history of attempts?
4. **Match count validation bounds:** Confirm 2-50 range is right for all selector types, or per-target tuning needed?

## Prior Phase Decisions (Phase 22)

Phase 22 established the storage-backed **SelectorRegistry** as the runtime source of truth:

- `selectors.ts` = seed/defaults only
- `SelectorRegistry` = runtime source-of-truth (live at `chrome.storage.local.selectorRegistry`)
- `resolve('TARGET')` = sync lookup with seed fallback
- `updateCandidate('TARGET', value)` = winner rotation (async, fire-and-forget)

Phase 23 will extend this by adding adapted candidates via LLM/heuristic fallback.

## Architecture Notes

### Content Script → Service Worker Message Pattern

Replicating the existing LLMDetector pattern:

1. **Content Script (detector/rederiver module):** Detects breakage on current feed, composes REDERIVE_SELECTOR message
2. **Content Script → Service Worker:** `chrome.runtime.sendMessage({ type: 'REDERIVE_SELECTOR', target: 'POST_CARD', ... })`
3. **Service Worker:** Receives message, calls heuristic re-deriver, optionally calls LLM if heuristics fail
4. **Service Worker → Storage:** Writes valid candidate to `selectorRegistry.targets[target].candidates[0]` (push to front)
5. **Content Script:** Receives response, immediately calls `updateCandidate()` to mark as matched

### Privacy-First Design

- **Heuristic module:** Lives in content script, never leaves the browser
- **LLM fallback:** Happens in service worker, sends only structural + aria-label skeleton
- **No logging of attempt history:** Don't store failed candidate attempts (privacy)
- **Rate-limit state:** Minimal tracking (timestamp of last attempt, call count), no historical log

## Open Questions for Discussion (If Needed)

1. Should heuristic re-deriver run **on every post** or **once per session when breakage detected**?
   - Per-post: catches selector rot in real-time but higher CPU cost
   - Once-per-session: lower cost but slower to adapt
   
2. Should adapted candidates ever be **committed to the seed** for future sessions, or always **temporary/session-scoped**?
   - Temporary: safer (if LinkedIn changes again, seed is still good)
   - Committed: faster recovery (adapted candidate becomes new baseline)

## Related Decisions from Prior Phases

| Decision | Phase | Status |
|----------|-------|--------|
| Selectors in `selectors.ts` + runtime via `SelectorRegistry` | 22 | Locked ✅ |
| No CSS class selectors (data-* only) | 1 | Locked ✅ |
| Service worker stateless, all state in chrome.storage.local | 1 | Locked ✅ |
| LLM calls in service worker (CORS issue) | 23 (ROADMAP confirmed) | Locked ✅ |

---

**Status:** Ready for `/gsd-phase-researcher 23` and `/gsd-plan-phase 23`
