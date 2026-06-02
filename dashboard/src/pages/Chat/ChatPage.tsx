import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Search, MoreVertical, FileSpreadsheet,
  Paperclip, Smile, Mic, Send, Trash2,
  Check, CheckCheck, Phone, Video as VideoIcon,
  Image as ImageIcon, FileText, Music, Play, Pause,
  ArrowLeft, X, Calendar, ZoomIn, ZoomOut, Download,
  FileDown, Lock, Sun, Moon, MessageCircle, MessageSquarePlus,
  Camera, Contact, BarChart3, Reply, Forward,
  Star, Trash, Info, RefreshCcw, PhoneCall,
} from 'lucide-react';
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
  participantIds?: string[];
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

// ───────── helpers ─────────

const RTL_RE = /[֐-׿؀-ۿ܀-ݏހ-޿ࢠ-ࣿיִ-﻿]/;
const isRtl = (s: string | null | undefined) => !!s && RTL_RE.test(s);

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtChatListTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
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

const previewFor = (m: Message): { icon: React.ReactNode; text: string } => {
  if (m.type === 'image' || m.type === 'sticker') return { icon: <ImageIcon size={14} />, text: 'Photo' };
  if (m.type === 'voice') return { icon: <Mic size={14} />, text: 'Voice message' };
  if (m.type === 'audio') return { icon: <Music size={14} />, text: 'Audio' };
  if (m.type === 'video') return { icon: <VideoIcon size={14} />, text: 'Video' };
  if (m.type === 'document') return { icon: <FileText size={14} />, text: 'Document' };
  return { icon: null, text: m.body ?? '' };
};

