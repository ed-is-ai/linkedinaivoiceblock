/**
 * Unit tests for the pure checkBuzzwords signal function.
 * Happy-path, edge cases, and ReDoS regression (< 50ms on 3000-char adversarial input).
 */

import { describe, it, expect } from 'vitest';
import { checkBuzzwords } from './buzzwords';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkBuzzwords', () => {
  it('returns 15 for high buzzword density (> 3/100 words)', () => {
    const text =
      'We will leverage synergy to pivot to a disruptive paradigm shift across actionable insights for thought leaders who seek scalable bandwidth with bleeding edge value-add and innovative holistic low-hanging fruit that moves the needle.';
    expect(checkBuzzwords(text)).toBe(15);
  });

  it('returns 0 for ordinary prose', () => {
    const text =
      'I had coffee with a friend today and we talked about the weather and our weekend plans together and made arrangements to meet again next week.';
    expect(checkBuzzwords(text)).toBe(0);
  });

  it('returns 0 for text under 20 words even with buzzwords', () => {
    const text = 'We will leverage synergy';
    expect(checkBuzzwords(text)).toBe(0);
  });

  it('returns 8 for moderate buzzword density (1.5–3/100 words)', () => {
    // ~100 neutral words + 2 buzzword hits → density ~2/100
    const filler = new Array(98).fill('word').join(' ');
    const text = `${filler} leverage synergy`;
    expect(checkBuzzwords(text)).toBe(8);
  });

  it('ReDoS: 3000-char string of repeated chars completes in < 50ms', () => {
    const adversarial = 'a'.repeat(3000);
    const ms = elapsed(() => checkBuzzwords(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
