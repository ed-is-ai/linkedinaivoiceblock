/**
 * LinkedIn Blocker — Shared TypeScript Interfaces
 *
 * These interfaces are the contracts between all extension entry points:
 * content script, service worker, popup, and dashboard.
 *
 * Phase 1 provides the foundation types. Phase 2 implements Detector.
 * Phase 3 expands StorageSchema with FlaggedAccount and settings.
 */

/**
 * Represents a single LinkedIn post as extracted from the DOM by the content script.
 * Passed from the content script to detectors (Phase 2+).
 *
 * Security note (T-03-04): PostData passes through memory only during detection.
 * As of v1.1, post text IS persisted to chrome.storage.local via persistStoredPost()
 * when a post is hidden — the user explicitly opted in to post storage.
 * See PROJECT.md v1.1 requirements and CONTEXT.md §D-10.
 */
export interface PostData {
  /** LinkedIn post URN, e.g. "urn:li:activity:7123456789012345678" */
  urn: string;
  /** Author profile identifier extracted from the profile URL slug */
  authorId: string;
  /** Author display name as shown in the feed */
  authorName: string;
  /** Full author profile URL, e.g. "https://www.linkedin.com/in/username/" */
  authorProfileUrl: string;
  /** Post text content. In v1.1, persisted to chrome.storage.local via persistStoredPost() when hidden (user opt-in). Truncated at 1000 chars on storage. */
  postText: string;
}

/**
 * Result returned by a Detector implementation after scoring a post.
 * The content script uses the score + confidence to decide whether to flag the post.
 */
export interface DetectionResult {
  /**
   * Composite score 0–100 (integer). Phase 2 changes the range from the Phase 1 0.0–1.0 placeholder.
   * Values >= 60 trigger auto-hide; 35–59 flag for review; < 35 are ignored.
   */
  score: number;
  /** Human-readable list of signals that contributed to the score. Denormalised view of Object.keys(signalBreakdown). */
  signals: string[];
  /**
   * Per-signal numeric breakdown (DETECT-05) — stored alongside the composite score so each signal
   * can be displayed and tuned independently. Keys match the strings emitted in `signals[]`.
   */
  signalBreakdown: Record<string, number>;
  /** Qualitative confidence tier derived from the score */
  confidence: 'high' | 'medium' | 'low';
  /** Which detection engine produced this result */
  engineUsed: 'heuristic' | 'llm';
}

/**
 * Pluggable detector interface (CLAUDE.md §Pluggable Detector Interface).
 * Both HeuristicDetector (Phase 2) and any future LLMDetector implement this.
 * The call site in the content script never changes — only the implementation swaps.
 */
export interface Detector {
  /** Human-readable identifier for this detector, used in logging */
  name: string;
  /** Score a single post and return the detection result */
  detect(post: PostData): Promise<DetectionResult>;
}

/**
 * Full account record for a flagged LinkedIn account stored in chrome.storage.local.
 *
 * Phase 3 promotes the Phase 2 stub shape to the full account record, adding
 * `postCount` and `peakScore` fields to support the EMA rolling score strategy.
 *
 * Phase 5 will expand the `status` union to `'pending' | 'blocked' | 'dismissed'`.
 * Phase 3 only ever writes `status: 'pending'`.
 *
 * Keyed by `authorId` in StorageSchema.flaggedAccounts.
 */
export interface FlaggedAccount {
  /** LinkedIn profile slug (e.g. "some-user" from /in/some-user/) */
  authorId: string;
  /** Author display name as shown in the feed */
  authorName: string;
  /** Full author profile URL, e.g. "https://www.linkedin.com/in/username/" */
  authorProfileUrl: string;
  /**
   * EMA rolling average composite score (0–100). Updated each time a new post from
   * this account is persisted: score = score × (1 - EMA_ALPHA) + newScore × EMA_ALPHA.
   * Phase 2 set this to peak; Phase 3 changes the semantics to EMA.
   */
  compositeScore: number;
  /**
   * Number of posts from this account that scored >= 35 and were persisted.
   * Used as context for the EMA rolling score.
   */
  postCount: number;
  /**
   * Highest single-post composite score ever recorded for this account (0–100).
   * Popup Phase 4 may sort by this rather than the EMA compositeScore.
   */
  peakScore: number;
  /** Per-signal numeric scores — signal name to individual score */
  signals: Record<string, number>;
  /** URNs of posts from this account that have been hidden */
  hiddenPostUrns: string[];
  /** Unix timestamp (ms) when this account was first flagged */
  firstSeenAt: number;
  /** Unix timestamp (ms) when this account was most recently flagged */
  lastSeenAt: number;
  /** Review status — 'blocked' set by popup Block action; 'dismissed' set by popup Dismiss action */
  status: 'pending' | 'blocked' | 'dismissed';
}

