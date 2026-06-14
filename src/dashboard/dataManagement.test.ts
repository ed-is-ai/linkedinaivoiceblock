import { describe, it, expect } from 'vitest';
import {
  csvEscape,
  buildJsonExport,
  deriveCleanseCount,
  filterCleansed,
  buildPostsCsvExport,
  buildTracesExport,
} from './dataManagement';
import type { FlaggedAccount, StoredPost, TraceEntry, UnflaggedPost } from '../shared/types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<FlaggedAccount> = {}): FlaggedAccount {
  return {
    authorId: 'user1',
    authorName: 'Test User',
    authorProfileUrl: 'https://www.linkedin.com/in/test-user/',
    compositeScore: 72.4,
    postCount: 3,
    peakScore: 85,
    signals: { listicle: 25, buzzwords: 15 },
    hiddenPostUrns: ['urn:li:activity:1'],
    firstSeenAt: 1748560000000,
    lastSeenAt: 1748650000000,
    status: 'pending',
    ...overrides,
  };
}

function makePost(overrides: Partial<StoredPost> = {}): StoredPost {
  return {
    urn: 'urn:li:activity:1',
    authorId: 'user1',
    authorName: 'Test User',
    score: 72,
    text: 'Some post text.',
    hiddenAt: 1748600000000,
    ...overrides,
  };
}

// ─── csvEscape ───────────────────────────────────────────────────────────────

describe('csvEscape', () => {
  it('returns plain number as string without quoting', () => {
    expect(csvEscape(72)).toBe('72');
  });

  it('returns plain string unchanged when no special chars', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('wraps field containing comma in double-quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('doubles internal double-quotes before wrapping', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps field containing newline in double-quotes', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps field containing carriage return in double-quotes', () => {
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"');
  });
});

function makeUnflagged(overrides: Partial<UnflaggedPost> = {}): UnflaggedPost {
  return {
    urn: 'urn:li:activity:99',
    authorId: 'user99',
    authorName: 'Unflagged User',
    score: 30,
    text: 'A perfectly normal post.',
    seenAt: 1748600000000,
    engineUsed: 'heuristic',
    ...overrides,
  };
}

// ─── buildJsonExport ─────────────────────────────────────────────────────────

