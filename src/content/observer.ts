/**
 * LinkedIn Blocker — MutationObserver + SPA Navigation Handler
 *
 * Exports a single entry point: startObserving(onPost).
 *
 * Strategy: trigger on span[data-testid="expandable-text-box"] appearing in the DOM.
 * That span only exists when a post's text is ready, so no text-readiness gate is needed.
 * From the span we walk up to find the outermost div[componentkey] post card.
 *
 * INFRA-04: All selector strings are imported from ./selectors.
 */

import { SELECTORS_VERSION } from './selectors';
import { resolve, updateCandidate } from './selector-registry';
import { triggerHeal, isFeedUrl, hasFeedContainer } from '../tools/library/dom-selector-rederive/heal';
import type { ObservedPost } from '../shared/types';
import type { HealOutcome } from '../shared/heal-messages';

// ---------------------------------------------------------------------------
// Module-scope state
// ---------------------------------------------------------------------------

let currentObserver: MutationObserver | null = null;
const processedPosts = new Set<string>();
let storedOnPost: ((post: ObservedPost) => void) | null = null;
let lastUrl = location.href;

// --- Breakage-detection state (Phase 23, ADAPT-01) -------------------------
// Self-healing fires only after a sustained zero-match window on an active feed,
// guarded by the Core-4 checks. All of this resets on SPA navigation (reinit).
let _zeroMatchWindowStart: number | null = null; // epoch ms the current zero-match run began
let _postsSeenThisSession = 0; // posts dispatched since the last reinit
let _healInProgress = false; // content-side single-flight guard
let _lastHealMs = 0; // epoch ms of the last heal attempt (content-side cool-off)
let _breakageInterval: ReturnType<typeof setInterval> | null = null; // re-checks the window on a static broken feed

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 500;

/** 30s rolling window of zero post matches before breakage is declared (ADAPT-01). */
const BREAKAGE_DEBOUNCE_MS = 30_000;
/** Must have dispatched >= 3 real posts this session before a heal can fire (suppresses skeleton-loader). */
const MIN_SESSION_POSTS = 3;
/** Content-side cool-off between heal attempts; the service worker enforces the real per-day cap. */
const HEAL_COOLOFF_MS = 60_000;

// ---------------------------------------------------------------------------
// waitForFeedContainer
// ---------------------------------------------------------------------------

async function waitForFeedContainer(): Promise<Element | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const feedContainerSelector = resolve('FEED_CONTAINER');
    let el = document.querySelector(feedContainerSelector);
    if (el) {
      updateCandidate('FEED_CONTAINER', feedContainerSelector).catch(() => {});
      return el;
    }
    const feedContainerFallbackSelector = resolve('FEED_CONTAINER_FALLBACK');
    el = document.querySelector(feedContainerFallbackSelector);
    if (el) {
      updateCandidate('FEED_CONTAINER_FALLBACK', feedContainerFallbackSelector).catch(() => {});
      return el;
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, BASE_DELAY_MS * Math.min(attempt + 1, 4))
    );
  }
  console.warn('[LLB] Feed container not found after retries.', {
    selectorsVersion: SELECTORS_VERSION,
    url: location.href,
  });
  return null;
}

// ---------------------------------------------------------------------------
// extractPostData
// ---------------------------------------------------------------------------