/**
 * Argument shape the observer hands to the onPost callback.
 * The Element reference is memory-only and never persisted — used by exclusions,
 * CSS hide, and tombstone DOM writes.
 *
 * Note: `postNode` is intentionally NOT part of `PostData` (PostData stays serialisable
 * for detector input; postNode is added at the call boundary in content/index.ts).
 */
export interface ObservedPost {
  /** LinkedIn post URN, e.g. "urn:li:activity:7123456789012345678" */
  urn: string;
  /** Author profile identifier extracted from the profile URL slug */
  authorId: string;
  /** Author display name as shown in the feed */
  authorName: string;
  /** Full author profile URL, e.g. "https://www.linkedin.com/in/username/" */
  authorProfileUrl: string;
  /** Post text content. In v1.1, persisted to chrome.storage.local via persistStoredPost() when hidden (user opt-in). Truncated at 1000 chars on storage. */
  postText: string;
  /** Reference to the outer post card DOM element — used for CSS hiding and tombstone injection */
  postNode: Element;
}

/** User-configurable detection settings stored in chrome.storage.local. */
export interface Settings {
  /** Score threshold (35–90) above which posts are auto-hidden. Default: 60. */
  autoHideThreshold: number;
}

/** One calendar day of detection stats (UTC date). Rolling 30-day log. */
export interface DailyStats {
  /** UTC date string 'YYYY-MM-DD' */
  date: string;
  /** Posts entering the scoring pipeline (after hard exclusions) */
  seen: number;
  /** Posts hidden (score >= effectiveHideThreshold) */
  hidden: number;
  /** Posts with score >= FLAG_THRESHOLD that had AI language signals */
  aiSignals?: number;
  /** Posts with score >= FLAG_THRESHOLD that had bot behaviour signals */
  botSignals?: number;
  /** Unique author profile IDs seen on this day (INSIGHT-01). Deduped — one entry per author regardless of post count. */
  seenProfileIds?: string[];
}

/**
 * A hidden post saved to chrome.storage.local for later review (v1.1 post storage).
 * Stored in StorageSchema.storedPosts as a newest-first array, capped at 200 entries.
 *
 * User opt-in: storing post text was explicitly requested and overrides the v1.0
 * "never store post text" constraint. See PROJECT.md v1.1 requirements.
 */
export interface StoredPost {
  /** LinkedIn post URN — dedup key; matches FlaggedAccount.hiddenPostUrns entries */
  urn: string;
  /** Author profile slug — FK to FlaggedAccount; Phase 8 filters by this */
  authorId: string;
  /** Author display name at time of hiding */
  authorName: string;
  /** Composite detection score at time of hiding (0–100) */
  score: number;
  /** Post text truncated at POST_TEXT_MAX_CHARS (1000 chars) */
  text: string;
  /** Unix timestamp (ms) when this post was hidden */
  hiddenAt: number;
}

/**
 * Enumeration of all selector targets that can be adapted and stored in the registry.
 * These correspond to the selector constants exported from src/content/selectors.ts.
 *
 * Note: Some targets (POST_URN_ATTR, POST_URN_ATTR_FALLBACK, COMPANY_PAGE_MARKER)
 * are used with getAttribute() or String.includes(), not querySelector().
 * The registry returns these as attribute-name or URL-pattern strings (not DOM selectors).
 */
export type SelectorTarget =
  | 'FEED_CONTAINER'
  | 'FEED_CONTAINER_FALLBACK'
  | 'POST_CARD'
  | 'POST_URN_ATTR'
  | 'POST_URN_ATTR_FALLBACK'
  | 'POST_BODY_TEXT'
  | 'POST_AUTHOR_NAME'
  | 'POST_AUTHOR_LINK'
  | 'SPONSORED_MARKER'
  | 'COMPANY_PAGE_MARKER'
  | 'RESHARE_INDICATOR'
  | 'COMMENT_EXPAND_BUTTON'
  | 'OPEN_TO_WORK_MARKER'
  | 'COMMENT_TEXT'
  | 'AUTHOR_HEADLINE'
  | 'CONNECTION_DEGREE';

