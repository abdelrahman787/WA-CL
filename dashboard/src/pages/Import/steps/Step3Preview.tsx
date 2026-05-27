import { useEffect, useMemo, useRef, useState } from 'react';
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
const ROW_HEIGHT = 120;
const IMAGE_TYPES = new Set(['image', 'sticker']);

export function Step3Preview({ state, next }: Props) {
  const [items, setItems] = useState<PreviewMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

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
          rowProps={{ items, firstSender, jobId: state.jobId ?? '' }}
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
  jobId,
}: RowComponentProps<{ items: PreviewMessage[]; firstSender: string | undefined; jobId: string }>) {
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
          <MediaPreview jobId={jobId} message={m} />
        )}
        <div className="ts">{new Date(m.originalTimestamp).toLocaleString()}</div>
      </div>
    </div>
  );
}

function MediaPreview({ jobId, message }: { jobId: string; message: PreviewMessage }) {
  const showImage = message.mediaMatched && IMAGE_TYPES.has(message.messageType);
  const url = useAuthedBlob(showImage ? `/api/import/jobs/${jobId}/media/${message.id}` : null);

  if (!message.mediaMatched) {
    return (
      <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
        ⚠️ {message.mediaFileName} (not in archive)
      </div>
    );
  }
  if (showImage && url) {
    return (
      <img
        src={url}
        alt={message.mediaFileName ?? ''}
        style={{ maxWidth: 160, maxHeight: 90, borderRadius: 4, objectFit: 'cover' }}
        loading="lazy"
      />
    );
  }
  return (
    <div style={{ fontSize: '0.85rem' }}>
      📎 {message.mediaFileName}
    </div>
  );
}

/**
 * Fetch a protected resource with the dashboard API key and expose the
 * response body as an object-URL safe for direct `<img>` rendering.
 * Cancellation on unmount; revokes the URL to avoid leaks.
 */
function useAuthedBlob(href: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!href) { setUrl(null); return; }
    let cancelled = false;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    fetch(href, { headers: { 'X-API-Key': apiKey } })
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(b => {
        if (cancelled) return;
        const u = URL.createObjectURL(b);
        lastUrlRef.current = u;
        setUrl(u);
      })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => {
      cancelled = true;
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
    };
  }, [href]);

  return url;
}
