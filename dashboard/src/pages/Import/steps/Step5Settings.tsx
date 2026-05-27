import type { ImportWizardState } from '../ImportWizard';

interface Props {
  state: ImportWizardState;
  update: (patch: Partial<ImportWizardState>) => void;
  next: () => void;
}

export function Step5Settings({ state, update, next }: Props) {
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
        />
      </label>
      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Session ID:{' '}
        <input
          type="text"
          value={state.sessionId}
          onChange={e => update({ sessionId: e.target.value })}
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
      <div className="iw-actions">
        <span />
        <button onClick={next}>Start import →</button>
      </div>
    </>
  );
}
