import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import './ChatPage.css';

interface User { id: string; username: string; displayName: string; role: string }

interface Chat {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  avatarUrl: string | null;
  importJobId: string | null;
  lastMessage?: Message | null;
  unreadCount?: number;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string | null;
  type: string;
  body: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

// Arabic / Hebrew / etc.
const RTL_RE = /[֐-׿؀-ۿ܀-ݏހ-޿ࢠ-ࣿיִ-﻿]/;
const isRtl = (s: string | null | undefined) => !!s && RTL_RE.test(s);

export default function ChatPage() {
  const meStr = sessionStorage.getItem('owa_user');
  const me = meStr ? (JSON.parse(meStr) as User) : null;
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showNew, setShowNew] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // --- connect socket ---
  useEffect(() => {
    const s = io('/chat', { withCredentials: true });
    socketRef.current = s;
    s.on('message:new', ({ message }: { message: Message }) => {
      if (message.chatId === activeId) {
        setMessages(prev => [...prev, message]);
      }
      setChats(prev => prev.map(c =>
        c.id === message.chatId
          ? { ...c, lastMessage: message, unreadCount: (c.unreadCount ?? 0) + (message.chatId === activeId ? 0 : 1) }
          : c,
      ));
    });
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- load chats + users ---
  useEffect(() => {
    void fetch('/api/chat/chats', { credentials: 'include' }).then(r => r.json()).then(setChats);
    void fetch('/api/users', { credentials: 'include' }).then(r => r.json()).then(setUsers);
  }, []);

  // --- open a chat: subscribe, load messages, mark read ---
  useEffect(() => {
    if (!activeId) return;
    const s = socketRef.current;
    s?.emit('subscribe', { chatId: activeId });
    void fetch(`/api/chat/chats/${activeId}/messages?pageSize=200`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setMessages(d.items));
    void fetch(`/api/chat/chats/${activeId}/read`, { method: 'POST', credentials: 'include' });
    setChats(prev => prev.map(c => c.id === activeId ? { ...c, unreadCount: 0 } : c));
    return () => { s?.emit('unsubscribe', { chatId: activeId }); };
  }, [activeId]);

  const activeChat = useMemo(() => chats.find(c => c.id === activeId) ?? null, [chats, activeId]);

  const titleFor = (c: Chat) => {
    if (c.type === 'group') return c.name ?? 'Group';
    // For direct chats, show the OTHER participant's name. We don't have
    // participants on the list payload, so fall back to "Chat".
    return c.name ?? 'Chat';
  };
  const initial = (s: string) => s.slice(0, 1).toUpperCase();

  const send = async (body: string) => {
    if (!activeId || !body.trim()) return;
    await fetch(`/api/chat/chats/${activeId}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    // Server emits via socket; our local listener will append.
  };

  return (
    <div className={'wa-shell'}>
      <aside className={'wa-sidebar' + (activeId ? ' has-chat-open' : '')}>
        <div className="wa-sidebar-header">
          <strong>{me?.displayName}</strong>
          <button onClick={() => setShowNew(true)}>+ New</button>
        </div>
        <div className="wa-search">
          <input placeholder="Search chats…" />
        </div>
        <div className="wa-chat-list">
          {chats.map(c => (
            <div key={c.id} className={'wa-chat-item' + (c.id === activeId ? ' active' : '')} onClick={() => setActiveId(c.id)}>
              <div className="wa-avatar">{initial(titleFor(c))}</div>
              <div className="wa-chat-meta">
                <div className="title">
                  <span>{titleFor(c)} {c.importJobId && <span title="Imported from WhatsApp">📥</span>}</span>
                  {c.unreadCount ? <span className="wa-unread">{c.unreadCount}</span> : null}
                </div>
                <div className="last">{c.lastMessage?.body ?? <em>No messages yet</em>}</div>
              </div>
            </div>
          ))}
          {chats.length === 0 && <p style={{ padding: '1rem', color: '#667781' }}>No chats yet — tap “+ New”.</p>}
        </div>
      </aside>

      <section className={'wa-main' + (activeId ? '' : ' no-chat-open')}>
        {!activeChat ? (
          <div className="wa-main-empty">Select a chat to start messaging.</div>
        ) : (
          <>
            <div className="wa-main-header">
              <button onClick={() => setActiveId(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem' }}>←</button>
              <div className="wa-avatar" style={{ width: 36, height: 36, fontSize: '0.8rem' }}>{initial(titleFor(activeChat))}</div>
              <div style={{ flex: 1 }}>
                <div className="title">{titleFor(activeChat)}</div>
                <div className="status">{activeChat.type === 'group' ? 'group' : 'online'}</div>
              </div>
            </div>
            <MessageList messages={messages} meId={me?.id ?? ''} users={users} />
            <InputBar onSend={send} />
          </>
        )}
      </section>

      {showNew && (
        <NewChatModal
          users={users.filter(u => u.id !== me?.id)}
          onCancel={() => setShowNew(false)}
          onCreated={chat => {
            setChats(prev => prev.find(c => c.id === chat.id) ? prev : [chat, ...prev]);
            setActiveId(chat.id);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function MessageList({ messages, meId, users }: { messages: Message[]; meId: string; users: User[] }) {
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  let lastDay = '';
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  return (
    <div className="wa-messages">
      {messages.map(m => {
        const day = new Date(m.createdAt).toDateString();
        const dayDivider = day !== lastDay ? <div key={`d-${m.id}`} className="wa-day-divider">{day}</div> : null;
        lastDay = day;
        const mine = m.senderId === meId;
        const isSystem = m.type === 'system' || m.senderId === null;
        const rtl = isRtl(m.body);
        const sender = m.senderId ? userMap.get(m.senderId)?.displayName ?? '…' : '';
        return (
          <>
            {dayDivider}
            <div
              key={m.id}
              className={'wa-bubble ' + (isSystem ? 'system' : mine ? 'mine' : 'theirs')}
              dir={rtl ? 'rtl' : 'ltr'}
              style={rtl ? { textAlign: 'right' } : undefined}
            >
              {!isSystem && !mine && <div className="sender">{sender}</div>}
              <div>{m.body}</div>
              <div className="ts">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function InputBar({ onSend }: { onSend: (body: string) => void }) {
  const [body, setBody] = useState('');
  const submit = () => {
    if (!body.trim()) return;
    onSend(body);
    setBody('');
  };
  return (
    <div className="wa-input-bar">
      <textarea
        rows={1}
        placeholder="Type a message"
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
      />
      <button onClick={submit} aria-label="Send">➤</button>
    </div>
  );
}

function NewChatModal({
  users,
  onCancel,
  onCreated,
}: {
  users: User[];
  onCancel: () => void;
  onCreated: (chat: Chat) => void;
}) {
  const [type, setType] = useState<'direct' | 'group'>('direct');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const submit = async () => {
    const body = type === 'direct'
      ? { type, participantIds: picked.slice(0, 1) }
      : { type, name, participantIds: picked };
    if (body.participantIds.length === 0) return;
    const res = await fetch('/api/chat/chats', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) onCreated(await res.json());
  };
  return (
    <div style={modalShell}>
      <div style={modalCard}>
        <h3>New chat</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <label><input type="radio" checked={type === 'direct'} onChange={() => setType('direct')} /> Direct</label>
          <label><input type="radio" checked={type === 'group'} onChange={() => setType('group')} /> Group</label>
        </div>
        {type === 'group' && (
          <input placeholder="Group name" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '0.5rem' }} />
        )}
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          {users.map(u => (
            <label key={u.id} style={{ display: 'flex', gap: '0.5rem', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
              <input
                type={type === 'direct' ? 'radio' : 'checkbox'}
                checked={picked.includes(u.id)}
                onChange={() => type === 'direct' ? setPicked([u.id]) : toggle(u.id)}
              />
              {u.displayName} <span style={{ color: '#9ca3af' }}>@{u.username}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={submit}>Start</button>
        </div>
      </div>
    </div>
  );
}

const modalShell: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'grid', placeItems: 'center', zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  background: '#fff', borderRadius: 10, padding: '1.5rem', width: 'min(420px, 92vw)',
  display: 'flex', flexDirection: 'column', gap: '0.75rem',
};
