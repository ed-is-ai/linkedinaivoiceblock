/**
 * Self-healing orchestrator — generalized to all live-stale DOM-healable targets
 * (ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-06, HEAL-03, HEAL-05).
 *
 * triggerHeal runs the full repair loop when the observer (observer.ts) detects total
 * scraping breakage on the post feed, or when the dashboard user triggers a manual heal:
 *
 *   1. Build heal set LIVE — iterate the DOM-healable target list, keep only those where
 *      the current active selector returned by resolve(target) fails to match the live
 *      container (container.querySelector / container.matches both return nothing).
 *      This reuses the existing resolve() machinery and avoids any dependency on the dead
 *      selectorSessionMisses / recordMiss signal (which has zero runtime call sites).
 *      COMPANY_PAGE_MARKER (URL substring) and POST_URN_ATTR (attribute name) are excluded
 *      from the DOM-healable set because they are not querySelector inputs (D-05).
 *
 *   2. Route each stale target by shape:
 *      - Card-shaped (POST_CARD, POST_BODY_TEXT) → heuristic deriver (local, no API call,
 *        ADAPT-02).  Validate each candidate; first passing one is written via insertCandidate
 *        with source 'heuristic' (ADAPT-02, D-07).  If none validate → outcome 'failed'.
 *      - Sub-element targets → LLM re-deriver (ADAPT-03).  Requires API key from storage.
 *        If key absent → outcome 'unchanged' (degrade gracefully, D-04).  If present →
 *        buildDomSkeleton → LLMRederiver.rederive → validate-then-insert with source 'llm'.
 *        Per-target errors are caught; one target failure never aborts the others (D-06).
 *
 *   3. Return a per-target HealOutcome[] listing only the targets that were in the heal set
 *      (i.e. were stale).  Non-stale targets are not represented.
 *
 * The validate-before-write gate (HEAL-05 / D-07) is preserved: insertCandidate is the ONLY
 * write surface; no candidate is ever written without a prior validateCandidate(.pass) check.
 * Model-proposed strings are data only — never eval'd; the validator passes them only to
 * querySelectorAll (ADAPT-06).
 *
 * The single-flight/cool-off latch that wraps the entire promise lives in the content-side
 * TRIGGER_HEAL message listener (Plan 03).  triggerHeal itself is stateless.
 *
 * This module also exposes the two stateless Core-4 guards (isFeedUrl, hasFeedContainer)
 * used by observer.ts to suppress false-positive breakage detection (the other two guards —
 * session-activity and the 30s zero-match window — own observer-side state).
 *
 * Requirements: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-06, ADAPT-09, HEAL-03, HEAL-05
 */

import { resolve, insertCandidate } from '../../../content/selector-registry';
import { deriveHeuristicCandidates } from './heuristic';
import { validateCandidate } from './validator';
import { buildDomSkeleton } from './sanitizer';
import { LLMRederiver } from './rederiver';
import { storageGet } from '../../../shared/memory/storage';
import type { HealOutcome } from '../../../shared/heal-messages';
import type { SelectorTarget } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Internal target sets
// ---------------------------------------------------------------------------

/** Card-shaped targets routed through the heuristic deriver. */
const CARD_TARGETS: ReadonlyArray<'POST_CARD' | 'POST_BODY_TEXT'> = [
  'POST_CARD',
  'POST_BODY_TEXT',
];

/**
 * Sub-element targets routed through the LLM re-deriver.
 * POST_URN_ATTR (attribute name) and COMPANY_PAGE_MARKER (URL substring) are intentionally
 * absent — they are not querySelector inputs and must never appear in the heal set (D-05).
 */
const SUB_ELEMENT_TARGETS: ReadonlyArray<SelectorTarget> = [
  'SPONSORED_MARKER',
  'AUTHOR_HEADLINE',
  'CONNECTION_DEGREE',
  'COMMENT_EXPAND_BUTTON',
  'COMMENT_TEXT',
  'OPEN_TO_WORK_MARKER',
];

// ---------------------------------------------------------------------------
// Core-4 stateless guards
// ---------------------------------------------------------------------------

/**
 * Core-4 guard #1: only the LinkedIn feed route is eligible for breakage detection.
 * A profile/jobs/messaging route legitimately has no post-body spans.
 */
export function isFeedUrl(): boolean {
  return location.pathname === '/feed/' || location.pathname === '/feed';
}

/**
 * Core-4 guard #2: a feed container (or its fallback) must be present. A logged-out
 * wall has neither, so zero post matches there is expected, not breakage.
 * Uses the live resolve() so a broken FEED_CONTAINER falls through to the fallback.
 */
