import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface ChatRow {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  importJobId: string | null;
  participantCount: number;
  lastMessage: { body: string | null; createdAt: string; senderId: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

interface User { id: string; username: string; displayName: string }

export default function AdminChats() {
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ChatRow | null>(null);
  const [participants, setParticipants] = useState<{ userId: string; role: string }[]>([]);
  const [addPick, setAddPick] = useState('');

  const refresh = async () => {
    setLoading(true);
    const [c, u] = await Promise.all([
      fetch('/api/chat/admin/chats', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
    ]);
    setChats(c);
    setUsers(u);
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!selected) return;
    void fetch(`/api/chat/chats/${selected.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { participants: { userId: string; role: string }[] }) =>
        setParticipants(d.participants ?? []),
      );
  }, [selected]);

  const userMap = new Map(users.map(u => [u.id, u]));

  const remove = async (chatId: string) => {
    if (!confirm('Permanently delete this chat and all messages?')) return;
    await fetch(`/api/chat/admin/chats/${chatId}`, { method: 'DELETE', credentials: 'include' });
    setSelected(null);
    await refresh();
  };

  const removeMember = async (chatId: string, userId: string) => {
    if (!confirm('Remove member?')) return;
    await fetch(`/api/chat/admin/chats/${chatId}/participants/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setParticipants(p => p.filter(x => x.userId !== userId));
  };

  const addMember = async () => {
    if (!selected || !addPick) return;
    await fetch(`/api/chat/admin/chats/${selected.id}/participants`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: [addPick] }),
    });
    setAddPick('');
    void fetch(`/api/chat/chats/${selected.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { participants: { userId: string; role: string }[] }) =>
        setParticipants(d.participants ?? []),
      );
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>All chats <small style={{ color: '#6b7280', fontSize: '0.7em' }}>(admin view)</small></h1>
        <button onClick={() => void refresh()}>Refresh</button>
      </div>
      {loading ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ background: 'var(--color-surface, #fff)', borderRadius: 8, maxHeight: '70vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead><tr style={{ textAlign: 'left' }}>
                <th>Title</th><th>Type</th><th>Members</th><th>Last activity</th><th></th>
              </tr></thead>
              <tbody>
                {chats.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      background: selected?.id === c.id ? '#f3f4f6' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      {c.name ?? <em>{c.type === 'direct' ? 'Direct chat' : 'Group'}</em>}
                      {c.importJobId && <span title="Imported"> 📥</span>}
                    </td>
                    <td>{c.type}</td>
                    <td align="center">{c.participantCount}</td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {c.lastMessage ? new Date(c.lastMessage.createdAt).toLocaleString() : '—'}
                    </td>
                    <td>
                      <button onClick={e => { e.stopPropagation(); void remove(c.id); }} style={{ color: '#dc2626' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {chats.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>No chats.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'var(--color-surface, #fff)', borderRadius: 8, padding: '1rem' }}>
            {!selected ? (
              <p style={{ color: '#6b7280' }}>Select a chat to inspect or modify.</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{selected.name ?? `(${selected.type})`}</h3>
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  <code>{selected.id}</code><br />
                  Created {new Date(selected.createdAt).toLocaleString()}
                </p>
                <Link to={`/admin/chats/${selected.id}/messages`} style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                  View messages →
                </Link>

                <h4>Participants ({participants.length})</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {participants.map(p => {
                    const u = userMap.get(p.userId);
                    return (
                      <li key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #f0f2f5' }}>
                        <span>
                          {u?.displayName ?? '(unknown)'} <small style={{ color: '#9ca3af' }}>@{u?.username ?? p.userId.slice(0, 8)}</small>
                          {p.role === 'admin' && ' 👑'}
                        </span>
                        <button onClick={() => void removeMember(selected.id, p.userId)} style={{ color: '#dc2626', fontSize: '0.8rem' }}>
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {selected.type === 'group' && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <select value={addPick} onChange={e => setAddPick(e.target.value)} style={{ flex: 1 }}>
                      <option value="">— add user —</option>
                      {users
                        .filter(u => !participants.find(p => p.userId === u.id))
                        .map(u => (
                          <option key={u.id} value={u.id}>{u.displayName} (@{u.username})</option>
                        ))}
                    </select>
                    <button disabled={!addPick} onClick={() => void addMember()}>Add</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
