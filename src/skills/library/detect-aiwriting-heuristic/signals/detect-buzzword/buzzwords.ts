/**
 * Buzzword density signal detector.
 *
 * Measures the density of AI-favoured corporate buzzwords relative to total word count.
 * High buzzword density (> 3 per 100 words) is a strong indicator of AI-generated content.
 *
 * Pure function: no DOM access, no side effects.
 */

/** Canonical buzzword vocabulary per FEATURES.md §High-confidence indicators. */
const BUZZWORDS: readonly string[] = [
  'synergy',
  'leverage',
  'game-changer',
  'game changer',
  'disruptive',
  'innovative',
  'thought leader',
  'holistic',
  'paradigm shift',
  'actionable insights',
  'move the needle',
  'circle back',
  'deep dive',
  'boil the ocean',
  'bleeding edge',
  'best-in-class',
  'value-add',
  'low-hanging fruit',
  'scalable',
  'bandwidth',
  'pivot',
];

/**
 * Compiled alternation regex for all buzzwords.
 * Built once at module scope — never recompiled per call.
 */
const BUZZ_RE = new RegExp(
  `\\b(${BUZZWORDS.map(w => w.replace(/ /g, '\\s+')).join('|')})\\b`,
  'gi',
);

/**
 * Checks the buzzword density in post text.
 * @param text - The full post text.
 * @returns 15 for density > 3/100 words, 8 for density > 1.5/100 words, 0 otherwise.
 *          Returns 0 for texts under 20 words (too short to be meaningful).
 */
export function checkBuzzwords(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words < 20) return 0; // too short to be meaningful

  const hits = (text.match(BUZZ_RE) ?? []).length;
  const density = (hits / words) * 100;

  if (density > 3) return 15;  // > 3 per 100 words: strong signal
  if (density > 1.5) return 8; // > 1.5 per 100 words: weak signal
  return 0;
}
