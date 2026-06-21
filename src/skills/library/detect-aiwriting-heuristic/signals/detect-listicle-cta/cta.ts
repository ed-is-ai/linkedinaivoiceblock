/**
 * Call-to-action (CTA) phrase signal detector.
 *
 * AI-generated LinkedIn posts follow a template: formulaic opener ("Excited to announce...")
 * combined with an engagement closer ("What do you think?", "Drop a comment below").
 * Presence of both opener and closer is a strong combined signal.
 *
 * Pure function: no DOM access, no side effects.
 */

/** Opener phrase regexes — formulaic post starters common in AI-generated content. */
const CTA_OPENERS: readonly RegExp[] = [
  /\bexcited to announce\b/i,
  /\bthrilled to share\b/i,
  /\bhumbled (and )?honored\b/i,
  /\bproud to announce\b/i,
  /\bdelighted to share\b/i,
];

/** Closer phrase regexes — engagement CTA phrases common at the end of AI posts. */
const CTA_CLOSERS: readonly RegExp[] = [
  /\bwhat do you think\b/i,
  /\bdrop a comment\b/i,
  /\bfollow (me )?for more\b/i,
  /\blike (this post|and follow)\b/i,
  /\bsave this (for later)?\b/i,
  /\bshare (this|your thoughts)\b/i,
  /\blet me know (in the comments|below)\b/i,
  /\blet'?s connect\b/i,
  /\bDM me\b/i,
  /\bsounds interesting\b/i,
  /\bwhich (one |camp |side )?(are you|do you)\b/i,
  /\bagree\?/i,
];

/**
 * Checks whether post text contains CTA opener and/or closer phrases.
 * @param text - The full post text.
 * @returns 10 when both opener and closer are present, 6 for closer only, 4 for opener only, 0 for neither.
 */
export function checkCta(text: string): number {
  const openerHits = CTA_OPENERS.filter(re => re.test(text)).length;
  const closerHits = CTA_CLOSERS.filter(re => re.test(text)).length;

  if (openerHits >= 1 && closerHits >= 1) return 10; // both opener and closer: strong signal
  if (closerHits >= 1) return 6;                      // closer only: partial signal
  if (openerHits >= 1) return 4;                      // opener only: weak signal
  return 0;
}
