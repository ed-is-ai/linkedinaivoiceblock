import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { StoredPost, UnflaggedPost } from '../shared/types';
import type { EvalRun } from '../shared/eval/index';
import { labelPost, seedLabels, countLabeled } from './evalsLabeling';

function App() {
  const [posts, setPosts] = useState<StoredPost[]>([]);
  const [unflagged, setUnflagged] = useState<UnflaggedPost[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engine, setEngine] = useState<'heuristic' | 'llm'>('heuristic');

  useEffect(() => {
    chrome.storage.local
      .get(['storedPosts', 'unflaggedPosts', 'evalRuns'])
      .then((result: Record<string, unknown>) => {
        setPosts((result['storedPosts'] ?? []) as StoredPost[]);
        setUnflagged((result['unflaggedPosts'] ?? []) as UnflaggedPost[]);
        setRuns((result['evalRuns'] ?? []) as EvalRun[]);
      })
      .catch(() => {
        setLoadError('Could not load data. Try reopening the Evals page.');
      });
  }, []);

  const lastRun = runs.at(-1) ?? null;
  const totalPosts = posts.length + unflagged.length;
  const labeledCount = countLabeled([
    ...posts.map(p => ({ label: p.label })),
    ...unflagged.map(p => ({ label: p.label })),
  ]);

  // Derive F1 from the best-threshold row in the last run
  const lastRunBestRow = lastRun
    ? lastRun.thresholds.find(t => t.threshold === lastRun.bestF1Threshold)
    : null;

  return (
    <div style={s.page}>
      <h1 style={s.heading}>LinkedIn Blocker — Evals</h1>
      <div style={s.crumb}>One scrollable console — labeling, eval runs, results, error analysis.</div>

      {loadError && <div style={s.errorMsg}>{loadError}</div>}

      {/* RUN CONTROLS */}
      <div style={s.card}>
        <div style={s.cardHeading}>Run an eval</div>
        <div style={s.label}>Dataset</div>
        <div style={{ marginBottom: 14, fontSize: 13, color: '#374151' }}>
          chrome.storage.local ({labeledCount} labeled / {totalPosts - labeledCount} unlabeled)
        </div>
        <div style={s.label}>Engine</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            style={engine === 'heuristic' ? s.toggleActive : s.toggle}
            onClick={() => setEngine('heuristic')}
          >
            Heuristic (free)
          </button>
          <button
            style={engine === 'llm' ? s.toggleActive : s.toggle}
            onClick={() => setEngine('llm')}
          >
            LLM (Claude)
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={s.primaryBtn} disabled>
            ▶ Run eval
          </button>
          {lastRun ? (
            <span style={s.sub}>
              Last run: {lastRun.runAt.slice(0, 10)} · {lastRun.engine} · F1{' '}
              {lastRunBestRow?.f1 != null ? lastRunBestRow.f1.toFixed(2) : '—'}
            </span>
          ) : (
            <span style={s.sub}>No eval runs yet</span>
          )}
        </div>
      </div>

      {/* METRICS GRID */}
      <div style={s.card}>
        <div style={s.cardHeading}>Results</div>
        {lastRun && lastRunBestRow ? (
          <div style={s.metricsGrid}>
            <div style={s.metric}>
              <div style={s.metricValue}>{lastRunBestRow.f1 != null ? lastRunBestRow.f1.toFixed(2) : '—'}</div>
              <div style={s.metricKey}>F1</div>
            </div>
            <div style={s.metric}>
              <div style={s.metricValue}>{lastRunBestRow.precision != null ? lastRunBestRow.precision.toFixed(2) : '—'}</div>
              <div style={s.metricKey}>Precision</div>
            </div>
            <div style={s.metric}>
              <div style={s.metricValue}>{lastRunBestRow.recall != null ? lastRunBestRow.recall.toFixed(2) : '—'}</div>
              <div style={s.metricKey}>Recall</div>
            </div>
            <div style={s.metric}>
              <div style={s.metricValue}>{lastRun.counts.labeled}</div>
              <div style={s.metricKey}>Posts</div>
            </div>
          </div>
        ) : (
          <div style={s.sub}>No results yet — run an eval above.</div>
        )}
      </div>

      {/* THRESHOLD SWEEP */}
      <div style={s.card}>
        <div style={s.cardHeading}>Threshold sweep</div>
        {lastRun && lastRun.thresholds.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr>
                {(['Threshold', 'Precision', 'Recall', 'F1', 'FP', 'FN'] as const).map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lastRun.thresholds.map(row => (
                <tr
                  key={row.threshold}
                  style={row.threshold === lastRun.bestF1Threshold
                    ? { background: '#eff6ff', fontWeight: 600 }
                    : {}}
                >
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                    {row.threshold}{row.threshold === lastRun.bestF1Threshold ? ' ◀ best' : ''}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.precision != null ? row.precision.toFixed(2) : '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.recall != null ? row.recall.toFixed(2) : '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.f1 != null ? row.f1.toFixed(2) : '—'}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.fp}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.fn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={s.sub}>Run an eval to see the threshold sweep table.</div>
        )}
      </div>

      {/* ERROR ANALYSIS */}
      <div style={s.card}>
        <div style={s.cardHeading}>Error analysis</div>
        {lastRun && (lastRun.errorAnalysis.falsePositives.length > 0 || lastRun.errorAnalysis.falseNegatives.length > 0) ? (
          <div style={s.sub}>
            {lastRun.errorAnalysis.falsePositives.length} FP / {lastRun.errorAnalysis.falseNegatives.length} FN @ threshold {lastRun.errorAnalysis.threshold}
          </div>
        ) : (
          <div style={s.sub}>Run an eval to see false positives and false negatives.</div>
        )}
      </div>

      {/* LABELING SECTION */}
      <LabelingSection
        posts={posts}
        unflagged={unflagged}
        setPosts={setPosts}
        setUnflagged={setUnflagged}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labeling section — extracted so the component is focused on layout
// ---------------------------------------------------------------------------

interface LabelingSectionProps {
  readonly posts: StoredPost[];
  readonly unflagged: UnflaggedPost[];
  readonly setPosts: (v: StoredPost[]) => void;
  readonly setUnflagged: (v: UnflaggedPost[]) => void;
}

function LabelingSection({ posts, unflagged, setPosts, setUnflagged }: LabelingSectionProps) {
  type PostRow = { urn: string; text: string; label?: string };

  const allPosts: PostRow[] = [
    ...posts.map(p => ({ urn: p.urn, text: p.text, label: p.label })),
    ...unflagged.map(p => ({ urn: p.urn, text: p.text, label: p.label })),
  ];

  const labeled = countLabeled(allPosts);
  const total = allPosts.length;

  async function handleLabelClick(urn: string, label: 'ai' | 'human'): Promise<void> {
    await labelPost(urn, label);
    setPosts(posts.map(p => p.urn === urn ? { ...p, label } : p));
    setUnflagged(unflagged.map(p => p.urn === urn ? { ...p, label } : p));
  }

  async function handleBulkSeed(): Promise<void> {
    await seedLabels();
    const result = await chrome.storage.local.get(['storedPosts', 'unflaggedPosts']);
    setPosts((result['storedPosts'] ?? []) as StoredPost[]);
    setUnflagged((result['unflaggedPosts'] ?? []) as UnflaggedPost[]);
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeading}>
        Label posts ({labeled} labeled of {total} posts)
      </div>
      {allPosts.length === 0 ? (
        <div style={s.sub}>
          No posts yet — browse LinkedIn to collect posts, then label them here.
        </div>
      ) : (
        allPosts.map(post => (
          <div key={post.urn} style={s.lblRow}>
            <span style={s.lblText}>{post.text}</span>
            <span style={s.seg}>
              <button
                style={post.label === 'ai' ? s.segBtnAiSelected : s.segBtnAi}
                onClick={() => handleLabelClick(post.urn, 'ai')}
              >
                AI
              </button>
              <button
                style={post.label === 'human' ? s.segBtnHumanSelected : s.segBtnHuman}
                onClick={() => handleLabelClick(post.urn, 'human')}
              >
                Human
              </button>
            </span>
          </div>
        ))
      )}
      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={s.actionBtn} onClick={handleBulkSeed}>
          Bulk: flagged→AI, unflagged→Human
        </button>
        <span style={s.sub}>Writes label back to storage (skips already-labeled posts)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-export helpers for callers that import from evals.tsx directly.
// The implementations live in evalsLabeling.ts (static imports, fully mockable).
// ---------------------------------------------------------------------------

export { labelPost, seedLabels, countLabeled } from './evalsLabeling';

// ---------------------------------------------------------------------------
// Inline styles — no CSS class names (CLAUDE.md constraint)
// ---------------------------------------------------------------------------

const s: Record<string, import('preact').JSX.CSSProperties> = {
  page: {
    maxWidth: 760,
    margin: '40px auto',
    padding: '0 24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1a1a1a',
  },
  heading: { fontSize: 22, fontWeight: 700, margin: '0 0 6px' },
  crumb: { fontSize: 13, color: '#6b7280', marginBottom: 24 },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '20px 24px',
    marginBottom: 16,
  },
  cardHeading: { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 },
  label: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  sub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  toggle: {
    padding: '6px 16px',
    border: '1px solid #d1d5db',
    borderRadius: 20,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  toggleActive: {
    padding: '6px 16px',
    border: '1px solid #0a66c2',
    borderRadius: 20,
    background: '#0a66c2',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  primaryBtn: {
    padding: '6px 16px',
    border: '1px solid #0a66c2',
    borderRadius: 6,
    background: '#0a66c2',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  actionBtn: {
    padding: '6px 16px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  errorMsg: { fontSize: 12, color: '#dc2626', marginBottom: 8 },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
  },
  metric: {
    background: '#f3f4f6',
    borderRadius: 8,
    padding: 14,
  },
  metricValue: { fontSize: 28, fontWeight: 700, color: '#0a66c2', lineHeight: 1.1 },
  metricKey: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  lblRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  lblText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  seg: {
    display: 'inline-flex',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    overflow: 'hidden',
  },
  segBtnAi: {
    border: 'none',
    background: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    color: '#dc2626',
  },
  segBtnAiSelected: {
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  segBtnHuman: {
    border: 'none',
    background: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    color: '#059669',
  },
  segBtnHumanSelected: {
    border: 'none',
    background: '#059669',
    color: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
};

render(<App />, document.getElementById('root')!);
