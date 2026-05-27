import type { ImportWizardState } from '../ImportWizard';

interface Props { state: ImportWizardState; restart: () => void; }

export function Step7Done({ state, restart }: Props) {
  return (
    <>
      <h2>✅ Import complete</h2>
      <p>Job <code>{state.jobId}</code> finished.</p>
      <div className="iw-actions">
        <a href="/import/history">View history</a>
        <button onClick={restart}>Import another</button>
      </div>
    </>
  );
}
