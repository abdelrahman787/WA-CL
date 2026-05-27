import { useEffect, useState } from 'react';
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

export function Step3Preview({ state, next }: Props) {
  const [items, setItems] = useState<PreviewMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!state.jobId) return;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    fetch(`/api/import/jobs/${state.jobId}/preview?page=${page}`, {
      headers: { 'X-API-Key': apiKey },
    })
      .then(r => r.json())
      .then(data => { setItems(data.items); setTotal(data.total); });
  }, [state.jobId, page]);

  const firstSender = items.find(m => !m.isSystemMessage)?.originalSenderName;

  return (
    <>
      <h2>Preview ({total} messages)</h2>
      <div className="iw-bubble-list">
        {items.map(m => {
          if (m.isSystemMessage) {
            return <div key={m.id} className="iw-bubble system">{m.textContent}</div>;
          }
          const mine = m.originalSenderName === firstSender;
          return (
            <div key={m.id} className={'iw-bubble' + (mine ? ' mine' : '')}>
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
          );
        })}
      </div>
      <div className="iw-actions">
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span>page {page}</span>
        <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
      <div className="iw-actions">
        <span />
        <button onClick={next}>Continue to user mapping →</button>
      </div>
    </>
  );
}
