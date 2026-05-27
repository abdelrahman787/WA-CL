import { useEffect, useState } from 'react';
import type { ImportWizardState } from '../ImportWizard';

interface Props { state: ImportWizardState; next: () => void; }

export function Step6Importing({ state, next }: Props) {
  const [status, setStatus] = useState('starting…');

  useEffect(() => {
    if (!state.jobId) return;
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
      .then(() => { setStatus('complete'); next(); })
      .catch((e: Error) => setStatus(`failed: ${e.message}`));
  }, [state, next]);

  return (
    <>
      <h2>Importing…</h2>
      <p>{status}</p>
      <div className="iw-progress"><span style={{ width: status === 'complete' ? '100%' : '50%' }} /></div>
    </>
  );
}
