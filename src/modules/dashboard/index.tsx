import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { FlaggedAccount, DailyStats, StoredPost, TraceEntry, SelectorRegistrySchema, SelectorTarget, UnflaggedPost } from '../../shared/types';
import { buildJsonExport, buildPostsCsvExport, buildTracesExport, deriveCleanseCount, filterCleansed } from './dataManagement';
import SelectorView from './SelectorView';
import { buildSeedRegistry } from '../../content/selector-registry';
import { storageSet } from '../../shared/memory/storage';
import { TRIGGER_HEAL, HEAL_BUSY } from '../../shared/heal-messages';
import type { HealOutcome, TriggerHealResponse } from '../../shared/heal-messages';


function NetPostsChart({ stats, timeWindow }: { stats: DailyStats[], timeWindow: 7 | 30 }) {
  const days: string[] = [];
  for (let i = timeWindow - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const byDate = new Map(stats.map(s => [s.date, s]));
  const values = days.map(date => {
    const s = byDate.get(date);
    if (!s || s.seen === 0) return 0;
    return Math.round(((s.seen - s.hidden) / s.seen) * 100);
  });

  const hasData = values.some(v => v > 0);
  if (!hasData) return <div style={{ fontSize: 12, color: '#9ca3af', padding: '24px 0' }}>No feed data yet — browse LinkedIn to collect data.</div>;

  const W = 500, H = 100;
  const pL = 36, pR = 8, pT = 8, pB = 24;
  const cW = W - pL - pR;
  const cH = H - pT - pB;
  const maxY = Math.max(...values, 1);
  const n = days.length;

  const xOf = (i: number) => pL + (n > 1 ? (i / (n - 1)) : 0.5) * cW;
  const yOf = (v: number) => pT + (1 - v / maxY) * cH;

  const pts = values.map((v, i) => [xOf(i), yOf(v)] as [number, number]);
  const linePts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPts = [`${pL},${pT + cH}`, ...pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`), `${xOf(n - 1).toFixed(1)},${pT + cH}`].join(' ');

  const xLabels = timeWindow === 7
    ? days.map((d, i) => ({ i, label: d.slice(5) }))
    : [0, 7, 14, 21, n - 1].map(i => ({ i, label: days[i]?.slice(5) ?? '' }));

  const yTicks = [0, Math.round(maxY / 2), maxY];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {yTicks.map(v => (
        <g key={v}>
          <line x1={pL} y1={yOf(v)} x2={pL + cW} y2={yOf(v)} stroke="#f3f4f6" strokeWidth={1} />
          <text x={pL - 8} y={v === 0 ? yOf(v) - 4 : yOf(v)} fontSize={9} fill="#9ca3af" textAnchor="end" dominantBaseline="middle">{v}%</text>
        </g>
      ))}
      <line x1={pL} y1={pT} x2={pL} y2={pT + cH} stroke="#e5e7eb" strokeWidth={1} />
      <line x1={pL} y1={pT + cH} x2={pL + cW} y2={pT + cH} stroke="#e5e7eb" strokeWidth={1} />
      <polygon points={areaPts} fill="#0a66c2" opacity={0.08} />
      <polyline points={linePts} fill="none" stroke="#0a66c2" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {xLabels.map(({ i, label }) => (
        <text key={i} x={xOf(i).toFixed(1)} y={H - 4} fontSize={9} fill="#9ca3af" textAnchor="middle">{label}</text>
      ))}
    </svg>
  );
}

function cutoffDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function App() {
  const [timeWindow, setTimeWindow] = useState<7 | 30>(7);
  const [accounts, setAccounts] = useState<FlaggedAccount[]>([]);
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [posts, setPosts] = useState<StoredPost[]>([]);
  const [unflagged, setUnflagged] = useState<UnflaggedPost[]>([]);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [cleanseDate, setCleanseDate] = useState<string>('');
  const [cleansePreview, setCleansePreview] = useState<{ accountCount: number; postCount: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectorRegistry, setSelectorRegistry] = useState<SelectorRegistrySchema | null>(null);
  const [sessionMisses, setSessionMisses] = useState<Set<SelectorTarget>>(new Set());
  const [feedTabOpen, setFeedTabOpen] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['flaggedAccounts', 'dailyStats', 'storedPosts', 'unflaggedPosts', 'dismissedAccounts', 'selectorRegistry', 'selectorSessionMisses', 'llbTraces']).then((result: Record<string, any>) => {
      const accts = Object.values(
        (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>
      );
      setAccounts(accts);
      setStats((result.dailyStats ?? []) as DailyStats[]);
      setPosts((result.storedPosts ?? []) as StoredPost[]);
      setUnflagged((result.unflaggedPosts ?? []) as UnflaggedPost[]);
      setTraces((result.llbTraces ?? []) as TraceEntry[]);
      setDismissed((result.dismissedAccounts ?? []) as string[]);
      setSelectorRegistry((result.selectorRegistry as SelectorRegistrySchema) ?? null);
      setSessionMisses(new Set((result.selectorSessionMisses ?? []) as SelectorTarget[]));
    }).catch(() => {
      setLoadError('Could not load data. Try reopening the dashboard.');
    });
  }, []);

  useEffect(() => {
    function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
      if (area !== 'local') return;
      if (changes['selectorRegistry']) {
        setSelectorRegistry((changes['selectorRegistry'].newValue as SelectorRegistrySchema) ?? null);
      }
      if (changes['selectorSessionMisses']) {
        setSessionMisses(new Set((changes['selectorSessionMisses'].newValue as SelectorTarget[]) ?? []));
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    function checkFeedTab() {
      chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' }).then((tabs) => {
        setFeedTabOpen(tabs.length > 0);
      }).catch(() => {
        setFeedTabOpen(false);
      });
    }
    checkFeedTab();
    document.addEventListener('visibilitychange', checkFeedTab);
    window.addEventListener('focus', checkFeedTab);
    return () => {
      document.removeEventListener('visibilitychange', checkFeedTab);
      window.removeEventListener('focus', checkFeedTab);
    };
  }, []);

  async function handleHeal(): Promise<HealOutcome[]> {
    const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' });
    const tab = tabs[0];
    if (!tab || tab.id == null) {
      throw new Error('No LinkedIn feed tab found');
    }
    return new Promise<HealOutcome[]>((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id!, { type: TRIGGER_HEAL }, (response: TriggerHealResponse | undefined) => {
        if (chrome.runtime.lastError) {
          const raw = chrome.runtime.lastError.message ?? 'Unknown error';
          const isConnectionError =
            raw.includes('Receiving end does not exist') ||
            raw.includes('Could not establish connection');
          reject(
            new Error(
              isConnectionError
                ? "Couldn't reach the LinkedIn feed tab. Reload the feed tab, then try again."
                : raw
            )
          );
          return;
        }
        if (!response) {
          reject(new Error('No response from content script'));
          return;
        }
        if ('error' in response) {
          if (response.error === HEAL_BUSY) {
            reject(new Error('Heal already running — try again in a moment'));
          } else {
            reject(new Error(response.error));
          }
          return;
        }
        resolve(response.result);
      });
    });
  }

  function triggerDownload(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJson(): void {
    const today = new Date().toISOString().slice(0, 10);
    triggerDownload(buildJsonExport(accounts, posts, unflagged), `linkedin-blocker-${today}.json`, 'application/json');
  }

  function handleExportPostsCsv(): void {
    const today = new Date().toISOString().slice(0, 10);
    triggerDownload(buildPostsCsvExport(posts), `linkedin-blocker-posts-${today}.csv`, 'text/csv');
  }

  function handleExportTraces(): void {
    const today = new Date().toISOString().slice(0, 10);
    triggerDownload(buildTracesExport(traces), `linkedin-blocker-traces-${today}.json`, 'application/json');
  }

  async function handleClean(): Promise<void> {
    if (!cleanseDate || !cleansePreview) return;
    const { accountCount, postCount } = cleansePreview;
    const ok = window.confirm(
      `Delete ${accountCount} account(s), ${postCount} post(s), and all dismissed entries? This cannot be undone.`
    );
    if (!ok) return;
    const { keptAccounts, keptPosts } = filterCleansed(accounts, posts, cleanseDate);
    await chrome.storage.local.set({ flaggedAccounts: keptAccounts, storedPosts: keptPosts, dismissedAccounts: [] });
    setAccounts(Object.values(keptAccounts));
    setPosts(keptPosts);
    setDismissed([]);
    setCleanseDate('');
    setCleansePreview(null);
  }

  async function handleResetSelectors(): Promise<void> {
    await storageSet({ selectorRegistry: buildSeedRegistry() });
  }

  // All-time totals derived from flaggedAccounts (complete history)
  const totalHiddenAllTime = accounts.reduce((s, a) => s + a.hiddenPostUrns.length, 0);

  // Recent activity from dailyStats (only available since Phase 6 deployment)
  const cutoff = cutoffDate(timeWindow);
  const windowStats = stats.filter(d => d.date >= cutoff);
  const recentSeen = windowStats.reduce((s, d) => s + d.seen, 0);
  const recentHidden = windowStats.reduce((s, d) => s + d.hidden, 0);
  const recentPct = recentSeen > 0 ? ((recentHidden / recentSeen) * 100).toFixed(1) : null;

  // Profile bot rate — unique profiles seen in window that are flagged (INSIGHT-02)
  const seenUnion = new Set<string>();
  for (const d of windowStats) {
    for (const id of (d.seenProfileIds ?? [])) {
      seenUnion.add(id);
    }
  }
  const pendingIds = new Set(
    accounts
      .filter(a => a.status !== 'dismissed' && !dismissed.includes(a.authorId))
      .map(a => a.authorId)
  );
  const botProfileCount = [...seenUnion].filter(id => pendingIds.has(id)).length;
  const profileBotRate = seenUnion.size > 0
    ? ((botProfileCount / seenUnion.size) * 100).toFixed(1)
    : null;


  return (
    <div style={s.page}>
      <h1 style={s.heading}>LinkedIn AIVoice blocker - Feed Health</h1>
      <div style={s.subtitle}>because your brain deserves better</div>

      <div style={s.toggleRow}>
        <button
          style={timeWindow === 7 ? s.toggleActive : s.toggle}
          onClick={() => setTimeWindow(7)}
        >7 days</button>
        <button
          style={timeWindow === 30 ? s.toggleActive : s.toggle}
          onClick={() => setTimeWindow(30)}
        >30 days</button>
      </div>

      <div style={s.card}>
        <div style={s.statLabel}>Net AI voice posts in feed — last {timeWindow} days</div>
        <div style={s.categoryNote}>Posts seen minus posts hidden by detector</div>
        <div style={{ marginTop: 12 }}>
          <NetPostsChart stats={stats} timeWindow={timeWindow} />
        </div>
      </div>

      <div style={s.card}>
        <div style={s.statLabel}>Posts hidden — all time</div>
        <div style={s.statValue}>{totalHiddenAllTime}</div>
        <div style={s.statSub}>across {accounts.length} flagged accounts</div>

        <div style={{ marginTop: 20 }}>
          <div style={s.metricLabel}>Posts flagged — last {timeWindow} days</div>
          {recentPct !== null ? (
            <div style={s.barRow}>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, ...s.barAI, width: `${recentPct}%` }} />
              </div>
              <span style={s.barCount}>{recentPct}% ({recentHidden} of {recentSeen})</span>
            </div>
          ) : (
            <div style={s.statSub}>No post data yet — browse LinkedIn to collect data.</div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={s.metricLabel}>Bot profiles seen — last {timeWindow} days</div>
          {profileBotRate !== null ? (
            <div style={s.barRow}>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, ...s.barBot, width: `${profileBotRate}%` }} />
              </div>
              <span style={s.barCount}>{profileBotRate}% ({botProfileCount} of {seenUnion.size})</span>
            </div>
          ) : (
            <div style={s.statSub}>Browse LinkedIn to collect profile data.</div>
          )}
        </div>
      </div>

      <SelectorView
        registry={selectorRegistry}
        sessionMisses={sessionMisses}
        onReset={handleResetSelectors}
        onHeal={handleHeal}
        feedTabOpen={feedTabOpen}
        error={loadError}
      />

      <div style={s.card}>
        <div style={s.cardHeading}>Data management</div>
        <div style={{ marginBottom: 12 }}>
          <button
            style={s.actionBtn}
            onClick={() => window.open(chrome.runtime.getURL('modules/evals/evals.html'), '_blank', 'noreferrer')}
          >
            Open Evals console
          </button>
        </div>
        {loadError && <div style={s.errorMsg}>{loadError}</div>}
        <div style={s.statLabel}>Export data</div>
        {accounts.length === 0 && (
          <div style={s.statSub}>No flagged accounts yet — browse LinkedIn to collect data.</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {(accounts.length > 0 || posts.length > 0 || unflagged.length > 0) && (
            <button style={s.actionBtn} onClick={handleExportJson}>Export matching behaviour</button>
          )}
          {posts.length > 0 && (
            <button style={s.actionBtn} onClick={handleExportPostsCsv}>Export Posts seen ({posts.length})</button>
          )}
          <button
            style={traces.length === 0 ? { ...s.actionBtn, opacity: 0.5, cursor: 'not-allowed' } : s.actionBtn}
            onClick={handleExportTraces}
            disabled={traces.length === 0}
          >
            Export LLM call traces{traces.length > 0 ? ` (${traces.length})` : ''}
          </button>
        </div>
        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
        <div style={s.statLabel}>Cleanse data before:</div>
        <input
          type="date"
          style={{ marginTop: 8, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          value={cleanseDate}
          onInput={(e) => {
            const d = (e.target as HTMLInputElement).value;
            setCleanseDate(d);
            if (d) {
              setCleansePreview(deriveCleanseCount(accounts, posts, d));
            } else {
              setCleansePreview(null);
            }
          }}
        />
        {cleansePreview !== null && (
          <div style={s.statSub}>Will remove {cleansePreview.accountCount} account(s) and {cleansePreview.postCount} post(s)</div>
        )}
        <button
          style={cleanseDate ? s.destructiveBtn : s.destructiveBtnDisabled}
          disabled={!cleanseDate}
          onClick={handleClean}
        >Confirm cleanse</button>
      </div>
    </div>
  );
}

const s: Record<string, import('preact').JSX.CSSProperties> = {
  page: {
    maxWidth: 640,
    margin: '40px auto',
    padding: '0 24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1a1a1a',
  },
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 24 },
  toggleRow: { display: 'flex', gap: 8, marginBottom: 24 },
  toggle: {
    padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: 20,
    background: '#fff', cursor: 'pointer', fontSize: 13,
  },
  toggleActive: {
    padding: '6px 16px', border: '1px solid #0a66c2', borderRadius: 20,
    background: '#0a66c2', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  card: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '20px 24px', marginBottom: 16,
  },
  statLabel: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  statValue: { fontSize: 40, fontWeight: 700, color: '#0a66c2', lineHeight: 1.1 },
  statSub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  metricLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  barRow: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
  },
  barTrack: {
    flex: 1, height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 6, transition: 'width 0.3s' },
  barAI: { background: '#0a66c2' },
  barBot: { background: '#f59e0b' },
  barCount: { fontSize: 12, width: 140, textAlign: 'right' as const, flexShrink: 0 },
  cardHeading: { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 },
  errorMsg: { fontSize: 12, color: '#dc2626', marginBottom: 8 },
  actionBtn: {
    padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: 6,
    background: '#fff', cursor: 'pointer', fontSize: 13,
  },
  destructiveBtn: {
    padding: '6px 16px', border: 'none', borderRadius: 6,
    background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, marginTop: 8,
  },
  destructiveBtnDisabled: {
    padding: '6px 16px', border: 'none', borderRadius: 6,
    background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed', fontSize: 13, marginTop: 8,
  },
  categoryNote: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
};

render(<App />, document.getElementById('root')!);
