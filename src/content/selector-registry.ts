/**
 * LinkedIn Blocker — Selector Registry Singleton
 *
 * Runtime source of truth for all selector lookups. Maintains an in-memory cache
 * of the SelectorRegistry schema for sync resolve() calls, backed by chrome.storage.local
 * for persistence across tabs.
 *
 * Supports:
 * - Sync resolve() for the observer hot path (reads in-memory _cache with seed fallback)
 * - Async seedIfNeeded() to initialize storage on first load or version bump (additive migration)
 * - Async load() to warm the in-memory cache before observer starts
 * - Async updateCandidate() to rotate winning candidates to front and persist
 * - Sync recordMiss() to track per-session unmatched selectors
 * - chrome.storage.onChanged listener to refresh cache when other tabs write
 */

import type {
  SelectorRegistrySchema,
  SelectorTarget,
  SelectorCandidate,
  CandidateSource,
  TargetEntry,
} from '../shared/types';
import { storageGet, storageSet } from '../shared/memory/storage';
import {
  SELECTORS_VERSION,
  FEED_CONTAINER,
  FEED_CONTAINER_FALLBACK,
  POST_CARD,
  POST_URN_ATTR,
  POST_URN_ATTR_FALLBACK,
  POST_BODY_TEXT,
  POST_AUTHOR_NAME,
  POST_AUTHOR_LINK,
  SPONSORED_MARKER,
  COMPANY_PAGE_MARKER,
  RESHARE_INDICATOR,
  COMMENT_EXPAND_BUTTON,
  OPEN_TO_WORK_MARKER,
  COMMENT_TEXT,
  AUTHOR_HEADLINE,
  CONNECTION_DEGREE,
} from './selectors';

/**
 * In-memory cache of the selector registry. Null until load() completes.
 * Refreshed via chrome.storage.onChanged when other tabs write.
 */
let _cache: SelectorRegistrySchema | null = null;

/**
 * Per-session set of targets that have resolved but never produced a DOM match.
 * Written to storage on first miss per target (write-once-per-miss).
 */
const _sessionMisses = new Set<SelectorTarget>();

/**
 * Seed map for resolve() fallback. Used when _cache is null (before load())
 * and as a last-resort fallback if a target is not found in the cache.
 */
const SEED_MAP: Record<SelectorTarget, string> = {
  FEED_CONTAINER,
  FEED_CONTAINER_FALLBACK,
  POST_CARD,
  POST_URN_ATTR,
  POST_URN_ATTR_FALLBACK,
  POST_BODY_TEXT,
  POST_AUTHOR_NAME,
  POST_AUTHOR_LINK,
  SPONSORED_MARKER,
  COMPANY_PAGE_MARKER,
  RESHARE_INDICATOR,
  COMMENT_EXPAND_BUTTON,
  OPEN_TO_WORK_MARKER,
  COMMENT_TEXT,
  AUTHOR_HEADLINE,
  CONNECTION_DEGREE,
};

/**
 * Build a seed registry with one seed candidate per target.
 * Used during first seedIfNeeded() and as the fallback for malformed storage.
 */
export function buildSeedRegistry(): SelectorRegistrySchema {
  const targets: Record<SelectorTarget, TargetEntry> = {} as Record<
    SelectorTarget,
    TargetEntry
  >;
  const now = new Date().toISOString();

  (Object.entries(SEED_MAP) as [SelectorTarget, string][]).forEach(
    ([target, value]) => {
      targets[target] = {
        candidates: [
          {
            value,
            source: 'seed' as CandidateSource,
            lastMatchedAt: null,
            lastVerifiedAt: null,
            addedAt: now,
            failCount: 0,
            matchCount: 0,
          },
        ],
      };
    }
  );

  return {
    version: SELECTORS_VERSION,
    targets,
    lastAdaptedAt: null,
  };
}

/**
 * Additive migration: merge existing adapted candidates with new targets from seed.
 *
 * Rules:
 * 1. Copy all existing TargetEntry records (preserving adapted candidates)
 * 2. Add any SelectorTarget keys present in SEED_MAP but absent in stored
 * 3. Ensure seed value is always present in each list (append as last item if absent)
 * 4. Set version to SELECTORS_VERSION
 * 5. Defensively validate stored shape; fall back to buildSeedRegistry() on malformed input
 */
function migrate(stored: SelectorRegistrySchema | undefined): SelectorRegistrySchema {
  // Validate stored is an object with a targets object
  if (!stored || typeof stored !== 'object' || !stored.targets || typeof stored.targets !== 'object') {
    return buildSeedRegistry();
  }

  const seed = buildSeedRegistry();
  const targets: Record<SelectorTarget, TargetEntry> = { ...seed.targets };

  // Copy existing targets, preserving adapted candidates
  const storedTargets = stored.targets as Record<string, TargetEntry | undefined>;
  (Object.entries(SEED_MAP) as [SelectorTarget, string][]).forEach(([target]) => {
    if (storedTargets[target]) {
      targets[target] = JSON.parse(JSON.stringify(storedTargets[target])); // Deep copy
    }
  });

  // Ensure seed value is in every list as a fallback
  (Object.entries(targets) as [SelectorTarget, TargetEntry][]).forEach(([target, entry]) => {
    const seedValue = SEED_MAP[target];
    const hasSeed = entry.candidates.some((c) => c.source === 'seed' && c.value === seedValue);
    if (!hasSeed) {
      // Append seed as last-resort fallback
      const seedCandidate = seed.targets[target].candidates[0];
      if (seedCandidate) {
        entry.candidates.push(seedCandidate);
      }
    }
  });

  return {
    version: SELECTORS_VERSION,
    targets,
    lastAdaptedAt: stored.lastAdaptedAt ?? null,
  };
}

