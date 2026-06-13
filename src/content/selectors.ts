/**
 * LinkedIn Blocker — Selector Seed Values
 *
 * !! ALL HARD-CODED LINKEDIN SELECTOR STRINGS LIVE IN THIS FILE AND ONLY HERE !!
 *
 * Seed-vs-Runtime Model (Phase 22):
 *   - This file defines the DEFAULT/seed selector values for all LinkedIn DOM targets.
 *   - At runtime, the content script reads selectors EXCLUSIVELY through SelectorRegistry,
 *     which hydrates from chrome.storage.local and falls back to these seed values.
 *   - Only SelectorRegistry may write selector strings to storage (for runtime adaptation).
 *   - Changing one constant in this file sets the default for any selector breakage recovery.
 *   - No other file in the project may directly import or contain a LinkedIn selector string.
 *
 * Inspection date: 2026-05-25 (see .planning/phases/01-foundation/DOM-INSPECTION.md)
 *
 * Selector value rules:
 *   - Values MUST use data-* attributes, aria-* attributes, role attributes, or semantic elements.
 *   - CSS class names (e.g. .some-class) are FORBIDDEN — LinkedIn rebuilds class names on every deploy.
 *   - URL patterns (strings passed to .includes() / .contains()) are allowed for href-based checks.
 */

/** Version of the selector registry. Increment when a verified change is made. */
export const SELECTORS_VERSION = '1.3.0';

// ---------------------------------------------------------------------------
// Feed container
// ---------------------------------------------------------------------------

/**
 * Primary feed container selector.
 * Verified 2026-05-29: LinkedIn replaced data-finite-scroll-hotkey-context with
 * data-component-type="LazyColumn" on the feed container element.
 */
export const FEED_CONTAINER = '[data-component-type="LazyColumn"]';

/**
 * Fallback feed container selector.
 */
export const FEED_CONTAINER_FALLBACK = 'main';

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------

/**
 * Post card root element selector.
 * Verified 2026-05-29: LinkedIn replaced data-urn/data-id with a componentkey attribute.
 * Top-level div[componentkey] elements within the LazyColumn are the post card roots.
 * The componentkey value is an opaque UUID used as the post dedup key.
 */
export const POST_CARD = 'div[componentkey]';

/**
 * The attribute name that holds the post ID on the post card element.
 * Verified 2026-05-29: componentkey replaces the former data-urn (urn:li:activity:*).
 */
export const POST_URN_ATTR = 'componentkey';

/**
 * Fallback post ID attribute — same as primary since componentkey is the only stable attr.
 */
export const POST_URN_ATTR_FALLBACK = 'componentkey';

// ---------------------------------------------------------------------------
// Author
// ---------------------------------------------------------------------------

/**
 * Author display name element selector.
 * Verified 2026-05-29: Author name is in a strong inside the profile anchor. The :has(strong)
 * filter excludes avatar links (plain <a href="/in/..."> with no text children).
 */
export const POST_AUTHOR_NAME = 'a[href*="/in/"]:has(strong) strong';

// ---------------------------------------------------------------------------
// Exclusion markers
// ---------------------------------------------------------------------------

/**
 * Sponsored / Promoted post marker selector.
 * Verified: sponsored posts include an element with aria-label containing "Promoted"
 * or "Sponsored". This attribute-based check survives CSS class renames.
 * Content scripts may also check the text content of sub-description elements for
 * the string "Promoted" as a belt-and-suspenders fallback.
 */
export const SPONSORED_MARKER = '[aria-label*="Promoted"], [aria-label*="Sponsored"]';

/**
 * Company page author URL pattern.
 * Verified: company page profile URLs contain /company/ (e.g. linkedin.com/company/google/).
 * Individual profiles use /in/ (e.g. linkedin.com/in/username/).
 * Use with authorProfileUrl.includes(COMPANY_PAGE_MARKER) in content script logic.
 */
export const COMPANY_PAGE_MARKER = '/company/';

// ---------------------------------------------------------------------------
// Phase 2 additions
// POST_BODY_TEXT, POST_AUTHOR_LINK, POST_AUTHOR_NAME: verified 2026-05-29 against live feed.
// FEED_CONTAINER, POST_CARD, POST_URN_ATTR: verified 2026-05-29 — LinkedIn replaced data-* attrs
// with componentkey attribute and data-component-type="LazyColumn" container.
// RESHARE_INDICATOR, COMMENT_EXPAND_BUTTON, OPEN_TO_WORK_MARKER, COMMENT_TEXT: [ASSUMED] — still
// requires live LinkedIn DevTools verification before code depending on these selectors is shipped.
// ---------------------------------------------------------------------------

