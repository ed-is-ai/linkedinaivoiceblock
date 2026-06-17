/**
 * LinkedIn Blocker — Flagged Account Queue
 *
 * Manages persistence of flagged LinkedIn accounts in chrome.storage.local.
 * Implements EMA rolling composite score, peak score tracking, post count,
 * Phase 2 data migration, and a 500-entry cap with lowest-score eviction.
 *
 * Shared module — must NOT import from content/ and must NOT reference the
 * document or the extension runtime. Only chrome.storage.local (via storage wrappers).
 */

import { storageGet, storageSet } from './storage';
import type { FlaggedAccount } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * EMA smoothing factor for composite score updates.
 * Lower = slower to change (more stable); higher = more reactive to new posts.
 * α = 0.2 means a new post contributes 20% to the rolling score.
 * Accounts can rehabilitate over time if they post more human-looking content.
 */
const EMA_ALPHA = 0.2;

/** Maximum number of entries in flaggedAccounts before eviction triggers. */
const QUEUE_CAP = 500;

// ---------------------------------------------------------------------------
// persistFlaggedAccount
// ---------------------------------------------------------------------------

/**
 * Persist or update a flagged account entry in chrome.storage.local.
 *
 * Update path (existing entry):
 *   - EMA rolls the composite score: score = score × (1 − α) + newScore × α
 *   - Peak score updated to Math.max(existing, new)
 *   - postCount incremented (migration guard: ?? 0 for Phase 2 entries)
 *   - Per-signal scores retained as Math.max(existing, new)
 *   - hiddenPostUrn appended if not already present
 *
 * Create path (new entry):
 *   - Eviction fires if queue is at QUEUE_CAP (lowest compositeScore; oldest firstSeenAt on tie)
 *   - New FlaggedAccount entry created with postCount = 1
 */
export async function persistFlaggedAccount(opts: {
  authorId: string;
  authorName: string;
  authorProfileUrl: string;
  compositeScore: number;
  signals: Record<string, number>;
  hiddenPostUrn: string | null;
}): Promise<void> {
  const { authorId, authorName, authorProfileUrl, compositeScore, signals, hiddenPostUrn } = opts;

  const { flaggedAccounts = {} } = await storageGet(['flaggedAccounts']);
  const existing = flaggedAccounts[authorId];
  const now = Date.now();

  if (existing) {
    // EMA update — D-01
    existing.compositeScore = existing.compositeScore * (1 - EMA_ALPHA) + compositeScore * EMA_ALPHA;

    // Peak score — D-02
    existing.peakScore = Math.max(existing.peakScore, compositeScore);

    // Post count with migration guard for Phase 2 entries that lack postCount — D-04
    existing.postCount = (existing.postCount ?? 0) + 1;

    // Refresh display fields
    existing.lastSeenAt = now;
    existing.authorName = authorName;
    existing.authorProfileUrl = authorProfileUrl;

    // Merge signals — retain highest observed score per signal key
    for (const [key, val] of Object.entries(signals)) {
      existing.signals[key] = Math.max(existing.signals[key] ?? 0, val);
    }

    // Append hidden URN if provided and not already tracked
    if (hiddenPostUrn !== null && !existing.hiddenPostUrns.includes(hiddenPostUrn)) {
      existing.hiddenPostUrns.push(hiddenPostUrn);
    }

    flaggedAccounts[authorId] = existing;
  } else {
    // Eviction check — D-12, D-13: only fires on cap hit for new entries
    if (Object.keys(flaggedAccounts).length >= QUEUE_CAP) {
      const allIds = Object.keys(flaggedAccounts);
      const firstId = allIds[0]; // safe: we just confirmed length >= QUEUE_CAP > 0
      if (firstId === undefined) return; // type-narrowing guard — unreachable in practice
      const evictId = Object.entries(flaggedAccounts).reduce((worst, [id, entry]) => {
        const w = flaggedAccounts[worst]; // key came from Object.keys — always present
        if (w === undefined) return worst;
        if (entry.compositeScore < w.compositeScore) return id;
        if (entry.compositeScore === w.compositeScore && entry.firstSeenAt < w.firstSeenAt) return id;
        return worst;
      }, firstId);
      delete flaggedAccounts[evictId];
    }

    // Create new entry
    const entry: FlaggedAccount = {
      authorId,
      authorName,
      authorProfileUrl,
      compositeScore,
      peakScore: compositeScore,
      postCount: 1,
      signals: { ...signals },
      hiddenPostUrns: hiddenPostUrn === null ? [] : [hiddenPostUrn],
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'pending',
    };
    flaggedAccounts[authorId] = entry;
  }

  await storageSet({ flaggedAccounts });
}
