import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  Search, Plus, MoreVertical, FileSpreadsheet,
  Paperclip, Smile, Mic, Send, Trash2,
  Check, CheckCheck, Phone, Video as VideoIcon,
  Image as ImageIcon, FileText, Music, Play, Pause,
  ArrowLeft, X, Calendar, ZoomIn, ZoomOut, Download,
  FileDown, Lock,
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
  const titleFor = (c: Chat) => c.name ?? (c.type === 'group' ? 'Group' : 'Chat');
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
    <div className="wa-shell">
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
            <button className="wa-icon-btn" title="New chat" onClick={() => setShowNew(true)}>
              <Plus size={20} />
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
                    <span className="wa-chat-last">
                      {prev ? (
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
            <div className="wa-main-header">
              <button className="wa-icon-btn wa-back-btn" onClick={() => setActiveId(null)} title="Back">
                <ArrowLeft size={20} />
              </button>
              <div className="wa-avatar sm" style={{ background: colourForId(activeChat.id) }}>
                {initial(titleFor(activeChat))}
              </div>
              <div className="wa-main-header-info">
                <div className="wa-main-header-title">
                  {titleFor(activeChat)}
                  {activeChat.importJobId && <FileSpreadsheet size={14} style={{ marginInlineStart: 4, color: 'var(--wa-teal-accent)' }} />}
                </div>
                <div className="wa-main-header-status">
                  {activeChat.type === 'group' ? 'tap for group info' : 'online'}
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

            <MessageList messages={visibleMessages} meId={me?.id ?? ''} users={users} />
            <InputBar onSendText={send} onSendMedia={sendMedia} chatId={activeId!} />
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

/* ═══════════════════════ Message list ═══════════════════════ */

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
              <div className={'wa-bubble ' + (mine ? 'mine' : 'theirs')} dir={rtl ? 'rtl' : 'ltr'}>
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
            <img src={url} alt="" style={{ transform: `scale(${zoom})`, transition: 'transform 120ms' }} />
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
          <span>{duration ? formatDuration(playing ? (duration * pct / 100) : duration) : '— : —'}</span>
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

function InputBar({ onSendText, onSendMedia, chatId }: {
  onSendText: (body: string) => void;
  onSendMedia: (type: Message['type'], mediaUrl: string, body?: string) => void;
  chatId: string;
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

  const submit = () => {
    if (!body.trim()) return;
    onSendText(body);
    setBody('');
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

  const EMOJI = ['😀', '😂', '🥰', '😎', '🤔', '👍', '🎉', '❤️', '🙏', '🔥', '✅', '⚠️'];

  return (
    <div className="wa-input-bar-wrap">
      {uploading && <div className="wa-upload-strip" />}
      {showEmoji && (
        <div className="wa-pop wa-pop-emoji">
          {EMOJI.map(e => (
            <button key={e} onClick={() => { setBody(b => b + e); setShowEmoji(false); }}>{e}</button>
          ))}
        </div>
      )}
      {showAttach && (
        <div className="wa-pop wa-pop-attach">
          <button onClick={() => fileInputRef.current?.click()}>
            <ImageIcon size={16} /> <span>Photo / Video</span>
          </button>
          <button onClick={() => {
            const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*';
            i.onchange = (e: any) => onPickFile(e, 'audio');
            i.click();
          }}>
            <Music size={16} /> <span>Audio</span>
          </button>
          <button onClick={() => {
            const i = document.createElement('input'); i.type = 'file';
            i.onchange = (e: any) => onPickFile(e, 'document');
            i.click();
          }}>
            <FileText size={16} /> <span>Document</span>
          </button>
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
              onChange={e => setBody(e.target.value)}
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
