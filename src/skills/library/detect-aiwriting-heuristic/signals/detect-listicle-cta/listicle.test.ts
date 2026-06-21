/**
 * Unit tests for the pure checkListicle signal function.
 * Happy-path, edge cases, and ReDoS regression (< 50ms on 3000-char adversarial input).
 */

import { describe, it, expect } from 'vitest';
import { checkListicle } from './listicle';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkListicle', () => {
  it('returns >= 8 for a numbered listicle with >= 3 lines', () => {
    const text = 'Some intro text\n1. Foo\n2. Bar\n3. Baz\nSome outro';
    expect(checkListicle(text)).toBeGreaterThanOrEqual(8);
  });

  it('returns 12 for a listicle header + >= 2 numbered items', () => {
    const text =
      'Here are 5 things you must do to succeed in your career\n1. Wake up early\n2. Read every day\n3. Network constantly';
    expect(checkListicle(text)).toBe(12);
  });

  it('returns 0 for plain prose', () => {
    const text = 'I went to the store today. It was a wonderful experience.';
    expect(checkListicle(text)).toBe(0);
  });

  it('returns 6 for a header with no numbered lines (truncated content)', () => {
    const text = 'Here are 3 reasons why you should invest in yourself.';
    expect(checkListicle(text)).toBe(6);
  });

  it('ReDoS: 3000-char repeated pattern completes in < 50ms', () => {
    const adversarial = '1. 1. 1. '.repeat(334); // ~3006 chars of repeated numbered pattern
    const ms = elapsed(() => checkListicle(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
