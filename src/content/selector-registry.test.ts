/**
 * Tests for SelectorRegistry singleton.
 *
 * Phase 23 (this file): insertCandidate prepend-winner + retain-prior + 10-cap +
 * seed-preservation (ADAPT-07) and candidateConfidence match×recency×source ordering
 * (ADAPT-08). Uses an in-memory chrome.storage.local mock; the registry is warmed via
 * load() and assertions read the persisted store written by insertCandidate.
 *
 * Requirements: ADAPT-07, ADAPT-08
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildSeedRegistry,
  load,
  insertCandidate,
  candidateConfidence,
} from './selector-registry';
import type {
  SelectorRegistrySchema,
  SelectorCandidate,
  TargetEntry,
} from '../shared/types';

// ── In-memory chrome.storage.local mock ──────────────────────────────────────

let store: Record<string, unknown> = {};

const setSpy = vi.fn(async (values: Record<string, unknown>) => {
  Object.assign(store, values);
});

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) => {
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in store) out[k] = store[k];
        }
        return out;
      }),
      set: setSpy,
      remove: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn() },
  },
};

/** Build a fresh candidate with sane defaults for tests. */
function cand(overrides: Partial<SelectorCandidate>): SelectorCandidate {
  return {
    value: 'div[data-x]',
    source: 'seed',
    lastMatchedAt: null,
    lastVerifiedAt: null,
    addedAt: new Date().toISOString(),
    failCount: 0,
    matchCount: 0,
    ...overrides,
  };
}

/**
 * Seed the mock store with a registry whose POST_CARD entry we control,
 * then warm the in-memory cache via load().
 */
async function seedAndLoad(postCard: TargetEntry): Promise<void> {
  const registry: SelectorRegistrySchema = buildSeedRegistry();
  registry.targets.POST_CARD = postCard;
  store.selectorRegistry = registry;
  await load();
  setSpy.mockClear();
}

