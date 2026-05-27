import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ImportWizardState } from '../ImportWizard';

interface Progress {
  stage: string;
  progress: number;
  currentStep: string;
  stats: { totalMessages: number; matchedMedia: number; totalMedia: number };
}

interface Props { state: ImportWizardState; next: () => void; }

export function Step2Processing({ state, next }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    if (!state.jobId) return;
    const socket: Socket = io('/import');
    socket.emit('subscribe', { jobId: state.jobId });
    socket.on('progress', (p: Progress) => {
      setProgress(p);
      if (p.stage === 'preview') {
        setTimeout(next, 400);
      }
    });
    socket.on('error', (e: { error: string }) => {
      setProgress(p => ({ ...(p ?? { stage: 'failed', progress: 0, currentStep: '', stats: { totalMessages: 0, matchedMedia: 0, totalMedia: 0 } }), currentStep: `error: ${e.error}` }));
    });
    return () => { socket.disconnect(); };
  }, [state.jobId, next]);

  const pct = progress?.progress ?? 0;
  return (
    <>
      <h2>Processing…</h2>
      <p>{progress?.currentStep ?? 'connecting…'}</p>
      <div className="iw-progress"><span style={{ width: `${pct}%` }} /></div>
      <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
        Job: {state.jobId ?? '—'} · Stage: {progress?.stage ?? '…'}
      </p>
    </>
  );
}
