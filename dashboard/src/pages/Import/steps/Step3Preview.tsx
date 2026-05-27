import { useEffect, useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { ImportWizardState } from '../ImportWizard';

interface PreviewMessage {
  id: string;
  originalSenderName: string;
  originalTimestamp: string;
  messageType: string;
  textContent: string | null;
  mediaFileName: string | null;
  mediaMatched: boolean;
  isSystemMessage: boolean;
  sequenceIndex: number;
}

interface Props { state: ImportWizardState; next: () => void; }

const PAGE_SIZE = 1000;
const ROW_HEIGHT = 88;

export function Step3Preview({ state, next }: Props) {
  const [items, setItems] = useState<PreviewMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch all messages in batches so the list can virtualize across the
  // entire chat (no manual pagination).
  useEffect(() => {
    if (!state.jobId) return;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    let cancelled = false;

    (async () => {
      setLoading(true);
      const collected: PreviewMessage[] = [];
      let page = 1;
      let totalKnown = Infinity;
      while (!cancelled && collected.length < totalKnown) {
        const res = await fetch(
          `/api/import/jobs/${state.jobId}/preview?page=${page}&pageSize=${PAGE_SIZE}`,
          { headers: { 'X-API-Key': apiKey } },
        );
        const data: { items: PreviewMessage[]; total: number } = await res.json();
        if (cancelled) return;
        collected.push(...data.items);
        totalKnown = data.total;
        setTotal(totalKnown);
        setItems([...collected]);
        if (data.items.length < PAGE_SIZE) break;
        page++;
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [state.jobId]);

  const firstSender = useMemo(
    () => items.find(m => !m.isSystemMessage)?.originalSenderName,
    [items],
  );

  return (
    <>
      <h2>Preview ({total} messages)</h2>
      {loading && <p>Loaded {items.length} / {total}…</p>}
      <div style={{ height: 600, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8 }}>
        <List
          rowCount={items.length}
          rowHeight={ROW_HEIGHT}
          rowComponent={PreviewRow}
          rowProps={{ items, firstSender }}
          overscanCount={8}
          style={{ height: '100%' }}
        />
      </div>
      <div className="iw-actions">
        <span />
        <button onClick={next} disabled={loading}>
          Continue to user mapping →
        </button>
      </div>
    </>
  );
}

function PreviewRow({
  index,
  style,
  items,
  firstSender,
}: RowComponentProps<{ items: PreviewMessage[]; firstSender: string | undefined }>) {
  const m = items[index];
  if (!m) return <div style={style} />;
  if (m.isSystemMessage) {
    return (
      <div style={style}>
        <div className="iw-bubble system">{m.textContent}</div>
      </div>
    );
  }
  const mine = m.originalSenderName === firstSender;
  return (
    <div style={style}>
      <div className={'iw-bubble' + (mine ? ' mine' : '')}>
        <div className="sender">{m.originalSenderName}</div>
        {m.textContent && <div>{m.textContent}</div>}
        {m.mediaFileName && (
          <div style={{ fontSize: '0.85rem' }}>
            {m.mediaMatched ? '📎 ' : '⚠️ '}{m.mediaFileName}
            {!m.mediaMatched && ' (not in archive)'}
          </div>
        )}
        <div className="ts">{new Date(m.originalTimestamp).toLocaleString()}</div>
      </div>
    </div>
  );
}
