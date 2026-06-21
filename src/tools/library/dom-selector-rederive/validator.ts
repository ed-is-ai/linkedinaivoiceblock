/**
 * Candidate validation gate — 3-gate predicate before any selector is written to storage.
 *
 * Mirrors the sequential early-return gate pattern of checkExclusions (src/content/exclusions.ts).
 * Every proposed selector — whether from the heuristic re-deriver or the LLM fallback —
 * MUST pass this gate before SelectorRegistry.updateCandidate() is ever called.
 *
 * Gate order (fail-fast, sequential):
 *   0.  BLOCKLIST_EXACT    - reject body/html/* and :root outright (ADAPT-06, D2)
 *   0a. DANGEROUS_TOKEN_RE - reject eval/function/javascript:/</>/ window/document (ADAPT-06, D2)
 *   0b. CLASS_ID_RE        - reject any .class or #id token (CLAUDE.md constraint #1, D6)
 *   DOM querySelectorAll   - the selector string is passed ONLY to querySelectorAll,
 *                            NEVER to eval / new Function / innerHTML (ADAPT-06)
 *   1.  match count 2-50   - too few (<2) or too broad (>50) rejected (ADAPT-07, ADAPT-08)
 *   2.  author-link ratio  - fraction of matches with a[href*="/in/"] must be >50% (ADAPT-10)
 *   3.  post-text presence - at least one match has trimmed textContent >10 chars (ADAPT-10)
 *   Advisory: sponsored contamination - log console.warn if any match contains a
 *             Promoted/Sponsored marker (D9, non-blocking per CONTEXT.md)
 *
 * Requirements: ADAPT-06, ADAPT-07, ADAPT-08, ADAPT-10
 */

/**
 * Result returned by validateCandidate.
 * pass=true means all gates passed; pass=false means the selector must not be written.
 */
export interface ValidationResult {
  /** True if the selector passed all validation gates. */
  pass: boolean;
  /** Human-readable reason string. 'all gates passed' when pass=true. */
  reason: string;
  /** Number of elements matched by querySelectorAll. 0 if the selector was rejected before DOM query. */
  matchCount: number;
}

/**
 * Exact selector strings that are unconditionally rejected.
 * These would match the entire document or critical infrastructure elements.
 */
const BLOCKLIST_EXACT = new Set(['body', 'html', '*', ':root']);

/**
 * Token patterns that indicate injection attempts or dangerous constructs (ADAPT-06, D2).
 * The selector is rejected immediately — before any querySelectorAll call — if matched.
 */
const DANGEROUS_TOKEN_RE = /eval|function\s*\(|javascript:|<|>|\bwindow\b|\bdocument\b/i;

/**
 * CSS class (.) or id (#) token guard (CLAUDE.md constraint #1, D6).
 * LinkedIn rebuilds class names on every deploy — class/id selectors are forbidden
 * in all extension code. The pattern rejects any selector containing . or # that is
 * NOT followed immediately by a digit (to allow [attr="value"] patterns with punctuation).
 */
const CLASS_ID_RE = /[.#](?![0-9])/;

/**
 * Validates a CSS selector candidate against the 3-gate write-safety criteria.
 *
 * The selector string is ONLY ever passed to `container.querySelectorAll()`.
 * It is never passed to eval, new Function, innerHTML, or any code-execution surface.
 *
 * @param selector  - The candidate CSS selector string to validate.
 * @param container - The live DOM element to run querySelectorAll against.
 * @returns ValidationResult with pass/fail, reason, and matchCount.
 */
export function validateCandidate(selector: string, container: Element): ValidationResult {
  const trimmed = selector.trim();

  // Gate 0: blocklist exact (ADAPT-06, D2) — check before any DOM query
  if (BLOCKLIST_EXACT.has(trimmed)) {
    return { pass: false, reason: `blocklisted exact: ${selector}`, matchCount: 0 };
  }

  // Gate 0a: dangerous token check (ADAPT-06, D2) — reject injection attempts
  if (DANGEROUS_TOKEN_RE.test(selector)) {
    return { pass: false, reason: 'dangerous token in selector string', matchCount: 0 };
  }

  // Gate 0b: CSS class/id guard (CLAUDE.md constraint #1, D6)
  if (CLASS_ID_RE.test(selector)) {
    return {
      pass: false,
      reason: 'CSS class or id selector forbidden (CLAUDE.md constraint #1)',
      matchCount: 0,
    };
  }

  // DOM query — the selector is passed ONLY to querySelectorAll, never to eval/new Function
  let matches: NodeListOf<Element>;
  try {
    matches = container.querySelectorAll(selector);
  } catch {
    return { pass: false, reason: 'invalid CSS selector syntax', matchCount: 0 };
  }

  const count = matches.length;

  // Gate 1: match count must be in the 2–50 range (ADAPT-07, ADAPT-08, ADAPT-10)
  if (count < 2) {
    return { pass: false, reason: `too few matches: ${count}`, matchCount: count };
  }
  if (count > 50) {
    return { pass: false, reason: `too many matches: ${count}`, matchCount: count };
  }

  const elements = Array.from(matches);

  // Gate 2: author-link ratio — fraction with a[href*="/in/"] must be >50% (ADAPT-10)
  const withAuthorLink = elements.filter(
    (el) => el.querySelector('a[href*="/in/"]') !== null,
  );
  if (withAuthorLink.length / count <= 0.5) {
    return {
      pass: false,
      reason: `author-link ratio too low: ${withAuthorLink.length}/${count}`,
      matchCount: count,
    };
  }

  // Gate 3: post-text presence — at least one match has trimmed textContent >10 chars (ADAPT-10)
  const hasPostText = elements.some((el) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length > 10;
  });
  if (!hasPostText) {
    return { pass: false, reason: 'no post-body text found in matched elements', matchCount: count };
  }

  // Advisory D9: sponsored contamination — log only, never a write-blocker (CONTEXT.md decision)
  const withSponsored = elements.filter(
    (el) =>
      el.querySelector('[aria-label*="Promoted"], [aria-label*="Sponsored"]') !== null,
  );
  if (withSponsored.length > 0) {
    console.warn(
      '[LLB] validator: sponsored contamination warning —',
      withSponsored.length,
      'of',
      count,
      'matches contain promoted markers',
    );
  }

  return { pass: true, reason: 'all gates passed', matchCount: count };
}
