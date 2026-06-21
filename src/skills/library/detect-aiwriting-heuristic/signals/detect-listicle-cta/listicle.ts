/**
 * Listicle structure signal detector.
 *
 * Detects numbered list posts ("5 Things I Learned...", "Here are 3 reasons...") that are
 * a strong indicator of AI-generated LinkedIn content.
 *
 * Returns 0–12 based on presence of numbered items and/or a listicle header.
 * Pure function: no DOM access, no side effects.
 */

/** Matches a line starting with a number followed by a period or closing parenthesis. */
const NUMBERED_LINE = /^\s*\d+[\.\)]\s/m;

/** Matches a header phrase like "here are 5 things" or "5 lessons" etc. */
const LISTICLE_HEADER = /\b(here'?s?\s+)?\d+\s+(things?|reasons?|lessons?|tips?|ways?|steps?)\b/i;

const MIN_NUMBERED_ITEMS = 3;

/**
 * Checks whether post text exhibits a listicle structure.
 * @param text - The full post text.
 * @returns Numeric signal weight: 12 (header + items), 8 (items only), 6 (header only), 0 (no signal).
 */
export function checkListicle(text: string): number {
  const headerMatch = LISTICLE_HEADER.test(text);
  const lines = text.split('\n');
  const numberedLines = lines.filter(l => NUMBERED_LINE.test(l)).length;

  if (headerMatch && numberedLines >= 2) return 12; // strong listicle signal: header + items
  if (numberedLines >= MIN_NUMBERED_ITEMS) return 8; // numbered structure without header
  if (headerMatch) return 6; // header but no numbered items (content may be truncated)
  return 0;
}
