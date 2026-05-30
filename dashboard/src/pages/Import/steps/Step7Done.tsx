import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ImportWizardState } from '../ImportWizard';

interface Cred { username: string; password: string; displayName: string }

interface Props { state: ImportWizardState; restart: () => void }

export function Step7Done({ state, restart }: Props) {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!state.jobId) return;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    fetch(`/api/import/jobs/${state.jobId}/credentials`, { headers: { 'X-API-Key': apiKey } })
      .then(r => (r.ok ? r.json() : { credentials: [] }))
      .then(d => setCreds(d.credentials ?? []))
      .catch(() => setCreds([]));
  }, [state.jobId]);

  const copyAll = async () => {
    const text = creds
      .map(c => `${c.displayName} — username: ${c.username} — password: ${c.password}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <>
      <h2>✅ Import complete</h2>
      <p>Job <code>{state.jobId}</code> finished.</p>

      {creds.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fbbf24', borderRadius: 8, padding: '1rem', marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>🔐 New user credentials</h3>
          <p style={{ fontSize: '0.85rem', color: '#92400e', marginTop: 0 }}>
            These passwords are shown <strong>once only</strong>. Copy them now and hand them to the right people — the server doesn't store the plaintext.
          </p>
          <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Display name</th><th>Username</th><th>Password</th>
              </tr>
            </thead>
            <tbody>
              {creds.map(c => (
                <tr key={c.username} style={{ borderTop: '1px solid #fed7aa' }}>
                  <td style={{ padding: '0.4rem 0' }}>{c.displayName}</td>
                  <td><code>{c.username}</code></td>
                  <td><code>{c.password}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={copyAll} style={{ marginTop: '0.75rem' }}>
            {copied === 'all' ? '✓ Copied' : 'Copy all to clipboard'}
          </button>
        </div>
      )}

      <div className="iw-actions" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
        {state.jobId && (
          <Link
            to={`/chats/${state.jobId}`}
            style={{
              background: '#075E54',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            View imported chat →
          </Link>
        )}
        <Link to="/import/history">View history</Link>
        <button onClick={restart}>Import another</button>
      </div>
    </>
  );
}
