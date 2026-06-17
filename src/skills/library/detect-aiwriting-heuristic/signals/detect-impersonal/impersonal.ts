/**
 * Impersonal voice signal detector.
 *
 * AI-generated LinkedIn posts frequently make universal claims about vague
 * groups ("Most professionals", "Successful leaders", "The best teams")
 * rather than sharing specific personal experiences. This framing lets the
 * AI sound authoritative while committing to nothing concrete.
 *
 * Pure function: no DOM access, no side effects.
 */

const IMPERSONAL_PATTERNS: readonly RegExp[] = [
  // "Most/Many [professionals/leaders/people/teams/founders/companies]"
  /\b(?:Most|Many|The majority of) (?:people|professionals|leaders|managers|founders|entrepreneurs|executives|developers|engineers|teams|companies|organisations?|organizations?)\b/i,
  // "Successful [people/leaders/founders/teams/companies]"
  /\bSuccessful (?:people|leaders|founders|managers|entrepreneurs|executives|teams|companies|professionals)\b/i,
  // "The best [leaders/performers/teams/companies/professionals] [do/know/understand]"
  /\bThe (?:best|top|great|greatest|most effective|most successful) (?:leaders?|performers?|teams?|companies|professionals?|founders?|entrepreneurs?|executives?|managers?)\b/i,
  // "Those who [succeed/thrive/win/grow/lead]"
  /\bThose who (?:succeed|thrive|win|grow|lead|understand|know|get it|make it)\b/i,
  // "[X]% of [people/professionals/companies]" — fake/vague statistic
  /\b\d+\s*%\s*of (?:people|professionals|leaders|companies|teams|organisations?|organizations?|founders?)\b/i,
  // "High performers/achievers/earners [do/know]"
  /\bHigh[- ](?:performers?|achievers?|earners?|impact)\b/i,
];

/**
 * Checks for impersonal voice patterns (generic third-person authority claims).
 *
 * @param text - The full post text.
 * @returns 15 for two or more patterns, 8 for one, 0 for none or texts under 20 words.
 */
export function checkImpersonalVoice(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words < 20) return 0;

  const hits = IMPERSONAL_PATTERNS.filter(re => re.test(text)).length;
  if (hits >= 2) return 15;
  if (hits === 1) return 8;
  return 0;
}
