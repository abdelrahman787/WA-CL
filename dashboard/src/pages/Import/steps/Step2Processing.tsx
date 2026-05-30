import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ImportWizardState } from '../ImportWizard';

interface Progress {
  stage: string;
  progress: number;
  currentStep: string;
  stats?: { totalMessages?: number; matchedMedia?: number; totalMedia?: number };
}

interface JobStatus {
  id: string;
  status: 'uploading' | 'extracting' | 'parsing' | 'matching_media' | 'preview' | 'mapping_users' | 'importing' | 'complete' | 'failed';
  totalMessages: number;
  matchedMediaFiles: number;
  totalMediaFiles: number;
  errorDetails?: { message?: string } | null;
}

interface Props { state: ImportWizardState; next: () => void }

const READY_STAGES = new Set(['preview', 'mapping_users', 'importing', 'complete']);

/**
 * The socket race we ran into in production: the server emits progress
 * events immediately after upload returns, but the React component is
 * still mounting + opening its socket. By the time `subscribe` fires
 * the job can already be finished. Result: the bar stays at
 * "connecting…" forever.
 *
 * The fix is twofold:
 *   1. Poll /api/import/jobs/:id on mount AND every 1.5s as a fallback,
 *      so we always learn about a finished job even if no socket event
 *      ever lands.
 *   2. Keep the socket for the smooth high-frequency progress between
 *      polls.
 */
export function Step2Processing({ state, next }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.jobId) return;
    let cancelled = false;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';

    const advance = () => {
      if (cancelled) return;
      cancelled = true;
      setTimeout(next, 200);
    };

    // 1. Live updates via socket — best case.
    const socket: Socket = io('/import');
    socket.emit('subscribe', { jobId: state.jobId });
    socket.on('progress', (p: Progress) => {
      setProgress(p);
      if (READY_STAGES.has(p.stage)) advance();
    });
    socket.on('error', (e: { error: string }) => {
      setError(e.error);
    });

    // 2. Polling fallback. Catches the case where the job already
    //    finished before we connected, and surfaces a final "failed"
    //    status that wasn't broadcast to a room we joined late.
    const poll = async () => {
      try {
        const res = await fetch(`/api/import/jobs/${state.jobId}`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (!res.ok) return;
        const job: JobStatus = await res.json();
        if (cancelled) return;
        setProgress(prev => ({
          stage: job.status,
          progress: prev?.progress ?? (READY_STAGES.has(job.status) ? 100 : 50),
          currentStep: prev?.currentStep ?? job.status,
          stats: {
            totalMessages: job.totalMessages,
            matchedMedia: job.matchedMediaFiles,
            totalMedia: job.totalMediaFiles,
          },
        }));
        if (job.status === 'failed') {
          setError(job.errorDetails?.message ?? 'import failed');
          return;
        }
        if (READY_STAGES.has(job.status)) advance();
      } catch (e) {
        // ignore — next tick will retry
        void e;
      }
    };
    void poll(); // immediate check
    const interval = setInterval(poll, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
      socket.disconnect();
    };
  }, [state.jobId, next]);

  const pct = progress?.progress ?? 5;
  return (
    <>
      <h2>Processing…</h2>
      <p>{error ?? progress?.currentStep ?? 'connecting…'}</p>
      <div className="iw-progress"><span style={{ width: `${pct}%` }} /></div>
      <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
        Job: {state.jobId ?? '—'} · Stage: {progress?.stage ?? '…'}
        {progress?.stats?.totalMessages
          ? <> · {progress.stats.totalMessages} messages parsed</>
          : null}
      </p>
      {error && (
        <p style={{ color: '#dc2626', marginTop: '0.5rem' }}>
          ❌ {error}
        </p>
      )}
    </>
  );
}