beforeEach(() => {
  store = {};
  (globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;
  vi.clearAllMocks();
});

// ── insertCandidate: prepend-winner + retain-prior (ADAPT-07) ────────────────

describe('insertCandidate — prepend new + retain prior active (ADAPT-07)', () => {
  it('prepends a brand-new candidate at index 0 and retains the prior active at index 1', async () => {
    await seedAndLoad({
      candidates: [cand({ value: 'div[componentkey]', source: 'seed' })],
    });

    await insertCandidate('POST_CARD', 'div[data-urn]', 'heuristic');

    const persisted = store.selectorRegistry as SelectorRegistrySchema;
    const list = persisted.targets.POST_CARD.candidates;
    expect(list[0]!.value).toBe('div[data-urn]');
    expect(list[0]!.source).toBe('heuristic');
    // Prior active retained at index 1 so detection auto-recovers if LinkedIn reverts
    expect(list[1]!.value).toBe('div[componentkey]');
    expect(list[1]!.source).toBe('seed');
  });

  it('sets new candidate metadata: source, addedAt/lastVerifiedAt now, matchCount 0, failCount 0, lastMatchedAt null', async () => {
    await seedAndLoad({
      candidates: [cand({ value: 'div[componentkey]', source: 'seed' })],
    });

    await insertCandidate('POST_CARD', 'div[data-urn]', 'llm');

    const persisted = store.selectorRegistry as SelectorRegistrySchema;
    const inserted = persisted.targets.POST_CARD.candidates[0]!;
    expect(inserted.source).toBe('llm');
    expect(inserted.matchCount).toBe(0);
    expect(inserted.failCount).toBe(0);
    expect(inserted.lastMatchedAt).toBeNull();
    expect(inserted.addedAt).toBeTruthy();
    expect(inserted.lastVerifiedAt).toBeTruthy();
  });

  it('updates lastAdaptedAt and persists via a single storageSet write', async () => {
    await seedAndLoad({
      candidates: [cand({ value: 'div[componentkey]', source: 'seed' })],
    });

    await insertCandidate('POST_CARD', 'div[data-urn]', 'heuristic');

    expect(setSpy).toHaveBeenCalledTimes(1);
    const persisted = store.selectorRegistry as SelectorRegistrySchema;
    expect(persisted.lastAdaptedAt).toBeTruthy();
  });
});

// ── insertCandidate: dedup behavior ──────────────────────────────────────────

describe('insertCandidate — dedup (delegates to updateCandidate, never duplicates)', () => {
  it('rotates an existing value at index>0 to the front instead of duplicating', async () => {
    await seedAndLoad({
      candidates: [
        cand({ value: 'div[data-new]', source: 'heuristic' }),
        cand({ value: 'div[componentkey]', source: 'seed' }),
      ],
    });

    await insertCandidate('POST_CARD', 'div[componentkey]', 'seed');

    const persisted = store.selectorRegistry as SelectorRegistrySchema;
    const list = persisted.targets.POST_CARD.candidates;
    expect(list[0]!.value).toBe('div[componentkey]');
    // No duplicate created
    expect(list.filter((c) => c.value === 'div[componentkey]')).toHaveLength(1);
    expect(list).toHaveLength(2);
  });

  it('increments matchCount for a value already at index 0, no duplicate', async () => {
    await seedAndLoad({
      candidates: [cand({ value: 'div[data-urn]', source: 'heuristic', matchCount: 2 })],
    });

    await insertCandidate('POST_CARD', 'div[data-urn]', 'heuristic');

    const persisted = store.selectorRegistry as SelectorRegistrySchema;
    const list = persisted.targets.POST_CARD.candidates;
    expect(list).toHaveLength(1);
    expect(list[0]!.matchCount).toBe(3);
    expect(list[0]!.lastMatchedAt).toBeTruthy();
  });
});

// ── insertCandidate: 10-cap + seed preservation ──────────────────────────────

describe('insertCandidate — 10-candidate cap without evicting seed', () => {
  it('caps the list at 10 after insertion', async () => {
    // 10 non-seed candidates + 1 seed at the tail = 11; insert pushes toward cap
    const existing: SelectorCandidate[] = [];
    for (let i = 0; i < 9; i++) {
      existing.push(cand({ value: `div[data-a${i}]`, source: 'heuristic' }));
    }
    existing.push(cand({ value: 'div[componentkey]', source: 'seed' }));
    await seedAndLoad({ candidates: existing }); // length 10

    await insertCandidate('POST_CARD', 'div[data-fresh]', 'heuristic'); // would be 11

    const persisted = store.selectorRegistry as SelectorRegistrySchema;
    const list = persisted.targets.POST_CARD.candidates;
    expect(list).toHaveLength(10);
    expect(list[0]!.value).toBe('div[data-fresh]');
  });

  it('never evicts the seed candidate even when it would fall past the cap', async () => {
    // seed sits at the tail (index 10) so naive slice(0,10) would drop it
    const existing: SelectorCandidate[] = [];
    for (let i = 0; i < 10; i++) {
      existing.push(cand({ value: `div[data-b${i}]`, source: 'heuristic' }));
    }
    existing.push(cand({ value: 'div[componentkey]', source: 'seed' })); // index 10
    await seedAndLoad({ candidates: existing }); // length 11

    await insertCandidate('POST_CARD', 'div[data-fresh]', 'heuristic'); // unshift -> 12, cap to 10

    const persisted = store.selectorRegistry as SelectorRegistrySchema;
    const list = persisted.targets.POST_CARD.candidates;
    expect(list).toHaveLength(10);
    expect(list.some((c) => c.source === 'seed' && c.value === 'div[componentkey]')).toBe(true);
  });
});

// ── candidateConfidence ordering (ADAPT-08) ──────────────────────────────────

describe('candidateConfidence — match × recency × source weight (ADAPT-08)', () => {
  it('ranks llm above seed for equal matchCount and recency (source weighting)', () => {
    const seed = cand({ source: 'seed', matchCount: 5, lastMatchedAt: null });
    const llm = cand({ source: 'llm', matchCount: 5, lastMatchedAt: null });
    expect(candidateConfidence(llm)).toBeGreaterThan(candidateConfidence(seed));
  });

  it('orders sources seed < heuristic < llm < user at equal match/recency', () => {
    const base = { matchCount: 3, lastMatchedAt: null as string | null };
    const seed = candidateConfidence(cand({ ...base, source: 'seed' }));
    const heuristic = candidateConfidence(cand({ ...base, source: 'heuristic' }));
    const llm = candidateConfidence(cand({ ...base, source: 'llm' }));
    const user = candidateConfidence(cand({ ...base, source: 'user' }));
    expect(seed).toBeLessThan(heuristic);
    expect(heuristic).toBeLessThan(llm);
    expect(llm).toBeLessThan(user);
  });

  it('uses recency 0.3 for a never-matched candidate', () => {
    // (matchCount+1) × 0.3 × sourceWeight = (0+1) × 0.3 × 0.6 = 0.18 for a never-matched seed
    const neverMatched = cand({ source: 'seed', matchCount: 0, lastMatchedAt: null });
    expect(candidateConfidence(neverMatched)).toBeCloseTo(0.18, 5);
  });

  it('a recent match outranks a 30-day-old match for the same candidate shape', () => {
    const now = Date.now();
    const recent = cand({
      source: 'heuristic',
      matchCount: 4,
      lastMatchedAt: new Date(now - 60 * 1000).toISOString(),
    });
    const old = cand({
      source: 'heuristic',
      matchCount: 4,
      lastMatchedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(candidateConfidence(recent)).toBeGreaterThan(candidateConfidence(old));
  });

  it('a higher matchCount outranks a lower one at equal recency/source', () => {
    const many = cand({ source: 'llm', matchCount: 10, lastMatchedAt: null });
    const few = cand({ source: 'llm', matchCount: 1, lastMatchedAt: null });
    expect(candidateConfidence(many)).toBeGreaterThan(candidateConfidence(few));
  });
});
