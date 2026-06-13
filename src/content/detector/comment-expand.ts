/**
 * Safe comment-expansion helper.
 *
 * Clicks the LinkedIn "View comments" / "Load more comments" button on a post node
 * to expose comment text for the generic-comments engagement signal (DETECT-07).
 *
 * Design constraints (D-02, RESEARCH Open Question 2):
 *   - Read-only action: only the comment-expand button is clicked. Block, like, follow,
 *     and send buttons are NEVER touched (CLAUDE.md constraint #3 / T-02-11).
 *   - Page-scoped expansion budget: MAX_EXPANSIONS_PER_PAGE caps the total number of
 *     comment-expand clicks across the entire page load at 10. This prevents the
 *     extension from making excessive requests to LinkedIn's comment API when many
 *     suspicious posts appear in a single feed session (RESEARCH Open Question 2).
 *   - Silent degrade: if the expand button is absent (post has no comments or already
 *     expanded), the function returns [] immediately without throwing (Pitfall 2).
 *   - Error safety: the entire function body is wrapped in try/catch. Clicking a stale
 *     or detached node must not throw uncaught errors to the caller.
 *
 * SPA navigation note:
 *   Call resetExpansionBudget() from the SPA navigation hook in content/index.ts (Plan 04)
 *   whenever the user navigates to a new feed view. This ensures each new feed page starts
 *   with a fresh 10-expansion budget rather than carrying over state from the previous page.
 */

import { resolve } from '../selector-registry';

/** Maximum number of comment-section expansions allowed per page load. */
const MAX_EXPANSIONS_PER_PAGE = 10;

/**
 * Module-scope counter — tracks how many times expandComments has clicked the expand
 * button on the current page. Shared across all calls within a page load.
 */
let pageExpansionCount = 0;

/**
 * Resets the per-page expansion budget to 0.
 *
 * Call this from the SPA navigation hook in content/index.ts whenever the feed navigates
 * to a new view so each page view starts with a fresh 10-expansion budget (RESEARCH Open
 * Question 2 / D-02).
 */
export function resetExpansionBudget(): void {
  pageExpansionCount = 0;
}

/**
 * Attempts to expand the comment section on a post and return the comment texts.
 *
 * @param postNode - The post card DOM element to search for the expand button.
 * @returns Promise resolving to an array of comment text strings (up to 20 entries),
 *          or an empty array if: the budget is exhausted, the button is absent, or any
 *          error occurs during expansion.
 */
export async function expandComments(postNode: Element): Promise<string[]> {
  try {
    // Check page-scoped budget before doing any DOM work
    if (pageExpansionCount >= MAX_EXPANSIONS_PER_PAGE) {
      return [];
    }

    // Locate the expand button — silently degrade if absent (Pitfall 2)
    const button = postNode.querySelector(resolve('COMMENT_EXPAND_BUTTON')) as HTMLElement | null;
    if (button === null) {
      return [];
    }

    // Click the button and increment the budget counter atomically
    button.click();
    pageExpansionCount++;

    // Wait for LinkedIn to render the comment section after the click
    await new Promise<void>(r => setTimeout(r, 800));

    // Collect comment text using innerText (preserves user-facing text; excludes hidden
    // screen-reader content and script text that .textContent would include)
    const comments = Array.from(postNode.querySelectorAll(resolve('COMMENT_TEXT')))
      .map(el => (el as HTMLElement).innerText.trim())
      .filter(Boolean)
      .slice(0, 20); // cap at 20 entries to bound O(n²) Levenshtein comparisons

    return comments;
  } catch {
    // Silently swallow errors — clicking on a stale/detached node must not surface to
    // the caller. The caller (HeuristicDetector) treats [] as "no comment signal".
    return [];
  }
}
