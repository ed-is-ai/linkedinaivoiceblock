/**
 * LinkedIn Blocker — Post Store
 *
 * Manages persistence of hidden posts in chrome.storage.local for later review.
 * Implements deduplication by URN, text truncation, newest-first ordering,
 * and a 200-entry cap with oldest-entry eviction.
 *
 * Shared module — must NOT import from content/ and must NOT reference the
 * document or the extension runtime. Only chrome.storage.local (via storage wrappers).
 */

import { storageGet, storageSet } from './storage';
import type { StoredPost, UnflaggedPost } from './types';

// ---------------------------------------------------------------------------
// Label write-back (Phase 28, D-08 / D-09)
// ---------------------------------------------------------------------------

/**
 * Write a ground-truth label onto a single post entry (D-08).
 *
 * Routes storedPosts-first: if the URN is found in storedPosts, sets its `label`
 * and writes only storedPosts. Otherwise finds the entry in unflaggedPosts and
 * writes only unflaggedPosts. One storageSet per call.
 *
 * This is the ONLY sanctioned writer of post labels — the content script NEVER calls this.
 * The Evals page calls it on a deliberate user click, so the label always overwrites any
 * prior value (single explicit user action, not automatic scoring logic).
 *
 * @param urn   LinkedIn post URN — dedup key used to find the entry
 * @param label Ground-truth label supplied by the user
 */
export async function setPostLabel(urn: string, label: 'ai' | 'human'): Promise<void> {
  const { storedPosts = [], unflaggedPosts = [] } = await storageGet(['storedPosts', 'unflaggedPosts']);

  // storedPosts-first: check hidden (flagged) posts
  const storedIdx = storedPosts.findIndex(p => p.urn === urn);
  if (storedIdx !== -1) {
    storedPosts[storedIdx]!.label = label;
    await storageSet({ storedPosts });
    return;
  }

  // Fallthrough: check unflagged (eval-negative) posts
  const unflaggedIdx = unflaggedPosts.findIndex(p => p.urn === urn);
  if (unflaggedIdx !== -1) {
    unflaggedPosts[unflaggedIdx]!.label = label;
    await storageSet({ unflaggedPosts });
  }
}

/**
 * Bulk-seed ground-truth labels for all currently unlabeled posts (D-09).
 *
 * - storedPosts entries with no label get label = 'ai' (they were hidden as suspected AI)
 * - unflaggedPosts entries with no label get label = 'human' (they were not flagged)
 *
 * IDEMPOTENCY CONTRACT: entries that already carry a label are NEVER overwritten.
 * This protects manual corrections made via setPostLabel() before bulkSeedLabels() runs.
 * The `label === undefined` guard is the D-09 implementation — mirrors the .some() dedup
 * discipline used by persistStoredPost/persistUnflaggedPost.
 *
 * Calling bulkSeedLabels() twice produces the same storage state as calling it once.
 */
export async function bulkSeedLabels(): Promise<void> {
  const { storedPosts = [], unflaggedPosts = [] } = await storageGet(['storedPosts', 'unflaggedPosts']);

  let storedMutated = false;
  for (const post of storedPosts) {
    if (post.label === undefined) {
      post.label = 'ai';
      storedMutated = true;
    }
  }

  let unflaggedMutated = false;
  for (const post of unflaggedPosts) {
    if (post.label === undefined) {
      post.label = 'human';
      unflaggedMutated = true;
    }
  }

  if (storedMutated || unflaggedMutated) {
    await storageSet({ storedPosts, unflaggedPosts });
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of stored posts before oldest is evicted. */
const POST_STORE_CAP = 200;

/** Maximum number of unflagged (eval-negative) posts before oldest is evicted (D-02). */
const UNFLAGGED_STORE_CAP = 200;

/** Maximum characters of post text to store. */
const POST_TEXT_MAX_CHARS = 1000;

// ---------------------------------------------------------------------------
// persistStoredPost
// ---------------------------------------------------------------------------

/**
 * Persist a hidden post to chrome.storage.local for later review.
 *
 * - Deduplicates by URN (skips if already stored)
 * - Truncates text at POST_TEXT_MAX_CHARS
 * - Prepends to array (newest first)
 * - Evicts oldest entry when POST_STORE_CAP is reached
 */
export async function persistStoredPost(opts: {
  urn: string;
  authorId: string;
  authorName: string;
  score: number;
  text: string;
}): Promise<void> {
  const { urn, authorId, authorName, score, text } = opts;
  const { storedPosts = [] } = await storageGet(['storedPosts']);

  // Dedup: skip if this URN is already stored
  if (storedPosts.some((p: StoredPost) => p.urn === urn)) return;

  const entry: StoredPost = {
    urn,
    authorId,
    authorName,
    score,
    text: text.trim().slice(0, POST_TEXT_MAX_CHARS),
    hiddenAt: Date.now(),
  };

  // Prepend (newest first), then evict oldest if over cap
  const updated = [entry, ...(storedPosts as StoredPost[])];
  if (updated.length > POST_STORE_CAP) updated.pop();

  await storageSet({ storedPosts: updated });
}

// ---------------------------------------------------------------------------
// persistUnflaggedPost
// ---------------------------------------------------------------------------

/**
 * Persist a below-FLAG_THRESHOLD post to chrome.storage.local as an eval negative.
 *
 * - Only called when Settings.captureUnflaggedPosts is true (gated at call site, D-05)
 * - Deduplicates by URN (skips if already stored)
 * - Truncates text at POST_TEXT_MAX_CHARS (1000 chars)
 * - Prepends to array (newest first)
 * - Evicts oldest entry when UNFLAGGED_STORE_CAP (200) is reached
 * - Stores UNLABELED — never writes a `label` field (D-06)
 */
export async function persistUnflaggedPost(opts: {
  urn: string;
  authorId: string;
  authorName: string;
  score: number;
  text: string;
  engineUsed: 'heuristic' | 'llm';
}): Promise<void> {
  const { urn, authorId, authorName, score, text, engineUsed } = opts;
  const { unflaggedPosts = [] as UnflaggedPost[] } = await storageGet(['unflaggedPosts']);

  const arr = unflaggedPosts;

  // Dedup: skip if this URN is already stored
  if (arr.some((p) => p.urn === urn)) return;

  const entry: UnflaggedPost = {
    urn,
    authorId,
    authorName,
    score,
    text: text.trim().slice(0, POST_TEXT_MAX_CHARS),
    seenAt: Date.now(),
    engineUsed,
  };

  // Prepend (newest first), then evict the oldest entry (by seenAt) if over cap
  const updated = [entry, ...arr];
  if (updated.length > UNFLAGGED_STORE_CAP) {
    // Find and remove the entry with the smallest seenAt (oldest), regardless of position
    let oldestIdx = 0;
    for (let i = 1; i < updated.length; i++) {
      if (updated[i]!.seenAt < updated[oldestIdx]!.seenAt) oldestIdx = i;
    }
    updated.splice(oldestIdx, 1);
  }

  await storageSet({ unflaggedPosts: updated });
}
