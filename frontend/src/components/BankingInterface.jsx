import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioCapture } from '../AudioCapture.js';
import { AudioPlayer } from '../AudioPlayer.js';
import ImageCapture from './ImageCapture.jsx';
import MicButton from './MicButton.jsx';
import TranscriptDisplay from './TranscriptDisplay.jsx';
import TransactionsTable from './TransactionsTable.jsx';

// Append a delta to the last message in state if it belongs to the same
// unfinished turn, otherwise start a new bubble.  Done inside setMessages
// so the decision is always based on the authoritative latest state.
function appendOrCreate(prev, role, delta, finished) {
  const last = prev[prev.length - 1];
  const isNewTurn = !last || last.role !== role || last.finished;
  if (isNewTurn) {
    return [...prev, { role, text: delta, finished }];
  }
  return [...prev.slice(0, -1), { ...last, text: last.text + delta, finished }];
}

// Mark the last agent bubble as finished (used by turn_complete and when
// the user starts speaking while an agent bubble is still open).
function closeAgentBubble(prev) {
  const last = prev[prev.length - 1];
  if (last && last.role === 'agent' && !last.finished) {
    return [...prev.slice(0, -1), { ...last, finished: true }];
  }
  return prev;
}

const WS_URL =
  window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.host}/ws`;

export default function BankingInterface({ session, onLogout }) {
  const [status, setStatus] = useState('connecting'); // connecting | live | disconnected | error
  const [isRecording, setIsRecording] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [toolLabel, setToolLabel] = useState('');
  const [toastTimeout, setToastTimeout] = useState(null);
  const [transactionsData, setTransactionsData] = useState(null);
  // Local balance — initialised from login session, updated live after payments.
  const [balance, setBalance] = useState(session.balance);

  const wsRef = useRef(null);
  const captureRef = useRef(null);
  const playerRef = useRef(null);

  const showToolLabel = useCallback(
    (label) => {
      setToolLabel(label);
      if (toastTimeout) clearTimeout(toastTimeout);
      const t = setTimeout(() => setToolLabel(''), 3000);
      setToastTimeout(t);
    },
    [toastTimeout]
  );

  // Connect WebSocket
  useEffect(() => {
    playerRef.current = new AudioPlayer();

    const ws = new WebSocket(`${WS_URL}/${session.user_id}/${session.session_id}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('live');
      // Auto-start recording on connect
      startRecording(ws);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      setIsRecording(false);
      setIsAgentSpeaking(false);
      captureRef.current?.stop();
    };

    ws.onerror = () => {
      setStatus('error');
    };

    return () => {
      ws.close();
      captureRef.current?.stop();
      playerRef.current?.interrupt();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleServerMessage = useCallback(
    (msg) => {
      switch (msg.type) {
        case 'audio':
          setIsAgentSpeaking(true);
          playerRef.current?.playChunk(msg.data);
          break;

        case 'transcript_input':
          // When the user starts speaking, close any open agent bubble and
          // dismiss the transactions table so it doesn't persist across turns.
          setTransactionsData(null);
          setMessages((prev) => {
            const withClosed = closeAgentBubble(prev);
            return appendOrCreate(withClosed, 'user', msg.text, msg.finished);
          });
          break;

        case 'transcript_output':
          // Accumulate deltas directly into message state — no external ref.
          // appendOrCreate checks last.finished to detect new turns, so this
          // works correctly even if turn_complete was delayed or missing.
          setIsAgentSpeaking(true);
          setMessages((prev) => appendOrCreate(prev, 'agent', msg.text, false));
          break;

        case 'tool_call':
          showToolLabel(msg.label);
          break;

        case 'balance_update':
          // Refresh the balance pill immediately after a transfer or payment.
          setBalance(msg.balance);
          break;

        case 'transactions_table':
          // Render transaction list visually — agent speaks only the summary.
          setTransactionsData({
            transactions: msg.transactions,
            category:     msg.category,
            total_spend:  msg.total_spend,
            year:         msg.year,
            count:        msg.count,
            currency:     msg.currency,
          });
          break;

        case 'interrupted':
          // Barge-in: stop audio immediately, leave transcript bubbles in place.
          playerRef.current?.interrupt();
          setIsAgentSpeaking(false);
          setMessages((prev) => closeAgentBubble(prev));
          break;

        case 'turn_complete':
          setIsAgentSpeaking(false);
          setMessages((prev) => closeAgentBubble(prev));
          break;

        case 'error':
          setStatus('error');
          break;

        default:
          break;
      }
    },
    [showToolLabel]
  );

  const startRecording = async (ws) => {
    try {
      const capture = new AudioCapture((pcmBuffer) => {
        const sock = ws || wsRef.current;
        if (sock?.readyState === WebSocket.OPEN) {
          sock.send(pcmBuffer);
        }
      });
      await capture.start();
      captureRef.current = capture;
      setIsRecording(true);
    } catch (e) {
      console.error('Mic error:', e);
      setStatus('error');
    }
  };

  const toggleRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (isRecording) {
      captureRef.current?.stop();
      captureRef.current = null;
      setIsRecording(false);
    } else {
      await startRecording(null);
    }
  };

  const handleImage = (base64Jpeg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Send image + explicit intent as a single payload so main.py bundles
      // them into one Content turn (inline_data Part + text Part).
      // The model sees both together and immediately routes to payments_agent
      // without needing a separate voice command.
      wsRef.current.send(
        JSON.stringify({
          type: 'image',
          data: base64Jpeg,
          mimeType: 'image/jpeg',
          prompt: 'Please scan this bill and tell me what it says.',
        })
      );
    }
  };

  const statusConfig = {
    connecting: { color: '#F59E0B', dot: '●', text: 'Connecting…' },
    live: { color: '#22C55E', dot: '●', text: 'Live' },
    disconnected: { color: '#9AA5B4', dot: '●', text: 'Disconnected' },
    error: { color: '#EF4444', dot: '●', text: 'Connection error' },
  };
  const sc = statusConfig[status] || statusConfig.disconnected;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoIcon}>NR</div>
          <div>
            <div style={styles.logoText}>NorthRiver Bank</div>
            <div style={styles.customerName}>{session.customer_name}</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.statusBadge}>
            <span style={{ color: sc.color }}>{sc.dot}</span>
            <span style={styles.statusText}>{sc.text}</span>
          </div>
          <button style={styles.logoutBtn} onClick={onLogout}>
            Exit
          </button>
        </div>
      </header>

      {/* Balance pill */}
      <div style={styles.balancePill}>
        <span style={styles.balancePillLabel}>Balance</span>
        <span style={styles.balancePillAmount}>
          €{balance.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Transcript */}
      <div style={styles.transcriptWrapper}>
        <TranscriptDisplay messages={messages} />
      </div>

      {/* Tool toast */}
      {toolLabel && (
        <div style={styles.toast}>
          <span style={styles.toastSpinner}>⟳</span> {toolLabel}
        </div>
      )}

      {/* Transactions table — shown after a spending query, hidden on next user turn */}
      {transactionsData && (
        <TransactionsTable
          data={transactionsData}
          onClose={() => setTransactionsData(null)}
        />
      )}

      {/* Controls */}
      <div style={styles.controls}>
        <ImageCapture
          onImage={handleImage}
          disabled={status !== 'live'}
        />

        <MicButton
          isRecording={isRecording}
          isAgentSpeaking={isAgentSpeaking}
          onClick={toggleRecording}
          disabled={status !== 'live'}
        />

        {/* Spacer to balance layout */}
        <div style={{ width: '80px' }} />
      </div>

      {status === 'error' && (
        <div style={styles.errorBanner}>
          Connection lost.{' '}
          <button style={styles.errorReloadBtn} onClick={() => window.location.reload()}>
            Reconnect
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#F0F4FA',
  },
  header: {
    background: '#FFFFFF',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #003D7A, #0057B0)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '18px',
    flexShrink: 0,
  },
  logoText: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#003D7A',
    lineHeight: '1.2',
  },
  customerName: {
    fontSize: '12px',
    color: '#5A6478',
    lineHeight: '1.2',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    background: '#F7F9FC',
    border: '1px solid #E2E8F0',
    borderRadius: '20px',
    padding: '4px 10px',
  },
  statusText: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#5A6478',
  },
  logoutBtn: {
    background: 'none',
    fontSize: '13px',
    color: '#9AA5B4',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  balancePill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#003D7A',
    margin: '16px 24px',
    borderRadius: '14px',
    padding: '14px 20px',
    flexShrink: 0,
  },
  balancePillLabel: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  balancePillAmount: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  transcriptWrapper: {
    flex: 1,
    background: '#FFFFFF',
    margin: '0 24px',
    borderRadius: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '300px',
  },
  toast: {
    margin: '12px 24px 0',
    padding: '10px 16px',
    background: '#003D7A',
    color: '#fff',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    animation: 'fadeIn 0.2s ease',
  },
  toastSpinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
    fontSize: '16px',
  },
  controls: {
    padding: '20px 24px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexShrink: 0,
    background: '#F0F4FA',
  },
  errorBanner: {
    background: '#FEF2F2',
    borderTop: '1px solid #FCA5A5',
    padding: '12px 24px',
    fontSize: '14px',
    color: '#EF4444',
    textAlign: 'center',
  },
  errorReloadBtn: {
    background: 'none',
    color: '#EF4444',
    fontWeight: '600',
    textDecoration: 'underline',
    fontSize: '14px',
  },
};