/**
 * Seed storage if absent or version-bumped. Never overwrites adapted candidates on normal load.
 * SELECTOR-03: Guard with version check — only write when key is absent OR version differs.
 */
export async function seedIfNeeded(): Promise<void> {
  registerOnChangedListener();
  const { selectorRegistry } = await storageGet(['selectorRegistry']);

  if (!selectorRegistry || selectorRegistry.version !== SELECTORS_VERSION) {
    await storageSet({ selectorRegistry: migrate(selectorRegistry) });
  }
}

/**
 * TTL eviction constant: 30 days in milliseconds.
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Load registry from storage into in-memory cache.
 * Runs TTL eviction: drop candidates with source !== 'seed' and addedAt > 30 days old.
 * Seed candidates are never evicted, ensuring every target always has a selector.
 */
export async function load(): Promise<void> {
  registerOnChangedListener();
  const { selectorRegistry } = await storageGet(['selectorRegistry']);
  const registry = selectorRegistry ?? buildSeedRegistry();

  // Apply TTL eviction
  const now = Date.now();
  Object.values(registry.targets).forEach((entry) => {
    entry.candidates = entry.candidates.filter((c) => {
      if (c.source === 'seed') {
        return true; // Never evict seed
      }
      const candidateAge = now - new Date(c.addedAt).getTime();
      return candidateAge < THIRTY_DAYS_MS;
    });
  });

  _cache = registry;
}

/**
 * Sync resolver called from the observer hot path.
 * Returns the value of the first candidate (index 0) if cache is warm,
 * falls back to seed constant if cache is null (pre-load fallback).
 *
 * Note: POST_URN_ATTR, POST_URN_ATTR_FALLBACK, and COMPANY_PAGE_MARKER
 * are attribute-name and URL-pattern strings, not CSS selectors. The registry
 * returns them as-is; consumers are responsible for using them correctly.
 */
export function resolve(target: SelectorTarget): string {
  if (!_cache) {
    // Pre-load fallback: return seed constant
    return SEED_MAP[target];
  }

  const entry = _cache.targets[target];
  return entry?.candidates[0]?.value ?? SEED_MAP[target];
}

/**
 * Rotate a winning candidate to the front and persist.
 * SELECTOR-04: Find the candidate by value; if already at index 0, just update lastMatchedAt.
 * If at index > 0, splice and unshift to front. Enforce <= 10 cap after rotation (SELECTOR-05).
 * Fire-and-forget from observer hot path — use .catch(() => {}) at call site.
 */
export async function updateCandidate(
  target: SelectorTarget,
  winnerValue: string
): Promise<void> {
  if (!_cache) {
    return; // No-op if cache is not warm
  }

  const entry = _cache.targets[target];
  if (!entry) {
    return;
  }

  const idx = entry.candidates.findIndex((c) => c.value === winnerValue);

  if (idx <= 0) {
    // Already at front or not found — just update lastMatchedAt and increment matchCount
    if (idx === 0 && entry.candidates[0]) {
      entry.candidates[0].lastMatchedAt = new Date().toISOString();
      entry.candidates[0].matchCount = (entry.candidates[0].matchCount ?? 0) + 1;
    }
  } else {
    // Rotate to front
    const removed = entry.candidates.splice(idx, 1);
    const winner = removed[0];
    if (winner) {
      winner.lastMatchedAt = new Date().toISOString();
      winner.matchCount = (winner.matchCount ?? 0) + 1;
      entry.candidates.unshift(winner);
    }
  }

  // Enforce cap <= 10, never evicting seed
  if (entry.candidates.length > 10) {
    // Find the seed candidate (always keep it)
    const seedIdx = entry.candidates.findIndex((c) => c.source === 'seed');
    if (seedIdx >= 0) {
      // If seed is in the tail (unlikely but possible), move it to the end of the truncated list
      const truncated = entry.candidates.slice(0, 10);
      if (seedIdx >= 10) {
        // Seed was evicted — add it back at the end
        const seedCandidate = entry.candidates[seedIdx];
        if (seedCandidate && truncated.length > 0) {
          truncated[truncated.length - 1] = seedCandidate;
        }
      }
      entry.candidates = truncated;
    } else {
      // No seed found (should never happen) — just truncate
      entry.candidates = entry.candidates.slice(0, 10);
    }
  }

  // Persist
  await storageSet({ selectorRegistry: _cache }).catch(() => {});
}

/**
 * Source weights for candidate confidence ordering (ADAPT-08).
 * seed < heuristic < llm < user — an adapted/user candidate outranks the seed
 * at equal match/recency so a proven repair stays at the front.
 */
