/**
 * Tests for validateCandidate — 3-gate validation gate.
 * Covers D1 (match bounds), D2 (injection safety), D5 (author-link ratio + post-text),
 * D6 (CSS class/id forbidden), D9 (sponsored contamination advisory).
 * Requirements: ADAPT-06, ADAPT-07, ADAPT-08, ADAPT-10
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateCandidate } from './validator';

// ── Adversarial selector strings (D2 injection safety) ─────────────────────
const ADVERSARIAL_SELECTORS = [
  // Blocklist exact
  'body',
  'html',
  '*',
  ':root',
  // CSS class/id selectors (CLAUDE.md constraint #1, D6)
  '.feed-shared-update-v2',
  '#main-content',
  '.some-class',
  // Injection attempt strings (ADAPT-06, D2)
  '");alert(1)//',
  '<script>alert(1)</script>',
  'div[eval("x")]',
  'javascript:alert(1)',
  '[window]',
  '[document]',
  'function()',
];

/**
 * Build a container with N post-card elements that each have:
 *   - An author link <a href="/in/username">
 *   - Some post body text
 * Used for tests that need to pass Gate 2 and Gate 3.
 */
function buildValidContainer(count: number): Element {
  const container = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.setAttribute('data-testid', 'post-card');
    card.innerHTML = `
      <a href="/in/user-${i}">User ${i}</a>
      <span>Post body text for testing that is longer than ten characters</span>
    `;
    container.appendChild(card);
  }
  return container;
}

/**
 * Build a container with N elements that have author links but NO post-body text.
 */
function buildNoTextContainer(count: number): Element {
  const container = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.setAttribute('data-testid', 'post-card');
    card.innerHTML = `<a href="/in/user-${i}"></a>`;
    container.appendChild(card);
  }
  return container;
}

/**
 * Build a container where elements have no author links (e.g. job cards).
 */
function buildNoAuthorLinkContainer(count: number): Element {
  const container = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.setAttribute('data-testid', 'post-card');
    card.innerHTML = `<a href="/jobs/view/${i}">Job ${i}</a><span>Job description text</span>`;
    container.appendChild(card);
  }
  return container;
}

describe('validateCandidate — adversarial/injection rejection (D2, D6)', () => {
  it.each(ADVERSARIAL_SELECTORS)(
    'rejects adversarial selector: "%s"',
    (badSelector) => {
      const container = buildValidContainer(5);
      const result = validateCandidate(badSelector, container);
      expect(result.pass).toBe(false);
    },
  );
});

