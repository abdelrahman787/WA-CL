import { Link } from 'react-router-dom';
import type { ImportWizardState } from '../ImportWizard';

interface Props { state: ImportWizardState; restart: () => void; }

export function Step7Done({ state, restart }: Props) {
  return (
    <>
      <h2>✅ Import complete</h2>
      <p>Job <code>{state.jobId}</code> finished.</p>
      <div className="iw-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        {state.jobId && (
          <Link
            to={`/chats/${state.jobId}`}
            style={{
              background: '#075E54',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            View imported chat →
          </Link>
        )}
        <Link to="/import/history">View history</Link>
        <button onClick={restart}>Import another</button>
      </div>
    </>
  );
}