describe('buildJsonExport', () => {
  it('returns valid JSON with exportedAt and flaggedAccounts keys', () => {
    const result = buildJsonExport([], []);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('exportedAt');
    expect(parsed).toHaveProperty('flaggedAccounts');
  });

  it('handles empty accounts array — flaggedAccounts is []', () => {
    const parsed = JSON.parse(buildJsonExport([], []));
    expect(parsed.flaggedAccounts).toEqual([]);
  });

  it('embeds matching posts under account posts field', () => {
    const account = makeAccount();
    const post = makePost();
    const parsed = JSON.parse(buildJsonExport([account], [post]));
    expect(parsed.flaggedAccounts[0].posts).toHaveLength(1);
    expect(parsed.flaggedAccounts[0].posts[0].urn).toBe('urn:li:activity:1');
  });

  it('gives account with no matching posts an empty posts array', () => {
    const account = makeAccount({ authorId: 'user1' });
    const post = makePost({ authorId: 'user2' });
    const parsed = JSON.parse(buildJsonExport([account], [post]));
    expect(parsed.flaggedAccounts[0].posts).toEqual([]);
  });

  it('converts firstSeenAt and lastSeenAt to ISO strings', () => {
    const account = makeAccount({ firstSeenAt: 1748560000000, lastSeenAt: 1748650000000 });
    const parsed = JSON.parse(buildJsonExport([account], []));
    const exported = parsed.flaggedAccounts[0];
    expect(exported.firstSeenAt).toBe(new Date(1748560000000).toISOString());
    expect(exported.lastSeenAt).toBe(new Date(1748650000000).toISOString());
  });

  it('converts post hiddenAt to ISO string', () => {
    const account = makeAccount();
    const post = makePost({ hiddenAt: 1748600000000 });
    const parsed = JSON.parse(buildJsonExport([account], [post]));
    expect(parsed.flaggedAccounts[0].posts[0].hiddenAt).toBe(new Date(1748600000000).toISOString());
  });

  it('does not include dailyStats or dismissedAccounts at top level', () => {
    const parsed = JSON.parse(buildJsonExport([], []));
    expect(parsed).not.toHaveProperty('dailyStats');
    expect(parsed).not.toHaveProperty('dismissedAccounts');
  });

  it('two-arg call yields a top-level unflaggedPosts equal to []', () => {
    const parsed = JSON.parse(buildJsonExport([], []));
    expect(parsed).toHaveProperty('unflaggedPosts');
    expect(parsed.unflaggedPosts).toEqual([]);
  });

  it('three-arg call with one UnflaggedPost yields unflaggedPosts of length 1 with correct fields', () => {
    const post = makeUnflagged({ seenAt: 1748600000000, label: 'negative' });
    const parsed = JSON.parse(buildJsonExport([], [], [post]));
    expect(parsed.unflaggedPosts).toHaveLength(1);
    const entry = parsed.unflaggedPosts[0];
    expect(entry.urn).toBe('urn:li:activity:99');
    expect(entry.authorId).toBe('user99');
    expect(entry.authorName).toBe('Unflagged User');
    expect(entry.score).toBe(30);
    expect(entry.text).toBe('A perfectly normal post.');
    expect(entry.seenAt).toBe(new Date(1748600000000).toISOString());
    expect(entry.label).toBe('negative');
  });

  it('three-arg call without label does NOT include label key in exported entry', () => {
    const post = makeUnflagged();
    const parsed = JSON.parse(buildJsonExport([], [], [post]));
    expect(parsed.unflaggedPosts[0]).not.toHaveProperty('label');
  });

  it('unflaggedPosts is a top-level sibling of flaggedAccounts, not nested under an account', () => {
    const account = makeAccount();
    const unflagged = makeUnflagged();
    const parsed = JSON.parse(buildJsonExport([account], [], [unflagged]));
    // unflaggedPosts at top level
    expect(parsed).toHaveProperty('unflaggedPosts');
    expect(parsed.unflaggedPosts).toHaveLength(1);
    // NOT nested under flaggedAccounts[0]
    expect(parsed.flaggedAccounts[0]).not.toHaveProperty('unflaggedPosts');
  });

  // ── flaggedPosts[] assertions (Phase 25.2) ──────────────────────────────

  it('empty call yields a top-level flaggedPosts equal to []', () => {
    const parsed = JSON.parse(buildJsonExport([], []));
    expect(parsed).toHaveProperty('flaggedPosts');
    expect(parsed.flaggedPosts).toEqual([]);
  });

  it('given one StoredPost, flaggedPosts[0] has correct urn, authorId, authorName, text, score and hiddenAt as ISO', () => {
    const post = makePost({ hiddenAt: 1748600000000 });
    const parsed = JSON.parse(buildJsonExport([], [post]));
    expect(parsed.flaggedPosts).toHaveLength(1);
    const entry = parsed.flaggedPosts[0];
    expect(entry.urn).toBe('urn:li:activity:1');
    expect(entry.authorId).toBe('user1');
    expect(entry.authorName).toBe('Test User');
    expect(entry.text).toBe('Some post text.');
    expect(entry.score).toBe(72);
    expect(entry.hiddenAt).toBe(new Date(1748600000000).toISOString());
  });

  it('flaggedPosts[0] does NOT have an engineUsed property', () => {
    const post = makePost();
    const parsed = JSON.parse(buildJsonExport([], [post]));
    expect(parsed.flaggedPosts[0]).not.toHaveProperty('engineUsed');
  });

  it('StoredPost with label yields flaggedPosts[0].label equal to that label', () => {
    const post = { ...makePost(), label: 'ai' } as StoredPost & { label: string };
    const parsed = JSON.parse(buildJsonExport([], [post]));
    expect(parsed.flaggedPosts[0].label).toBe('ai');
  });

  it('StoredPost without label yields flaggedPosts[0] with NO label property', () => {
    const post = makePost();
    const parsed = JSON.parse(buildJsonExport([], [post]));
    expect(parsed.flaggedPosts[0]).not.toHaveProperty('label');
  });

  it('flaggedPosts is a top-level sibling of flaggedAccounts, NOT nested under any entry', () => {
    const account = makeAccount();
    const post = makePost();
    const parsed = JSON.parse(buildJsonExport([account], [post]));
    expect(parsed).toHaveProperty('flaggedPosts');
    expect(parsed.flaggedAccounts[0]).not.toHaveProperty('flaggedPosts');
  });

  // ── blocked boolean on exported flaggedAccounts[] (Phase 25.2) ──────────

  it('exported flaggedAccounts[0] has blocked: true when account status is "blocked"', () => {
    const account = makeAccount({ status: 'blocked' });
    const parsed = JSON.parse(buildJsonExport([account], []));
    expect(parsed.flaggedAccounts[0].blocked).toBe(true);
  });

  it('exported flaggedAccounts[0] has blocked: false when account status is "pending"', () => {
    const account = makeAccount({ status: 'pending' });
    const parsed = JSON.parse(buildJsonExport([account], []));
    expect(parsed.flaggedAccounts[0].blocked).toBe(false);
  });

  it('exported flaggedAccounts[0] has blocked: false when account status is "dismissed"', () => {
    const account = makeAccount({ status: 'dismissed' });
    const parsed = JSON.parse(buildJsonExport([account], []));
    expect(parsed.flaggedAccounts[0].blocked).toBe(false);
  });

  it('exported flaggedAccounts[0] does NOT have a status property', () => {
    const account = makeAccount({ status: 'blocked' });
    const parsed = JSON.parse(buildJsonExport([account], []));
    expect(parsed.flaggedAccounts[0]).not.toHaveProperty('status');
  });

  it('exported flaggedAccounts[0] still has a nested posts array (D-06 retention)', () => {
    const account = makeAccount();
    const post = makePost();
    const parsed = JSON.parse(buildJsonExport([account], [post]));
    expect(parsed.flaggedAccounts[0]).toHaveProperty('posts');
    expect(parsed.flaggedAccounts[0].posts).toHaveLength(1);
    const nestedPost = parsed.flaggedAccounts[0].posts[0];
    expect(nestedPost).toHaveProperty('urn');
    expect(nestedPost).toHaveProperty('score');
    expect(nestedPost).toHaveProperty('text');
    expect(nestedPost).toHaveProperty('hiddenAt');
  });
});

