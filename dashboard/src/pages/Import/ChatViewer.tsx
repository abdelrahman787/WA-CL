import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window';
import './ImportWizard.css';

interface Message {
  id: string;
  originalSenderName: string;
  originalTimestamp: string;
  messageType: string;
  textContent: string | null;
  mediaFileName: string | null;
  mediaMatched: boolean;
  isSystemMessage: boolean;
}

// Arabic / Hebrew / Syriac / Thaana — anything that should render RTL.
const RTL_RE = /[֐-׿؀-ۿ܀-ݏހ-޿ࢠ-ࣿיִ-﻿]/;
const isRtlText = (s: string | null | undefined): boolean => !!s && RTL_RE.test(s);

const PAGE_SIZE = 1000;
const ROW_HEIGHT = 96;

export default function ChatViewer() {
  const { chatId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<number[]>([]);
  const [hitCursor, setHitCursor] = useState(0);
  const listRef = useRef<ListImperativeAPI | null>(null);

  useEffect(() => {
    if (!chatId) return;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    let cancelled = false;

    (async () => {
      const collected: Message[] = [];
      let page = 1;
      let totalKnown = Infinity;
      while (!cancelled && collected.length < totalKnown) {
        const res = await fetch(
          `/api/import/jobs/${chatId}/preview?page=${page}&pageSize=${PAGE_SIZE}`,
          { headers: { 'X-API-Key': apiKey } },
        );
        const data: { items: Message[]; total: number } = await res.json();
        if (cancelled) return;
        collected.push(...data.items);
        totalKnown = data.total;
        setTotal(totalKnown);
        setMessages([...collected]);
        if (data.items.length < PAGE_SIZE) break;
        page++;
      }
    })();

    return () => { cancelled = true; };
  }, [chatId]);

  const firstSender = useMemo(
    () => messages.find(m => !m.isSystemMessage)?.originalSenderName,
    [messages],
  );

  // Recompute hits whenever the query or message buffer changes.
  useEffect(() => {
    if (!query.trim()) { setHits([]); setHitCursor(0); return; }
    const q = query.toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const hay = (m.textContent ?? '') + ' ' + (m.originalSenderName ?? '') + ' ' + (m.mediaFileName ?? '');
      if (hay.toLowerCase().includes(q)) out.push(i);
    }
    setHits(out);
    setHitCursor(0);
    if (out.length) listRef.current?.scrollToRow({ index: out[0], align: 'center' });
  }, [query, messages]);

  const jumpToHit = (delta: number) => {
    if (!hits.length) return;
    const next = (hitCursor + delta + hits.length) % hits.length;
    setHitCursor(next);
    listRef.current?.scrollToRow({ index: hits[next], align: 'center' });
  };

  const hitSet = useMemo(() => new Set(hits), [hits]);

  return (
    <div className="iw-shell">
      <h1>
        Chat {chatId}{' '}
        <span style={{ fontSize: '0.7em', color: '#6b7280' }}>({total} messages)</span>
      </h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search messages…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: '1 1 240px', minWidth: 200 }}
        />
        {query.trim() && (
          <>
            <span style={{ alignSelf: 'center', fontSize: '0.85rem' }}>
              {hits.length ? `${hitCursor + 1} / ${hits.length}` : 'no matches'}
            </span>
            <button onClick={() => jumpToHit(-1)} disabled={!hits.length}>↑</button>
            <button onClick={() => jumpToHit(1)} disabled={!hits.length}>↓</button>
          </>
        )}
      </div>

      <div className="iw-card" style={{ padding: 0 }}>
        <div style={{ height: 'calc(100vh - 240px)', minHeight: 400 }}>
          <List
            listRef={listRef}
            rowCount={messages.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={ChatRow}
            rowProps={{ messages, firstSender, hitSet, currentHit: hits[hitCursor] }}
            overscanCount={8}
            style={{ height: '100%', padding: '0.5rem' }}
          />
        </div>
      </div>
    </div>
  );
}

function ChatRow({
  index,
  style,
  messages,
  firstSender,
  hitSet,
  currentHit,
}: RowComponentProps<{
  messages: Message[];
  firstSender: string | undefined;
  hitSet: Set<number>;
  currentHit: number | undefined;
}>) {
  const m = messages[index];
  if (!m) return <div style={style} />;

  if (m.isSystemMessage) {
    return (
      <div style={style}>
        <div className="iw-bubble system">{m.textContent}</div>
      </div>
    );
  }

  const mine = m.originalSenderName === firstSender;
  const rtl = isRtlText(m.textContent) || isRtlText(m.originalSenderName);
  const isHit = hitSet.has(index);
  const isCurrent = currentHit === index;

  return (
    <div style={style}>
      <div
        className={'iw-bubble' + (mine ? ' mine' : '')}
        dir={rtl ? 'rtl' : 'ltr'}
        style={{
          ...(rtl ? { textAlign: 'right' as const } : null),
          ...(isHit ? { outline: '2px solid #f59e0b' } : null),
          ...(isCurrent ? { outline: '2px solid #ef4444', outlineOffset: 1 } : null),
        }}
      >
        <div className="sender">{m.originalSenderName}</div>
        {m.textContent && <div>{m.textContent}</div>}
        {m.mediaFileName && (
          <div style={{ fontSize: '0.85rem' }}>
            {m.mediaMatched ? '📎 ' : '⚠️ '}{m.mediaFileName}
          </div>
        )}
        <div className="ts">{new Date(m.originalTimestamp).toLocaleString()}</div>
      </div>
    </div>
  );
}
