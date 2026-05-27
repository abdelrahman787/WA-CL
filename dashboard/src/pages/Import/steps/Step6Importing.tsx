import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ImportWizardState } from '../ImportWizard';

interface Props { state: ImportWizardState; next: () => void; }

interface Progress {
  stage: string;
  progress: number;
  currentStep: string;
  stats: { totalMessages: number; processedMessages: number; matchedMedia: number; totalMedia: number };
}

export function Step6Importing({ state, next }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [status, setStatus] = useState('starting…');
  const [cancelled, setCancelled] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Live progress via WebSocket — server emits to the `import:{jobId}` room.
  useEffect(() => {
    if (!state.jobId) return;
    const socket = io('/import');
    socketRef.current = socket;
    socket.emit('subscribe', { jobId: state.jobId });
    socket.on('progress', (p: Progress) => setProgress(p));
    socket.on('complete', () => {
      setStatus('complete');
      setTimeout(next, 250);
    });
    socket.on('error', (e: { error: string }) => setStatus(`failed: ${e.error}`));
    return () => { socket.disconnect(); };
  }, [state.jobId, next]);

  // Kick off the confirm request once mounted.
  useEffect(() => {
    if (!state.jobId || cancelled) return;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    fetch(`/api/import/jobs/${state.jobId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        chatTitle: state.chatTitle || undefined,
        sessionId: state.sessionId || undefined,
        preserveTimestamps: state.preserveTimestamps,
        createAsArchived: state.createAsArchived,
      }),
    })
      .then(r => r.json())
      .then(() => setStatus(s => (s === 'starting…' ? 'finalising…' : s)))
      .catch((e: Error) => setStatus(`failed: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = async () => {
    if (!state.jobId) return;
    setCancelled(true);
    setStatus('cancelling…');
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    await fetch(`/api/import/jobs/${state.jobId}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': apiKey },
    }).catch(() => {});
    setStatus('cancelled');
    socketRef.current?.disconnect();
  };

  const pct = progress?.progress ?? (status === 'complete' ? 100 : 5);

  return (
    <>
      <h2>Importing…</h2>
      <p>{progress?.currentStep ?? status}</p>
      <div className="iw-progress"><span style={{ width: `${pct}%` }} /></div>
      {progress && (
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          {progress.stats.processedMessages.toLocaleString()} / {progress.stats.totalMessages.toLocaleString()} messages
          {progress.stats.totalMedia > 0 && (
            <> · {progress.stats.matchedMedia} / {progress.stats.totalMedia} media</>
          )}
        </p>
      )}
      <div className="iw-actions">
        <button
          onClick={cancel}
          disabled={cancelled || status === 'complete' || status.startsWith('cancel')}
          style={{ background: '#dc2626', color: 'white' }}
        >
          Cancel import
        </button>
        <span />
      </div>
    </>
  );
}
