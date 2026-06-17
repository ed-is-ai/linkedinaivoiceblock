/**
 * AI-vocabulary signal detector.
 *
 * Detects linguistic patterns strongly correlated with LLM-generated text, based on
 * Wikipedia's "Signs of AI writing" catalogue. These differ from generic corporate
 * buzzwords (checkBuzzwords) — they are vocabulary choices characteristic of LLM
 * output itself rather than corporate-speak that humans also produce.
 *
 * Two sub-signals are combined:
 *   1. AI-vocabulary density — overuse of LLM-favoured words (delve, meticulous, etc.)
 *   2. Negative parallelisms — "not just X, but also Y" constructions common in AI prose
 *
 * Pure function: no DOM access, no side effects.
 */

/**
 * Vocabulary items strongly associated with LLM output.
 * Sources: Wikipedia §Signs of AI writing — "High-density AI vocabulary" and
 * "Promotional language" sections.
 */
const AI_VOCAB: readonly string[] = [
  // LLM era 2023–mid-2024
  'delve',
  'intricate',
  'interplay',
  'meticulous',
  'underscore',
  'testament',
  'tapestry',
  // LLM era mid-2024–mid-2025
  'fostering',
  'showcasing',
  'highlighting',
  'align with',
  'aligned with',
  // Promotional / travel-guide markers
  'nestled',
  'vibrant',
  'groundbreaking',
  'diverse array',
  'in the heart of',
  // Filler hedge phrases
  'it is worth noting',
  'it is important to note',
  'it is essential to',
  // Marketing-verb copulative substitutes
  'serves as a',
  'marks a pivotal',
  'pivotal moment',
  'represents a shift',
  'multifaceted',
  'nuanced',
  'remarkable',
];

/**
 * Compiled alternation regex for AI vocabulary terms.
 * Built once at module scope — never recompiled per call.
 */
const toPattern = (w: string) => w.replaceAll(' ', '\\s+');
const AI_VOCAB_RE = new RegExp(
  String.raw`\b(${AI_VOCAB.map(toPattern).join('|')})\b`,
  'gi',
);

/**
 * Negative parallelism pattern: "not just X, but (also) Y".
 * Common AI construction for creating an appearance of nuance.
 * Bounded lookahead (.{0,60}) prevents catastrophic backtracking.
 */
const PARALLELISM_RE = /\bnot\s+just\b.{0,60}?\bbut\s+(?:also\s+)?\b/gi;

/**
 * Checks for AI-vocabulary density and negative parallelisms in post text.
 *
 * @param text - The full post text.
 * @returns 12 for high density (> 2/100 words or ≥ 2 parallelisms),
 *          6 for low density (> 1/100 words or 1 parallelism),
 *          0 otherwise. Returns 0 for texts under 20 words.
 */
export function checkAiVocab(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words < 20) return 0;

  let vocabHits = 0;
  AI_VOCAB_RE.lastIndex = 0;
  while (AI_VOCAB_RE.exec(text) !== null) vocabHits++;

  let parallelisms = 0;
  PARALLELISM_RE.lastIndex = 0;
  while (PARALLELISM_RE.exec(text) !== null) parallelisms++;

  const density = (vocabHits / words) * 100;

  if (density > 2 || parallelisms >= 2) return 12;
  if (density >= 1 || parallelisms >= 1) return 6;
  return 0;
}
