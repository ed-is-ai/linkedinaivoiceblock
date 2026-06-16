/**
 * Unit tests for the pure checkEmDash signal function.
 * Happy-path, edge cases, and ReDoS regression (< 50ms on 3000-char adversarial input).
 */

import { describe, it, expect } from 'vitest';
import { checkEmDash } from './em-dash';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkEmDash', () => {
  it('returns >= 5 for text of 50 words with 2 em-dashes (density ~4/100)', () => {
    const words = new Array(48).fill('word').join(' ');
    const text = `First part — second part ${words} — final`;
    const wordCount = text.trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(50);
    expect(checkEmDash(text)).toBeGreaterThanOrEqual(5);
  });

  it('returns 10 for density > 2/100 words on a 50-word text with 2 em-dashes', () => {
    // 50 words, 2 em-dashes → 4/100 → returns 10
    const words = new Array(46).fill('word').join(' ');
    const text = `word — word — ${words}`;
    expect(checkEmDash(text)).toBe(10);
  });

  it('returns 0 for text with no em-dashes', () => {
    const text = new Array(50).fill('ordinary word').join(' ');
    expect(checkEmDash(text)).toBe(0);
  });

  it('returns 0 for text under 30 words even with em-dashes', () => {
    const text = 'Short — text — with — five — em — dashes here now.';
    // Should be < 30 words
    expect(checkEmDash(text)).toBe(0);
  });

  it('ReDoS: 3000-char string of em-dashes completes in < 50ms', () => {
    const adversarial = '— '.repeat(1500); // 3000 chars of em-dashes
    const ms = elapsed(() => checkEmDash(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
