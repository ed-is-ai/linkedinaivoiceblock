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
import type { ObservedPost } from '../shared/types';

// ---------------------------------------------------------------------------
// Module-scope state
// ---------------------------------------------------------------------------

let currentObserver: MutationObserver | null = null;
const processedPosts = new Set<string>();
let storedOnPost: ((post: ObservedPost) => void) | null = null;
let lastUrl = location.href;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// waitForFeedContainer
// ---------------------------------------------------------------------------

async function waitForFeedContainer(): Promise<Element | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const el =
      document.querySelector(resolve('FEED_CONTAINER')) ??
      document.querySelector(resolve('FEED_CONTAINER_FALLBACK'));
    if (el) return el;
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
  const innerCard = card.querySelector(resolve('RESHARE_INDICATOR'));
  const sourceEl = innerCard ?? card;

  const authorAnchor = ([...sourceEl.querySelectorAll(resolve('POST_AUTHOR_LINK'))] as HTMLAnchorElement[])
    .find(a => (a.textContent ?? '').trim().length > 0) ?? null;
  const authorProfileUrl = authorAnchor?.href ?? '';
  const authorName = (
    authorAnchor?.querySelector('strong')?.textContent?.trim() ||
    authorAnchor?.querySelector('span')?.textContent?.trim() ||
    authorAnchor?.textContent?.trim() ||
    '<unknown>'
  );

  const slugMatch = /\/in\/([^/?#]+)/.exec(authorProfileUrl);
  const authorId = slugMatch?.[1] ?? '';

  const postText = (sourceEl.querySelector(resolve('POST_BODY_TEXT'))?.textContent ?? '').replace(/\s+/g, ' ').trim();

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

  const urnAttrSelector = resolve('POST_URN_ATTR');
  const urn = outermost.getAttribute(urnAttrSelector) ?? '';
  if (!urn || processedPosts.has(urn)) return;

  processedPosts.add(urn);
  // Wire winner rotation (fire-and-forget)
  updateCandidate('POST_URN_ATTR', urnAttrSelector).catch(() => {});
  onPost(extractPostData(outermost, urn));
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
  });

  // Observe document.body so LinkedIn's virtual scrolling (which replaces the
  // LazyColumn rather than appending to it) does not detach the observer.
  observer.observe(document.body, { childList: true, subtree: true });

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
