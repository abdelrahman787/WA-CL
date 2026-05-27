import { useMemo, useState } from 'react';
import { Step1Upload } from './steps/Step1Upload';
import { Step2Processing } from './steps/Step2Processing';
import { Step3Preview } from './steps/Step3Preview';
import { Step4MapUsers } from './steps/Step4MapUsers';
import { Step5Settings } from './steps/Step5Settings';
import { Step6Importing } from './steps/Step6Importing';
import { Step7Done } from './steps/Step7Done';
import './ImportWizard.css';

const STEPS = [
  'Upload',
  'Processing',
  'Preview',
  'Map users',
  'Settings',
  'Importing',
  'Done',
] as const;

export interface ImportWizardState {
  jobId: string | null;
  chatTitle: string;
  sessionId: string;
  preserveTimestamps: boolean;
  createAsArchived: boolean;
}

const initial: ImportWizardState = {
  jobId: null,
  chatTitle: '',
  sessionId: '',
  preserveTimestamps: true,
  createAsArchived: false,
};

export default function ImportWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ImportWizardState>(initial);

  const update = (patch: Partial<ImportWizardState>) =>
    setState(s => ({ ...s, ...patch }));

  const Stepper = useMemo(() => (
    <ol className="iw-steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={'iw-step ' + (i === step ? 'active' : i < step ? 'done' : '')}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  ), [step]);

  const body = (() => {
    switch (step) {
      case 0: return <Step1Upload state={state} update={update} next={() => setStep(1)} />;
      case 1: return <Step2Processing state={state} next={() => setStep(2)} />;
      case 2: return <Step3Preview state={state} next={() => setStep(3)} />;
      case 3: return <Step4MapUsers state={state} next={() => setStep(4)} />;
      case 4: return <Step5Settings state={state} update={update} next={() => setStep(5)} />;
      case 5: return <Step6Importing state={state} next={() => setStep(6)} />;
      case 6: return <Step7Done state={state} restart={() => { setState(initial); setStep(0); }} />;
      default: return null;
    }
  })();

  return (
    <div className="iw-shell">
      <h1>Import WhatsApp chat</h1>
      {Stepper}
      <div className="iw-card">{body}</div>
    </div>
  );
}