/**
 * Origin of a selector candidate in the registry.
 * Tracks whether a selector was seeded from src/content/selectors.ts (seed),
 * derived heuristically (heuristic), produced by an LLM (llm), or manually set by user (user).
 */
export type CandidateSource = 'seed' | 'heuristic' | 'llm' | 'user';

/**
 * A single selector candidate for a given target, with metadata for winner rotation and TTL eviction.
 *
 * The registry maintains a rank-ordered list of candidates per target.
 * Index 0 is the active selector — used for all querySelector() / getAttribute() calls.
 * Higher indices are fallbacks, rotated to the front on successful match (winner rotation).
 */
export interface SelectorCandidate {
  /** Selector string, attribute name, or URL pattern — returned as-is by resolve() */
  value: string;
  /** Origin of this candidate (seed from src/content/selectors.ts, or adapted) */
  source: CandidateSource;
  /** ISO 8601 timestamp of the last successful DOM match, or null if never matched */
  lastMatchedAt: string | null;
  /** ISO 8601 timestamp of last verification (matches SELECTOR-01 metadata field) */
  lastVerifiedAt: string | null;
  /** ISO 8601 timestamp when this candidate was added to the registry */
  addedAt: string;
  /** Consecutive failed query attempts (incremented on querySelectorAll(value) returning empty; reset to 0 on match) */
  failCount: number;
  /** Cumulative number of successful DOM matches for this candidate (incremented on match) */
  matchCount: number;
}

/**
 * A ranked list of selector candidates for a single target.
 * Index 0 is the active selector; subsequent indices are fallbacks.
 * The list is capped at 10 entries (SELECTOR-05).
 */
export interface TargetEntry {
  /** Rank-ordered selector candidates; index 0 = active */
  candidates: SelectorCandidate[];
}

/**
 * Complete selector registry schema stored in chrome.storage.local under the 'selectorRegistry' key.
 *
 * The registry is seeded from src/content/selectors.ts constants on first load or version bump,
 * and subsequently adapted through winner rotation (Phase 23+) and TTL-based candidate eviction.
 *
 * Versioning: When src/content/selectors.ts SELECTORS_VERSION changes, the registry is migrated
 * additively — new targets are added from the seed, existing adapted candidates are preserved,
 * and the seed value is appended as a last-resort fallback.
 */
export interface SelectorRegistrySchema {
  /** Version string matching src/content/selectors.ts SELECTORS_VERSION. Used to trigger migrations. */
  version: string;
  /** Map of all selector targets to their candidate lists. Every SelectorTarget must have an entry. */
  targets: Record<SelectorTarget, TargetEntry>;
  /** ISO 8601 timestamp of the last adaptation event (winner rotation or eviction), or null if seed-only */
  lastAdaptedAt: string | null;
}

/**
 * Typed schema for chrome.storage.local.
 *
 * Phase 3 expands this with dismissedAccounts. Phase 6 adds settings and dailyStats.
 *
 * This interface exists in Phase 1 so that storage.ts is generic over a real type
 * rather than `any`, satisfying INFRA-03 and enabling strict-mode compilation.
 */
export interface StorageSchema {
  /**
   * Map of LinkedIn author IDs to flagged account data.
   * Phase 3 uses FlaggedAccount (with postCount + peakScore) in place of the Phase 2 stub.
   */
  flaggedAccounts?: Record<string, FlaggedAccount>;
  /**
   * Array of authorId strings that have been dismissed as false positives (Phase 5 writes).
   * Phase 3 declares the key with an empty-array default; content script loads it as a
   * Set<string> for O(1) lookup.
   */
  dismissedAccounts?: string[];
  /** Anthropic API key — set once via DevTools: chrome.storage.local.set({anthropicApiKey:'sk-ant-...'}) */
  anthropicApiKey?: string;
  /** User settings — threshold configurable in popup Settings section. */
  settings?: Settings;
  /** Rolling 30-day stats log. Content script writes; dashboard reads. */
  dailyStats?: DailyStats[];
  /** Newest-first array of hidden posts saved for review. Capped at 200 entries; content script writes, popup Phase 8 reads. */
  storedPosts?: StoredPost[];
  /** Selector registry: versioned, rank-ordered candidate lists per target. Seeded from src/content/selectors.ts on first load or version bump. */
  selectorRegistry?: SelectorRegistrySchema;
  /** Set of selector targets that produced zero DOM matches in the current content-script session. Written by content script; read by dashboard health view. */
  selectorSessionMisses?: SelectorTarget[];
}
