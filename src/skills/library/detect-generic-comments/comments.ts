/**
 * Generic comment pattern signal detector.
 *
 * Detects bot-engagement patterns in post comment sections:
 * 1. Exact match against known generic AI-engagement phrases (returns 15).
 * 2. Near-duplicate detection via Levenshtein distance < 10 (returns 10).
 *
 * Only processes comments longer than 20 characters to avoid false positives on short replies.
 * Caps eligible comment list at 20 to bound the O(n²) Levenshtein loop (190 comparisons max).
 *
 * Pure function: no DOM access, no side effects.
 */

import levenshtein from 'fast-levenshtein';

/** Known generic AI-engagement phrases. Matched case-insensitively after trimming. */
const GENERIC_PHRASES = new Set<string>([
  'great insights! this really resonated with me.',
  "couldn't agree more! this is exactly what i needed.",
  'this is gold! saving this for later.',
  'so true! this hit differently today.',
  'saving this! thank you for sharing your wisdom.',
  'well said! this is incredibly insightful content.',
  'love this! you always deliver such value here.',
  'this is so true and so well articulated.',
  'great post! this is the content we all need.',
  'dropping this here for future reference. thank you.',
  'absolutely brilliant perspective on this topic today.',
  'this resonates deeply. thank you for sharing this.',
  'incredible insights as always. so much value here.',
  'mind blown by this post. sharing with my network.',
  'this is exactly the content linkedin needs more of.',
]);

/** Minimum comment length to be eligible for analysis (avoids "Thanks!" false positives). */
const MIN_COMMENT_LENGTH = 20;

/** Maximum eligible comments to process — bounds the O(n²) Levenshtein loop. */
const MAX_ELIGIBLE = 20;

/**
 * Checks for generic or near-duplicate comment patterns in a post's comment section.
 * @param commentTexts - Array of raw comment text strings from the post.
 * @returns 15 for >= 2 exact generic phrase matches, 10 for >= 2 near-duplicate pairs
 *          (Levenshtein distance < 10), 0 if no pattern detected.
 */
export function checkGenericComments(commentTexts: string[]): number {
  // Filter to eligible comments only (length > 20 chars), then cap at MAX_ELIGIBLE
  const eligible = commentTexts
    .filter(t => t.length > MIN_COMMENT_LENGTH)
    .slice(0, MAX_ELIGIBLE);

  if (eligible.length < 2) return 0;

  // Step 1: Exact generic phrase match (O(n) against a Set)
  const genericHits = eligible.filter(t =>
    GENERIC_PHRASES.has(t.toLowerCase().trim()),
  );
  if (genericHits.length >= 2) return 15; // full signal weight

  // Step 2: Near-duplicate fuzzy check via Levenshtein distance
  let nearDupPairs = 0;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      // Non-null assertions: indices are within-bounds by loop construction;
      // noUncheckedIndexedAccess requires explicit guard.
      if (levenshtein.get(eligible[i]!, eligible[j]!) < 10) {
        nearDupPairs++;
        if (nearDupPairs >= 2) return 10; // partial signal weight
      }
    }
  }

  return 0;
}
