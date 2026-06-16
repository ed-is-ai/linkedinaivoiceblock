/**
 * Hook-story opener signal detector.
 *
 * AI-generated LinkedIn posts frequently open with a neat first-person
 * anecdote or attributed quote to create emotional engagement. The story
 * exists purely to introduce a generic lesson — it is suspiciously tidy
 * and universally relatable, unlike genuine personal stories.
 *
 * Pure function: no DOM access, no side effects.
 */

/**
 * Patterns for hook-story openers.
 * All quantifiers are bounded to prevent ReDoS on adversarial input.
 */
const HOOK_PATTERNS: readonly RegExp[] = [
  // "I was [verb-ing] when..." — classic anecdote structure
  /\bI was \w+ing\b.{0,50}when\b/i,
  // "I had a [conversation/meeting/call/moment] with [person]"
  /\bI had a (?:conversation|meeting|call|moment|chat|session)\b/i,
  // "A [title] [told/asked/said/taught/showed] me"
  /\bA (?:CEO|founder|manager|mentor|leader|senior|director|VP|executive|colleague|stranger|developer|engineer|designer|professor|coach)\b.{0,60}(?:told|asked|said|taught|showed|shared with|reminded)\s+me\b/i,
  // "My [mentor/boss/etc.] once/always/told me..."
  /\bMy (?:mentor|boss|manager|CEO|founder|coach|teacher|father|mother|professor|colleague|friend)\b.{0,80}(?:once|always|told me|said|reminded me|taught me)/i,
  // "Last [week/month/year/day], I [verb]..."
  /\bLast (?:week|month|year|Monday|Tuesday|Wednesday|Thursday|Friday|quarter)\b.{0,40}\bI\b/i,
  // "Years ago / Months ago / Weeks ago, I..."
  /\b(?:Years?|Months?|Weeks?|Days?) ago,?\s+I\b/i,
  // "I'll never forget" / "I remember when"
  /\bI(?:'ll| will) never forget\b/i,
  /\bI remember when\b/i,
];

/**
 * Checks for hook-story opener patterns in post text.
 *
 * @param text - The full post text.
 * @returns 20 for two or more hook patterns, 15 for one, 0 for none or texts under 20 words.
 */
export function checkHookStory(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words < 20) return 0;

  const hits = HOOK_PATTERNS.filter(re => re.test(text)).length;
  if (hits >= 2) return 20;
  if (hits === 1) return 15;
  return 0;
}
