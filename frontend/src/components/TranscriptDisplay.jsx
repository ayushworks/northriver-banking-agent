import { useEffect, useRef } from 'react';

export default function TranscriptDisplay({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>🎙</div>
        <p style={styles.emptyText}>Start talking — River is listening</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            ...styles.bubble,
            ...(msg.role === 'agent' ? styles.agentBubble : styles.userBubble),
            opacity: msg.finished === false ? 0.6 : 1,
          }}
        >
          {msg.role === 'agent' && <span style={styles.roleBadge}>River</span>}
          <p style={styles.text}>{msg.text}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '40px',
  },
  emptyIcon: {
    fontSize: '48px',
  },
  emptyText: {
    fontSize: '15px',
    color: '#9AA5B4',
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: '16px',
    lineHeight: '1.5',
  },
  agentBubble: {
    alignSelf: 'flex-start',
    background: '#F0F4FA',
    borderBottomLeftRadius: '4px',
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: 'linear-gradient(135deg, #003D7A, #0057B0)',
    color: '#FFFFFF',
    borderBottomRightRadius: '4px',
  },
  roleBadge: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: '#003D7A',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  text: {
    fontSize: '14px',
    color: 'inherit',
  },
};
