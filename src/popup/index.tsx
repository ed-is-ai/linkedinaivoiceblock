import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import type { FlaggedAccount, DailyStats, StoredPost, Settings } from '../shared/types';
import AccountRow from './AccountRow';
import BatchBlockBar from './BatchBlockBar';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [accounts, setAccounts] = useState<FlaggedAccount[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [storedPosts, setStoredPosts] = useState<StoredPost[]>([]);
  const [threshold, setThreshold] = useState(60);
  const [captureUnflagged, setCaptureUnflagged] = useState(false);
  const [feedPct, setFeedPct] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get(['anthropicApiKey', 'settings']).then((result) => {
      const key = result.anthropicApiKey as string | undefined;
      if (key) {
        setHasKey(true);
        setApiKey(key);
      }
      const s = result.settings as Settings | undefined;
      if (s?.autoHideThreshold !== undefined) setThreshold(s.autoHideThreshold);
      setCaptureUnflagged(s?.captureUnflaggedPosts ?? false);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get(['flaggedAccounts', 'dailyStats', 'storedPosts']).then((result) => {
      const raw = (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>;
      setAccounts(Object.values(raw));
      const daily = (result.dailyStats ?? []) as DailyStats[];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const w = daily.filter(d => d.date >= cutoffStr);
      const seen = w.reduce((s, d) => s + d.seen, 0);
      const hidden = w.reduce((s, d) => s + d.hidden, 0);
      setFeedPct(seen > 0 ? `${((hidden / seen) * 100).toFixed(1)}%` : null);
      setStoredPosts((result.storedPosts ?? []) as StoredPost[]);
    });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === 'local' && changes['flaggedAccounts']) {
        const raw = (changes['flaggedAccounts'].newValue ?? {}) as Record<string, FlaggedAccount>;
        setAccounts(Object.values(raw));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function handleBlock(account: FlaggedAccount) {
    // Mark as blocked in storage so the content script applies the blocked overlay
    const result = await chrome.storage.local.get(['flaggedAccounts']);
    const flaggedAccounts = (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>;
    const existing = flaggedAccounts[account.authorId];
    if (existing) {
      flaggedAccounts[account.authorId] = { ...existing, status: 'blocked' as const };
      await chrome.storage.local.set({ flaggedAccounts });
    }
  }

  async function handleBatchBlock() {
    const result = await chrome.storage.local.get(['flaggedAccounts']);
    const flaggedAccounts = (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>;
    for (const account of batchQualifying) {
      const existing = flaggedAccounts[account.authorId];
      if (existing) {
        flaggedAccounts[account.authorId] = { ...existing, status: 'blocked' as const };
      }
    }
    await chrome.storage.local.set({ flaggedAccounts });
  }

  async function handleDismiss(account: FlaggedAccount) {
    const result = await chrome.storage.local.get(['flaggedAccounts', 'dismissedAccounts']);
    const flaggedAccounts = (result.flaggedAccounts ?? {}) as Record<string, FlaggedAccount>;
    const dismissedAccounts = (result.dismissedAccounts ?? []) as string[];

    delete flaggedAccounts[account.authorId];

    const newDismissed = dismissedAccounts.includes(account.authorId)
      ? dismissedAccounts
      : [...dismissedAccounts, account.authorId];

    await chrome.storage.local.set({ flaggedAccounts, dismissedAccounts: newDismissed });
    // Popup state refresh is automatic via the existing onChanged listener (Phase 4)
  }

  async function mergeSettings(patch: Partial<Settings>): Promise<void> {
    const result = await chrome.storage.local.get(['settings']);
    const existing = (result.settings as Settings | undefined) ?? {};
    await chrome.storage.local.set({ settings: { ...existing, ...patch } });
  }

  function saveThreshold(value: number) {
    setThreshold(value);
    mergeSettings({ autoHideThreshold: value });
  }

  function saveCaptureUnflagged(value: boolean) {
    setCaptureUnflagged(value);
    mergeSettings({ captureUnflaggedPosts: value });
  }

  function openDashboard() {
    window.open(chrome.runtime.getURL('dashboard/index.html'), '_blank', 'noreferrer');
  }

  function save() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    chrome.storage.local.set({ anthropicApiKey: trimmed }).then(() => {
      setHasKey(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      console.log('[LLB popup] saved key prefix:', trimmed.slice(0, 20) + '...');
    });
  }

  function clear() {
    chrome.storage.local.remove(['anthropicApiKey']).then(() => {
      setApiKey('');
      setHasKey(false);
    });
  }

  const [blockedExpanded, setBlockedExpanded] = useState(false);

  const pending = accounts
    .filter(a => a.status === 'pending')
    .sort((a, b) => b.peakScore - a.peakScore);

  const batchQualifying = pending.filter(a => a.peakScore >= threshold);

  const blocked = accounts
    .filter(a => a.status === 'blocked')
    .sort((a, b) => b.peakScore - a.peakScore);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>LinkedIn Blocker</h2>
        {pending.length > 0 && (
          <span style={styles.badge}>{pending.length}</span>
        )}
      </div>

      <button onClick={openDashboard} style={styles.dashboardLink}>📊 View Dashboard</button>

      {feedPct !== null && (
        <p style={styles.feedHealth}>{feedPct} of posts flagged (7d)</p>
      )}

      <div style={styles.listContainer}>
        {pending.length === 0 ? (
          <p style={styles.emptyState}>
            No flagged accounts yet — scroll LinkedIn to start detecting.
          </p>
        ) : (
          pending.map(account => (
            <AccountRow
              key={account.authorId}
              account={account}
              onBlock={() => handleBlock(account)}
              onDismiss={() => handleDismiss(account)}
              isExpanded={expandedId === account.authorId}
              onToggle={() =>
                setExpandedId(prev => prev === account.authorId ? null : account.authorId)
              }
              posts={storedPosts
                .filter(p => p.authorId === account.authorId)
                .slice(0, 3)}
            />
          ))
        )}
      </div>

      {batchQualifying.length > 0 && (
        <BatchBlockBar
          count={batchQualifying.length}
          onBatchBlock={handleBatchBlock}
        />
      )}

      {blocked.length > 0 && (
        <div>
          <div
            style={styles.blockedSectionHeader}
            onClick={() => setBlockedExpanded(prev => !prev)}
          >
            Blocked ({blocked.length}) {blockedExpanded ? '▾' : '▸'}
          </div>
          {blockedExpanded && blocked.map(account => (
            <AccountRow
              key={account.authorId}
              account={account}
              onBlock={() => {}}
              onDismiss={() => {}}
              isBlocked={true}
              posts={storedPosts.filter(p => p.authorId === account.authorId).slice(0, 3)}
            />
          ))}
        </div>
      )}

      <details style={styles.details}>
        <summary style={styles.summary}>⚙ Settings</summary>
        <div style={styles.settingsBody}>
          <div style={styles.settingRow}>
            <label style={styles.settingLabel}>
              Hide posts scoring above:
              <span style={styles.thresholdValue}>{threshold} / 100</span>
            </label>
            <input
              type="range"
              min={35}
              max={90}
              step={5}
              value={threshold}
              onInput={(e) => saveThreshold(Number((e.target as HTMLInputElement).value))}
              style={styles.slider}
            />
          </div>

          <div style={styles.captureRow}>
            <label style={styles.captureLabel}>
              <input
                type="checkbox"
                checked={captureUnflagged}
                onChange={(e) => saveCaptureUnflagged((e.target as HTMLInputElement).checked)}
                style={styles.captureCheckbox}
              />
              Capture unflagged posts (eval prep)
            </label>
            <p style={styles.captureHint}>
              Stores text from posts that were <em>not</em> hidden — broader privacy surface. OFF by default.
              Only enable if you are building an evaluation dataset.
            </p>
          </div>

          <div style={styles.modeRow}>
            <span style={{ ...styles.dot, background: hasKey ? '#22c55e' : '#f59e0b' }} />
            <span style={styles.modeLabel}>
              {hasKey ? 'Claude API (LLM mode)' : 'Heuristic mode'}
            </span>
          </div>

          <label style={styles.label}>Anthropic API key</label>
          <input
            type="password"
            value={apiKey}
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
            placeholder="sk-ant-..."
            style={styles.input}
          />

          <div style={styles.buttonRow}>
            <button onClick={save} style={styles.saveBtn} disabled={!apiKey.trim()}>
              {saved ? 'Saved ✓' : 'Save'}
            </button>
            {hasKey && (
              <button onClick={clear} style={styles.clearBtn}>
                Clear
              </button>
            )}
          </div>

          <p style={styles.hint}>
            Get a key at{' '}
            <a href="https://console.anthropic.com" target="_blank" style={styles.link}>
              console.anthropic.com
            </a>
            . Without a key the heuristic detector runs instead.
          </p>
        </div>
      </details>
    </div>
  );
}

const styles: Record<string, preact.JSX.CSSProperties> = {
  container: {
    width: 280,
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    color: '#1a1a1a',
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600 },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    background: '#0a66c2',
    color: '#fff',
    borderRadius: 10,
    padding: '1px 7px',
    fontSize: 11,
    fontWeight: 600,
  },
  listContainer: {
    maxHeight: 400,
    overflowY: 'auto' as const,
    marginBottom: 8,
  },
  emptyState: {
    fontSize: 12,
    color: '#6b7280',
    margin: '12px 0',
    lineHeight: 1.5,
  },
  details: {
    marginTop: 8,
    borderTop: '1px solid #e5e7eb',
    paddingTop: 8,
  },
  summary: {
    cursor: 'pointer',
    fontSize: 12,
    color: '#6b7280',
    userSelect: 'none' as const,
    listStyle: 'none',
  },
  settingsBody: {
    marginTop: 10,
  },
  modeRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  modeLabel: { fontSize: 12, color: '#555' },
  label: { display: 'block', marginBottom: 4, fontWeight: 500 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  buttonRow: { display: 'flex', gap: 8, marginBottom: 10 },
  saveBtn: {
    flex: 1,
    padding: '6px 0',
    background: '#0a66c2',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  clearBtn: {
    padding: '6px 12px',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  hint: { margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5 },
  link: { color: '#0a66c2' },
  settingRow: { marginBottom: 12 },
  settingLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 4,
  },
  thresholdValue: { color: '#0a66c2', fontWeight: 700 },
  slider: { width: '100%', cursor: 'pointer' },
  dashboardLink: {
    width: '100%',
    padding: '6px 0',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center' as const,
  },
  feedHealth: { fontSize: 11, color: '#6b7280', margin: '0 0 8px' },
  captureRow: { marginBottom: 12 },
  captureLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  captureCheckbox: { cursor: 'pointer', margin: 0 },
  captureHint: { margin: '4px 0 0', fontSize: 11, color: '#6b7280', lineHeight: 1.5 },
  blockedSectionHeader: {
    cursor: 'pointer',
    fontSize: 11,
    color: '#6b7280',
    padding: '6px 0',
    borderTop: '1px solid #e5e7eb',
    userSelect: 'none' as const,
  },
};

render(<App />, document.getElementById('root')!);
