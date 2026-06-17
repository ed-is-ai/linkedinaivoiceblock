import { describe, it, expect } from 'vitest';
import { checkHookStory } from './hook-story';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkHookStory', () => {
  it('returns 0 for text under 20 words', () => {
    expect(checkHookStory('I was sitting when it happened.')).toBe(0);
  });

  it('returns 0 for plain professional post with no hook', () => {
    const text = 'Excited to share that we shipped a new feature today. The team worked incredibly hard over the past three months to build something our customers have been asking for. Really proud of everyone involved.';
    expect(checkHookStory(text)).toBe(0);
  });

  it('returns 15 for a single hook pattern (anecdote opener)', () => {
    const text = 'I was sitting in a meeting when our CEO said something that changed how I think about leadership. He paused and looked around the room. Then he said the one thing no one expected to hear that day.';
    expect(checkHookStory(text)).toBe(15);
  });

  it('returns 20 for two or more hook patterns', () => {
    const text = "I was reviewing code when a senior developer told me something I'll never forget. He looked at me and said the words that changed my entire career trajectory. Last year, I didn't understand. Now I do.";
    expect(checkHookStory(text)).toBe(20);
  });

  it('returns 15 for "A [title] told me" pattern', () => {
    const text = 'A mentor told me something years ago that I still think about every single day when I sit down to do deep work on my most important projects and goals.';
    expect(checkHookStory(text)).toBe(15);
  });

  it('returns 15 for "Years ago, I" pattern', () => {
    const text = 'Years ago, I made a mistake that cost our company three months of work and thousands of dollars in wasted effort that we could never recover or get back.';
    expect(checkHookStory(text)).toBe(15);
  });

  it('ReDoS: 3000-char adversarial string completes in < 50ms', () => {
    const adversarial = 'I was working on working on working on '.repeat(80);
    const ms = elapsed(() => checkHookStory(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
