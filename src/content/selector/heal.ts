/**
 * Self-healing orchestrator (ADAPT-01 wiring target / ADAPT-02 / ADAPT-03 / ADAPT-06).
 *
 * triggerHeal runs the full repair loop when the observer (observer.ts) detects total
 * scraping breakage on the post feed:
 *   1. Heuristic pass — deriveHeuristicCandidates walks the live container (no API call).
 *      Each candidate is gated through validateCandidate; the FIRST that passes is written
 *      via SelectorRegistry.insertCandidate and the loop returns (free repair, ADAPT-02).
 *   2. LLM fallback — only if NO heuristic candidate validated AND an API key is configured.
 *      Sends only a PII-stripped skeleton (buildDomSkeleton) to the service worker via
 *      LLMRederiver; each returned candidate is gated through the same validator; the first
 *      that passes is written with source 'llm' (ADAPT-03).
 *
 * No selector is ever written until validateCandidate passes (the only write surface is
 * insertCandidate). Model-proposed strings are data only — they are never eval'd; the
 * validator only ever passes them to querySelectorAll (ADAPT-06).
 *
 * This module also exposes the two stateless Core-4 guards (isFeedUrl, hasFeedContainer)
 * used by observer.ts to suppress false-positive breakage detection (the other two guards —
 * session-activity and the 30s zero-match window — own observer-side state).
 *
 * Requirements: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-06, ADAPT-09
 */

import { resolve, insertCandidate } from '../selector-registry';
import { deriveHeuristicCandidates } from './heuristic';
import { validateCandidate } from './validator';
import { buildDomSkeleton } from './sanitizer';
import { LLMRederiver } from '../detector/rederiver';
import { storageGet } from '../../shared/storage';

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

/**
 * Run the self-healing loop against a live feed container: heuristics first (validate +
 * insert the first that passes), then the LLM fallback (only when heuristics yield no
 * validated candidate and an API key is configured). Resolves whether or not a heal was
 * written — callers fire-and-forget and release their own heal lock in a finally.
 *
 * @param container - The live feed container element to re-derive a POST_CARD selector from.
 */
export async function triggerHeal(container: Element): Promise<void> {
  // Step 1: heuristic pass — local, no API call (ADAPT-02)
  const heuristics = deriveHeuristicCandidates('POST_CARD', container);
  for (const h of heuristics) {
    const valid = validateCandidate(h.selector, container);
    if (valid.pass) {
      await insertCandidate('POST_CARD', h.selector, 'heuristic');
      console.info('[LLB] heal: heuristic candidate accepted:', h.selector);
      return;
    }
    console.warn('[LLB] heal: heuristic candidate rejected:', h.selector, '-', valid.reason);
  }

  // Step 2: LLM fallback — only if no heuristic validated AND an API key is configured (ADAPT-03)
  const apiKeyResult = await storageGet(['anthropicApiKey']);
  if (!apiKeyResult.anthropicApiKey) {
    console.warn('[LLB] heal: no API key - LLM fallback skipped');
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
      console.info('[LLB] heal: LLM candidate accepted:', c.selector, '-', c.rationale);
      return;
    }
    console.warn('[LLB] heal: LLM candidate rejected:', c.selector, '-', valid.reason);
  }

  console.warn('[LLB] heal: all candidates failed validation - selector unchanged');
}
