import { useEffect, useState } from 'react';

interface Job {
  id: string;
  originalFileName: string;
  chatName: string | null;
  status: string;
  totalMessages: number;
  matchedMediaFiles: number;
  totalMediaFiles: number;
  createdAt: string;
}

export default function ImportHistory() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    fetch('/api/import/jobs', { headers: { 'X-API-Key': apiKey } })
      .then(r => r.json())
      .then(setJobs);
  }, []);

  return (
    <div className="iw-shell">
      <h1>Import history</h1>
      <div className="iw-card">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Chat</th>
              <th align="left">Status</th>
              <th align="right">Messages</th>
              <th align="right">Media</th>
              <th align="left">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td>{j.chatName ?? j.originalFileName}</td>
                <td>{j.status}</td>
                <td align="right">{j.totalMessages}</td>
                <td align="right">{j.matchedMediaFiles}/{j.totalMediaFiles}</td>
                <td>{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
                No imports yet — start one from <a href="/import">/import</a>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
