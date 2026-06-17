/**
 * Unit tests for the pure checkGenericComments signal function.
 * Happy-path, edge cases, and ReDoS regression (< 50ms on 3000-char adversarial input).
 */

import { describe, it, expect } from 'vitest';
import { checkGenericComments } from './comments';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkGenericComments', () => {
  it('returns 0 when all comments are too short (<= 20 chars)', () => {
    const comments = ['Great insights!', "Couldn't agree more!", 'This is gold!'];
    // All are <= 20 chars, so eligible list is empty
    expect(checkGenericComments(comments)).toBe(0);
  });

  it('returns 15 when >= 2 comments exactly match the generic phrase list', () => {
    const comments = [
      'great insights! this really resonated with me.', // exact match (>20 chars)
      "couldn't agree more! this is exactly what i needed.", // exact match (>20 chars)
      'A different comment that is longer than twenty characters.',
    ];
    expect(checkGenericComments(comments)).toBe(15);
  });

  it('returns 10 when >= 2 near-duplicate pairs exist (Levenshtein < 10)', () => {
    // Three near-identical long strings — will produce >= 2 near-dup pairs
    const comments = [
      'This is a wonderful and insightful post thank you',
      'This is a wonderful and insightful post thank you!', // 1 char diff
      'This is a wonderful and insightful post thank yoU', // 1 char diff (capital)
    ];
    expect(checkGenericComments(comments)).toBe(10);
  });

  it('returns 0 when there is only one long unique comment', () => {
    const comments = ['A single long unique comment that is definitely more than twenty chars.'];
    expect(checkGenericComments(comments)).toBe(0);
  });

  it('returns 0 for diverse long comments with no near-duplicates', () => {
    const comments = [
      'This post made me think about the complexity of modern work environments.',
      'I disagree with this perspective — the evidence suggests otherwise.',
      'Great story, but I think the conclusion could be stronger with data.',
    ];
    expect(checkGenericComments(comments)).toBe(0);
  });

  it('ReDoS: 3000-char repeated string completes in < 50ms', () => {
    const adversarial = new Array(20).fill('a'.repeat(150));
    const ms = elapsed(() => checkGenericComments(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
