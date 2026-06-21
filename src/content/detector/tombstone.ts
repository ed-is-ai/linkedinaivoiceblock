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
 * Injects an auto-hidden tombstone as a sibling before postNode.
 *
 * Pirate-themed: a black ship silhouette + "Flying false colours: [authorName]"
 * (a suspected-AI post sailing under a false flag), the detection score with a
 * random pirate quip, and a "Take a peek anyway" button (top-right) that reveals
 * the post on demand.
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
  tombstone.setAttribute('role', 'status');

  // Ship logo + humorous copy. authorName set via textContent only — never the
  // inner-HTML property (D-09 / T-02-09 XSS mitigation). Logo is a DOM-built SVG.
  const line1 = document.createElement('div');
  line1.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:600';
  line1.appendChild(buildPirateShip());
  const title = document.createElement('span');
  title.textContent = `Flying false colours: ${authorName}`;
  line1.appendChild(title);

  // Reveal control (top-right). Clicking reveals the post and removes our
  // tombstone. postNode.classList.remove() touches only the class (CLAUDE.md #2);
  // the tombstone is our own node, so removing it is safe.
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'llb-tombstone__reveal';
  reveal.style.marginLeft = 'auto';
  reveal.setAttribute('aria-label', `Reveal post by ${authorName}`);
  reveal.textContent = '🔭 Take a peek anyway';
  reveal.addEventListener('click', () => {
    postNode.classList.remove('llb-hidden');
    tombstone.remove();
  });
  line1.appendChild(reveal);

  const line2 = document.createElement('div');
  line2.style.cssText = 'font-size:11px;margin-top:2px;opacity:0.8';
  line2.textContent = `Score: ${score}/100 — ${pickPirateLine()}`;

  tombstone.appendChild(line1);
  tombstone.appendChild(line2);

  // Insert as sibling BEFORE the post — not inside — to survive React VDom reconciliation
  // (Pitfall 4, T-02-12). postNode.parentNode may be null if the post was removed from
  // the DOM between scoring and tombstone injection; the optional chain handles this safely.
  postNode.parentNode?.insertBefore(tombstone, postNode);
}

/**
 * Pirate quips for the blocked tombstone score line. One is chosen at random
 * per blocked post (see {@link pickPirateLine}). Exported for tests.
 */
export const PIRATE_LINES: readonly string[] = [
  'no buried treasure here',
  'walked straight off the gangplank',
  "tossed to Davy Jones' locker",
  'all chum, no catch',
  'dead men tell no humblebrags',
  'scuttled before it could set sail',
  'marooned on Engagement Island',
  'yo ho ho and a bottle of nope',
  'shiver me feed, not today',
  'straight to the brig with ye',
  'no wind in these sails',
  'abandon thread!',
  'plank-walked for crimes against the timeline',
  'fed to the kraken',
  'all hashtags, no doubloons',
  'that be a keelhaulin\', matey',
  'swabbed from the deck of yer feed',
  'X marks the block',
  'this booty be cursed',
  'nothin\' but barnacles and buzzwords',
];