describe('validateCandidate — blocklist exact (D2)', () => {
  it('rejects "body" — blocklisted exact', () => {
    const result = validateCandidate('body', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('blocklisted');
  });

  it('rejects "html" — blocklisted exact', () => {
    const result = validateCandidate('html', document.body);
    expect(result.pass).toBe(false);
  });

  it('rejects "*" — blocklisted exact', () => {
    const result = validateCandidate('*', document.body);
    expect(result.pass).toBe(false);
  });

  it('rejects ":root" — blocklisted exact', () => {
    const result = validateCandidate(':root', document.body);
    expect(result.pass).toBe(false);
  });

  it('blocklist check fires BEFORE any querySelectorAll runs', () => {
    // If blocklist is evaluated after querySelectorAll, "body" would match many elements.
    // We verify the reason specifically indicates blocklisted (not count-related).
    const result = validateCandidate('body', document.body);
    expect(result.reason).toMatch(/blocklisted/i);
    expect(result.matchCount).toBe(0);
  });
});

describe('validateCandidate — dangerous token rejection fires before querySelectorAll (D2)', () => {
  it('rejects selector with <script> tag — dangerous token', () => {
    const result = validateCandidate('<script>alert(1)</script>', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/dangerous token/i);
    expect(result.matchCount).toBe(0);
  });

  it('rejects selector with injection attempt — dangerous token', () => {
    const result = validateCandidate('");alert(1)//', document.body);
    expect(result.pass).toBe(false);
    expect(result.matchCount).toBe(0);
  });
});

describe('validateCandidate — CSS class/id guard (D6, CLAUDE.md constraint #1)', () => {
  it('rejects ".feed-shared-update-v2" — CSS class selector forbidden', () => {
    const result = validateCandidate('.feed-shared-update-v2', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/class or id/i);
  });

  it('rejects "#main-content" — CSS id selector forbidden', () => {
    const result = validateCandidate('#main-content', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/class or id/i);
  });

  it('rejects ".some-class" — CSS class selector forbidden', () => {
    const result = validateCandidate('.some-class', document.body);
    expect(result.pass).toBe(false);
  });
});

describe('validateCandidate — invalid CSS selector syntax', () => {
  it('rejects syntactically invalid selector — reason includes "invalid CSS selector syntax"', () => {
    const result = validateCandidate('div[[broken', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('invalid CSS selector syntax');
    expect(result.matchCount).toBe(0);
  });
});

describe('validateCandidate — match count bounds (D1, ADAPT-07, ADAPT-08)', () => {
  it('rejects selector matching exactly 1 element — too few (D8/ADAPT-08)', () => {
    document.body.innerHTML = '<div data-only="one"><a href="/in/x">u</a><span>text here enough</span></div>';
    const result = validateCandidate('[data-only]', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/too few/i);
  });

  it('rejects selector matching 0 elements — too few', () => {
    document.body.innerHTML = '<div></div>';
    const result = validateCandidate('[data-nonexistent]', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/too few/i);
  });

  it('rejects selector matching >50 elements — too broad (ADAPT-07)', () => {
    document.body.innerHTML = '';
    for (let i = 0; i < 51; i++) {
      document.body.innerHTML += `<div data-broad="yes"></div>`;
    }
    const result = validateCandidate('[data-broad]', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/too many/i);
  });

  it('accepts selector matching exactly 2 elements with valid author links and text', () => {
    const container = buildValidContainer(2);
    const result = validateCandidate('[data-testid="post-card"]', container);
    expect(result.pass).toBe(true);
    expect(result.matchCount).toBe(2);
  });

  it('accepts selector matching exactly 50 elements with valid author links and text', () => {
    const container = buildValidContainer(50);
    const result = validateCandidate('[data-testid="post-card"]', container);
    expect(result.pass).toBe(true);
    expect(result.matchCount).toBe(50);
  });
});

describe('validateCandidate — author-link ratio gate (D5, ADAPT-10)', () => {
  it('rejects when <=50% of matches have author links (job-card ratio)', () => {
    const container = buildNoAuthorLinkContainer(5);
    const result = validateCandidate('[data-testid="post-card"]', container);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/author-link ratio/i);
  });

  it('rejects skeleton elements — no author links at all', () => {
    document.body.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-testid', 'post-card');
      card.innerHTML = '<div class="skeleton"></div>';
      document.body.appendChild(card);
    }
    const result = validateCandidate('[data-testid="post-card"]', document.body);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/author-link ratio/i);
  });

  it('passes when >50% of matches have author links', () => {
    const container = buildValidContainer(5); // all 5 have author links
    const result = validateCandidate('[data-testid="post-card"]', container);
    expect(result.pass).toBe(true);
    expect(result.matchCount).toBe(5);
  });
});

describe('validateCandidate — post-text presence gate (D5)', () => {
  it('rejects when no matched element has post-body text >10 chars', () => {
    const container = buildNoTextContainer(5);
    const result = validateCandidate('[data-testid="post-card"]', container);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no post-body text/i);
  });
});

describe('validateCandidate — sponsored contamination advisory (D9)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns pass=true even when some matches contain Promoted marker (D9 advisory, non-blocking)', () => {
    const container = document.createElement('div');
    // 3 valid post cards + 1 with Promoted marker
    for (let i = 0; i < 4; i++) {
      const card = document.createElement('div');
      card.setAttribute('data-testid', 'post-card');
      if (i === 0) {
        // Promoted card — also has author link and text so it still passes all 3 gates
        card.innerHTML = `
          <a href="/in/sponsored">Sponsor</a>
          <span>Sponsored post body text that is long enough</span>
          <span aria-label="Promoted">Promoted</span>
        `;
      } else {
        card.innerHTML = `
          <a href="/in/user-${i}">User ${i}</a>
          <span>Post body text for testing more than ten chars</span>
        `;
      }
      container.appendChild(card);
    }

    const result = validateCandidate('[data-testid="post-card"]', container);
    expect(result.pass).toBe(true);
    expect(result.matchCount).toBe(4);
    // Advisory warning must have been called
    expect(warnSpy).toHaveBeenCalled();
  });

  it('does NOT warn when no promoted markers are present', () => {
    const container = buildValidContainer(5);
    validateCandidate('[data-testid="post-card"]', container);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('validateCandidate — matchCount in result', () => {
  it('matchCount reflects actual DOM match count on successful validation', () => {
    const container = buildValidContainer(7);
    const result = validateCandidate('[data-testid="post-card"]', container);
    expect(result.pass).toBe(true);
    expect(result.matchCount).toBe(7);
  });

  it('matchCount is 0 for blocklisted selectors', () => {
    const result = validateCandidate('body', document.body);
    expect(result.matchCount).toBe(0);
  });

  it('matchCount is correct on count-failure rejections', () => {
    document.body.innerHTML = '';
    for (let i = 0; i < 55; i++) {
      document.body.innerHTML += `<div data-broad="yes"></div>`;
    }
    const result = validateCandidate('[data-broad]', document.body);
    expect(result.pass).toBe(false);
    expect(result.matchCount).toBe(55);
  });
});
