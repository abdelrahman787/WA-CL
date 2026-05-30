import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import type { ImportWizardState } from '../ImportWizard';

interface Participant { name: string; count: number; }
type Action = 'map_existing' | 'create_new' | 'skip';
interface Mapping {
  senderName: string;
  action: Action;
  existingUserId?: string;
  existingUserLabel?: string;
  displayName?: string;
}

interface ExistingUser {
  id: string;
  name: string;
  role?: string;
}

interface Props { state: ImportWizardState; next: () => void; }

export function Step4MapUsers({ state, next }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [users, setUsers] = useState<ExistingUser[]>([]);
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

    // Load existing API keys to act as the "user" directory.
    fetch('/api/import/users-directory', { headers: { 'X-API-Key': apiKey } })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; username: string; displayName: string; role?: string }>) => {
        if (Array.isArray(rows)) {
          setUsers(rows.map(r => ({ id: r.id, name: r.displayName || r.username, role: r.role })));
        }
      })
      .catch(() => { /* directory optional */ });
  }, [state.jobId]);

  const fuse = useMemo(
    () => new Fuse(users, { keys: ['name'], threshold: 0.4, includeScore: true }),
    [users],
  );

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
          existingUserId: m.action === 'map_existing' ? m.existingUserId : undefined,
          newUserData:
            m.action === 'create_new'
              ? { displayName: m.displayName ?? m.senderName }
              : undefined,
        })),
      }),
    });
    setSubmitting(false);
    next();
  };

  return (
    <>
      <h2>Map participants</h2>
      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        Each detected sender can be linked to an existing user (API key),
        registered as a new viewer, or kept anonymous.
      </p>
      {participants.map(p => {
        const m = mappings[p.name];
        const set = (patch: Partial<Mapping>) =>
          setMappings(s => ({ ...s, [p.name]: { ...s[p.name], ...patch } }));
        const suggestion = users.length
          ? fuse.search(p.name).slice(0, 1)[0]?.item
          : undefined;
        return (
          <div key={p.name} className="iw-card" style={{ marginBottom: '0.75rem' }}>
            <div><strong>{p.name}</strong> — {p.count} messages</div>

            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              <input
                type="radio"
                checked={m?.action === 'map_existing'}
                onChange={() => set({ action: 'map_existing', existingUserId: m?.existingUserId ?? suggestion?.id })}
              />
              {' '}Map to existing user
            </label>
            {m?.action === 'map_existing' && (
              <ExistingUserPicker
                users={users}
                fuse={fuse}
                value={m.existingUserId}
                onChange={u => set({ existingUserId: u.id, existingUserLabel: u.name })}
                suggestion={suggestion}
              />
            )}

            <label style={{ display: 'block' }}>
              <input
                type="radio"
                checked={m?.action === 'create_new'}
                onChange={() => set({ action: 'create_new' })}
              />
              {' '}Create new user
            </label>
            {m?.action === 'create_new' && (
              <input
                type="text"
                value={m.displayName ?? p.name}
                onChange={e => set({ displayName: e.target.value })}
                style={{ marginLeft: '1.5rem', marginTop: '0.25rem' }}
              />
            )}

            <label style={{ display: 'block' }}>
              <input
                type="radio"
                checked={m?.action === 'skip'}
                onChange={() => set({ action: 'skip' })}
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

function ExistingUserPicker({
  users,
  fuse,
  value,
  onChange,
  suggestion,
}: {
  users: ExistingUser[];
  fuse: Fuse<ExistingUser>;
  value: string | undefined;
  onChange: (u: ExistingUser) => void;
  suggestion?: ExistingUser;
}) {
  const [query, setQuery] = useState('');
  const results = query
    ? fuse.search(query).slice(0, 8).map(r => r.item)
    : users.slice(0, 8);
  return (
    <div style={{ marginLeft: '1.5rem', marginTop: '0.25rem' }}>
      <input
        type="search"
        placeholder="Search by name…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ width: '100%', maxWidth: 320 }}
      />
      {suggestion && !query && (
        <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
          Suggested: <button type="button" onClick={() => onChange(suggestion)}>{suggestion.name}</button>
        </div>
      )}
      <select
        value={value ?? ''}
        onChange={e => {
          const u = users.find(x => x.id === e.target.value);
          if (u) onChange(u);
        }}
        style={{ width: '100%', maxWidth: 320, marginTop: '0.25rem' }}
      >
        <option value="">— pick a user —</option>
        {results.map(u => (
          <option key={u.id} value={u.id}>
            {u.name}{u.role ? ` (${u.role})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
