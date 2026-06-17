/**
 * Tests for buildDomSkeleton — PII-stripped structural DOM serializer.
 * Covers ADAPT-04 (D4 PII boundary): ensures no personal identifiers cross
 * the content-script → service-worker message boundary.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildDomSkeleton } from './sanitizer';

describe('buildDomSkeleton — D4 PII boundary', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  // ── href stripping ────────────────────────────────────────────────────────
  it('strips href values from anchor elements — /in/ path absent from skeleton', () => {
    document.body.innerHTML = '<div><a href="/in/john-doe">John Doe</a></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('/in/');
    expect(skeleton).not.toContain('john-doe');
  });

  it('strips href values — author name text node is absent from skeleton', () => {
    document.body.innerHTML = '<div><a href="/in/john-doe">John Doe</a></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('John');
  });

  // ── aria-label stripping ─────────────────────────────────────────────────
  it('strips aria-label values — author name absent from skeleton', () => {
    document.body.innerHTML = '<div aria-label="Post by Jane Roe"><span>content</span></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('aria-label');
    expect(skeleton).not.toContain('Jane');
    expect(skeleton).not.toContain('Roe');
  });

  // ── src stripping ─────────────────────────────────────────────────────────
  it('strips src URLs — media.licdn.com absent from skeleton', () => {
    document.body.innerHTML = '<div><img src="https://media.licdn.com/x.jpg" /></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('media.licdn.com');
    expect(skeleton).not.toContain('src=');
  });

  // ── title stripping ───────────────────────────────────────────────────────
  it('strips title attribute values', () => {
    document.body.innerHTML = '<div title="Jane Roe profile"><span>text</span></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('title=');
    expect(skeleton).not.toContain('Jane Roe profile');
  });

  // ── alt stripping ─────────────────────────────────────────────────────────
  it('strips alt attribute values', () => {
    document.body.innerHTML = '<div><img alt="Photo of Jane Roe" /></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('alt=');
    expect(skeleton).not.toContain('Photo of Jane Roe');
  });

  // ── text node stripping ───────────────────────────────────────────────────
  it('strips text node content from the skeleton', () => {
    document.body.innerHTML = '<div><span>This is the post body by John Smith</span></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('John Smith');
    expect(skeleton).not.toContain('post body');
  });

  // ── data-* and role preservation ─────────────────────────────────────────
  it('preserves data-* attribute names and values in skeleton', () => {
    document.body.innerHTML = '<div data-testid="post-card" data-urn="urn:li:activity:123"><span>text</span></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).toContain('data-testid="post-card"');
    expect(skeleton).toContain('data-urn="urn:li:activity:123"');
  });

  it('preserves role attribute in skeleton', () => {
    document.body.innerHTML = '<div role="article"><span role="region">text</span></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).toContain('role="article"');
  });

  it('preserves tag names and nesting structure', () => {
    document.body.innerHTML = '<div><section><article><span>text</span></article></section></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).toContain('<section>');
    expect(skeleton).toContain('<article>');
    expect(skeleton).toContain('<span>');
  });

  // ── live DOM immutability ─────────────────────────────────────────────────
  it('does NOT mutate the live DOM — original element retains its href after the call', () => {
    document.body.innerHTML = '<div><a href="/in/john-doe">John Doe</a></div>';
    const container = document.body.firstElementChild as Element;
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    const originalHref = anchor.getAttribute('href');
    buildDomSkeleton(container);
    expect(anchor.getAttribute('href')).toBe(originalHref);
  });

  it('does NOT mutate the live DOM — original text content retained after call', () => {
    document.body.innerHTML = '<div><span>Original post text</span></div>';
    const container = document.body.firstElementChild as Element;
    buildDomSkeleton(container);
    expect(container.textContent).toContain('Original post text');
  });

  // ── truncation ────────────────────────────────────────────────────────────
  it('truncates output at 4000 chars and appends truncation marker for overlong input', () => {
    // Build deeply nested structure with MAX_SIBLINGS=3 children each having long data-* values.
    // After sibling capping (3 per level) and depth capping (6 levels), at MAX_DEPTH=6 and
    // MAX_SIBLINGS=3 we get at most 3^6 = 729 leaf elements. We need the serialized tag+attrs
    // to exceed 4000 chars total. Use long data-* attribute values (data-* values are preserved).
    // 3 top-level divs × 3 spans each, with a 600-char data-* value = ~3×(600+20)×3 = ~5580 chars > 4000.
    const longVal = 'a'.repeat(600);
    let html = '<div>';
    for (let i = 0; i < 3; i++) {
      html += `<div data-uid="${longVal}">`;
      for (let j = 0; j < 3; j++) {
        html += `<span data-uid="${longVal}">text</span>`;
      }
      html += '</div>';
    }
    html += '</div>';
    document.body.innerHTML = html;
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    const MARKER = '<!-- skeleton truncated -->';
    expect(skeleton.endsWith(MARKER)).toBe(true);
    // Total length should be ≤ 4000 chars + marker length
    expect(skeleton.length).toBeLessThanOrEqual(4000 + MARKER.length);
  });

  it('returns output without truncation marker when input fits within 4000 chars', () => {
    document.body.innerHTML = '<div><span data-id="123">text</span></div>';
    const container = document.body.firstElementChild as Element;
    const skeleton = buildDomSkeleton(container);
    expect(skeleton).not.toContain('<!-- skeleton truncated -->');
    expect(skeleton.length).toBeLessThanOrEqual(4000);
  });
});
