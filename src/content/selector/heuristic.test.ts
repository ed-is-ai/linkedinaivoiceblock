/**
 * Tests for deriveHeuristicCandidates (ADAPT-02).
 * Covers D6 (no class/id tokens), class-rot heal proof, confidence ordering,
 * edge cases (empty container, filter bounds).
 *
 * All fixtures are built inline via DOM manipulation to avoid external fixture file
 * dependencies, mirroring the pattern in exclusions.test.ts and validator.test.ts.
 *
 * Requirements: ADAPT-02, D6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveHeuristicCandidates } from './heuristic';
import { validateCandidate } from './validator';

// Mock the selector-registry resolve() so tests control what the "broken" seed returns
vi.mock('../selector-registry', () => ({
  resolve: vi.fn((target: string) => {
    if (target === 'POST_CARD') return 'div[componentkey]';
    if (target === 'POST_BODY_TEXT') return 'span[data-testid="expandable-text-box"]';
    return '[data-unknown]';
  }),
}));

// ── Fixture builders ────────────────────────────────────────────────────────

/**
 * Build a container simulating a HEALTHY feed where all children have [componentkey].
 * Used to verify the algorithm finds data-* attributes generally.
 */
function buildHealthyFeed(count: number = 8): Element {
  const container = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.setAttribute('componentkey', `card-${i}`);
    card.innerHTML = `
      <a href="/in/user-${i}">User ${i}</a>
      <span>Post body text that is definitely longer than ten characters for post ${i}</span>
    `;
    container.appendChild(card);
  }
  return container;
}

/**
 * Build a class-rot fixture: children use data-urn instead of componentkey.
 * This simulates LinkedIn rebuilding their DOM after a deploy.
 * Each child has author links + post text so the derived selector passes validation.
 */
function buildClassRotFeed(count: number = 8): Element {
  const container = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.setAttribute('data-urn', `urn:li:activity:${1000 + i}`);
    card.innerHTML = `
      <a href="/in/user-${i}">User ${i}</a>
      <span>Post body text that is definitely longer than ten characters for post ${i}</span>
    `;
    container.appendChild(card);
  }
  return container;
}

/**
 * Build a container where children have role="article".
 */
function buildRoleArticleFeed(count: number = 5): Element {
  const container = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.setAttribute('role', 'article');
    card.innerHTML = `
      <a href="/in/user-${i}">User ${i}</a>
      <span>Post body text that is definitely longer than ten characters for article ${i}</span>
    `;
    container.appendChild(card);
  }
  return container;
}

// ── Basic behavior ──────────────────────────────────────────────────────────

