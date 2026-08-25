import { useRef, useState } from 'react'
import TextArea from './ui/TextArea'
import Button from './ui/Button'
import { formatDateTime } from '../lib/time'
import { IconPaperclip, IconX } from '../lib/icons'

const MAX_ATTACHMENT_MB = 10

/**
 * Timeline chronologique de la situation d'un dossier.
 * Chaque entrée (avec pièce jointe optionnelle) devient un événement horodaté.
 * Remplace l'ancien duo « Situation actuelle » (champ libre réécrit) + « Fil d'activité ».
 */
export default function ActivityFeed({ events = [], onSend }) {
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  function handleFileChange(e) {
    const selected = e.target.files?.[0]
    e.target.value = ''
    if (!selected) return
    if (selected.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setError(`Le fichier dépasse la taille maximale de ${MAX_ATTACHMENT_MB} Mo.`)
      return
    }
    setError(null)
    setFile(selected)
  }

  async function handleSend() {
    const content = draft.trim()
    if (!content) return

    setSending(true)
    setError(null)
    try {
      await onSend(content, file)
      setDraft('')
      setFile(null)
    } catch {
      setError("Erreur lors de l'envoi de la mise à jour.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      {events.length === 0 ? (
        <div className="activity-feed__empty">Aucune mise à jour pour l'instant.</div>
      ) : (
        <div className="activity-feed">
          {events.map(event => (
            <div key={event.id} className="activity-feed__message">
              <div className="activity-feed__message-meta">
                <span className="activity-feed__author">{event.author_name}</span>
                <span className="activity-feed__time">{formatDateTime(event.created_at)}</span>
              </div>
              <div className="activity-feed__message-content">{event.content}</div>
              {event.attachment_url && (
                <a
                  className="activity-feed__message-attachment"
                  href={event.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconPaperclip size={13} />
                  {event.attachment_name || 'Pièce jointe'}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {onSend && (
        <div className="activity-feed__composer">
          <TextArea
            id="activity-feed-draft"
            className="activity-feed__composer-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Décrivez les derniers échanges ou la nouvelle avancée..."
            rows={2}
          />

          {file && (
            <div className="activity-feed__attachment-chip">
              <IconPaperclip size={13} />
              <span title={file.name}>{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Retirer la pièce jointe">
                <IconX size={13} />
              </button>
            </div>
          )}

          <div className="activity-feed__composer-row">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={IconPaperclip}
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
            >
              Pièce jointe
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
            >
              {sending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </div>

          {error && <div className="ui-field__msg ui-field__msg--error">{error}</div>}
        </div>
      )}
    </div>
  )
}
