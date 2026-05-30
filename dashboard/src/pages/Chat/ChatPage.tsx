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

// Arabic / Hebrew / Syriac / Thaana
const RTL_RE = /[֐-׿؀-ۿ܀-ݏހ-޿ࢠ-ࣿיִ-﻿]/;
const isRtl = (s: string | null | undefined) => !!s && RTL_RE.test(s);

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtChatListTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  if ((now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const fmtDayDivider = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const previewFor = (m: Message): string => {
  if (m.type === 'image' || m.type === 'sticker') return '📷 Photo';
  if (m.type === 'voice') return '🎤 Voice message';
  if (m.type === 'audio') return '🎵 Audio';
  if (m.type === 'video') return '🎬 Video';
  if (m.type === 'document') return '📄 Document';
  return m.body ?? '';
};

const colourForId = (id: string): string => {
  // Pseudo-random pastel-ish colour derived from the user id so each
  // user's avatar and sender label stay consistent across renders.
  const palette = ['#00a884', '#34b7f1', '#ff8c5a', '#7e57c2', '#26a69a', '#ec407a', '#5c6bc0', '#ef5350'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

export default function ChatPage() {
  const meStr = sessionStorage.getItem('owa_user');
  const me = meStr ? (JSON.parse(meStr) as User) : null;
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'unread' | 'groups'>('all');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s = io('/chat', { withCredentials: true });
    socketRef.current = s;
    s.on('message:new', ({ message }: { message: Message }) => {
      setMessages(prev => (message.chatId === activeId ? [...prev, message] : prev));
      setChats(prev => prev.map(c =>
        c.id === message.chatId
          ? {
              ...c,
              lastMessage: message,
              unreadCount: (c.unreadCount ?? 0) + (message.chatId === activeId ? 0 : 1),
            }
          : c,
      ));
    });
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetch('/api/chat/chats', { credentials: 'include' }).then(r => r.json()).then(setChats);
    void fetch('/api/users', { credentials: 'include' }).then(r => r.json()).then(setUsers);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const s = socketRef.current;
    s?.emit('subscribe', { chatId: activeId });
    void fetch(`/api/chat/chats/${activeId}/messages?pageSize=500`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setMessages(d.items));
    void fetch(`/api/chat/chats/${activeId}/read`, { method: 'POST', credentials: 'include' });
    setChats(prev => prev.map(c => c.id === activeId ? { ...c, unreadCount: 0 } : c));
    return () => { s?.emit('unsubscribe', { chatId: activeId }); };
  }, [activeId]);

  const activeChat = useMemo(() => chats.find(c => c.id === activeId) ?? null, [chats, activeId]);

  const titleFor = (c: Chat) => {
    if (c.type === 'group') return c.name ?? 'Group';
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
  };

  const filteredChats = useMemo(() => {
    let list = chats.slice();
    if (tab === 'unread') list = list.filter(c => (c.unreadCount ?? 0) > 0);
    if (tab === 'groups') list = list.filter(c => c.type === 'group');
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(c => titleFor(c).toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const at = a.lastMessage?.createdAt ?? '';
      const bt = b.lastMessage?.createdAt ?? '';
      return bt.localeCompare(at);
    });
  }, [chats, tab, query]);

  return (
    <div className="wa-shell">
      {/* ─────────── SIDEBAR ─────────── */}
      <aside className={'wa-sidebar' + (activeId ? ' has-chat-open' : '')}>
        <div className="wa-sidebar-header">
          <div className="wa-me">
            <div className="wa-avatar sm" style={{ background: colourForId(me?.id ?? '') }}>
              {initial(me?.displayName ?? me?.username ?? '?')}
            </div>
            <span>{me?.displayName}</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="wa-icon-btn" onClick={() => setShowNew(true)} title="New chat">✏️</button>
            <button className="wa-icon-btn" title="Menu" onClick={async () => {
              if (!confirm('Log out?')) return;
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
              sessionStorage.removeItem('owa_user');
              location.href = '/';
            }}>⋮</button>
          </div>
        </div>

        <div className="wa-search-wrap">
          <div className="wa-search">
            <span className="wa-search-icon">🔍</span>
            <input
              placeholder="Search or start a new chat"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="wa-tabs">
          <button className={'wa-tab' + (tab === 'all' ? ' active' : '')} onClick={() => setTab('all')}>All</button>
          <button className={'wa-tab' + (tab === 'unread' ? ' active' : '')} onClick={() => setTab('unread')}>Unread</button>
          <button className={'wa-tab' + (tab === 'groups' ? ' active' : '')} onClick={() => setTab('groups')}>Groups</button>
        </div>

        <div className="wa-chat-list">
          {filteredChats.map(c => {
            const last = c.lastMessage;
            const hasUnread = (c.unreadCount ?? 0) > 0;
            return (
              <div
                key={c.id}
                className={'wa-chat-item' + (c.id === activeId ? ' active' : '')}
                onClick={() => setActiveId(c.id)}
              >
                <div className="wa-avatar" style={{ background: colourForId(c.id) }}>
                  {initial(titleFor(c))}
                </div>
                <div className="wa-chat-meta">
                  <div className="wa-chat-title-row">
                    <span className="wa-chat-title">
                      {titleFor(c)}{c.importJobId ? ' 📥' : ''}
                    </span>
                    {last && (
                      <span className={'wa-chat-time' + (hasUnread ? ' unread' : '')}>
                        {fmtChatListTime(last.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="wa-chat-last-row">
                    <span className="wa-chat-last">
                      {last ? previewFor(last) : <em>Tap to start chatting</em>}
                    </span>
                    {hasUnread && <span className="wa-unread">{c.unreadCount}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredChats.length === 0 && (
            <p style={{ padding: '20px', color: 'var(--wa-text-muted)', textAlign: 'center' }}>
              {query ? 'No chats match your search.' : 'No chats yet — tap ✏️ to start one.'}
            </p>
          )}
        </div>
      </aside>

      {/* ─────────── MAIN ─────────── */}
      <section className={'wa-main' + (activeId ? '' : ' no-chat-open')}>
        {!activeChat ? (
          <div className="wa-main-empty">
            <div className="wa-empty-inner">
              <div className="wa-empty-illustration">💬</div>
              <h1 className="wa-empty-title">OpenWA Web</h1>
              <p className="wa-empty-text">
                Send and receive messages with your teammates.<br />
                Pick a conversation on the left, or start a new one.
              </p>
              <div className="wa-empty-lock">🔒 Your messages stay on your private OpenWA server.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="wa-main-header">
              <button className="wa-icon-btn wa-back-btn" onClick={() => setActiveId(null)} title="Back">←</button>
              <div className="wa-avatar sm" style={{ background: colourForId(activeChat.id) }}>
                {initial(titleFor(activeChat))}
              </div>
              <div className="info">
                <div className="title">{titleFor(activeChat)}{activeChat.importJobId ? ' 📥' : ''}</div>
                <div className="status">
                  {activeChat.type === 'group' ? 'tap for group info' : 'online'}
                </div>
              </div>
              <div className="wa-header-actions">
                <button className="wa-icon-btn" title="Search">🔍</button>
                <button className="wa-icon-btn" title="More">⋮</button>
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

/* ============================================================
 * Message list
 * ============================================================ */

function MessageList({ messages, meId, users }: { messages: Message[]; meId: string; users: User[] }) {
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  let lastDay = '';
  let lastSender = '';
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  return (
    <div className="wa-messages">
      {messages.map(m => {
        const day = new Date(m.createdAt).toDateString();
        const divider = day !== lastDay
          ? <div key={`d-${m.id}`} className="wa-day-divider">{fmtDayDivider(m.createdAt)}</div>
          : null;
        lastDay = day;
        const mine = m.senderId === meId;
        const isSystem = m.type === 'system' || m.senderId === null;
        const showSender = !isSystem && !mine && m.senderId !== lastSender;
        if (!isSystem) lastSender = m.senderId ?? '';
        const rtl = isRtl(m.body);
        const sender = m.senderId ? userMap.get(m.senderId)?.displayName ?? '…' : '';
        return (
          <Fragment key={m.id}>
            {divider}
            {isSystem ? (
              <div className="wa-bubble system">{m.body}</div>
            ) : (
              <div
                className={'wa-bubble ' + (mine ? 'mine' : 'theirs')}
                dir={rtl ? 'rtl' : 'ltr'}
              >
                {showSender && (
                  <div className="sender" style={{ color: colourForId(m.senderId ?? '') }}>
                    {sender}
                  </div>
                )}
                <MessageBody m={m} mine={mine} />
                <div className="meta">
                  {fmtTime(m.createdAt)}
                  {mine && <span className="wa-tick read" title="read">✓✓</span>}
                </div>
                <div style={{ clear: 'both' }} />
              </div>
            )}
          </Fragment>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

/* ============================================================
 * Per-type body — image, voice, audio, video, doc, sticker, text
 * ============================================================ */

function MessageBody({ m, mine }: { m: Message; mine: boolean }) {
  const [lightbox, setLightbox] = useState(false);
  const url = m.mediaUrl ?? null;

  if (m.type === 'image' || m.type === 'sticker') {
    if (!url) return <MissingMediaPill body={m.body} />;
    return (
      <>
        <img
          src={url}
          alt=""
          onClick={() => setLightbox(true)}
          style={{
            maxWidth: '100%', maxHeight: 320,
            borderRadius: 6, cursor: 'zoom-in', display: 'block',
          }}
        />
        {m.body && <div className="body" style={{ marginTop: 4 }}>{m.body}</div>}
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
    return <VoiceBubble url={url} mine={mine} />;
  }

  if (m.type === 'audio') {
    if (!url) return <MissingMediaPill body={m.body} />;
    return <audio controls src={url} style={{ width: 280, maxWidth: '100%' }} />;
  }

  if (m.type === 'video') {
    if (!url) return <MissingMediaPill body={m.body} />;
    return (
      <video controls src={url}
        style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 6, display: 'block' }} />
    );
  }

  if (m.type === 'document') {
    const fileName = (url ?? '').split('/').pop() ?? m.body ?? 'Document';
    return (
      <a href={url ?? '#'} download={fileName} target="_blank" rel="noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', background: 'rgba(0,0,0,0.06)',
          borderRadius: 6, textDecoration: 'none', color: 'inherit', minWidth: 220,
        }}>
        <span style={{ fontSize: 26 }}>📄</span>
        <span style={{ flex: 1, fontSize: '13px', wordBreak: 'break-all' }}>{fileName}</span>
      </a>
    );
  }

  return <div className="body">{m.body}</div>;
}

function MissingMediaPill({ body }: { body: string | null }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', borderRadius: 6,
      background: 'rgba(0,0,0,0.05)', color: 'var(--wa-text-muted)',
      fontSize: '13px',
    }}>
      <span>⚠️</span>
      <span>Media unavailable{body ? ` — ${body}` : ''}</span>
    </div>
  );
}

function VoiceBubble({ url, mine }: { url: string; mine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = ref.current; if (!a) return;
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
    const a = ref.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  };
  const mm = Math.floor(duration / 60);
  const ss = Math.floor(duration % 60).toString().padStart(2, '0');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      minWidth: 240, padding: '4px 6px',
    }}>
      <button onClick={toggle}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: mine ? '#0b9d68' : 'var(--wa-teal-dark)', color: '#fff',
          border: 'none', cursor: 'pointer', fontSize: 14,
          display: 'grid', placeItems: 'center',
        }} aria-label={playing ? 'pause' : 'play'}>
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 3, background: 'rgba(0,0,0,0.18)', borderRadius: 2, position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`, background: mine ? '#0b9d68' : 'var(--wa-teal-dark)', borderRadius: 2,
          }} />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--wa-text-muted)', marginTop: 4 }}>
          {duration > 0 ? `${mm}:${ss}` : '— : —'}
        </div>
      </div>
      <audio ref={ref} src={url} preload="metadata" style={{ display: 'none' }} />
    </div>
  );
}

/* ============================================================
 * Input bar
 * ============================================================ */

function InputBar({ onSend }: { onSend: (body: string) => void }) {
  const [body, setBody] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!body.trim()) return;
    onSend(body);
    setBody('');
    requestAnimationFrame(() => taRef.current?.focus());
  };
  return (
    <div className="wa-input-bar">
      <button className="wa-icon-btn" title="Emoji">😊</button>
      <button className="wa-icon-btn" title="Attach">📎</button>
      <textarea
        ref={taRef}
        rows={1}
        placeholder="Type a message"
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
      />
      <button
        className={'wa-send-btn' + (body.trim() ? ' has-text' : '')}
        onClick={submit}
        title="Send"
        aria-label="Send"
      >
        {body.trim() ? '➤' : '🎤'}
      </button>
    </div>
  );
}

/* ============================================================
 * New-chat modal
 * ============================================================ */

function NewChatModal({
  users, onCancel, onCreated,
}: {
  users: User[];
  onCancel: () => void;
  onCreated: (chat: Chat) => void;
}) {
  const [type, setType] = useState<'direct' | 'group'>('direct');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');

  const visible = useMemo(
    () => users.filter(u => !q || u.displayName.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase())),
    [users, q],
  );

  const toggle = (id: string) =>
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const submit = async () => {
    const body = type === 'direct'
      ? { type, participantIds: picked.slice(0, 1) }
      : { type, name, participantIds: picked };
    if (body.participantIds.length === 0) return;
    if (type === 'group' && !name.trim()) return;
    const res = await fetch('/api/chat/chats', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) onCreated(await res.json());
  };

  const initial = (s: string) => s.slice(0, 1).toUpperCase();

  return (
    <div className="wa-modal-bg" onClick={onCancel}>
      <div className="wa-modal" onClick={e => e.stopPropagation()}>
        <h3>{type === 'direct' ? 'New chat' : 'New group'}</h3>

        <div style={{ display: 'flex', gap: 12 }}>
          <label>
            <input type="radio" checked={type === 'direct'} onChange={() => { setType('direct'); setPicked([]); }} /> Direct
          </label>
          <label>
            <input type="radio" checked={type === 'group'} onChange={() => { setType('group'); setPicked([]); }} /> Group
          </label>
        </div>

        {type === 'group' && (
          <input
            placeholder="Group name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--wa-divider)', borderRadius: 4 }}
          />
        )}

        <input
          placeholder="Search users…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--wa-divider)', borderRadius: 4 }}
        />

        <div className="user-pick">
          {visible.map(u => {
            const isPicked = picked.includes(u.id);
            return (
              <div
                key={u.id}
                className="user-row"
                onClick={() => (type === 'direct' ? setPicked([u.id]) : toggle(u.id))}
              >
                <input
                  type={type === 'direct' ? 'radio' : 'checkbox'}
                  checked={isPicked}
                  readOnly
                />
                <div className="wa-avatar xs" style={{ background: colourForId(u.id) }}>{initial(u.displayName)}</div>
                <div style={{ flex: 1 }}>
                  <div>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: 'var(--wa-text-muted)' }}>@{u.username}</div>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p style={{ padding: 16, color: 'var(--wa-text-muted)', textAlign: 'center' }}>
              No users found.
            </p>
          )}
        </div>

        <div className="actions">
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            onClick={submit}
            disabled={picked.length === 0 || (type === 'group' && !name.trim())}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