function extractPostData(card: Element, urn: string): ObservedPost {
  const reshareIndicatorSelector = resolve('RESHARE_INDICATOR');
  const innerCard = card.querySelector(reshareIndicatorSelector);
  if (innerCard) {
    updateCandidate('RESHARE_INDICATOR', reshareIndicatorSelector).catch(() => {});
  }
  const sourceEl = innerCard ?? card;

  const postAuthorLinkSelector = resolve('POST_AUTHOR_LINK');
  const authorAnchor = ([...sourceEl.querySelectorAll(postAuthorLinkSelector)] as HTMLAnchorElement[])
    .find(a => (a.textContent ?? '').trim().length > 0) ?? null;
  if (authorAnchor) {
    updateCandidate('POST_AUTHOR_LINK', postAuthorLinkSelector).catch(() => {});
  }

  const authorProfileUrl = authorAnchor?.href ?? '';
  const authorName = (
    authorAnchor?.querySelector('strong')?.textContent?.trim() ||
    authorAnchor?.querySelector('span')?.textContent?.trim() ||
    authorAnchor?.textContent?.trim() ||
    '<unknown>'
  );

  const slugMatch = /\/in\/([^/?#]+)/.exec(authorProfileUrl);
  const authorId = slugMatch?.[1] ?? '';

  const postBodyTextSelector = resolve('POST_BODY_TEXT');
  const postBodyEl = sourceEl.querySelector(postBodyTextSelector);
  if (postBodyEl) {
    updateCandidate('POST_BODY_TEXT', postBodyTextSelector).catch(() => {});
  }
  const postText = (postBodyEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

  return { urn, authorId, authorName, authorProfileUrl, postText, postNode: card };
}

// ---------------------------------------------------------------------------
// dispatchFromBox
//
// Called when a span[data-testid="expandable-text-box"] appears in the DOM.
// Walks up from the span to find the outermost div[componentkey] post card,
// then dispatches it through the pipeline.
// ---------------------------------------------------------------------------

function dispatchFromBox(box: Element, onPost: (post: ObservedPost) => void): void {
  const text = (box.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return;

  // Walk up collecting div[componentkey] ancestors; the last one found (outermost)
  // is the post card. Skip known container-level keys.
  let outermost: Element | null = null;
  let cursor: Element | null = box.parentElement;
  while (cursor && cursor.tagName !== 'BODY') {
    if (cursor.matches('div[componentkey]')) {
      const key = cursor.getAttribute('componentkey') ?? '';
      if (!key.startsWith('container-')) {
        outermost = cursor; // keep updating — last one found before BODY is outermost
      }
    }
    cursor = cursor.parentElement;
  }

  if (!outermost) return;

  // Track POST_CARD as matched
  updateCandidate('POST_CARD', 'div[componentkey]').catch(() => {});

  const urnAttrSelector = resolve('POST_URN_ATTR');
  const urn = outermost.getAttribute(urnAttrSelector) ?? '';
  if (!urn || processedPosts.has(urn)) return;

  processedPosts.add(urn);
  onPostFound(); // ADAPT-01: a real post flowed — reset the zero-match window, bump session activity
  // Wire winner rotation (fire-and-forget)
  updateCandidate('POST_URN_ATTR', urnAttrSelector).catch(() => {});
  onPost(extractPostData(outermost, urn));
}

// ---------------------------------------------------------------------------
// Breakage detection (Phase 23, ADAPT-01)
//
// Core-4 false-positive guards: (1) on the feed URL, (2) a feed container is present,
// (3) >= MIN_SESSION_POSTS already dispatched this session, (4) a sustained 30s zero-
// match window. Only when all four hold do we hand off to the heal orchestrator.
// ---------------------------------------------------------------------------

/** Core-4 guard #3: at least MIN_SESSION_POSTS posts dispatched since the last reinit. */
function hasSessionActivity(): boolean {
  return _postsSeenThisSession >= MIN_SESSION_POSTS;
}

/** A real post was dispatched: bump the session counter and clear the zero-match window. */
function onPostFound(): void {
  _postsSeenThisSession++;
  _zeroMatchWindowStart = null;
}

/**
 * Called when a DOM change leaves the feed container with zero POST_BODY_TEXT matches.
 * Opens (or continues) the 30s zero-match window; once it elapses and the Core-4 guards
 * pass, hands off to triggerHeal under a content-side single-flight + cool-off guard.
 */
function onZeroPostsFound(container: Element): void {
  if (_zeroMatchWindowStart === null) {
    _zeroMatchWindowStart = Date.now();
    return;
  }
  if (Date.now() - _zeroMatchWindowStart < BREAKAGE_DEBOUNCE_MS) {
    return; // still inside the debounce window — not yet declared broken
  }
  // 30s elapsed with zero matches — Core-4 guards (URL + container + session activity)
  if (!isFeedUrl() || !hasFeedContainer() || !hasSessionActivity()) {
    _zeroMatchWindowStart = null; // a guard failed — not a real breakage
    return;
  }
  _zeroMatchWindowStart = null;
  // Delegate to the shared guarded entry — if it returns null the guard was busy (already
  // accounted for by the single-flight latch inside requestGuardedHeal).
  requestGuardedHeal(container).catch(() => {});
}

/** Resolve the live feed container fresh from the DOM (never a captured reference). */
export function liveFeedContainer(): Element | null {
  return (
    document.querySelector(resolve('FEED_CONTAINER')) ??
    document.querySelector(resolve('FEED_CONTAINER_FALLBACK'))
  );
}

/**
 * Single exported guarded heal entry — wraps the single-flight + cool-off latch so both
 * the automatic trigger (onZeroPostsFound) and the manual TRIGGER_HEAL listener share
 * exactly ONE latch in the content realm (D-08).
 *
 * Returns the per-target HealOutcome[] on success, or `null` when the guard declines
 * entry (heal in flight or cool-off not yet elapsed) so the caller can map `null` to
 * the { error: HEAL_BUSY } sentinel without running a concurrent heal.
 */
export async function requestGuardedHeal(container: Element): Promise<HealOutcome[] | null> {
  if (_healInProgress || Date.now() - _lastHealMs < HEAL_COOLOFF_MS) {
    return null; // guard busy — caller maps this to HEAL_BUSY sentinel
  }
  _healInProgress = true;
  _lastHealMs = Date.now();
  try {
    return await triggerHeal(container);
  } finally {
    _healInProgress = false;
  }
}

/** Evaluate the zero-match window after a mutation batch (or on the safety interval). */
function checkBreakage(): void {
  // Re-resolve the live container every time: LinkedIn replaces the LazyColumn on virtual
  // scroll WITHOUT a URL change, so a captured reference would go stale and report zero
  // posts on a healthy feed, firing a false-positive heal (review finding #1).
  const container = liveFeedContainer();
  if (!container) return;
  const hasPosts = container.querySelectorAll(resolve('POST_BODY_TEXT')).length > 0;
  if (hasPosts) {
    _zeroMatchWindowStart = null; // posts present — feed is healthy
    return;
  }
  onZeroPostsFound(container);
}

// ---------------------------------------------------------------------------
// processElement
// ---------------------------------------------------------------------------

function processElement(el: Element, onPost: (post: ObservedPost) => void): void {
  // Dispatch from any text-box spans in this element or its descendants.
  const postBodyTextSelector = resolve('POST_BODY_TEXT');
  if (el.matches(postBodyTextSelector)) {
    dispatchFromBox(el, onPost);
  } else {
    for (const box of el.querySelectorAll(postBodyTextSelector)) {
      dispatchFromBox(box, onPost);
    }
  }
}

// ---------------------------------------------------------------------------
// attachObserver
// ---------------------------------------------------------------------------

function attachObserver(
  container: Element,
  onPost: (post: ObservedPost) => void
): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        processElement(node as Element, onPost);
      }
    }
    checkBreakage(); // ADAPT-01: re-evaluate the zero-match window after each mutation batch
  });

  // Observe document.body so LinkedIn's virtual scrolling (which replaces the
  // LazyColumn rather than appending to it) does not detach the observer.
  observer.observe(document.body, { childList: true, subtree: true });

  // Safety interval: a fully broken feed stops mutating, so re-check the zero-match
  // window on a timer so the 30s breakage threshold can still elapse (ADAPT-01).
  if (_breakageInterval !== null) clearInterval(_breakageInterval);
  _breakageInterval = setInterval(checkBreakage, 5_000);

  // Initial scan: dispatch any posts already in the DOM.
  for (const box of container.querySelectorAll(resolve('POST_BODY_TEXT'))) {
    dispatchFromBox(box, onPost);
  }

  return observer;
}

// ---------------------------------------------------------------------------
// installSpaNavigationHandler
// ---------------------------------------------------------------------------

function installSpaNavigationHandler(reinit: () => void): void {
  window.addEventListener('popstate', () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(reinit, 1000);
    }
  });

  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args);
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(reinit, 1000);
    }
  };
}

// ---------------------------------------------------------------------------
// reinit
// ---------------------------------------------------------------------------

async function reinit(): Promise<void> {
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
  }
  processedPosts.clear();

  // ADAPT-01: reset breakage-detection state on SPA navigation so a healthy new
  // route does not inherit the previous route's zero-match window or session count.
  _zeroMatchWindowStart = null;
  _postsSeenThisSession = 0;
  _healInProgress = false;
  if (_breakageInterval !== null) {
    clearInterval(_breakageInterval);
    _breakageInterval = null;
  }

  const container = await waitForFeedContainer();
  if (container && storedOnPost) {
    currentObserver = attachObserver(container, storedOnPost);
  }
}

// ---------------------------------------------------------------------------
// startObserving (public API)
// ---------------------------------------------------------------------------

export function startObserving(
  onPost: (post: ObservedPost) => void
): void {
  storedOnPost = onPost;
  reinit();
  installSpaNavigationHandler(() => reinit());
}
