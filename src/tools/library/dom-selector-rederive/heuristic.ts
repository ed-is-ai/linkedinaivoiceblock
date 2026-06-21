/**
 * Heuristic selector re-deriver (ADAPT-02).
 *
 * When SelectorRegistry detects total breakage on POST_CARD or POST_BODY_TEXT,
 * this module walks the live feed container for data-attribute / role analogs
 * and returns ranked candidates. Every candidate is then passed through
 * validateCandidate before SelectorRegistry.insertCandidate() persists it.
 *
 * This file performs NO storage writes (CLAUDE.md constraint #1 — only
 * SelectorRegistry may write selector strings to storage). It does NOT
 * contain any inline selector literals; the currently-active broken selector
 * is obtained via resolve() from selector-registry.
 *
 * Requirement: ADAPT-02
 */

import { resolve } from '../../../content/selector-registry';

/**
 * A single heuristic-derived selector candidate.
 * Source is always 'heuristic'; confidence is a 0-1 float for ordering.
 */
export interface HeuristicCandidate {
  /** CSS selector string derived from live DOM analysis. Never contains class or id tokens (D6). */
  selector: string;
  /** Confidence score in the range [0, 1]. Higher = more likely to be a valid post-card selector. */
  confidence: number;
  /** Always 'heuristic' for candidates produced by this module. */
  source: 'heuristic';
}

/**
 * Source weight for heuristic-derived candidates.
 * Matches the ADAPT-08 formula: seed=0.6, heuristic=0.8, llm=0.9, user=1.0.
 */
const SOURCE_WEIGHT = 0.8;

/**
 * Denominator in the confidence formula: (matchCount / CONFIDENCE_SCALE) * sourceWeight.
 * 20 = "a full feed page"; a group of 20 elements gets max base confidence of 0.8.
 */
const CONFIDENCE_SCALE = 20;

/**
 * Minimum group size to consider as a post-card candidate.
 * Groups with fewer members are likely UI chrome, not post cards.
 */
const MIN_GROUP_SIZE = 2;

/**
 * Maximum group size to consider as a post-card candidate.
 * Groups with more members are likely layout noise.
 */
const MAX_GROUP_SIZE = 50;

/**
 * Confidence score for the role="article" fallback candidate.
 * Lower than a data-attribute candidate at 20 members (0.8) to prefer structural selectors.
 */
const ROLE_ARTICLE_CONFIDENCE = 0.7;

/**
 * Derive heuristic selector candidates from a live feed container.
 *
 * Algorithm (3 steps):
 *   1. Read the currently-active broken selector via resolve(target) to log context.
 *   2. Walk container.children, grouping elements by `tagName[attrName]` for
 *      attributes starting with `data-` or equal to `componentkey`.
 *   3. For each group with 2-50 members, produce a candidate with
 *      confidence = min(1.0, (matchCount/20) * 0.8).
 *      Also add [role="article"] when 2-50 children have role=article.
 *
 * Guarantees:
 *   - Never returns a selector with a CSS class (.) or id (#) token (D6).
 *   - Never writes to storage (CLAUDE.md constraint #1).
 *   - Never throws on empty or null container.
 *   - Candidates are sorted descending by confidence.
 *
 * @param target    - The selector target being re-derived ('POST_CARD' | 'POST_BODY_TEXT').
 * @param container - The live DOM element to walk (e.g. feed container).
 * @returns Array of HeuristicCandidate sorted by descending confidence. Empty if no candidates found.
 */
export function deriveHeuristicCandidates(
  target: 'POST_CARD' | 'POST_BODY_TEXT',
  container: Element,
): HeuristicCandidate[] {
  if (!container) {
    return [];
  }

  // Step 1: read the currently-active broken selector via resolve() — never inline literals
  // This is used for context/logging; the real work is the DOM walk below.
  const _brokenSelector = resolve(target);
  void _brokenSelector; // suppress unused-variable lint; resolve() is called for CLAUDE.md constraint #1

  const candidates: HeuristicCandidate[] = [];
  const children = Array.from(container.children);

  if (children.length === 0) {
    return [];
  }

  // Step 2: Group children by tagName[attrName] for data-* attrs and componentkey
  const attrGroups = new Map<string, Element[]>();
  for (const child of children) {
    for (const attr of Array.from(child.attributes)) {
      if (attr.name.startsWith('data-') || attr.name === 'componentkey') {
        const key = `${child.tagName.toLowerCase()}[${attr.name}]`;
        if (!attrGroups.has(key)) {
          attrGroups.set(key, []);
        }
        attrGroups.get(key)!.push(child);
      }
    }
  }

  // Step 3: For each qualifying group, produce a candidate
  for (const [selector, elements] of attrGroups) {
    const matchCount = elements.length;
    if (matchCount < MIN_GROUP_SIZE || matchCount > MAX_GROUP_SIZE) {
      continue;
    }
    const confidence = Math.min(1.0, (matchCount / CONFIDENCE_SCALE) * SOURCE_WEIGHT);
    candidates.push({ selector, confidence, source: 'heuristic' });
  }

  // role="article" fallback: count children with role=article
  const articleChildren = children.filter((c) => c.getAttribute('role') === 'article');
  if (articleChildren.length >= MIN_GROUP_SIZE && articleChildren.length <= MAX_GROUP_SIZE) {
    candidates.push({
      selector: '[role="article"]',
      confidence: ROLE_ARTICLE_CONFIDENCE,
      source: 'heuristic',
    });
  }

  // Sort descending by confidence
  return candidates.sort((a, b) => b.confidence - a.confidence);
}
