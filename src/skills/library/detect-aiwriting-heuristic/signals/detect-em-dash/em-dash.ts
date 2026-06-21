/**
 * Em-dash overuse signal detector.
 *
 * AI (especially GPT-family) compulsively uses em-dashes (—) as clause separators at
 * statistically abnormal rates. Density > 2 per 100 words is a strong signal.
 *
 * Pure function: no DOM access, no side effects.
 */

/**
 * Checks the em-dash frequency in post text.
 * @param text - The full post text.
 * @returns 10 for density > 2/100 words, 5 for density > 1/100 words, 0 otherwise.
 *          Returns 0 for texts under 30 words (floor to avoid false positives on short posts).
 */
export function checkEmDash(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words < 30) return 0; // 30-word floor: avoid false positives on short posts

  const emDashes = (text.match(/—/g) ?? []).length;
  const density = (emDashes / words) * 100;

  if (density > 2) return 10; // > 2 per 100 words: strong signal
  if (density > 1) return 5;  // > 1 per 100 words: weak signal
  return 0;
}