// ─── deriveCleanseCount ──────────────────────────────────────────────────────

describe('deriveCleanseCount', () => {
  it('counts accounts with lastSeenAt strictly before cutoff', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const old = makeAccount({ lastSeenAt: cutoffMs - 1 });
    const recent = makeAccount({ authorId: 'user2', lastSeenAt: cutoffMs });
    const { accountCount } = deriveCleanseCount([old, recent], [], '2026-05-15');
    expect(accountCount).toBe(1);
  });

  it('account with lastSeenAt exactly equal to cutoff is NOT counted (kept)', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const exact = makeAccount({ lastSeenAt: cutoffMs });
    const { accountCount } = deriveCleanseCount([exact], [], '2026-05-15');
    expect(accountCount).toBe(0);
  });

  it('counts posts with hiddenAt strictly before cutoff', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const old = makePost({ hiddenAt: cutoffMs - 1 });
    const exact = makePost({ urn: 'urn:2', hiddenAt: cutoffMs });
    const { postCount } = deriveCleanseCount([], [old, exact], '2026-05-15');
    expect(postCount).toBe(1);
  });

  it('post with hiddenAt exactly equal to cutoff is NOT counted (kept)', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const exact = makePost({ hiddenAt: cutoffMs });
    const { postCount } = deriveCleanseCount([], [exact], '2026-05-15');
    expect(postCount).toBe(0);
  });

  it('throws RangeError for an empty/invalid date string (WR-02)', () => {
    expect(() => deriveCleanseCount([makeAccount()], [makePost()], '')).toThrow(RangeError);
  });
});

// ─── filterCleansed ──────────────────────────────────────────────────────────

describe('filterCleansed', () => {
  it('keeps accounts with lastSeenAt >= cutoff', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const old = makeAccount({ authorId: 'old', lastSeenAt: cutoffMs - 1 });
    const kept = makeAccount({ authorId: 'kept', lastSeenAt: cutoffMs });
    const { keptAccounts } = filterCleansed([old, kept], [], '2026-05-15');
    expect(Object.keys(keptAccounts)).toEqual(['kept']);
  });

  it('account with lastSeenAt exactly equal to cutoff is KEPT', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const exact = makeAccount({ authorId: 'exact', lastSeenAt: cutoffMs });
    const { keptAccounts } = filterCleansed([exact], [], '2026-05-15');
    expect(keptAccounts['exact']).toBeDefined();
  });

  it('keptAccounts is a Record keyed by authorId', () => {
    const account = makeAccount({ authorId: 'user1', lastSeenAt: Date.now() + 99999 });
    const { keptAccounts } = filterCleansed([account], [], '2020-01-01');
    expect(keptAccounts['user1']).toBeDefined();
    expect(keptAccounts['user1']!.authorName).toBe('Test User');
  });

  it('keeps posts with hiddenAt >= cutoff', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const old = makePost({ urn: 'old', hiddenAt: cutoffMs - 1 });
    const kept = makePost({ urn: 'kept', hiddenAt: cutoffMs });
    const { keptPosts } = filterCleansed([], [old, kept], '2026-05-15');
    expect(keptPosts.map(p => p.urn)).toEqual(['kept']);
  });

  it('does not mutate input arrays', () => {
    const cutoffMs = new Date('2026-05-15').getTime();
    const accounts = [makeAccount({ lastSeenAt: cutoffMs - 1 })];
    const posts = [makePost({ hiddenAt: cutoffMs - 1 })];
    const accountsCopy = [...accounts];
    const postsCopy = [...posts];
    filterCleansed(accounts, posts, '2026-05-15');
    expect(accounts).toEqual(accountsCopy);
    expect(posts).toEqual(postsCopy);
  });
});

