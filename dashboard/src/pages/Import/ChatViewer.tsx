import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';
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

// Unicode block ranges for Arabic / Hebrew / Syriac / Thaana — anything
// that should render right-to-left.
const RTL_RE = /[֐-׿؀-ۿ܀-ݏހ-޿ࢠ-ࣿיִ-﻿]/;
const isRtlText = (s: string | null | undefined): boolean => !!s && RTL_RE.test(s);

const PAGE_SIZE = 1000;
const ROW_HEIGHT = 96;

export default function ChatViewer() {
  const { chatId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);

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

  return (
    <div className="iw-shell">
      <h1>Chat {chatId} <span style={{ fontSize: '0.7em', color: '#6b7280' }}>({total} messages)</span></h1>
      <div className="iw-card" style={{ padding: 0 }}>
        <div style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>
          <List
            rowCount={messages.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={ChatRow}
            rowProps={{ messages, firstSender }}
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
}: RowComponentProps<{ messages: Message[]; firstSender: string | undefined }>) {
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

  return (
    <div style={style}>
      <div
        className={'iw-bubble' + (mine ? ' mine' : '')}
        dir={rtl ? 'rtl' : 'ltr'}
        style={rtl ? { textAlign: 'right' } : undefined}
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
