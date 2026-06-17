import type { FlaggedAccount, StoredPost } from '../../shared/types';
import type { JSX } from 'preact';

interface AccountRowProps {
  account: FlaggedAccount;
  onBlock: () => void;
  onDismiss: () => void;
  isExpanded?: boolean;
  onToggle?: () => void;
  posts?: StoredPost[];
  isBlocked?: boolean;
}

const rowStyles: Record<string, JSX.CSSProperties> = {
  row: {
    padding: '10px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  summaryArea: { cursor: 'pointer' },
  topLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  nameLink: {
    color: '#1a1a1a',
    fontWeight: 600,
    fontSize: 13,
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 160,
    display: 'block',
  },
  peakScore: {
    color: '#0a66c2',
    fontWeight: 700,
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  meta: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  chip: {
    background: '#f3f4f6',
    color: '#374151',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 10,
  },
  moreChips: {
    fontSize: 10,
    color: '#9ca3af',
    alignSelf: 'center',
  },
  detailPanel: {
    background: '#f9fafb',
    borderRadius: 4,
    padding: '8px',
    marginTop: 6,
    marginBottom: 4,
  },
  signalTable: { marginBottom: 6 },
  signalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    padding: '1px 0',
  },
  signalName: { color: '#374151' },
  signalScore: { color: '#0a66c2', fontWeight: 600 },
  postsSection: { borderTop: '1px solid #e5e7eb', paddingTop: 6 },
  postSnippet: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
    fontSize: 11,
  },
  postText: { color: '#4b5563', flex: 1, lineHeight: 1.4 },
  postScore: {
    color: '#0a66c2',
    fontWeight: 600,
    flexShrink: 0,
    fontSize: 10,
  },
  actionRow: {
    display: 'flex',
    gap: 6,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  dismissBtn: {
    padding: '4px 10px',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
  },
  blockBtn: {
    padding: '4px 10px',
    background: '#fff',
    color: '#0a66c2',
    border: '1px solid #0a66c2',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
  },
  blockedChip: {
    background: '#f3f4f6',
    color: '#9ca3af',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
  } as JSX.CSSProperties,
};

export default function AccountRow({
  account, onBlock, onDismiss,
  isExpanded = false, onToggle, posts = [],
  isBlocked = false,
}: Readonly<AccountRowProps>): JSX.Element {
  const activeSignals = Object.entries(account.signals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a); // sorted by score desc for detail panel
  const visibleChipKeys = activeSignals.slice(0, 4).map(([k]) => k);
  const hiddenCount = activeSignals.length - visibleChipKeys.length;

  return (
    <div style={rowStyles.row}>
      <div style={rowStyles.summaryArea} onClick={onToggle}>
        <div style={rowStyles.topLine}>
          <a
            href={account.authorProfileUrl}
            target="_blank"
            rel="noreferrer"
            style={{ ...rowStyles.nameLink, ...(isBlocked ? { color: '#9ca3af' } : {}) }}
            onClick={(e) => e.stopPropagation()}
          >
            {account.authorName}
          </a>
          {isBlocked && <span style={rowStyles.blockedChip}>Blocked</span>}
          <span style={rowStyles.peakScore}>
            Peak: {account.peakScore}{'  '}{isExpanded ? '▾' : '▸'}
          </span>
        </div>

        <div style={rowStyles.meta}>
          <span>avg: {Math.round(account.compositeScore)}</span>
          <span>•</span>
          <span>{account.postCount} {account.postCount === 1 ? 'post' : 'posts'}</span>
        </div>

        <div style={rowStyles.chipRow}>
          {visibleChipKeys.map((chip) => (
            <span key={chip} style={rowStyles.chip}>{chip}</span>
          ))}
          {hiddenCount > 0 && (
            <span style={rowStyles.moreChips}>+{hiddenCount} more</span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div style={rowStyles.detailPanel}>
          <div style={rowStyles.signalTable}>
            {activeSignals.map(([key, score]) => (
              <div key={key} style={rowStyles.signalRow}>
                <span style={rowStyles.signalName}>{key}</span>
                <span style={rowStyles.signalScore}>{score} pts</span>
              </div>
            ))}
          </div>
          {posts.length > 0 && (
            <div style={rowStyles.postsSection}>
              {posts.map((post) => (
                <div key={post.urn} style={rowStyles.postSnippet}>
                  <span style={rowStyles.postText}>
                    {post.text.length > 120 ? post.text.slice(0, 120) + '…' : post.text}
                  </span>
                  <span style={rowStyles.postScore}>{post.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isBlocked && (
        <div style={rowStyles.actionRow}>
          <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} style={rowStyles.dismissBtn}>Dismiss</button>
          <button onClick={(e) => { e.stopPropagation(); onBlock(); }} style={rowStyles.blockBtn}>Block</button>
        </div>
      )}
    </div>
  );
}
