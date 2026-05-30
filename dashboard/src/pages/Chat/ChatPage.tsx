import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
          <Fragment key={m.id}>
            {dayDivider}
            <div
              className={'wa-bubble ' + (isSystem ? 'system' : mine ? 'mine' : 'theirs')}
              dir={rtl ? 'rtl' : 'ltr'}
              style={rtl ? { textAlign: 'right' } : undefined}
            >
              {!isSystem && !mine && <div className="sender">{sender}</div>}
              <MessageBody m={m} mine={mine} />
              <div className="ts">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </Fragment>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

/**
 * Render the body of a single message bubble. Switches between text,
 * image, voice-note, audio, video, document, and sticker layouts the
 * way real WhatsApp does. The `mediaUrl` is a same-origin URL exposed
 * by the import controller (works with the JWT cookie already on the
 * request — no extra auth plumbing needed).
 */
function MessageBody({ m, mine }: { m: Message; mine: boolean }) {
  const [lightbox, setLightbox] = useState(false);
  const url = m.mediaUrl ?? null;
  const fileName = (() => {
    // We don't have mediaFileName on ChatMessage today; the legacy
    // imported-message endpoint serves with the right content-type so
    // the browser still renders correctly. Derive a label from the URL.
    if (!url) return null;
    const tail = url.split('/').pop() ?? '';
    return tail || null;
  })();

  // Imported chats with mediaUrl=null but mediaFileName came in via the
  // text body (renderAnonymousBody / parser). Render those as a small
  // attached-file pill so they still look like a media message.
  if (m.type === 'image' || m.type === 'sticker') {
    if (!url) return <MissingMediaPill body={m.body} />;
    return (
      <>
        <img
          src={url}
          alt=""
          onClick={() => setLightbox(true)}
          style={{
            maxWidth: '100%',
            maxHeight: 320,
            borderRadius: 6,
            cursor: 'zoom-in',
            display: 'block',
          }}
        />
        {m.body && <div style={{ marginTop: 4 }}>{m.body}</div>}
        {lightbox && (
          <div
            onClick={() => setLightbox(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
              display: 'grid', placeItems: 'center', zIndex: 9999, cursor: 'zoom-out',
            }}
          >
            <img src={url} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh' }} />
          </div>
        )}
      </>
    );
  }

  if (m.type === 'voice') {
    if (!url) return <MissingMediaPill body={m.body} />;
    return (
      <VoiceBubble url={url} mine={mine} />
    );
  }

  if (m.type === 'audio') {
    if (!url) return <MissingMediaPill body={m.body} />;
    return (
      <audio
        controls
        src={url}
        style={{ width: 280, maxWidth: '100%' }}
      />
    );
  }

  if (m.type === 'video') {
    if (!url) return <MissingMediaPill body={m.body} />;
    return (
      <video
        controls
        src={url}
        style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 6, display: 'block' }}
      />
    );
  }

  if (m.type === 'document') {
    return (
      <a
        href={url ?? '#'}
        download={fileName ?? undefined}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', background: 'rgba(0,0,0,0.06)',
          borderRadius: 6, textDecoration: 'none', color: 'inherit',
          minWidth: 220,
        }}
      >
        <span style={{ fontSize: 24 }}>📄</span>
        <span style={{ flex: 1, fontSize: '0.85rem', wordBreak: 'break-all' }}>
          {fileName ?? m.body ?? 'Document'}
        </span>
      </a>
    );
  }

  // Plain text (or unknown type) — preserve newlines.
  return <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>;
}

function MissingMediaPill({ body }: { body: string | null }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', borderRadius: 6,
      background: 'rgba(0,0,0,0.05)', color: '#667781',
      fontSize: '0.85rem',
    }}>
      <span>⚠️</span>
      <span>Media unavailable{body ? ` — ${body}` : ''}</span>
    </div>
  );
}

/**
 * WhatsApp-style voice note: avatar circle + play/pause + a fake
 * waveform that just shows progress. Wraps an invisible <audio>.
 */
function VoiceBubble({ url, mine }: { url: string; mine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => {
      if (!a.duration || !isFinite(a.duration)) return;
      setPct((a.currentTime / a.duration) * 100);
    };
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => { setPlaying(false); setPct(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  };

  const mm = Math.floor(duration / 60);
  const ss = Math.floor(duration % 60).toString().padStart(2, '0');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      minWidth: 220, padding: '4px 8px',
    }}>
      <button
        onClick={toggle}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: mine ? '#0b9d68' : '#075E54', color: '#fff',
          border: 'none', cursor: 'pointer', fontSize: 14, display: 'grid', placeItems: 'center',
        }}
        aria-label={playing ? 'pause' : 'play'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{
          height: 4, background: 'rgba(0,0,0,0.15)', borderRadius: 2, position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`, background: mine ? '#0b9d68' : '#075E54', borderRadius: 2,
          }} />
        </div>
        <div style={{ fontSize: '0.7rem', color: '#667781', marginTop: 2 }}>
          {duration > 0 ? `${mm}:${ss}` : '— : —'}
        </div>
      </div>
      <audio ref={ref} src={url} preload="metadata" style={{ display: 'none' }} />
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
