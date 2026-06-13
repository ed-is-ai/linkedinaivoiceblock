import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { SelectorRegistrySchema, SelectorTarget } from '../shared/types';

interface SelectorViewProps {
  registry: SelectorRegistrySchema | null;
  sessionMisses: Set<SelectorTarget>;
  onReset: () => Promise<void>;
  error: string | null;
}

const FEED_ESSENTIAL: ReadonlySet<SelectorTarget> = new Set([
  'FEED_CONTAINER',
  'POST_CARD',
  'POST_AUTHOR_LINK',
  'POST_BODY_TEXT',
]);

const s: Record<string, JSX.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '20px 24px',
    marginBottom: 16,
  },
  cardHeading: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 12,
  },
  headingStale: {
    fontSize: 13,
    fontWeight: 600,
    color: '#dc2626',
    marginBottom: 12,
  },
  errorMsg: {
    fontSize: 12,
    color: '#dc2626',
    marginBottom: 8,
  },
  loadingMsg: {
    fontSize: 12,
    color: '#9ca3af',
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 600,
    paddingBottom: 8,
    borderBottom: '1px solid #e5e7eb',
    marginBottom: 4,
  },
  columnHeaderTarget: {
    flex: '0 0 30%',
  },
  columnHeaderSelector: {
    flex: '0 0 40%',
  },
  columnHeaderSource: {
    flex: '0 0 15%',
  },
  columnHeaderLastMatched: {
    flex: '0 0 15%',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  rowStaleEssential: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    paddingLeft: 6,
    borderBottom: '1px solid #e5e7eb',
    borderLeft: '2px solid #dc2626',
    color: '#dc2626',
  },
  target: {
    flex: '0 0 30%',
    fontSize: 13,
    fontWeight: 400,
  },
  selector: {
    flex: '0 0 40%',
    fontSize: 12,
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    color: '#374151',
  },
  selectorStale: {
    flex: '0 0 40%',
    fontSize: 12,
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    color: '#dc2626',
  },
  source: {
    flex: '0 0 15%',
  },
  badge: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 10,
  },
  badgeSeed: {
    color: '#0a66c2',
    background: '#eff6ff',
  },
  badgeHeuristic: {
    color: '#374151',
    background: '#f3f4f6',
  },
  badgeLlm: {
    color: '#6b7280',
    background: '#f9fafb',
  },
  badgeUser: {
    color: '#374151',
    background: '#f3f4f6',
  },
  lastMatched: {
    flex: '0 0 15%',
    fontSize: 12,
    fontWeight: 400,
    color: '#6b7280',
  },
  lastMatchedStaleContextual: {
    flex: '0 0 15%',
    fontSize: 12,
    fontWeight: 400,
    color: '#9ca3af',
  },
  notSeenAnnotation: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 4,
  },
  hrDivider: {
    margin: '16px 0',
    border: 'none',
    borderTop: '1px solid #e5e7eb',
  },
  resetIdleBtn: {
    padding: '6px 16px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  confirmStrip: {
    background: '#f3f4f6',
    borderRadius: 4,
    padding: '8px',
  },
  confirmMessage: {
    fontSize: 12,
    color: '#374151',
    margin: 0,
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    padding: '6px 12px',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
  resetNowBtn: {
    flex: 1,
    padding: '6px 0',
    background: '#0a66c2',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  resetNowBtnDisabled: {
    flex: 1,
    padding: '6px 0',
    background: '#0a66c2',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'not-allowed',
    fontSize: 13,
    fontWeight: 600,
    opacity: 0.7,
  },
  resetErrorMsg: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 8,
  },
};

