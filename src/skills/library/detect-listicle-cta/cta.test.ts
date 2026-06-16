/**
 * Unit tests for the pure checkCta signal function.
 * Happy-path, edge cases, and ReDoS regression (< 50ms on 3000-char adversarial input).
 */

import { describe, it, expect } from 'vitest';
import { checkCta } from './cta';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkCta', () => {
  it("returns 10 for text containing both opener and closer", () => {
    const text =
      "I'm excited to announce my new project. We've worked hard on this. What do you think?";
    expect(checkCta(text)).toBe(10);
  });

  it('returns 6 for text with only a closer phrase', () => {
    const text = 'Here is some insight. Drop a comment below if you agree.';
    expect(checkCta(text)).toBe(6);
  });

  it('returns 4 for text with only an opener phrase', () => {
    // "humbled and honored" = opener; no closer phrase present
    const text = 'Humbled and honored by this recognition from my colleagues. It means a lot.';
    expect(checkCta(text)).toBe(4);
  });

  it('returns 0 for plain text with no CTA patterns', () => {
    const text = 'I had a productive meeting today and learned something new.';
    expect(checkCta(text)).toBe(0);
  });

  it('ReDoS: 3000-char string completes in < 50ms', () => {
    const adversarial = 'aaa'.repeat(1000); // 3000 'a' chars
    const ms = elapsed(() => checkCta(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