// ─── buildPostsCsvExport ─────────────────────────────────────────────────────

describe('buildPostsCsvExport', () => {
  it('empty posts array returns header row only', () => {
    const result = buildPostsCsvExport([]);
    expect(result).toBe('authorId,authorName,urn,score,text,hiddenAt');
  });

  it('single post with plain text produces correct columns', () => {
    const post = makePost();
    const result = buildPostsCsvExport([post]);
    const lines = result.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('authorId,authorName,urn,score,text,hiddenAt');
    const fields = lines[1]!.split(',');
    expect(fields[0]).toBe('user1');
    expect(fields[1]).toBe('Test User');
    expect(fields[2]).toBe('urn:li:activity:1');
    expect(fields[3]).toBe('72');
    expect(fields[4]).toBe('Some post text.');
    expect(fields[5]).toBe(new Date(1748600000000).toISOString());
  });

  it('post text containing comma is RFC 4180-escaped', () => {
    const post = makePost({ text: 'Hello, world' });
    const result = buildPostsCsvExport([post]);
    expect(result).toContain('"Hello, world"');
  });

  it('post text containing double-quote is RFC 4180-escaped', () => {
    const post = makePost({ text: 'say "hi"' });
    const result = buildPostsCsvExport([post]);
    expect(result).toContain('"say ""hi"""');
  });

  it('post text containing newline is RFC 4180-escaped', () => {
    const post = makePost({ text: 'line1\nline2' });
    const result = buildPostsCsvExport([post]);
    expect(result).toContain('"line1\nline2"');
  });

  it('multiple posts produce the correct number of rows', () => {
    const posts = [
      makePost({ urn: 'urn:li:activity:1', authorId: 'user1' }),
      makePost({ urn: 'urn:li:activity:2', authorId: 'user2' }),
      makePost({ urn: 'urn:li:activity:3', authorId: 'user3' }),
    ];
    const result = buildPostsCsvExport(posts);
    const lines = result.split('\r\n');
    expect(lines).toHaveLength(4); // header + 3 rows
  });
});

// ─── buildTracesExport ───────────────────────────────────────────────────────

function makeTrace(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    model: 'claude-sonnet-4-6',
    systemPrompt: 'sys',
    userPrompt: 'user',
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0.001,
    timestamp: new Date(1748600000000).toISOString(),
    source: 'detector',
    ...overrides,
  };
}

describe('buildTracesExport', () => {
  it('returns valid JSON with exportedAt and traces keys', () => {
    const parsed = JSON.parse(buildTracesExport([]));
    expect(parsed).toHaveProperty('exportedAt');
    expect(parsed).toHaveProperty('traces');
  });

  it('empty traces array produces traces: []', () => {
    const parsed = JSON.parse(buildTracesExport([]));
    expect(parsed.traces).toEqual([]);
  });

  it('preserves trace entry fields verbatim', () => {
    const trace = makeTrace({ error: 'network error' });
    const parsed = JSON.parse(buildTracesExport([trace]));
    expect(parsed.traces[0].model).toBe('claude-sonnet-4-6');
    expect(parsed.traces[0].inputTokens).toBe(100);
    expect(parsed.traces[0].source).toBe('detector');
    expect(parsed.traces[0].error).toBe('network error');
  });

  it('output is pretty-printed with 2-space indentation', () => {
    const result = buildTracesExport([]);
    // Pretty-printed JSON contains newlines and leading spaces
    expect(result).toContain('\n');
    expect(result).toContain('  ');
    // Verify it matches the exact formatting of JSON.stringify with 2-space indent
    const parsed = JSON.parse(result);
    expect(result).toBe(JSON.stringify(parsed, null, 2));
  });
});