/**
 * Post body text container selector.
 * Verified 2026-05-29: Post body is in a span with data-testid="expandable-text-box".
 * LinkedIn removed div[dir="ltr"] as the commentary container.
 */
export const POST_BODY_TEXT = 'span[data-testid="expandable-text-box"]';

/**
 * Author profile link anchor selector.
 * Verified 2026-05-29: The profile anchor no longer carries data-test-app-aware-link or
 * aria-label. :has(strong) filters out avatar-only anchors that share the /in/ href pattern.
 */
export const POST_AUTHOR_LINK = 'a[href*="/in/"]';

/**
 * Reshare inner card selector.
 * [ASSUMED] -- requires live LinkedIn DevTools verification before code depending on this selector is shipped.
 * When a post is a reshare, LinkedIn renders an inner card element with a data-urn starting with
 * "urn:li:share:" nested inside the outer activity card (urn:li:activity:*).
 * Per D-10: the original author's text and profile are extracted from this inner card;
 * the outer activity URN remains the dedup key (Pitfall 6).
 */
export const RESHARE_INDICATOR = '[data-urn^="urn:li:share:"]';

/**
 * Comment section expand button selector.
 * [ASSUMED] -- requires live LinkedIn DevTools verification before code depending on this selector is shipped.
 * Matches the clickable button used to expand the comments section on a post.
 * Read-only action (does not submit, like, or follow) — safe to click programmatically per D-02.
 */
export const COMMENT_EXPAND_BUTTON =
  '[aria-label*="comment"], [data-control-name*="comment"]';

/**
 * Open to Work avatar banner selector.
 * [ASSUMED] -- requires live LinkedIn DevTools verification before code depending on this selector is shipped.
 * LinkedIn renders an aria-label containing "Open to work" on the profile photo overlay or badge
 * for users who have enabled the Open to Work feature.
 * Per D-12: Open to Work authors are NOT hard-excluded; instead the effective hide threshold is
 * raised by 20 points (requires 80/100 to auto-hide) to reduce false positives for job seekers.
 */
export const OPEN_TO_WORK_MARKER =
  '[aria-label*="Open to work"], [aria-label*="open to work"]';

/**
 * Comment text body element selector.
 * [ASSUMED] -- requires live LinkedIn DevTools verification before code depending on this selector is shipped.
 * Matches the body of an individual comment within the expanded comment section.
 * Used by the engagement signal (DETECT-07) to extract comment text for near-duplicate detection.
 */
export const COMMENT_TEXT =
  '[data-test-id*="comment-body"], [data-id*="comment"] span';

// ---------------------------------------------------------------------------
// Phase 3 additions
// AUTHOR_HEADLINE, CONNECTION_DEGREE: [ASSUMED] — still requires live LinkedIn
// DevTools verification before code depending on these selectors is shipped.
// ---------------------------------------------------------------------------

/**
 * Author headline/subtitle element selector.
 * [ASSUMED] -- requires live LinkedIn DevTools verification before code depending on this selector is shipped.
 * Matches the job title / headline text displayed below the author name in the post card header.
 * In LinkedIn's post card structure the author header row contains the name anchor followed by a
 * subtitle span carrying the job title and company. Assumed selector targets the first span
 * adjacent to the profile anchor in the post header.
 *
 * If this selector is too broad (matches non-headline spans), add a more specific qualifier
 * after live inspection (e.g. a data-* attribute or aria-label refinement).
 */
export const AUTHOR_HEADLINE = 'a[href*="/in/"] ~ span';

/**
 * Connection degree indicator element selector.
 * [ASSUMED] -- requires live LinkedIn DevTools verification before code depending on this selector is shipped.
 * Matches the "1st", "2nd", or "3rd+" degree indicator shown near the author name in the post
 * attribution. LinkedIn typically renders this with either an aria-label containing "degree" or
 * a span with a data-anonymize attribute set to "degree".
 *
 * The exact attribute or class structure needs DevTools confirmation — if neither variant
 * is present, the element may carry the degree text in a different stable attribute.
 */
export const CONNECTION_DEGREE =
  '[aria-label*="degree"], span[data-anonymize="degree"]';
