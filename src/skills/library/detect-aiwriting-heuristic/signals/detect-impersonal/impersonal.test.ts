import { describe, it, expect } from 'vitest';
import { checkImpersonalVoice } from './impersonal';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkImpersonalVoice', () => {
  it('returns 0 for text under 20 words', () => {
    expect(checkImpersonalVoice('Most people fail. Successful leaders thrive.')).toBe(0);
  });

  it('returns 0 for a personal post with no generic claims', () => {
    const text = "Last quarter I joined a new team and spent the first three months just listening. I made a lot of mistakes in my first few weeks, mostly because I assumed I already knew the answers. I didn't.";
    expect(checkImpersonalVoice(text)).toBe(0);
  });

  it('returns 8 for a single impersonal pattern', () => {
    const text = 'Most professionals spend the first ten years of their career optimising for salary rather than skills. By the time they realise the mistake, they are already locked into a compensation trap that is very hard to escape.';
    expect(checkImpersonalVoice(text)).toBe(8);
  });

  it('returns 15 for two or more impersonal patterns', () => {
    const text = 'Most people focus on the wrong metrics. Successful leaders understand that what you measure shapes what you build. The best teams optimise for learning speed, not output velocity. Those who thrive know the difference.';
    expect(checkImpersonalVoice(text)).toBe(15);
  });

  it('returns 8 for "The best leaders" pattern', () => {
    const text = 'The best leaders I have ever worked with share one trait in common: they ask more questions than they answer and they always make time for the people on their team no matter how busy they are.';
    expect(checkImpersonalVoice(text)).toBe(8);
  });

  it('returns 8 for a vague percentage claim', () => {
    const text = '70% of professionals say they feel disengaged at work within the first two years of joining a new company. The numbers are even worse for remote workers who never meet their colleagues in person.';
    expect(checkImpersonalVoice(text)).toBe(8);
  });

  it('ReDoS: 3000-char adversarial string completes in < 50ms', () => {
    const adversarial = 'Most people most people most people '.repeat(85);
    const ms = elapsed(() => checkImpersonalVoice(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