const colourForId = (id: string): string => {
  const palette = ['#00a884', '#34b7f1', '#ff8c5a', '#7e57c2', '#26a69a', '#ec407a', '#5c6bc0', '#ef5350'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

const formatDuration = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m.toString().padStart(2, '0')}:${s}`;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

// ───────── component ─────────

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
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  // Dark / light theme — defaults to whatever the OS prefers, with
  // per-user persistence in localStorage so the choice survives reloads.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('owa_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });
  useEffect(() => { localStorage.setItem('owa_theme', theme); }, [theme]);
  // Mobile bottom-nav tab.
  const [mobileTab, setMobileTab] = useState<'chats' | 'updates' | 'calls'>('chats');
  // Per-chat ephemeral state — typing users (resets on chat change),
  // online presence (userId -> bool).
  const [typingByChat, setTypingByChat] = useState<Record<string, Set<string>>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  // Right-click context menu state.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msg: Message } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Mirror activeId into a ref so the socket handler (mounted once with
  // [] deps) always reads the current value instead of the stale one
  // captured at mount. Without this, switching chats stopped new
  // messages from appearing in the visible thread.
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    const s = io('/chat', { withCredentials: true });
    socketRef.current = s;
    s.on('message:new', ({ message }: { message: Message }) => {
      const current = activeIdRef.current;
      setMessages(prev => (message.chatId === current ? [...prev, message] : prev));
      setChats(prev => prev.map(c =>
        c.id === message.chatId
          ? {
              ...c,
              lastMessage: message,
              unreadCount: (c.unreadCount ?? 0) + (message.chatId === current ? 0 : 1),
            }
          : c,
      ));
    });
    // A brand-new chat just landed for me (someone added me, or I just
    // created one). Slide it into the sidebar.
    s.on('chat:created', (chat: Chat) => {
      setChats(prev => prev.find(c => c.id === chat.id) ? prev : [chat, ...prev]);
    });
    // Server emits presence on every connect / disconnect of a user.
    s.on('presence', (e: { userId: string; online: boolean }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        if (e.online) next.add(e.userId);
        else next.delete(e.userId);
        return next;
      });
    });
    // typing — { chatId, userId, isTyping }. We keep a per-chat set of
    // userIds; the UI shows 'typing…' anywhere that set is non-empty.
    s.on('typing', (e: { chatId: string; userId: string; isTyping: boolean }) => {
      setTypingByChat(prev => {
        const next = { ...prev };
        const set = new Set(next[e.chatId] ?? []);
        if (e.isTyping) set.add(e.userId);
        else set.delete(e.userId);
        next[e.chatId] = set;
        return next;
      });
    });
    return () => { s.disconnect(); };
  }, []);

  useEffect(() => {
    void fetch('/api/chat/chats', { credentials: 'include' }).then(r => r.json()).then(setChats);
    void fetch('/api/users', { credentials: 'include' }).then(r => r.json()).then(setUsers);
  }, []);

  // Fetching messages can land out of order if you flip between chats
  // fast. AbortController + a captured-id check ignores any response
  // for a chat that's no longer active.
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    const s = socketRef.current;
    s?.emit('subscribe', { chatId: activeId });
    const ctrl = new AbortController();
    const myId = activeId;
    void fetch(`/api/chat/chats/${myId}/messages?pageSize=500`, {
      credentials: 'include',
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then(d => { if (activeIdRef.current === myId) setMessages(d.items); })
      .catch(() => { /* aborted or network */ });
    void fetch(`/api/chat/chats/${myId}/read`, { method: 'POST', credentials: 'include' });
    setChats(prev => prev.map(c => c.id === myId ? { ...c, unreadCount: 0 } : c));
    return () => {
      ctrl.abort();
      s?.emit('unsubscribe', { chatId: myId });
    };
  }, [activeId]);

  const activeChat = useMemo(() => chats.find(c => c.id === activeId) ?? null, [chats, activeId]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  /**
   * Resolve the visible title of a chat. For groups we use the stored
   * name. For direct chats — which have name=null on the server — we
   * pick the OTHER participant's displayName from the participantIds
   * the API now returns.
   */
  const titleFor = (c: Chat): string => {
    if (c.type === 'group') return c.name ?? 'Group';
    const other = (c.participantIds ?? []).find(id => id !== me?.id);
    if (other) {
      const u = userMap.get(other);
      if (u) return u.displayName;
    }
    return c.name ?? 'Chat';
  };

  /**
   * Returns a stable avatar id for the chat (so direct-chat avatars
   * follow the OTHER user's colour palette, not the chat's row id).
   */
  const avatarIdFor = (c: Chat): string => {
    if (c.type === 'group') return c.id;
    const other = (c.participantIds ?? []).find(id => id !== me?.id);
    return other ?? c.id;
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

  const sendMedia = async (type: Message['type'], mediaUrl: string, body = '') => {
    if (!activeId) return;
    await fetch(`/api/chat/chats/${activeId}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, mediaUrl, body }),
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

  const visibleMessages = useMemo(() => {
    if (!headerSearch.trim()) return messages;
    const q = headerSearch.toLowerCase();
    return messages.filter(m => (m.body ?? '').toLowerCase().includes(q));
  }, [messages, headerSearch]);

  return (
    <div
      className={'wa-shell' + (activeId ? ' chat-open' : '')}
      data-theme={theme}
    >
      {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
      <aside className={'wa-sidebar' + (activeId ? ' has-chat-open' : '')}>
        <div className="wa-sidebar-header">
          <div className="wa-me">
            <div className="wa-avatar sm" style={{ background: colourForId(me?.id ?? '') }}>
              {initial(me?.displayName ?? me?.username ?? '?')}
            </div>
            <span className="wa-me-name">{me?.displayName}</span>
          </div>
          <div className="wa-icon-group">
            <button
              className="wa-icon-btn"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="wa-icon-btn" title="New chat" onClick={() => setShowNew(true)}>
              <MessageSquarePlus size={20} />
            </button>
            <button className="wa-icon-btn" title="Menu" onClick={async () => {
              if (!confirm('Log out?')) return;
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
              sessionStorage.removeItem('owa_user');
              location.href = '/';
            }}>
              <MoreVertical size={20} />
            </button>
          </div>
        </div>

        <div className="wa-search-wrap">
          <div className="wa-search">
            <Search size={16} className="wa-search-icon" />
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
            const prev = last ? previewFor(last) : null;
            // Direct chats show an online dot when the OTHER side is connected.
            const otherUserId = c.type === 'direct'
              ? (c.participantIds ?? []).find(id => id !== me?.id)
              : undefined;
            const isOtherOnline = !!otherUserId && onlineUsers.has(otherUserId);
            // Anyone typing in this chat (excluding us)?
            const typingSet = typingByChat[c.id];
            const someoneTyping = typingSet && Array.from(typingSet).some(uid => uid !== me?.id);
            return (
              <div
                key={c.id}
                className={'wa-chat-item' + (c.id === activeId ? ' active' : '')}
                onClick={() => setActiveId(c.id)}
              >
                <div className="wa-avatar-wrap">
                  <div className="wa-avatar" style={{ background: colourForId(avatarIdFor(c)) }}>
                    {initial(titleFor(c))}
                  </div>
                  {isOtherOnline && <span className="wa-presence-dot" aria-label="online" />}
                </div>
                <div className="wa-chat-meta">
                  <div className="wa-chat-title-row">
                    <span className="wa-chat-title">
                      {titleFor(c)}
                      {c.importJobId && <FileSpreadsheet size={13} style={{ marginInlineStart: 4, color: 'var(--wa-teal-accent)' }} />}
                    </span>
                    {last && (
                      <span className={'wa-chat-time' + (hasUnread ? ' unread' : '')}>
                        {fmtChatListTime(last.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="wa-chat-last-row">
                    <span className={'wa-chat-last' + (someoneTyping ? ' typing' : '')}>
                      {someoneTyping ? (
                        <span>typing…</span>
                      ) : prev ? (
                        <>
                          {prev.icon && <span className="wa-chat-prev-icon">{prev.icon}</span>}
                          <span>{prev.text}</span>
                        </>
                      ) : <em>Tap to start chatting</em>}
                    </span>
                    {hasUnread && <span className="wa-unread">{c.unreadCount}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredChats.length === 0 && (
            <p className="wa-list-empty">
              {query ? 'No chats match your search.' : 'No chats yet — tap + to start one.'}
            </p>
          )}
        </div>
      </aside>

      {/* ═══════════════════════ MAIN ═══════════════════════ */}
      <section className={'wa-main' + (activeId ? '' : ' no-chat-open')}>
        {!activeChat ? (
          <div className="wa-main-empty">
            <div className="wa-empty-inner">
              <div className="wa-empty-illustration">
                <svg width="220" height="160" viewBox="0 0 320 184" xmlns="http://www.w3.org/2000/svg">
                  <g fill="none" stroke="#e1e9ec" strokeWidth="2">
                    <rect x="80" y="20" width="160" height="120" rx="12"/>
                    <circle cx="160" cy="80" r="22"/>
                    <line x1="120" y1="115" x2="200" y2="115"/>
                    <line x1="135" y1="128" x2="185" y2="128"/>
                    <path d="M 80 140 L 105 160 L 105 140"/>
                  </g>
                </svg>
              </div>
              <h1 className="wa-empty-title">OpenWA Web</h1>
              <p className="wa-empty-text">
                Send and receive messages with your teammates without keeping a browser tab open.<br />
                Pick a conversation on the left, or start a new one.
              </p>
              <div className="wa-empty-lock">
                <Lock size={13} /> Your messages stay on your private OpenWA server.
              </div>
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const otherUserId = activeChat.type === 'direct'
                ? (activeChat.participantIds ?? []).find(id => id !== me?.id)
                : undefined;
              const otherOnline = !!otherUserId && onlineUsers.has(otherUserId);
              const typingSet = typingByChat[activeChat.id];
              const typingNames = typingSet
                ? Array.from(typingSet)
                    .filter(uid => uid !== me?.id)
                    .map(uid => userMap.get(uid)?.displayName ?? '...')
                : [];
              return (
                <div className="wa-main-header">
                  <button className="wa-icon-btn wa-back-btn" onClick={() => setActiveId(null)} title="Back">
                    <ArrowLeft size={20} />
                  </button>
                  <div className="wa-avatar-wrap sm">
                    <div className="wa-avatar sm" style={{ background: colourForId(avatarIdFor(activeChat)) }}>
                      {initial(titleFor(activeChat))}
                    </div>
                    {otherOnline && activeChat.type === 'direct' && <span className="wa-presence-dot" />}
                  </div>
                  <div className="wa-main-header-info">
                    <div className="wa-main-header-title">
                      {titleFor(activeChat)}
                      {activeChat.importJobId && <FileSpreadsheet size={14} style={{ marginInlineStart: 4, color: 'var(--wa-teal-accent)' }} />}
                    </div>
                    <div className={'wa-main-header-status' + (typingNames.length > 0 ? ' typing' : '')}>
                      {typingNames.length > 0
                        ? (activeChat.type === 'group'
                            ? `${typingNames.join(', ')} typing…`
                            : 'typing…')
                        : activeChat.type === 'group'
                          ? `${activeChat.participantIds?.length ?? 0} members`
                          : (() => {
                              const u = otherUserId ? userMap.get(otherUserId) : null;
                              if (!u) return 'direct chat';
                              return otherOnline ? 'online' : `@${u.username}`;
                            })()}
                    </div>
                  </div>
                  <div className="wa-icon-group">
                    <button className="wa-icon-btn" title="Voice call"><Phone size={18} /></button>
                    <button className="wa-icon-btn" title="Video call"><VideoIcon size={18} /></button>
                    <button
                      className={'wa-icon-btn' + (headerSearchOpen ? ' active' : '')}
                      title="Search in chat"
                      onClick={() => { setHeaderSearchOpen(s => !s); if (headerSearchOpen) setHeaderSearch(''); }}
                    >
                      <Search size={18} />
                    </button>
                    <button className="wa-icon-btn" title="More"><MoreVertical size={20} /></button>
                  </div>
                </div>
              );
            })()}

            {headerSearchOpen && (
              <div className="wa-chat-search-strip">
                <Search size={14} />
                <input
                  autoFocus
                  placeholder="Search messages…"
                  value={headerSearch}
                  onChange={e => setHeaderSearch(e.target.value)}
                />
                {headerSearch && (
                  <button className="wa-icon-btn small" onClick={() => setHeaderSearch('')}><X size={14} /></button>
                )}
                <span className="wa-chat-search-count">{visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}</span>
              </div>
            )}

            <MessageList
              messages={visibleMessages}
              meId={me?.id ?? ''}
              users={users}
              typingNames={(() => {
                const s = typingByChat[activeChat.id];
                if (!s) return [];
                return Array.from(s)
                  .filter(uid => uid !== me?.id)
                  .map(uid => userMap.get(uid)?.displayName ?? '...');
              })()}
              onContextMessage={(e, msg) => {
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, msg });
              }}
            />
            <InputBar
              onSendText={send}
              onSendMedia={sendMedia}
              chatId={activeId!}
              onTypingChange={isTyping => socketRef.current?.emit('typing', { chatId: activeId, isTyping })}
            />
          </>
        )}
      </section>

      {/* Mobile FAB — only visible on small screens via CSS @media */}
      <button className="wa-fab" title="New chat" onClick={() => setShowNew(true)}>
        <MessageSquarePlus size={26} />
      </button>

      {/* Mobile bottom-nav — only visible on small screens via CSS @media */}
      <nav className="wa-bottom-nav">
        <button className={mobileTab === 'chats' ? 'active' : ''} onClick={() => setMobileTab('chats')}>
          <MessageCircle size={22} />
          <span>Chats</span>
        </button>
        <button className={mobileTab === 'updates' ? 'active' : ''} onClick={() => { setMobileTab('updates'); alert('Status updates are not yet supported.'); }}>
          <RefreshCcw size={22} />
          <span>Updates</span>
        </button>
        <button className={mobileTab === 'calls' ? 'active' : ''} onClick={() => { setMobileTab('calls'); alert('Calls are not yet supported.'); }}>
          <PhoneCall size={22} />
          <span>Calls</span>
        </button>
      </nav>

      {/* Right-click context menu on a message bubble */}
      {ctxMenu && (
        <ContextMenuPortal
          x={ctxMenu.x}
          y={ctxMenu.y}
          msg={ctxMenu.msg}
          mine={ctxMenu.msg.senderId === me?.id}
          onClose={() => setCtxMenu(null)}
        />
      )}

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

/* ═══════════════════════ Message list ═══════════════════════ */

function MessageList({
  messages, meId, users, typingNames, onContextMessage,
}: {
  messages: Message[];
  meId: string;
  users: User[];
  typingNames: string[];
  onContextMessage: (e: React.MouseEvent, msg: Message) => void;
}) {
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
          ? (
            <div key={`d-${m.id}`} className="wa-day-divider">
              <Calendar size={11} />
              <span>{fmtDayDivider(m.createdAt)}</span>
            </div>
          ) : null;
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
                onContextMenu={e => onContextMessage(e, m)}
              >
                {showSender && (
                  <div className="wa-sender" style={{ color: colourForId(m.senderId ?? '') }}>
                    {sender}
                  </div>
                )}
                <MessageBody m={m} mine={mine} />
                <div className="wa-meta">
                  <span>{fmtTime(m.createdAt)}</span>
                  {mine && <CheckCheck size={15} className="wa-tick read" />}
                </div>
                <div style={{ clear: 'both' }} />
              </div>
            )}
          </Fragment>
        );
      })}
      {typingNames.length > 0 && (
        <div className="wa-typing-bubble" title={`${typingNames.join(', ')} typing…`}>
          <span /><span /><span />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

/* ═══════════════════════ Per-type body ═══════════════════════ */

function MessageBody({ m, mine }: { m: Message; mine: boolean }) {
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const url = m.mediaUrl ?? null;

  if (m.type === 'image' || m.type === 'sticker') {
    if (!url) return <MissingMediaPill text="Photo unavailable" />;
    return (
      <>
        <div className="wa-media-frame">
          <img src={url} alt="" onClick={() => { setLightbox(true); setZoom(1); }} className="wa-img" />
        </div>
        {m.body && <div className="wa-body" style={{ marginTop: 4 }}>{m.body}</div>}
        {lightbox && (
          <div className="wa-lightbox" onClick={() => setLightbox(false)}>
            <div className="wa-lightbox-bar" onClick={e => e.stopPropagation()}>
              <button className="wa-icon-btn dark" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}><ZoomOut size={20} /></button>
              <button className="wa-icon-btn dark" onClick={() => setZoom(z => Math.min(4, z + 0.25))}><ZoomIn size={20} /></button>
              <a href={url} download className="wa-icon-btn dark"><Download size={20} /></a>
              <button className="wa-icon-btn dark" onClick={() => setLightbox(false)}><X size={20} /></button>
            </div>
            {/* Stop click-propagation on the image itself so users can
                pan / inspect without the click bubbling up to the
                backdrop and closing the lightbox. */}
            <img
              src={url}
              alt=""
              onClick={e => e.stopPropagation()}
              style={{ transform: `scale(${zoom})`, transition: 'transform 120ms', cursor: 'default' }}
            />
          </div>
        )}
      </>
    );
  }

  if (m.type === 'voice' || m.type === 'audio') {
    if (!url) return <MissingMediaPill text="Audio unavailable" />;
    return <VoiceBubble url={url} mine={mine} isVoice={m.type === 'voice'} />;
  }

  if (m.type === 'video') {
    if (!url) return <MissingMediaPill text="Video unavailable" />;
    return (
      <div className="wa-media-frame">
        <video controls src={url} className="wa-video" />
      </div>
    );
  }

  if (m.type === 'document') {
    const fileName = (url ?? '').split('/').pop() ?? m.body ?? 'Document';
    return (
      <a href={url ?? '#'} download={fileName} target="_blank" rel="noreferrer" className={'wa-doc ' + (mine ? 'mine' : 'theirs')}>
        <FileText size={28} className="wa-doc-icon" />
        <div className="wa-doc-info">
          <div className="wa-doc-name">{fileName}</div>
          <div className="wa-doc-sub">Document</div>
        </div>
        <FileDown size={18} className="wa-doc-dl" />
      </a>
    );
  }

  return <div className="wa-body">{m.body}</div>;
}

function MissingMediaPill({ text }: { text: string }) {
  return <div className="wa-missing-pill">⚠️ {text}</div>;
}

/* ═══════════════════════ Voice bubble ═══════════════════════ */

function VoiceBubble({ url, mine, isVoice }: { url: string; mine: boolean; isVoice: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

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
  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 0.5 : 1;
    setSpeed(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  return (
    <div className={'wa-voice ' + (mine ? 'mine' : 'theirs')}>
      <button onClick={toggle} className="wa-voice-play" aria-label={playing ? 'pause' : 'play'}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginInlineStart: 2 }} />}
      </button>
      <div className="wa-voice-track">
        <div className="wa-voice-bar"><div className="wa-voice-fill" style={{ width: `${pct}%` }} /></div>
        <div className="wa-voice-meta">
          {/* While playing or mid-track, show current time; otherwise
              show total length — same as WhatsApp's voice note. */}
          <span>{duration ? formatDuration(pct > 0 ? (duration * pct / 100) : duration) : '— : —'}</span>
          {isVoice && (
            <button onClick={cycleSpeed} className="wa-voice-speed">{speed}×</button>
          )}
        </div>
      </div>
      <audio ref={ref} src={url} preload="metadata" style={{ display: 'none' }} />
    </div>
  );
}