const SOURCE_WEIGHTS: Record<CandidateSource, number> = {
  seed: 0.6,
  heuristic: 0.8,
  llm: 0.9,
  user: 1.0,
};

/**
 * Score a candidate for confidence ordering (ADAPT-08).
 *
 * confidence = (matchCount + 1) × recency × sourceWeight
 *   - matchCount + 1 so a never-matched new candidate still ranks above 0.
 *   - recency: 1.0 for a match in the last instant, decaying linearly toward a
 *     0.1 floor across 30 days; 0.3 when the candidate has never matched.
 *   - sourceWeight: seed 0.6 < heuristic 0.8 < llm 0.9 < user 1.0.
 */
export function candidateConfidence(c: SelectorCandidate): number {
  const matchCount = c.matchCount ?? 0;
  const sourceWeight = SOURCE_WEIGHTS[c.source];
  let recency: number;
  if (c.lastMatchedAt) {
    const ageMs = Date.now() - new Date(c.lastMatchedAt).getTime();
    recency = Math.max(0.1, 1.0 - (ageMs / THIRTY_DAYS_MS) * 0.9);
  } else {
    recency = 0.3; // never matched — lower confidence
  }
  return (matchCount + 1) * recency * sourceWeight;
}

/**
 * Insert a new adapted candidate at index 0 for a target (ADAPT-07).
 *
 * Called by the heal orchestrator (23-04) AFTER validateCandidate passes — this is
 * the only new selector-write surface and it lives in SelectorRegistry per CLAUDE.md
 * constraint #1.
 *
 * Behavior:
 *   - If the value already exists (at any index), delegate to updateCandidate() which
 *     handles the index-0 matchCount bump and the >0 rotate-to-front — never duplicates.
 *   - If brand-new, unshift it at index 0 so the previously-active candidate moves to
 *     index 1 (retain-prior so detection auto-recovers if LinkedIn reverts).
 *   - Enforce the 10-candidate cap (SELECTOR-05) without ever evicting the seed.
 *   - Update lastAdaptedAt and persist once (single storage write).
 */
export async function insertCandidate(
  target: SelectorTarget,
  value: string,
  source: CandidateSource
): Promise<void> {
  if (!_cache) {
    return; // No-op if cache is not warm
  }

  const entry = _cache.targets[target];
  if (!entry) {
    return;
  }

  // Existing value (front or later) — delegate to updateCandidate (bump or rotate, no dup)
  const existing = entry.candidates.findIndex((c) => c.value === value);
  if (existing >= 0) {
    await updateCandidate(target, value);
    return;
  }

  // Brand-new candidate — prepend so the prior active retains at index 1 (ADAPT-07)
  const now = new Date().toISOString();
  entry.candidates.unshift({
    value,
    source,
    lastMatchedAt: null,
    lastVerifiedAt: now,
    addedAt: now,
    failCount: 0,
    matchCount: 0,
  });

  // Enforce cap <= 10, never evicting seed
  if (entry.candidates.length > 10) {
    const seedIdx = entry.candidates.findIndex((c) => c.source === 'seed');
    const truncated = entry.candidates.slice(0, 10);
    if (seedIdx >= 10) {
      // Seed was evicted by truncation — preserve it at the end of the kept list
      const seedCandidate = entry.candidates[seedIdx];
      if (seedCandidate && truncated.length > 0) {
        truncated[truncated.length - 1] = seedCandidate;
      }
    }
    entry.candidates = truncated;
  }

  _cache.lastAdaptedAt = now;

  // Single persist write (only SelectorRegistry writes selectors — CLAUDE.md #1)
  await storageSet({ selectorRegistry: _cache }).catch(() => {});
}

/**
 * Record a per-session miss for a target.
 * Sync write-once-per-miss: if not already recorded, add to the set and fire-and-forget storageSet.
 */
export function recordMiss(target: SelectorTarget): void {
  if (_sessionMisses.has(target)) {
    return; // Already recorded this session
  }

  _sessionMisses.add(target);
  storageSet({ selectorSessionMisses: Array.from(_sessionMisses) }).catch(() => {});
}

/**
 * chrome.storage.onChanged listener — registered lazily on first call.
 * When another tab writes selectorRegistry, refresh _cache from newValue.
 * Active before any await so it's ready to catch writes from other tabs during load().
 */
let _onChangedListenerRegistered = false;

function registerOnChangedListener() {
  if (_onChangedListenerRegistered) {
    return;
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') {
          return;
        }

        if (changes['selectorRegistry']) {
          _cache = (changes['selectorRegistry'].newValue as SelectorRegistrySchema) ?? null;
        }

        if (changes['selectorSessionMisses']) {
          // Update module-scope set if needed
          const newMisses = changes['selectorSessionMisses'].newValue as SelectorTarget[] | undefined;
          if (newMisses) {
            newMisses.forEach((target) => _sessionMisses.add(target));
          }
        }
      });
      _onChangedListenerRegistered = true;
    }
  } catch {
    // chrome.storage not available (e.g., in tests) — silent fail
  }
}
