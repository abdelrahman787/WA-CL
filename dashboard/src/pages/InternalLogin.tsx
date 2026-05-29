import { useState } from 'react';

interface Props {
  onLogin: (user: { id: string; username: string; displayName: string; role: string }) => void;
}

export function InternalLogin({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'login failed');
        return;
      }
      sessionStorage.setItem('owa_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shellStyle}>
      <form onSubmit={submit} style={cardStyle}>
        <h1 style={{ textAlign: 'center', color: '#075E54', margin: 0 }}>OpenWA</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', marginTop: 0 }}>Sign in to your workspace</p>

        <label style={labelStyle}>
          Username
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem', textAlign: 'center' }}>
          For API key access use the <a href="/legacy-login">legacy login</a>.
        </p>
      </form>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
  background: 'linear-gradient(135deg, #128C7E 0%, #075E54 100%)',
  padding: '1rem',
};

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: '2rem',
  width: '100%', maxWidth: 360, boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
  display: 'flex', flexDirection: 'column', gap: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem', color: '#374151',
};

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.75rem', background: '#075E54', color: 'white', border: 'none',
  borderRadius: 6, fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem',
};

export default InternalLogin;