/* ═══════════════════════ Input bar w/ recording ═══════════════════════ */

function InputBar({ onSendText, onSendMedia, chatId, onTypingChange }: {
  onSendText: (body: string) => void;
  onSendMedia: (type: Message['type'], mediaUrl: string, body?: string) => void;
  chatId: string;
  onTypingChange?: (isTyping: boolean) => void;
}) {
  const [body, setBody] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close emoji + attach popovers when clicking anywhere outside of
  // the input-bar wrapper. Real WhatsApp does the same.
  useEffect(() => {
    if (!showEmoji && !showAttach) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
        setShowAttach(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showEmoji, showAttach]);

  // Auto-grow the textarea up to ~5 lines so multi-line drafts don't
  // get clipped — same behaviour as WhatsApp Web's composer.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [body]);

  const submit = () => {
    if (!body.trim()) return;
    onSendText(body);
    setBody('');
    setTyping(false);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const uploadToServer = async (file: File): Promise<string> => {
    // Upload via the existing import upload mechanism is overkill; we
    // store the blob as a data URL directly so it round-trips through
    // the message record. For production a dedicated /api/chat/upload
    // is the cleaner path — kept as TODO.
    return await blobToBase64(file);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>, type: Message['type']) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToServer(file);
      await onSendMedia(type, url, file.name);
    } finally {
      setUploading(false);
      setShowAttach(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Voice recording is not supported by this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const opts: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm')) opts.mimeType = 'audio/webm';
      const mr = new MediaRecorder(stream, opts);
      mrRef.current = mr;
      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = await blobToBase64(blob);
        await onSendMedia('voice', url, '');
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
      mr.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (err) {
      alert('Could not access the microphone: ' + (err as Error).message);
    }
  };

  const stopAndSend = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      mrRef.current.stop();
    }
    setRecording(false);
  };

  const cancelRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    chunksRef.current = [];
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      // Stop without sending: temporarily detach onstop
      mrRef.current.onstop = () => { /* discard */ };
      mrRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRecording(false);
  };

  // Reset state when chat changes
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, [chatId]);

  // Typing broadcast — debounced. We fire `isTyping: true` on first
  // keystroke and `false` either 2 seconds after the LAST keystroke or
  // when the textarea empties / the message is sent. Without the debounce
  // we'd flood the socket on every character.
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);
  const setTyping = (active: boolean) => {
    if (typingActiveRef.current === active) return;
    typingActiveRef.current = active;
    onTypingChange?.(active);
  };
  const noteKeystroke = () => {
    setTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => setTyping(false), 2000);
  };
  // Reset typing state when leaving the chat.
  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setTyping(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  return (
    <div className="wa-input-bar-wrap" ref={wrapRef}>
      {uploading && <div className="wa-upload-strip" />}
      {showEmoji && (
        <CategorisedEmojiPicker onPick={ch => { setBody(b => b + ch); }} />
      )}
      {showAttach && (
        <div className="wa-pop wa-pop-attach">
          <div className="wa-attach-grid">
            <button onClick={() => fileInputRef.current?.click()}>
              <div className="attach-circle" style={{ background: '#bf59cf' }}><ImageIcon size={20} /></div>
              <span>Photo</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()}>
              <div className="attach-circle" style={{ background: '#0095f6' }}><Camera size={20} /></div>
              <span>Camera</span>
            </button>
            <button onClick={() => {
              const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*';
              i.onchange = e => onPickFile(e as unknown as React.ChangeEvent<HTMLInputElement>, 'audio');
              i.click();
            }}>
              <div className="attach-circle" style={{ background: '#f59e0b' }}><Music size={20} /></div>
              <span>Audio</span>
            </button>
            <button onClick={() => {
              const i = document.createElement('input'); i.type = 'file';
              i.onchange = e => onPickFile(e as unknown as React.ChangeEvent<HTMLInputElement>, 'document');
              i.click();
            }}>
              <div className="attach-circle" style={{ background: '#5e72e4' }}><FileText size={20} /></div>
              <span>Document</span>
            </button>
            <button onClick={() => alert('Contacts are not yet supported.')}>
              <div className="attach-circle" style={{ background: '#0ea5e9' }}><Contact size={20} /></div>
              <span>Contact</span>
            </button>
            <button onClick={() => alert('Polls are not yet supported.')}>
              <div className="attach-circle" style={{ background: '#fbbf24' }}><BarChart3 size={20} /></div>
              <span>Poll</span>
            </button>
          </div>
        </div>
      )}

      <div className="wa-input-bar">
        {recording ? (
          <div className="wa-recording-row">
            <div className="wa-recording-pulse">
              <span className="wa-recording-dot" />
              <span className="wa-recording-time">{formatDuration(seconds)}</span>
              <span className="wa-recording-label">Recording…</span>
            </div>
            <div className="wa-recording-actions">
              <button className="wa-icon-btn red" title="Cancel" onClick={cancelRecording}><Trash2 size={20} /></button>
              <button className="wa-send-btn has-text" title="Send" onClick={stopAndSend}>
                <Send size={20} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <button className={'wa-icon-btn' + (showEmoji ? ' active' : '')} title="Emoji"
              onClick={() => { setShowEmoji(v => !v); setShowAttach(false); }}>
              <Smile size={22} />
            </button>
            <button className={'wa-icon-btn' + (showAttach ? ' active' : '')} title="Attach"
              onClick={() => { setShowAttach(v => !v); setShowEmoji(false); }}>
              <Paperclip size={22} />
            </button>
            <textarea
              ref={taRef}
              rows={1}
              placeholder={uploading ? 'Uploading…' : 'Type a message'}
              value={body}
              onChange={e => {
                const v = e.target.value;
                setBody(v);
                if (v.trim()) noteKeystroke();
                else setTyping(false);
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              disabled={uploading}
            />
            {body.trim() ? (
              <button className="wa-send-btn has-text" onClick={submit} title="Send" aria-label="Send">
                <Send size={20} />
              </button>
            ) : (
              <button className="wa-send-btn" onClick={startRecording} title="Voice message" aria-label="Voice">
                <Mic size={22} />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const type = file.type.startsWith('video') ? 'video' : 'image';
                void onPickFile(e, type);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ Categorised emoji picker ═══════════════════════ */

/**
 * 8 emoji categories, each capped at a workable count so the grid stays
 * usable. Tap an emoji → it calls onPick and stays open (matches the
 * real WhatsApp picker — users typically pick several in a row).
 */
const EMOJI_CATEGORIES: Array<{ tab: string; chars: string[] }> = [
  { tab: '😀', chars: '😀 😁 😂 🤣 😃 😄 😅 😆 😉 😊 😋 😎 😍 😘 🥰 😗 😙 😚 🙂 🤗 🤩 🤔 🤨 😐 😑 😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 🥱 😴 😌 😛 😜 😝 🤤 😒 😓 😔 😕 🙃 🤑 😲'.split(' ') },
  { tab: '👤', chars: '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🤝 🙏 ✍️ 💪 👀 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵'.split(' ') },
  { tab: '🐶', chars: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🐣 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🪰 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬'.split(' ') },
  { tab: '🍎', chars: '🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥒 🌶️ 🌽 🥕 🥔 🍠 🥐 🍞 🥖 🥨 🧀 🥚 🍳 🥞 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🌮 🌯 🫔 🥗 🍰 🍫 🍩'.split(' ') },
  { tab: '⚽', chars: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🎱 🎳 🏓 🏸 🥊 🥋 🎯 ⛳ 🎣 🤿 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 🤺 🏇 🏌️ 🧘 🏄 🏊 🚴 🚵 🏆 🎖️ 🏅 🥇 🥈 🥉 🎮 🎲'.split(' ') },
  { tab: '✈️', chars: '✈️ 🚀 🚁 🚂 🚆 🚇 🚌 🚎 🚐 🚑 🚒 🚓 🚔 🚕 🚖 🚗 🚙 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🛺 🚤 ⛵ 🚢 🚏 🚦 🗽 🌋 🗻 🏝️ 🏜️ 🏔️ ⛰️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌'.split(' ') },
  { tab: '💡', chars: '💡 🔦 🕯️ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📀 📸 📷 📹 🎥 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏰ ⌛ ⏳ 📡 🔋 🔌 💎 💰 💸 📐 📏 ✂️ 🗝️ 🔑 🔒 🔓 🔧 🔨 🛠️ ⛏️ 🧲'.split(' ') },
  { tab: '❤️', chars: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✅ ❌ ⭕ 🛑 ⚠️ 🚸 ☢️ ☣️ ⬆️ ⬇️ ⬅️ ➡️ 🔄 🔃 🔝 🔚 🔙 🔛 🔜 ✔️ ☑️ 🔆 🔅 ⚡ 🔔 🔕 ➕ ➖ ❓ ❗'.split(' ') },
];

function CategorisedEmojiPicker({ onPick }: { onPick: (ch: string) => void }) {
  const [tab, setTab] = useState(0);
  return (
    <div className="wa-pop wa-pop-emoji">
      <div className="wa-emoji-tabs">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={i}
            className={'wa-emoji-tab' + (i === tab ? ' active' : '')}
            onClick={() => setTab(i)}
            title={`Category ${i + 1}`}
          >
            {cat.tab}
          </button>
        ))}
      </div>
      <div className="wa-emoji-grid">
        {EMOJI_CATEGORIES[tab].chars.map((ch, i) => (
          <button key={`${ch}-${i}`} onClick={() => onPick(ch)} title={ch}>{ch}</button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════ Right-click context menu ═══════════════════════ */

function ContextMenuPortal({
  x, y, mine, msg, onClose,
}: {
  x: number; y: number; mine: boolean; msg: Message; onClose: () => void;
}) {
  // Clamp so the menu doesn't fall off-screen.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 280);

  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const item = (label: string, icon: React.ReactNode, onClick?: () => void, danger?: boolean) => (
    <button
      className={danger ? 'danger' : ''}
      onMouseDown={e => { e.stopPropagation(); onClick?.(); onClose(); }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const copyToClipboard = () => navigator.clipboard?.writeText(msg.body ?? '').catch(() => {});

  return (
    <div
      className="wa-ctx-menu"
      style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
    >
      {item('Reply', <Reply size={16} />, () => alert('Reply not yet wired to backend.'))}
      {item('Forward', <Forward size={16} />, () => alert('Forward not yet wired to backend.'))}
      {item('Star', <Star size={16} />, () => alert('Star not yet wired to backend.'))}
      {item('Copy', <Check size={16} />, copyToClipboard)}
      {item('Info', <Info size={16} />, () => alert(`id: ${msg.id}\nsent: ${msg.createdAt}\ntype: ${msg.type}`))}
      {mine && item('Delete', <Trash size={16} />, () => alert('Delete needs the chat admin endpoint or self-delete (TODO).'), true)}
    </div>
  );
}

/* ═══════════════════════ New chat modal ═══════════════════════ */

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

        <div className="wa-type-pills">
          <button className={'wa-type-pill' + (type === 'direct' ? ' active' : '')} onClick={() => { setType('direct'); setPicked([]); }}>Direct</button>
          <button className={'wa-type-pill' + (type === 'group' ? ' active' : '')} onClick={() => { setType('group'); setPicked([]); }}>Group</button>
        </div>

        {type === 'group' && (
          <input
            placeholder="Group name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="wa-text-input"
          />
        )}

        <div className="wa-search small">
          <Search size={14} className="wa-search-icon" />
          <input placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        <div className="user-pick">
          {visible.map(u => {
            const isPicked = picked.includes(u.id);
            return (
              <div key={u.id} className={'user-row' + (isPicked ? ' picked' : '')}
                onClick={() => (type === 'direct' ? setPicked([u.id]) : toggle(u.id))}>
                <div className="wa-avatar xs" style={{ background: colourForId(u.id) }}>{initial(u.displayName)}</div>
                <div style={{ flex: 1 }}>
                  <div>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: 'var(--wa-text-muted)' }}>@{u.username}</div>
                </div>
                {isPicked && <Check size={18} style={{ color: 'var(--wa-teal-accent)' }} />}
              </div>
            );
          })}
          {visible.length === 0 && <p className="wa-list-empty">No users found.</p>}
        </div>

        <div className="actions">
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit} disabled={picked.length === 0 || (type === 'group' && !name.trim())}>Start</button>
        </div>
      </div>
    </div>
  );
}
