/**
 * Unit tests for the pure checkAiVocab signal function.
 * Happy-path, edge cases, and ReDoS regression (< 50ms on 3000-char adversarial input).
 */

import { describe, it, expect } from 'vitest';
import { checkAiVocab } from './ai-vocab';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkAiVocab', () => {
  it('returns 12 for high AI-vocab density (> 2/100 words)', () => {
    // ~30 words, 3 AI-vocab hits → density ~10/100
    const text =
      'In this meticulous tapestry of ideas, we must delve into the intricate interplay ' +
      'between innovation and tradition, underscoring the testament to human creativity.';
    expect(checkAiVocab(text)).toBe(12);
  });

  it('returns 6 for low AI-vocab density (1–2/100 words)', () => {
    // ~100 neutral words + 1 AI-vocab hit → density ~1/100
    const filler = new Array(99).fill('word').join(' ');
    const text = `${filler} delve`;
    expect(checkAiVocab(text)).toBe(6);
  });

  it('returns 12 for >= 2 negative parallelisms', () => {
    const text =
      'Not just a job, but also a calling. Not just a skill, but also a mindset. ' +
      'This is how we grow together as a community of professionals.';
    expect(checkAiVocab(text)).toBe(12);
  });

  it('returns 6 for 1 negative parallelism with no vocab hits', () => {
    const filler = new Array(30).fill('ordinary').join(' ');
    const text = `Not just a strategy, but also a philosophy. ${filler}`;
    expect(checkAiVocab(text)).toBe(6);
  });

  it('returns 0 for plain ordinary prose', () => {
    const text =
      'I had coffee with a friend today and we talked about the weather, our weekend ' +
      'plans, and what we have been reading lately. It was a nice catch-up.';
    expect(checkAiVocab(text)).toBe(0);
  });

  it('returns 0 for text under 20 words even with AI vocab', () => {
    const text = 'Let us delve into this meticulous tapestry.';
    expect(checkAiVocab(text)).toBe(0);
  });

  it('ReDoS: 3000-char adversarial string completes in < 50ms', () => {
    const adversarial = 'not just '.repeat(334); // ~3006 chars of repeated pattern
    const ms = elapsed(() => checkAiVocab(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