/** Pick a random pirate line. */
export function pickPirateLine(): string {
  return PIRATE_LINES[Math.floor(Math.random() * PIRATE_LINES.length)]!;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let svgSeq = 0;

/** Create a namespaced SVG element with the given attributes. */
function makeSvg(name: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/**
 * Build a black skull-and-crossbones (Jolly Roger) logo on a transparent
 * background. Constructed entirely via the DOM (no innerHTML) — the markup is
 * static and trusted, but DOM construction keeps us clear of inner-HTML usage.
 * Eye/nose holes are carved with a <mask> so the skull shape reads clearly.
 */
function buildPirateLogo(): SVGSVGElement {
  const maskId = `llb-skull-${svgSeq++}`;
  const svg = makeSvg('svg', {
    viewBox: '0 0 64 64', width: 30, height: 30,
    fill: '#000', 'aria-hidden': 'true', focusable: 'false',
  }) as SVGSVGElement;
  svg.style.flexShrink = '0';

  // Mask: white = visible skull, black = transparent cut-outs (eyes + nose).
  const defs = makeSvg('defs', {});
  const mask = makeSvg('mask', { id: maskId });
  mask.appendChild(makeSvg('rect', { width: 64, height: 64, fill: '#fff' }));
  mask.appendChild(makeSvg('circle', { cx: 24, cy: 24, r: 5, fill: '#000' }));
  mask.appendChild(makeSvg('circle', { cx: 40, cy: 24, r: 5, fill: '#000' }));
  mask.appendChild(makeSvg('path', { d: 'M32 29 l-3.5 8 h7 z', fill: '#000' }));
  defs.appendChild(mask);
  svg.appendChild(defs);

  // Crossed bones behind the skull, with knobs at each end.
  const bones = makeSvg('g', { stroke: '#000', 'stroke-width': 5, 'stroke-linecap': 'round' });
  bones.appendChild(makeSvg('line', { x1: 12, y1: 46, x2: 52, y2: 64 }));
  bones.appendChild(makeSvg('line', { x1: 52, y1: 46, x2: 12, y2: 64 }));
  svg.appendChild(bones);
  for (const [cx, cy] of [[12, 46], [52, 64], [52, 46], [12, 64]] as const) {
    svg.appendChild(makeSvg('circle', { cx, cy, r: 4 }));
  }

  // Skull (cranium + jaw) with eye/nose holes via the mask.
  const skull = makeSvg('g', { mask: `url(#${maskId})` });
  skull.appendChild(makeSvg('ellipse', { cx: 32, cy: 24, rx: 16, ry: 15 }));
  skull.appendChild(makeSvg('rect', { x: 24, y: 33, width: 16, height: 13, rx: 4 }));
  svg.appendChild(skull);

  return svg;
}

/**
 * Build a black pirate-ship (galleon) silhouette on a transparent background.
 * Solid silhouette — hull, mast, two billowed sails, and a pennant flag — so
 * no mask is needed. DOM-built (no innerHTML).
 */
function buildPirateShip(): SVGSVGElement {
  const svg = makeSvg('svg', {
    viewBox: '0 0 64 64', width: 32, height: 32,
    fill: '#000', 'aria-hidden': 'true', focusable: 'false',
  }) as SVGSVGElement;
  svg.style.flexShrink = '0';

  // Mast + pennant flag.
  svg.appendChild(makeSvg('rect', { x: 31, y: 8, width: 2.5, height: 38 }));
  svg.appendChild(makeSvg('path', { d: 'M33.5 8 l9 3 l-9 3 z' }));
  // Billowed sails either side of the mast.
  svg.appendChild(makeSvg('path', { d: 'M34 13 C 46 16, 46 33, 34 35 Z' }));
  svg.appendChild(makeSvg('path', { d: 'M30.5 13 C 18 16, 18 33, 30.5 35 Z' }));
  // Hull.
  svg.appendChild(makeSvg('path', { d: 'M7 45 H57 L51 54 Q32 60 13 54 Z' }));

  return svg;
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

  // Pirate logo + humorous copy. authorName set via textContent only — never the
  // inner-HTML property (D-09 / T-02-09 XSS mitigation; authorName is untrusted
  // DOM text). The logo is a DOM-built SVG (no innerHTML anywhere).
  const line1 = document.createElement('div');
  line1.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:600';
  line1.appendChild(buildPirateLogo());
  const title = document.createElement('span');
  title.textContent = `Made to walk the plank: ${authorName}`;
  line1.appendChild(title);

  // Reveal control: blocked posts stay hidden by default, but the user can opt
  // to peek. Sits top-right on the name row. Clicking reveals the post and
  // removes our tombstone. postNode.classList.remove() touches only the class
  // (CLAUDE.md #2); the tombstone is our own node, so removing it is safe.
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'llb-tombstone__reveal';
  reveal.style.marginLeft = 'auto';
  reveal.setAttribute('aria-label', `Reveal blocked post by ${authorName}`);
  reveal.textContent = '🔭 Take a peek anyway';
  reveal.addEventListener('click', () => {
    postNode.classList.remove('llb-hidden');
    tombstone.remove();
  });
  line1.appendChild(reveal);

  const line2 = document.createElement('div');
  line2.style.cssText = 'font-size:11px;margin-top:2px;opacity:0.8';
  line2.textContent = `Post score: ${postScore} · Profile score: ${profileScore} — ${pickPirateLine()}`;

  tombstone.appendChild(line1);
  tombstone.appendChild(line2);
  postNode.parentNode?.insertBefore(tombstone, postNode);
}
