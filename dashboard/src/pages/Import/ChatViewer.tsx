import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './ImportWizard.css';

interface Message {
  id: string;
  originalSenderName: string;
  originalTimestamp: string;
  messageType: string;
  textContent: string | null;
  mediaFileName: string | null;
  mediaMatched: boolean;
  isSystemMessage: boolean;
}

export default function ChatViewer() {
  const { chatId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!chatId) return;
    const apiKey = sessionStorage.getItem('openwa_api_key') ?? '';
    fetch(`/api/import/jobs/${chatId}/preview?page=1&pageSize=500`, {
      headers: { 'X-API-Key': apiKey },
    })
      .then(r => r.json())
      .then(d => setMessages(d.items));
  }, [chatId]);

  const firstSender = messages.find(m => !m.isSystemMessage)?.originalSenderName;

  return (
    <div className="iw-shell">
      <h1>Chat {chatId}</h1>
      <div className="iw-card">
        <div className="iw-bubble-list">
          {messages.map(m => {
            if (m.isSystemMessage) {
              return <div key={m.id} className="iw-bubble system">{m.textContent}</div>;
            }
            const mine = m.originalSenderName === firstSender;
            return (
              <div key={m.id} className={'iw-bubble' + (mine ? ' mine' : '')}>
                <div className="sender">{m.originalSenderName}</div>
                {m.textContent && <div>{m.textContent}</div>}
                {m.mediaFileName && (
                  <div style={{ fontSize: '0.85rem' }}>
                    {m.mediaMatched ? '📎 ' : '⚠️ '}{m.mediaFileName}
                  </div>
                )}
                <div className="ts">{new Date(m.originalTimestamp).toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
