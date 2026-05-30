import { useState } from 'react';
import type { ImportWizardState } from '../ImportWizard';

interface Props {
  state: ImportWizardState;
  update: (patch: Partial<ImportWizardState>) => void;
  next: () => void;
}

export function Step5Settings({ state, update, next }: Props) {
  // Most imports are stand-alone — they don't attach to a live WhatsApp
  // session. Hide the field behind an "Advanced" toggle so the typical
  // user isn't asked for a UUID they don't have. The API still accepts
  // sessionId for callers that genuinely want to bind to a live session.
  const [advanced, setAdvanced] = useState(false);

  return (
    <>
      <h2>Import settings</h2>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Chat title:{' '}
        <input
          type="text"
          value={state.chatTitle}
          onChange={e => update({ chatTitle: e.target.value })}
          placeholder="Auto-detected from export"
          style={{ width: '100%', maxWidth: 360 }}
        />
      </label>

      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={state.preserveTimestamps}
          onChange={e => update({ preserveTimestamps: e.target.checked })}
        />
        {' '}Preserve original timestamps
      </label>

      <label style={{ display: 'block' }}>
        <input
          type="checkbox"
          checked={state.createAsArchived}
          onChange={e => update({ createAsArchived: e.target.checked })}
        />
        {' '}Import as archived chat
      </label>

      <button
        type="button"
        onClick={() => setAdvanced(s => !s)}
        style={{
          marginTop: '0.75rem',
          background: 'none',
          border: 'none',
          color: '#075E54',
          cursor: 'pointer',
          padding: 0,
          fontSize: '0.85rem',
        }}
      >
        {advanced ? '▾' : '▸'} Advanced
      </button>

      {advanced && (
        <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f9fafb', borderRadius: 6, fontSize: '0.85rem' }}>
          <label style={{ display: 'block' }}>
            Bind to live WhatsApp session (optional):{' '}
            <input
              type="text"
              value={state.sessionId}
              onChange={e => update({ sessionId: e.target.value })}
              placeholder="UUID from /admin/sessions"
              style={{ width: '100%', maxWidth: 360 }}
            />
          </label>
          <p style={{ color: '#6b7280', margin: '0.5rem 0 0 0' }}>
            Leave empty to create a stand-alone imported chat (recommended).
            Set this only if you want the imported group history to attach
            to a live WhatsApp session you've already linked via QR — so
            new messages on that real number land in the same chat.
          </p>
        </div>
      )}

      <div className="iw-actions">
        <span />
        <button onClick={next}>Start import →</button>
      </div>
    </>
  );
}
