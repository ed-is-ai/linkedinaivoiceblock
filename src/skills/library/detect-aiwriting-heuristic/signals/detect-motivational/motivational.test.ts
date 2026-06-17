import { describe, it, expect } from 'vitest';
import { checkMotivational } from './motivational';

function elapsed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('checkMotivational', () => {
  it('returns 0 for text under 20 words', () => {
    expect(checkMotivational('Stop procrastinating. Start working.')).toBe(0);
  });

  it('returns 0 for plain professional post', () => {
    const text = 'Our team shipped a new feature this week after three months of development. We focused on improving the onboarding experience based on customer feedback. The results so far have been encouraging and we plan to iterate further.';
    expect(checkMotivational(text)).toBe(0);
  });

  it('returns 12 for a single motivational pattern', () => {
    const text = "Here's the truth: most people spend their entire careers waiting for permission to do the work they actually want to do. The ones who succeed don't wait for anyone to give them that permission they need.";
    expect(checkMotivational(text)).toBe(12);
  });

  it('returns 20 for two or more motivational patterns', () => {
    const text = "Stop chasing validation. Start building conviction. Most people want the result without the process. But the top performers understand that the process is the result. That hit me differently when I finally understood it.";
    expect(checkMotivational(text)).toBe(20);
  });

  it('returns 12 for "Most people...But" contrast pattern', () => {
    const text = "Most people spend their time optimising for short-term comfort rather than long-term growth and meaningful progress. But the highest performers I know always choose the harder path when it matters most in their career.";
    expect(checkMotivational(text)).toBe(12);
  });

  it("returns 12 for \"It's not about X. It's about Y.\" pattern", () => {
    const text = "It's not about working harder than everyone else around you. It's about working smarter on the things that actually move the needle and create leverage in your life and work over time.";
    expect(checkMotivational(text)).toBe(12);
  });

  it('ReDoS: 3000-char adversarial string completes in < 50ms', () => {
    const adversarial = 'Most people stop starting stop starting '.repeat(75);
    const ms = elapsed(() => checkMotivational(adversarial));
    expect(ms).toBeLessThan(50);
  });
});