export function hasFeedContainer(): boolean {
  return (
    document.querySelector(resolve('FEED_CONTAINER')) !== null ||
    document.querySelector(resolve('FEED_CONTAINER_FALLBACK')) !== null
  );
}

// ---------------------------------------------------------------------------
// Staleness probe
// ---------------------------------------------------------------------------

/**
 * A target is stale when its current active selector — resolve(target) — fails to match
 * the live container.  We check both querySelector (descendant match) and matches
 * (the container element itself matches the selector) to cover narrow card selectors.
 */
function isStale(target: SelectorTarget, container: Element): boolean {
  const selector = resolve(target);
  try {
    return (
      container.querySelector(selector) === null &&
      !container.matches(selector)
    );
  } catch {
    // Invalid selector in storage — treat as stale
    return true;
  }
}

// ---------------------------------------------------------------------------
// Generalized heal orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the generalized self-healing loop against a live feed container.
 *
 * Builds the heal set LIVE by probing each DOM-healable target with its current resolve()
 * selector; stale targets are healed by shape-based routing (heuristic for card targets,
 * LLM for sub-element targets when an API key is configured).
 *
 * Returns a HealOutcome[] listing every target that was stale (whether healed, failed,
 * or skipped due to a missing API key).  Non-stale targets are not represented.
 *
 * @param container - The live feed container element.
 * @param manual    - When true, the call originates from the dashboard manual heal button.
 *                    Passed through to LLMRederiver so the background can skip the 5-minute
 *                    cool-off for this run (daily cap and single-flight latch still apply).
 *                    Defaults to false (automatic observer-triggered heals keep the cool-off).
 */
export async function triggerHeal(container: Element, manual = false): Promise<HealOutcome[]> {
  const outcomes: HealOutcome[] = [];

  // ── Card-shaped targets: heuristic deriver ────────────────────────────────
  for (const target of CARD_TARGETS) {
    if (!isStale(target, container)) {
      continue; // not stale — skip (not included in outcomes)
    }

    const heuristics = deriveHeuristicCandidates(target, container);
    let healed = false;

    for (const h of heuristics) {
      const valid = validateCandidate(h.selector, container);
      if (valid.pass) {
        await insertCandidate(target, h.selector, 'heuristic');
        console.info('[LLB] heal: heuristic candidate accepted for', target, ':', h.selector);
        outcomes.push({ target, result: 'healed' });
        healed = true;
        break;
      }
      console.warn('[LLB] heal: heuristic candidate rejected for', target, ':', h.selector, '-', valid.reason);
    }

    if (!healed) {
      outcomes.push({ target, result: 'failed' });
    }
  }

  // ── Sub-element targets: LLM re-deriver ───────────────────────────────────
  // Fetch API key once — shared across all sub-element targets in this run.
  const apiKeyResult = await storageGet(['anthropicApiKey']);
  const apiKey = apiKeyResult.anthropicApiKey as string | undefined;

  if (!apiKey) {
    // No API key — all stale sub-element targets degrade gracefully to 'unchanged'
    for (const target of SUB_ELEMENT_TARGETS) {
      if (!isStale(target, container)) {
        continue;
      }
      console.warn('[LLB] heal: no API key — skipping sub-element target', target);
      outcomes.push({ target, result: 'unchanged' });
    }
    return outcomes;
  }

  // API key present — run LLM re-deriver per stale sub-element target
  const skeleton = buildDomSkeleton(container);

  for (const target of SUB_ELEMENT_TARGETS) {
    if (!isStale(target, container)) {
      continue;
    }

    try {
      const rederiver = new LLMRederiver();
      const llmCandidates = await rederiver.rederive(target, skeleton, manual);
      let healed = false;

      for (const c of llmCandidates) {
        const valid = validateCandidate(c.selector, container);
        if (valid.pass) {
          await insertCandidate(target, c.selector, 'llm');
          console.info('[LLB] heal: LLM candidate accepted for', target, ':', c.selector);
          outcomes.push({ target, result: 'healed' });
          healed = true;
          break;
        }
        console.warn('[LLB] heal: LLM candidate rejected for', target, ':', c.selector, '-', valid.reason);
      }

      if (!healed) {
        console.warn('[LLB] heal: no LLM candidate matched live DOM for', target, '(element likely not on page)');
        outcomes.push({ target, result: 'not-found', reason: 'not found on current page' });
      }
    } catch (err) {
      // Per-target error — distinguish rate-limited from genuine failure (D-06 / T-34-05)
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[LLB] heal: error re-deriving', target, ':', msg);
      if (msg.startsWith('rate-limited:')) {
        outcomes.push({ target, result: 'rate-limited', reason: msg });
      } else {
        outcomes.push({ target, result: 'failed', reason: msg });
      }
    }
  }

  return outcomes;
}
