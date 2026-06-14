import type { FlaggedAccount, StoredPost, TraceEntry, UnflaggedPost } from '../shared/types';

export function csvEscape(value: string | number): string {
  const str = String(value);
  // RFC 4180: if field contains comma, double-quote, or newline — wrap in double-quotes
  // and escape any internal double-quotes by doubling them.
  // Quote-doubling must happen before wrapping.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function buildJsonExport(
  accounts: FlaggedAccount[],
  posts: StoredPost[],
  unflagged: UnflaggedPost[] = [],
): string {
  const postsByAuthor: Record<string, StoredPost[]> = {};
  for (const p of posts) {
    (postsByAuthor[p.authorId] ??= []).push(p);
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    flaggedAccounts: accounts.map(a => ({
      ...a,
      firstSeenAt: new Date(a.firstSeenAt).toISOString(),
      lastSeenAt: new Date(a.lastSeenAt).toISOString(),
      posts: (postsByAuthor[a.authorId] ?? []).map(p => ({
        urn: p.urn,
        score: p.score,
        text: p.text,
        hiddenAt: new Date(p.hiddenAt).toISOString(),
      })),
    })),
    unflaggedPosts: unflagged.map(p => ({
      urn: p.urn,
      authorId: p.authorId,
      authorName: p.authorName,
      text: p.text,
      score: p.score,
      seenAt: new Date(p.seenAt).toISOString(),
      ...(p.label !== undefined ? { label: p.label } : {}),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

// Parse a cleanse cutoff date string to UTC ms, rejecting invalid input.
// An invalid/empty date yields NaN, and any `x >= NaN` comparison is always
// false — which would silently drop every record. Fail loud instead (WR-02).
function parseCutoffMs(beforeDateStr: string): number {
  // date-only strings parse as UTC midnight — stored timestamps are UTC ms, so comparison is correct
  const cutoffMs = new Date(beforeDateStr).getTime();
  if (!Number.isFinite(cutoffMs)) {
    throw new RangeError(`Invalid cleanse cutoff date: ${JSON.stringify(beforeDateStr)}`);
  }
  return cutoffMs;
}

export function deriveCleanseCount(
  accounts: FlaggedAccount[],
  posts: StoredPost[],
  beforeDateStr: string,
): { accountCount: number; postCount: number } {
  const cutoffMs = parseCutoffMs(beforeDateStr);
  return {
    accountCount: accounts.filter(a => a.lastSeenAt < cutoffMs).length,
    postCount: posts.filter(p => p.hiddenAt < cutoffMs).length,
  };
}

export function filterCleansed(
  accounts: FlaggedAccount[],
  posts: StoredPost[],
  beforeDateStr: string,
): { keptAccounts: Record<string, FlaggedAccount>; keptPosts: StoredPost[] } {
  const cutoffMs = parseCutoffMs(beforeDateStr);

  // dailyStats are untouched (D-10); dismissedAccounts wiping is handled by the caller (D-09)
  // because dismissedAccounts is string[] with no timestamp to filter on
  const keptAccounts: Record<string, FlaggedAccount> = {};
  for (const a of accounts.filter(a => a.lastSeenAt >= cutoffMs)) {
    keptAccounts[a.authorId] = a;
  }

  const keptPosts = posts.filter(p => p.hiddenAt >= cutoffMs);

  return { keptAccounts, keptPosts };
}

export function buildTracesExport(traces: TraceEntry[]): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    traces,
  };
  return JSON.stringify(payload, null, 2);
}

export function buildPostsCsvExport(posts: StoredPost[]): string {
  const headers = ['authorId', 'authorName', 'urn', 'score', 'text', 'hiddenAt'];

  const rows = posts.map(p => [
    p.authorId,
    p.authorName,
    p.urn,
    p.score,
    p.text,
    new Date(p.hiddenAt).toISOString(),
  ].map(csvEscape).join(','));

  return [headers.join(','), ...rows].join('\r\n');
}
