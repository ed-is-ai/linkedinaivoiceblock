/**
 * Tombstone DOM utility — injects a sibling div before a hidden post.
 *
 * When a post is hidden (class 'llb-hidden' added by content/index.ts), the tombstone
 * provides a click-to-reveal control to the user.
 *
 * Injection design (D-08, Pitfall 4 / T-02-12):
 *   The tombstone is inserted as a SIBLING before postNode using parentNode.insertBefore().
 *   It is NEVER injected inside postNode. Injecting inside postNode would allow LinkedIn's
 *   React reconciler to remove it when the virtual DOM syncs, breaking the reveal control.
 *   Injecting at the parent (a feed list container) is stable across reconciliation cycles.
 *
 * Security note (D-09, T-02-09 XSS mitigation):
 *   authorName is set via `tombstone.textContent = ...` ONLY — never via the inner-HTML
 *   property. authorName originates from DOM text (observer.ts innerText), but passing it
 *   through textContent ensures any HTML characters are treated as literal text, not markup.
 *
 * CSS note:
 *   `.llb-tombstone` styling and `.llb-hidden { display: none !important }` are NOT
 *   injected here — they live in the `<style>` block added by content/index.ts (Plan 04).
 *   This keeps DOM manipulation separate from style injection.
 *
 * CLAUDE.md constraint #2:
 *   `element.remove()` is forbidden on LinkedIn-owned nodes (breaks React VDom).
 *   `postNode` is LinkedIn-owned — this function only toggles its class, never removes it.
 *   `tombstone.remove()` in the click handler is allowed because the tombstone is OUR
 *   injected node; removing our own node is safe and expected.
 */

/**
 * Injects a tombstone element as a sibling before postNode.
 *
 * The tombstone displays "Post by [authorName] hidden ([score]/100)" and removes itself
 * while revealing the hidden post when clicked.
 *
 * @param postNode - The hidden post card element (LinkedIn-owned; only its class is touched).
 * @param authorName - The author's display name (passed through textContent only; never via the inner-HTML property).
 * @param score - The composite detection score (0–100) shown in the tombstone text.
 */
export function injectTombstone(
  postNode: Element,
  authorName: string,
  score: number,
): void {
  const tombstone = document.createElement('div');
  tombstone.className = 'llb-tombstone';
  tombstone.setAttribute('role', 'button');
  tombstone.setAttribute('aria-label', `Reveal post by ${authorName}`);

  // Use textContent only — NOT the inner-HTML property (D-09 / T-02-09 XSS mitigation)
  tombstone.textContent = `Post by ${authorName} hidden (${score}/100)`;

  // Click handler: reveal the post by removing the hidden class, then remove our tombstone.
  // postNode.classList.remove() is allowed — we are modifying the class, not the node itself.
  // tombstone.remove() is allowed — the tombstone is our own injected node.
  tombstone.addEventListener('click', () => {
    postNode.classList.remove('llb-hidden');
    tombstone.remove();
  });

  // Insert as sibling BEFORE the post — not inside — to survive React VDom reconciliation
  // (Pitfall 4, T-02-12). postNode.parentNode may be null if the post was removed from
  // the DOM between scoring and tombstone injection; the optional chain handles this safely.
  postNode.parentNode?.insertBefore(tombstone, postNode);
}

/**
 * Injects a "blocked account" tombstone as a sibling before postNode.
 *
 * Pirate-themed and humorous: the blocked post is "made to walk the plank".
 * The account was explicitly blocked by the user, so the post stays hidden by
 * default — but a "Take a peek" reveal button lets the user open it on demand
 * (removes the hidden class and the tombstone, same as the regular tombstone).
 *
 * @param postScore - Peak composite score that triggered the block (0–100).
 * @param profileScore - Sum of profile signal scores (headline-formula + degree-3).
 */
export function injectBlockedTombstone(
  postNode: Element,
  authorName: string,
  postScore: number,
  profileScore: number,
): void {
  const tombstone = document.createElement('div');
  tombstone.className = 'llb-tombstone llb-tombstone--blocked';
  tombstone.setAttribute('role', 'status');

  // Pirate logo + humorous copy. textContent only — never the inner-HTML
  // property (D-09 / T-02-09 XSS mitigation; authorName is untrusted DOM text).
  const line1 = document.createElement('div');
  line1.style.cssText = 'font-weight:600';
  line1.textContent = `🏴‍☠️ Made to walk the plank: ${authorName}`;

  const line2 = document.createElement('div');
  line2.style.cssText = 'font-size:11px;margin-top:2px;opacity:0.8';
  line2.textContent = `Post score: ${postScore} · Profile score: ${profileScore} — no buried treasure here`;

  // Reveal control: blocked posts stay hidden by default, but the user can opt
  // to peek. Clicking reveals the post and removes our tombstone.
  // postNode.classList.remove() touches only the class (CLAUDE.md #2); the
  // tombstone is our own node, so removing it is safe.
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'llb-tombstone__reveal';
  reveal.setAttribute('aria-label', `Reveal blocked post by ${authorName}`);
  reveal.textContent = '🔭 Take a peek anyway';
  reveal.addEventListener('click', () => {
    postNode.classList.remove('llb-hidden');
    tombstone.remove();
  });

  tombstone.appendChild(line1);
  tombstone.appendChild(line2);
  tombstone.appendChild(reveal);
  postNode.parentNode?.insertBefore(tombstone, postNode);
}
