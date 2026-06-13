/**
 * Profile signal detectors — headline formula and connection degree proxy.
 *
 * Implements DETECT-06 (Phase 3): two profile signals extracted from the post card DOM.
 * Profile signals add 5–10 pts each to the overall score; they cannot alone push a post
 * over any threshold (D-08, 03-CONTEXT.md).
 *
 * Signal keys stored in FlaggedAccount.signals:
 *   - 'headline-formula' : 0–10 pts
 *   - 'degree-3'         : 0 or 5 pts
 *
 * Pure functions (checkHeadlineFormula, checkConnectionDegree) have no DOM access and are
 * fully testable in Node. DOM access is isolated to extractProfileSignals().
 */

import { resolve } from '../../selector-registry';

// ---------------------------------------------------------------------------
// Headline formula signal
// ---------------------------------------------------------------------------

/**
 * Buzzwords and formulaic phrases that are characteristic of AI-generated LinkedIn headlines.
 * Checked case-insensitively. Each hit contributes +2 pts (capped at +5 from buzzwords).
 *
 * Per FEATURES.md §"2. Fake / Thin Profile Detection" and D-07 (03-CONTEXT.md).
 */
export const HEADLINE_BUZZWORDS: readonly string[] = [
  'visionary',
  'guru',
  'ninja',
  'evangelist',
  'thought leader',
  'disruptor',
  'change maker',
  'innovator',
  'futurist',
  'influencer',
  'helping you',
  'helping others',
  'empowering',
  '| speaker',
  '| coach',
  '| mentor',
  '| advisor',
  '| consultant',
  '| trainer',
  '| author',
  '| entrepreneur',
];

/**
 * Matches pipe-separated role combos with two or more segments, e.g. "Speaker | Coach | Mentor".
 * Two or more pipe-separated segments is the formula pattern (D-07, 03-CONTEXT.md).
 *
 * No nested quantifiers — bounded by realistic headline length to avoid ReDoS (T-03-P-01).
 */
export const HEADLINE_PIPE_PATTERN: RegExp = /(?:\w[\w\s]+\|\s*){2,}/;

/**
 * Checks a LinkedIn headline for formulaic AI-generated patterns.
 *
 * Scoring:
 *   - HEADLINE_PIPE_PATTERN match: +5 pts
 *   - Each buzzword hit (case-insensitive): +2 pts, capped at +5 pts total from buzzwords
 *   - Total maximum: 10 pts (clamped)
 *
 * @param headlineText - The raw headline text from the post card. Untrusted DOM input;
 *                       used for regex/string operations only — no eval, no innerHTML.
 * @returns Score 0–10.
 */
export function checkHeadlineFormula(headlineText: string): number {
  if (!headlineText?.trim()) return 0;

  let score = 0;

  if (HEADLINE_PIPE_PATTERN.test(headlineText)) {
    score += 5;
  }

  const lower = headlineText.toLowerCase();
  let buzzScore = 0;
  for (const word of HEADLINE_BUZZWORDS) {
    if (lower.includes(word)) {
      buzzScore += 2;
      if (buzzScore >= 5) break; // cap buzzword contribution at 5 pts
    }
  }
  score += Math.min(buzzScore, 5);

  return Math.min(score, 10);
}

// ---------------------------------------------------------------------------
// Connection degree proxy signal
// ---------------------------------------------------------------------------

/**
 * Returns a score based on the LinkedIn connection degree indicator text.
 *
 * A "3rd+" connection signals lower social proximity, which is a weak indicator of
 * a less-established account (D-07, 03-CONTEXT.md).
 *
 * @param degreeText - Text content or aria-label of the degree indicator element.
 *                     Untrusted DOM input; normalised to lowercase before comparison.
 * @returns 5 if the text contains '3rd', 0 otherwise.
 */
export function checkConnectionDegree(degreeText: string): number {
  if (!degreeText) return 0;
  const normalised = degreeText.toLowerCase();
  if (normalised.includes('3rd')) return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// DOM extraction helper
// ---------------------------------------------------------------------------

/**
 * Extracts profile signals from a post card DOM node.
 *
 * Queries the two Phase 3 selectors (AUTHOR_HEADLINE, CONNECTION_DEGREE) and calls
 * the pure signal functions above. Returns a Record of signal keys to scores for
 * any signals that fired (score > 0).
 *
 * Uses `innerText` for visible text extraction (never the raw DOM property), consistent with
 * the rest of the codebase. Falls back to `getAttribute('aria-label')` for the degree
 * element since some degree indicators are aria-labelled rather than text nodes.
 *
 * DOM access is entirely inside this function; checkHeadlineFormula and
 * checkConnectionDegree remain pure and testable without a browser.
 *
 * @param postNode - The post card root Element from the MutationObserver callback.
 * @returns Record mapping signal keys to numeric scores for signals that fired.
 */
export function extractProfileSignals(postNode: Element): Record<string, number> {
  const signals: Record<string, number> = {};

  const headlineEl = postNode.querySelector(resolve('AUTHOR_HEADLINE'));
  const headlineText = (headlineEl as HTMLElement | null)?.innerText?.trim() ?? '';
  const headlineScore = checkHeadlineFormula(headlineText);
  if (headlineScore > 0) signals['headline-formula'] = headlineScore;

  const degreeEl = postNode.querySelector(resolve('CONNECTION_DEGREE'));
  const degreeText =
    (degreeEl as HTMLElement | null)?.innerText?.trim() ??
    (degreeEl?.getAttribute('aria-label') ?? '');
  const degreeScore = checkConnectionDegree(degreeText);
  if (degreeScore > 0) signals['degree-3'] = degreeScore;

  return signals;
}
