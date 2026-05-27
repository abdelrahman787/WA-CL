import { useState, useRef } from 'react';
import type { ImportWizardState } from '../ImportWizard';

interface Props {
  state: ImportWizardState;
  update: (patch: Partial<ImportWizardState>) => void;
  next: () => void;
}

export function Step1Upload({ update, next }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (f: File | null) => {
    if (!f) return;
    if (!/\.(rar|zip)$/i.test(f.name)) {
      setError('Only .rar or .zip exports are supported.');
      return;
    }
    if (f.size > 2 * 1024 * 1024 * 1024) {
      setError('File exceeds 2 GB limit.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // TODO: replace JSON pointer with multipart/form-data once Multer is wired.
      const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
      const res = await fetch('/api/import/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          filePath: file.name, // placeholder until upload pipeline ships
          originalName: file.name,
          size: file.size,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'upload failed');
      update({ jobId: data.jobId });
      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <p>
        Export your WhatsApp chat: <strong>Chat → Menu → More → Export Chat → Include Media</strong>,
        then drop the resulting .zip or .rar here.
      </p>
      <div
        className={'iw-drop' + (dragging ? ' dragging' : '')}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        {file ? (
          <>
            <div><strong>{file.name}</strong></div>
            <div>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
          </>
        ) : (
          <p>Tap or drop a .zip / .rar archive (max 2 GB)</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.rar"
          style={{ display: 'none' }}
          onChange={e => accept(e.target.files?.[0] ?? null)}
        />
      </div>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <div className="iw-actions">
        <span />
        <button disabled={!file || uploading} onClick={submit}>
          {uploading ? 'Uploading…' : 'Upload →'}
        </button>
      </div>
    </>
  );
}
