import { useState } from 'react';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 401) {
        setError('Invalid username or password. Please try again.');
        return;
      }
      if (!res.ok) throw new Error('Login failed. Please try again.');

      const data = await res.json();
      onLogin(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>NR</div>
          <span style={styles.logoText}>NorthRiver Bank</span>
        </div>

        <h1 style={styles.heading}>Welcome back</h1>
        <p style={styles.subheading}>Sign in to start your voice banking session</p>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={styles.field}>
            <label style={styles.label} htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              style={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={loading}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          <button
            type="submit"
            style={{
              ...styles.startBtn,
              opacity: loading || !username || !password ? 0.6 : 1,
              cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
            }}
            disabled={loading || !username || !password}
          >
            {loading ? 'Signing in…' : '🎙 Sign In & Start Session'}
          </button>
        </form>

        <p style={styles.hint}>
          Your microphone will be activated after you sign in.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #003D7A 0%, #0057B0 100%)',
    padding: '24px',
  },
  card: {
    background: '#FFFFFF',
    borderRadius: '24px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '32px',
  },
  logoIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #003D7A, #0057B0)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '20px',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#003D7A',
  },
  heading: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: '8px',
  },
  subheading: {
    fontSize: '15px',
    color: '#5A6478',
    marginBottom: '32px',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#5A6478',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1.5px solid #E2E8F0',
    fontSize: '15px',
    color: '#1A1A2E',
    background: '#F7F9FC',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  errorBox: {
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#EF4444',
    marginBottom: '20px',
  },
  startBtn: {
    width: '100%',
    padding: '16px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #003D7A, #0057B0)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    transition: 'opacity 0.2s',
    marginBottom: '16px',
  },
  hint: {
    fontSize: '12px',
    color: '#9AA5B4',
    textAlign: 'center',
  },
};