describe('deriveHeuristicCandidates — basic behavior', () => {
  it('returns an array for a healthy feed container (POST_CARD)', () => {
    const container = buildHealthyFeed(8);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns candidates with source="heuristic"', () => {
    const container = buildHealthyFeed(8);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((c) => {
      expect(c.source).toBe('heuristic');
    });
  });

  it('returns candidates with confidence in 0..1 range', () => {
    const container = buildHealthyFeed(10);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    results.forEach((c) => {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('returns candidates sorted by descending confidence', () => {
    const container = buildHealthyFeed(10);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]!.confidence).toBeGreaterThanOrEqual(results[i + 1]!.confidence);
    }
  });
});

// ── D6: no class or id tokens ──────────────────────────────────────────────

describe('deriveHeuristicCandidates — D6: no class or id tokens (CLAUDE.md constraint #1)', () => {
  it('no returned candidate contains a CSS class token (.)', () => {
    const container = buildHealthyFeed(8);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    results.forEach((c) => {
      expect(c.selector).not.toMatch(/\.[a-zA-Z]/);
    });
  });

  it('no returned candidate contains a CSS id token (#)', () => {
    const container = buildHealthyFeed(8);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    results.forEach((c) => {
      expect(c.selector).not.toContain('#');
    });
  });
});

// ── Class-rot scenario ──────────────────────────────────────────────────────

describe('deriveHeuristicCandidates — class-rot heal (ADAPT-02)', () => {
  it('on class-rot fixture (seed div[componentkey] matches 0), returns at least one candidate', () => {
    const container = buildClassRotFeed(8);
    // The seed selector div[componentkey] matches 0 children in this container
    const seedMatches = container.querySelectorAll('div[componentkey]');
    expect(seedMatches.length).toBe(0);

    const results = deriveHeuristicCandidates('POST_CARD', container);
    expect(results.length).toBeGreaterThan(0);
  });

  it('top candidate on class-rot fixture is data-*-based (e.g. div[data-urn])', () => {
    const container = buildClassRotFeed(8);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    expect(results.length).toBeGreaterThan(0);
    // Top candidate should be data-* shaped
    const top = results[0]!;
    expect(top.selector).toMatch(/\[data-/);
  });

  it('top heuristic candidate on class-rot fixture passes validateCandidate — heal proof (ADAPT-02)', () => {
    const container = buildClassRotFeed(8);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    expect(results.length).toBeGreaterThan(0);

    const top = results[0]!;
    const validation = validateCandidate(top.selector, container);
    expect(validation.pass).toBe(true);
  });
});

// ── role="article" fallback ─────────────────────────────────────────────────

describe('deriveHeuristicCandidates — role="article" fallback candidate', () => {
  it('produces a [role="article"] candidate when 2-50 children have role=article', () => {
    const container = buildRoleArticleFeed(5);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    const roleCandidate = results.find((c) => c.selector === '[role="article"]');
    expect(roleCandidate).toBeDefined();
    expect(roleCandidate!.source).toBe('heuristic');
  });

  it('role="article" candidate has confidence 0.7', () => {
    const container = buildRoleArticleFeed(5);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    const roleCandidate = results.find((c) => c.selector === '[role="article"]');
    expect(roleCandidate).toBeDefined();
    expect(roleCandidate!.confidence).toBe(0.7);
  });

  it('does NOT produce role="article" when only 1 child has role=article (below 2 threshold)', () => {
    const container = document.createElement('div');
    const card = document.createElement('div');
    card.setAttribute('role', 'article');
    container.appendChild(card);

    const results = deriveHeuristicCandidates('POST_CARD', container);
    const roleCandidate = results.find((c) => c.selector === '[role="article"]');
    expect(roleCandidate).toBeUndefined();
  });

  it('does NOT produce role="article" when >50 children have role=article (above 50 threshold)', () => {
    const container = document.createElement('div');
    for (let i = 0; i < 51; i++) {
      const card = document.createElement('div');
      card.setAttribute('role', 'article');
      container.appendChild(card);
    }

    const results = deriveHeuristicCandidates('POST_CARD', container);
    const roleCandidate = results.find((c) => c.selector === '[role="article"]');
    expect(roleCandidate).toBeUndefined();
  });
});

// ── Filter bounds ───────────────────────────────────────────────────────────

describe('deriveHeuristicCandidates — attribute group filter bounds', () => {
  it('excludes attribute groups with <2 members (singleton attributes)', () => {
    const container = document.createElement('div');
    // Only 1 child with this attribute
    const card = document.createElement('div');
    card.setAttribute('data-singleton', 'only-one');
    container.appendChild(card);

    const results = deriveHeuristicCandidates('POST_CARD', container);
    const singletonCandidate = results.find((c) => c.selector.includes('data-singleton'));
    expect(singletonCandidate).toBeUndefined();
  });

  it('excludes attribute groups with >50 members (too broad)', () => {
    const container = document.createElement('div');
    // 51 children all with same data-attr
    for (let i = 0; i < 51; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-broad', `item-${i}`);
      container.appendChild(card);
    }

    const results = deriveHeuristicCandidates('POST_CARD', container);
    const broadCandidate = results.find((c) => c.selector.includes('data-broad'));
    expect(broadCandidate).toBeUndefined();
  });

  it('includes attribute group with exactly 2 members', () => {
    const container = document.createElement('div');
    for (let i = 0; i < 2; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-pair', `item-${i}`);
      container.appendChild(card);
    }

    const results = deriveHeuristicCandidates('POST_CARD', container);
    const pairCandidate = results.find((c) => c.selector.includes('data-pair'));
    expect(pairCandidate).toBeDefined();
  });

  it('includes attribute group with exactly 50 members', () => {
    const container = document.createElement('div');
    for (let i = 0; i < 50; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-fifty', `item-${i}`);
      container.appendChild(card);
    }

    const results = deriveHeuristicCandidates('POST_CARD', container);
    const fiftyCandidate = results.find((c) => c.selector.includes('data-fifty'));
    expect(fiftyCandidate).toBeDefined();
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('deriveHeuristicCandidates — edge cases', () => {
  it('returns empty array for a childless container (no throw)', () => {
    const container = document.createElement('div');
    // container has no children
    expect(container.children.length).toBe(0);
    const results = deriveHeuristicCandidates('POST_CARD', container);
    expect(results).toEqual([]);
  });

  it('returns empty array for container with only text nodes (no element children)', () => {
    const container = document.createElement('div');
    container.appendChild(document.createTextNode('some text'));
    const results = deriveHeuristicCandidates('POST_CARD', container);
    expect(results).toEqual([]);
  });

  it('handles POST_BODY_TEXT target without throwing', () => {
    const container = buildClassRotFeed(5);
    expect(() => {
      deriveHeuristicCandidates('POST_BODY_TEXT', container);
    }).not.toThrow();
  });
});

// ── Confidence formula ──────────────────────────────────────────────────────

describe('deriveHeuristicCandidates — confidence formula', () => {
  it('larger groups produce higher confidence than smaller groups (within same attr type)', () => {
    const container = document.createElement('div');
    // 5 children with data-urn
    for (let i = 0; i < 5; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-urn', `urn-${i}`);
      container.appendChild(card);
    }
    // 15 children with data-other (larger group)
    for (let i = 0; i < 15; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-other', `other-${i}`);
      container.appendChild(card);
    }

    const results = deriveHeuristicCandidates('POST_CARD', container);
    const urnCand = results.find((c) => c.selector.includes('data-urn'));
    const otherCand = results.find((c) => c.selector.includes('data-other'));

    expect(urnCand).toBeDefined();
    expect(otherCand).toBeDefined();
    // data-other has more members (15 vs 5), so higher confidence
    expect(otherCand!.confidence).toBeGreaterThan(urnCand!.confidence);
  });

  it('confidence does not exceed 1.0 even for large groups (capped at 1.0)', () => {
    const container = document.createElement('div');
    // 20 children — confidence formula: (20/20)*0.8 = 0.8, still under 1.0
    // But 25 children: (25/20)*0.8 = 1.0
    for (let i = 0; i < 25; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-large', `item-${i}`);
      container.appendChild(card);
    }

    const results = deriveHeuristicCandidates('POST_CARD', container);
    results.forEach((c) => {
      expect(c.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});
