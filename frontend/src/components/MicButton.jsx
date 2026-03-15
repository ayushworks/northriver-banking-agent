export default function MicButton({ isRecording, isAgentSpeaking, onClick, disabled }) {
  const state = disabled ? 'disabled' : isAgentSpeaking ? 'speaking' : isRecording ? 'recording' : 'idle';

  const colors = {
    idle: { bg: '#003D7A', ring: 'transparent', icon: '🎙' },
    recording: { bg: '#EF4444', ring: '#FCA5A5', icon: '⏹' },
    speaking: { bg: '#22C55E', ring: '#86EFAC', icon: '🔊' },
    disabled: { bg: '#D1D5DB', ring: 'transparent', icon: '🎙' },
  };

  const { bg, ring, icon } = colors[state];

  return (
    <div style={styles.wrapper}>
      {/* Pulse ring when recording */}
      {state === 'recording' && (
        <div
          style={{
            ...styles.pulseRing,
            background: ring,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {/* Glow ring when agent speaking */}
      {state === 'speaking' && (
        <div
          style={{
            ...styles.pulseRing,
            background: ring,
            animation: 'pulse 0.8s ease-in-out infinite',
          }}
        />
      )}

      <button
        style={{ ...styles.button, background: bg }}
        onClick={onClick}
        disabled={disabled || state === 'speaking'}
        title={
          state === 'recording'
            ? 'Tap to stop'
            : state === 'speaking'
            ? 'River is speaking…'
            : 'Tap to speak'
        }
      >
        <span style={styles.icon}>{icon}</span>
      </button>

      <p style={styles.label}>
        {state === 'recording'
          ? 'Listening…'
          : state === 'speaking'
          ? 'River is speaking'
          : 'Tap to speak'}
      </p>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.25); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -60%)',
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    pointerEvents: 'none',
  },
  button: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    transition: 'transform 0.15s, box-shadow 0.15s',
    position: 'relative',
    zIndex: 1,
  },
  icon: {
    fontSize: '28px',
  },
  label: {
    fontSize: '13px',
    color: '#5A6478',
    fontWeight: '500',
  },
};
