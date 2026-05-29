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
  const [progress, setProgress] = useState(0);
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

  /**
   * Real multipart upload via XHR so we get a working progress event.
   * fetch() does not expose request upload progress; XHR does.
   */
  const submit = () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);

    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    const fd = new FormData();
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/import/upload', true);
    xhr.setRequestHeader('X-API-Key', apiKey);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      setUploading(false);
      let data: { jobId?: string; message?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* keep empty */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.jobId) {
        update({ jobId: data.jobId });
        next();
      } else {
        setError(data.message ?? `upload failed (HTTP ${xhr.status})`);
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError('network error during upload');
    };
    xhr.send(fd);
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

      {uploading && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="iw-progress"><span style={{ width: `${progress}%` }} /></div>
          <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{progress}% uploaded</p>
        </div>
      )}

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