export default function SelectorView({
  registry,
  sessionMisses,
  onReset,
  error,
}: Readonly<SelectorViewProps>): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [writing, setWriting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleConfirmReset() {
    setWriting(true);
    setResetError(null);
    try {
      await onReset();
      setConfirming(false);
    } catch {
      setResetError('Reset failed. Try again.');
      setConfirming(false);
    } finally {
      setWriting(false);
    }
  }

  // Count feed-essential targets with session misses
  const feedEssentialMissCount = Array.from(sessionMisses).filter((target) =>
    FEED_ESSENTIAL.has(target)
  ).length;

  // Determine heading text and style
  const hasStaleEssential = feedEssentialMissCount > 0;
  const headingText =
    hasStaleEssential
      ? `Selector Health (${feedEssentialMissCount} stale)`
      : 'Selector Health';
  const headingStyle = hasStaleEssential ? s.headingStale : s.cardHeading;

  // Error state
  if (error) {
    return (
      <div style={s.card}>
        <div style={headingStyle}>{headingText}</div>
        <div style={s.errorMsg}>
          Could not load selector health. Try reopening the dashboard.
        </div>
      </div>
    );
  }

  // Loading state
  if (!registry) {
    return (
      <div style={s.card}>
        <div style={headingStyle}>{headingText}</div>
        <div style={s.loadingMsg}>Loading selector health…</div>
      </div>
    );
  }

  // Render populated state
  const targets = Object.entries(registry.targets) as [
    SelectorTarget,
    { candidates: Array<{ value: string; source: string; lastMatchedAt: string | null }> }
  ][];

  return (
    <div style={s.card}>
      <div style={headingStyle}>{headingText}</div>

      {/* Column headers */}
      <div style={s.columnHeader}>
        <div style={s.columnHeaderTarget}>Target</div>
        <div style={s.columnHeaderSelector}>Active selector</div>
        <div style={s.columnHeaderSource}>Source</div>
        <div style={s.columnHeaderLastMatched}>Last matched</div>
      </div>

      {/* Data rows */}
      {targets.map(([target, entry]) => {
        const candidate = entry.candidates[0];
        if (!candidate) return null;

        const isMissing = sessionMisses.has(target);
        const isEssential = FEED_ESSENTIAL.has(target);
        const isMissingEssential = isMissing && isEssential;

        const rowStyle = isMissingEssential ? s.rowStaleEssential : s.row;
        const targetStyle = isMissingEssential
          ? { ...s.target, color: '#dc2626' }
          : s.target;
        const selectorStyle = isMissingEssential ? s.selectorStale : s.selector;
        const lastMatchedStyle = isMissing && !isEssential
          ? s.lastMatchedStaleContextual
          : s.lastMatched;

        const lastMatchedValue = candidate.lastMatchedAt
          ? candidate.lastMatchedAt.substring(0, 10)
          : '—';

        // Determine badge style
        let badgeStyle: JSX.CSSProperties = { ...s.badge, ...s.badgeSeed };
        if (candidate.source === 'heuristic') {
          badgeStyle = { ...s.badge, ...s.badgeHeuristic };
        } else if (candidate.source === 'llm') {
          badgeStyle = { ...s.badge, ...s.badgeLlm };
        } else if (candidate.source === 'user') {
          badgeStyle = { ...s.badge, ...s.badgeUser };
        }

        return (
          <div key={target} style={rowStyle}>
            <div style={targetStyle}>{target}</div>
            <div style={selectorStyle} title={candidate.value}>
              {candidate.value}
            </div>
            <div style={s.source}>
              <div style={badgeStyle}>{candidate.source}</div>
            </div>
            <div style={lastMatchedStyle}>
              {lastMatchedValue}
              {isMissing && !isEssential && (
                <span style={s.notSeenAnnotation}>(not seen this session)</span>
              )}
            </div>
          </div>
        );
      })}

      {/* HR divider */}
      <hr style={s.hrDivider} />

      {/* Reset control */}
      {!confirming ? (
        <button
          style={s.resetIdleBtn}
          onClick={() => setConfirming(true)}
        >
          Reset to defaults
        </button>
      ) : (
        <>
          <div style={s.confirmStrip}>
            <p style={s.confirmMessage}>
              Reset all selectors to bundled defaults?
            </p>
            <div style={s.buttonRow}>
              <button
                style={s.cancelBtn}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                style={writing ? s.resetNowBtnDisabled : s.resetNowBtn}
                disabled={writing}
                onClick={handleConfirmReset}
              >
                {writing ? 'Resetting…' : 'Reset now'}
              </button>
            </div>
          </div>
          {resetError && <div style={s.resetErrorMsg}>{resetError}</div>}
        </>
      )}
    </div>
  );
}
