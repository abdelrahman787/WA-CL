import { useEffect, useState } from 'react';
import type { ImportWizardState } from '../ImportWizard';

interface Participant { name: string; count: number; }
type Action = 'map_existing' | 'create_new' | 'skip';
interface Mapping { senderName: string; action: Action; existingUserId?: string; displayName?: string; }

interface Props { state: ImportWizardState; next: () => void; }

export function Step4MapUsers({ state, next }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!state.jobId) return;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    fetch(`/api/import/jobs/${state.jobId}/participants`, { headers: { 'X-API-Key': apiKey } })
      .then(r => r.json())
      .then((data: { counts: Participant[] }) => {
        setParticipants(data.counts);
        const init: Record<string, Mapping> = {};
        for (const p of data.counts) {
          init[p.name] = { senderName: p.name, action: 'create_new', displayName: p.name };
        }
        setMappings(init);
      });
  }, [state.jobId]);

  const submit = async () => {
    if (!state.jobId) return;
    setSubmitting(true);
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    await fetch(`/api/import/jobs/${state.jobId}/map-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        mappings: Object.values(mappings).map(m => ({
          senderName: m.senderName,
          action: m.action,
          existingUserId: m.existingUserId,
          newUserData: m.action === 'create_new' ? { displayName: m.displayName ?? m.senderName } : undefined,
        })),
      }),
    });
    setSubmitting(false);
    next();
  };

  return (
    <>
      <h2>Map participants</h2>
      {participants.map(p => {
        const m = mappings[p.name];
        return (
          <div key={p.name} className="iw-card" style={{ marginBottom: '0.75rem' }}>
            <div><strong>{p.name}</strong> — {p.count} messages</div>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              <input
                type="radio"
                checked={m?.action === 'create_new'}
                onChange={() => setMappings(s => ({ ...s, [p.name]: { ...s[p.name], action: 'create_new' } }))}
              />
              {' '}Create new user
            </label>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                checked={m?.action === 'skip'}
                onChange={() => setMappings(s => ({ ...s, [p.name]: { ...s[p.name], action: 'skip' } }))}
              />
              {' '}Skip (anonymous)
            </label>
          </div>
        );
      })}
      <div className="iw-actions">
        <span />
        <button disabled={submitting} onClick={submit}>
          {submitting ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </>
  );
}
