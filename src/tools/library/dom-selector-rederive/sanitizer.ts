/**
 * PII sanitizer — builds a privacy-safe structural DOM skeleton for the LLM fallback.
 *
 * Strips ALL personally identifiable information from a DOM subtree clone before
 * serialization. The result is sent to the service worker for the Anthropic API call.
 * The live DOM passed in is NEVER mutated — all stripping happens on a deep clone.
 *
 * What is stripped (ADAPT-04):
 *   - Text node content (replaced with empty string)
 *   - href, src, aria-label, title, alt, action, data-src attribute values (removed entirely)
 *
 * What is preserved (required for LLM structural analysis):
 *   - Tag names
 *   - data-* attribute names and values
 *   - role attribute
 *   - Nesting hierarchy (depth-capped at MAX_DEPTH, siblings capped at MAX_SIBLINGS)
 *
 * Output is truncated at MAX_CHARS (4000) to keep within the context window budget.
 * Truncation is at the last complete `>` with a `<!-- skeleton truncated -->` marker.
 *
 * Requirement: ADAPT-04
 */

/** PII-bearing attribute names removed from every element in the clone. */
const PII_ATTRS_TO_REMOVE = ['href', 'src', 'aria-label', 'title', 'alt', 'action', 'data-src'];

/** Maximum DOM nesting depth to serialize. Children below this level are removed. */
const MAX_DEPTH = 6;

/** Maximum sibling elements to retain per parent at each depth level. */
const MAX_SIBLINGS = 3;

/** Maximum serialized output length in characters before truncation. */
const MAX_CHARS = 4000;

/**
 * Builds a PII-stripped structural skeleton of a DOM element.
 *
 * Clones the container, strips all PII attributes and text-node content on the clone
 * (depth-capped + sibling-capped), serializes to a string, then enforces MAX_CHARS.
 *
 * @param container - The DOM element to serialize. Never mutated.
 * @returns A PII-free HTML skeleton string, truncated at MAX_CHARS if needed.
 */
export function buildDomSkeleton(container: Element): string {
  const clone = container.cloneNode(true) as Element;
  stripPii(clone, 0);
  const raw = serializeElement(clone);
  if (raw.length <= MAX_CHARS) return raw;
  // Truncate at the last complete closing `>` before MAX_CHARS
  const truncated = raw.slice(0, MAX_CHARS);
  const lastClose = truncated.lastIndexOf('>');
  const base = lastClose > 0 ? truncated.slice(0, lastClose + 1) : truncated;
  return base + '\n<!-- skeleton truncated -->';
}

/**
 * Recursively strips PII from a clone element in-place.
 * Removes PII attributes and blanks text node content.
 * Enforces MAX_DEPTH (removes all children beyond depth) and MAX_SIBLINGS (removes excess siblings).
 *
 * @param node  - The element to strip (must be a clone, not the live DOM node).
 * @param depth - Current nesting depth (0 = the container itself).
 */
function stripPii(node: Element, depth: number): void {
  // Remove PII attribute names (and their values) from this element
  for (const attr of PII_ATTRS_TO_REMOVE) {
    node.removeAttribute(attr);
  }

  // Blank text node content on this element's direct children
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      child.textContent = '';
    }
  }

  // Enforce sibling cap — remove excess element children from the clone
  const elementChildren = Array.from(node.children);
  const excess = elementChildren.slice(MAX_SIBLINGS);
  for (const el of excess) {
    el.remove();
  }

  const kept = elementChildren.slice(0, MAX_SIBLINGS);

  if (depth < MAX_DEPTH) {
    // Recurse into retained children
    for (const child of kept) {
      stripPii(child, depth + 1);
    }
  } else {
    // Beyond max depth — remove all remaining children
    for (const child of kept) {
      child.remove();
    }
  }
}

/**
 * Recursively serializes an element to a plain HTML string.
 * Only tag names and remaining (non-PII) attributes are emitted.
 * Text nodes are intentionally omitted — they were blanked by stripPii.
 *
 * @param el - The element to serialize (must be a stripped clone).
 * @returns The serialized HTML string.
 */
function serializeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs = Array.from(el.attributes)
    .map((a) => `${a.name}="${a.value}"`)
    .join(' ');
  const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
  const children = Array.from(el.children)
    .map((c) => serializeElement(c))
    .join('');
  return `${openTag}${children}</${tag}>`;
}
