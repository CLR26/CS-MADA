import { useState } from 'react'
import TextArea from './ui/TextArea'
import Button from './ui/Button'
import { formatDateTime } from '../lib/time'

export default function ActivityFeed({ events = [], onSend }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  async function handleSend() {
    const content = draft.trim()
    if (!content) return

    setSending(true)
    setError(null)
    try {
      await onSend(content)
      setDraft('')
    } catch {
      setError("Erreur lors de l'envoi du message.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      {events.length === 0 ? (
        <div className="activity-feed__empty">Aucune activité pour l'instant.</div>
      ) : (
        <div className="activity-feed">
          {events.map(event =>
            event.kind === 'message' ? (
              <div key={event.id} className="activity-feed__message">
                <div className="activity-feed__message-meta">
                  <span className="activity-feed__author">{event.author_name}</span>
                  <span className="activity-feed__time">{formatDateTime(event.created_at)}</span>
                </div>
                <div className="activity-feed__message-content">{event.content}</div>
              </div>
            ) : (
              <div key={event.id} className="activity-feed__system">
                <span>{event.content}</span>
                <span className="activity-feed__time">{formatDateTime(event.created_at)}</span>
              </div>
            )
          )}
        </div>
      )}

      {onSend && (
        <div className="activity-feed__composer">
          <TextArea
            id="activity-feed-draft"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Écrire un message pour l'équipe..."
            rows={2}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSend}
            disabled={sending || !draft.trim()}
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
          {error && <div className="ui-field__msg ui-field__msg--error">{error}</div>}
        </div>
      )}
    </div>
  )
}
