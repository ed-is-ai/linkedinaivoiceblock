/**
 * Motivational rhythm signal detector.
 *
 * AI-generated LinkedIn posts often follow an inspirational template:
 * dramatic contrast framing ("Most people X. The best people Y."),
 * imperative reversals ("Stop X. Start Y."), overdramatic pauses
 * ("That hit me differently."), or overt lesson-reveal phrases
 * ("Here's the truth:").
 *
 * Pure function: no DOM access, no side effects.
 */

const MOTIVATIONAL_PATTERNS: readonly RegExp[] = [
  // "Stop [verb-ing]. Start [verb-ing]." — very characteristic AI imperative reversal
  /\bStop \w+ing\.?\s+Start \w+ing\b/i,
  // "Most people [do X]. [Contrast group] [do Y]."
  /\bMost people\b.{0,150}(?:But|While|The (?:best|top|great|successful|right)|Instead)/is,
  // "That hit me differently." / "This changed everything." / "That stuck with me."
  /\bThat (?:hit|stuck|landed|changed|shifted)\b.{0,30}(?:differently|everything|me|with me)\b/i,
  // "Here's the truth:" / "Here's what I know:" / "Here's the thing:"
  /\bHere'?s (?:the (?:truth|thing|secret|key|lesson|reality)|what (?:I know|I've learned|most people miss))\b/i,
  // "It's not about X. It's about Y."
  /\bIt'?s not about\b.{0,60}\bIt'?s about\b/is,
  // "The [real/hard/uncomfortable] truth is..."
  /\bThe (?:real|hard|uncomfortable|simple|honest|brutal) truth\b/i,
  // "Which [type/one/person] are you?" — closing engagement formula
  /\bWhich (?:one|type|kind|person|leader|approach) are you\b\??/i,
];

/**
 * Checks for motivational rhythm patterns in post text.
 *
 * @param text - The full post text.
 * @returns 20 for two or more patterns, 12 for one, 0 for none or texts under 20 words.
 */
export function checkMotivational(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words < 20) return 0;

  const hits = MOTIVATIONAL_PATTERNS.filter(re => re.test(text)).length;
  if (hits >= 2) return 20;
  if (hits === 1) return 12;
  return 0;
}
