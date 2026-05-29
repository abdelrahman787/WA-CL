import { useEffect, useState } from 'react';

interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'operator' | 'viewer';
  isActive: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'operator' as User['role'] });
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const res = await fetch('/api/users', { credentials: 'include' });
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? 'create failed');
      return;
    }
    setCreating(false);
    setForm({ username: '', displayName: '', password: '', role: 'operator' });
    await refresh();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' });
    await refresh();
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Users</h1>
        <button onClick={() => setCreating(s => !s)}>
          {creating ? 'Cancel' : '+ New user'}
        </button>
      </div>

      {creating && (
        <form onSubmit={create} style={{ background: 'var(--color-surface, #fff)', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <input placeholder="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required />
            <input placeholder="display name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required />
            <input placeholder="password (8+)" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={8} required />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as User['role'] })}>
              <option value="operator">operator</option>
              <option value="admin">admin</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" style={{ marginTop: '0.75rem' }}>Create</button>
        </form>
      )}

      {loading ? <p>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface, #fff)' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Username</th><th>Display name</th><th>Role</th><th>Active</th><th>Last seen</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td>{u.username}</td>
                <td>{u.displayName}</td>
                <td>{u.role}</td>
                <td>{u.isActive ? '✅' : '❌'}</td>
                <td>{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : '—'}</td>
                <td><button onClick={() => remove(u.id)} style={{ color: '#dc2626' }}>Delete</button></td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
