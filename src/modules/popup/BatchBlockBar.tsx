import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

interface BatchBlockBarProps {
  count: number;
  onBatchBlock: () => Promise<void>;
}

const barStyles: Record<string, JSX.CSSProperties> = {
  idleBtn: {
    width: '100%',
    padding: '6px 0',
    background: '#fff',
    color: '#0a66c2',
    border: '1px solid #0a66c2',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    margin: '8px 0',
  },
  confirmStrip: {
    background: '#f3f4f6',
    borderRadius: 4,
    padding: '8px',
    marginBottom: 8,
  },
  message: {
    fontSize: 12,
    color: '#374151',
    margin: 0,
  },
  countEmphasis: {
    fontWeight: 600,
    color: '#0a66c2',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  keepBtn: {
    padding: '6px 12px',
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
  blockAllBtn: {
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
  blockAllBtnDisabled: {
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
};

export default function BatchBlockBar({ count, onBatchBlock }: Readonly<BatchBlockBarProps>): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [writing, setWriting] = useState(false);

  async function handleConfirm() {
    setWriting(true);
    try {
      await onBatchBlock();
    } catch (err) {
      console.error('[LLB popup] batch block failed:', err);
      setConfirming(false);
    } finally {
      setWriting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        style={barStyles.idleBtn}
        aria-label="Block all accounts above threshold"
        onClick={() => setConfirming(true)}
      >
        Block all above threshold ({count})
      </button>
    );
  }

  return (
    <div style={barStyles.confirmStrip}>
      <p style={barStyles.message}>
        <span>Block </span>
        <span style={barStyles.countEmphasis}>{count} accounts</span>
        <span> above threshold?</span>
      </p>
      <div style={barStyles.buttonRow}>
        <button
          style={barStyles.keepBtn}
          onClick={() => setConfirming(false)}
        >
          Keep pending
        </button>
        <button
          style={writing ? barStyles.blockAllBtnDisabled : barStyles.blockAllBtn}
          aria-label="Confirm batch block"
          disabled={writing}
          onClick={handleConfirm}
        >
          Block all now
        </button>
      </div>
    </div>
  );
}
