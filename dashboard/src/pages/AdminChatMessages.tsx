import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface Message {
  id: string;
  chatId: string;
  senderId: string | null;
  body: string | null;
  type: string;
  createdAt: string;
  deletedAt: string | null;
}
interface User { id: string; displayName: string; username: string }

export default function AdminChatMessages() {
  const { chatId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<Map<string, User>>(new Map());

  const refresh = async () => {
    if (!chatId) return;
    const [data, us] = await Promise.all([
      fetch(`/api/chat/chats/${chatId}/messages?pageSize=1000`, { credentials: 'include' }).then(r => r.json()),
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
    ]);
    setMessages(data.items);
    setUsers(new Map((us as User[]).map(u => [u.id, u])));
  };
  useEffect(() => { void refresh(); }, [chatId]);

  const remove = async (messageId: string) => {
    if (!confirm('Delete this message for everyone?')) return;
    await fetch(`/api/chat/admin/messages/${messageId}`, { method: 'DELETE', credentials: 'include' });
    await refresh();
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <h1>Messages <small style={{ color: '#6b7280', fontSize: '0.7em' }}>(admin)</small></h1>
      <p style={{ color: '#6b7280' }}><code>{chatId}</code></p>
      <div style={{ background: 'var(--color-surface, #fff)', borderRadius: 8, padding: '0.75rem' }}>
        {messages.map(m => {
          const sender = m.senderId ? users.get(m.senderId) : null;
          return (
            <div key={m.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #f0f2f5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{sender?.displayName ?? (m.senderId ? '(unknown)' : 'system')}</strong>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                  {new Date(m.createdAt).toLocaleString()}
                  <button
                    onClick={() => void remove(m.id)}
                    disabled={!!m.deletedAt}
                    style={{ marginLeft: '0.5rem', color: '#dc2626', fontSize: '0.75rem' }}
                  >
                    {m.deletedAt ? 'deleted' : 'delete'}
                  </button>
                </span>
              </div>
              <div style={{ color: m.deletedAt ? '#9ca3af' : 'inherit', fontStyle: m.deletedAt ? 'italic' : 'normal' }}>
                {m.deletedAt ? '— deleted —' : m.body}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <p style={{ color: '#6b7280' }}>No messages.</p>}
      </div>
    </div>
  );
}
