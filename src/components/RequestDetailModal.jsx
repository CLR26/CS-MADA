import { useEffect, useRef, useState } from 'react'
import StatePill from './StatePill'
import { formatDateTime, formatDuration } from '../lib/time'

export default function RequestDetailModal({ demande, knownDepartments, onUpdate, onResolve, onReopen, onDelete, onClose }) {
  const [situation, setSituation] = useState(demande.situation)
  const [waitingOn, setWaitingOn] = useState(demande.waiting_on)
  const [departement, setDepartement] = useState(demande.departement || '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const modalRef = useRef(null)

  const isResolved = !!demande.resolved_at
  const dirty =
    situation !== demande.situation ||
    waitingOn !== demande.waiting_on ||
    departement !== (demande.departement || '')

  useEffect(() => {
    modalRef.current?.focus()
  }, [])

  function requestClose() {
    if (confirmDelete) { setConfirmDelete(false); return }
    if (dirty && !saving) { setConfirmClose(true); return }
    onClose()
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dirty, saving, confirmDelete])

  async function handleSave() {
    if (!situation.trim()) { setError('La situation ne peut pas être vide.'); return }
    if (waitingOn === 'departement' && !departement.trim()) { setError('Précisez le département.'); return }
    setSaving(true)
    setError(null)
    try {
      await onUpdate(demande.id, {
        situation: situation.trim(),
        waiting_on: waitingOn,
        departement: waitingOn === 'departement' ? departement.trim() : null,
      })
      onClose()
    } catch {
      setError('Erreur de mise à jour. Réessayez.')
      setSaving(false)
    }
  }

  async function handleResolve() {
    if (dirty && !situation.trim()) { setError('La situation ne peut pas être vide.'); return }
    if (waitingOn === 'departement' && !departement.trim()) { setError('Précisez le département.'); return }
    setSaving(true)
    setError(null)
    try {
      await onResolve(
        demande.id,
        dirty
          ? { situation: situation.trim(), waiting_on: waitingOn, departement: waitingOn === 'departement' ? departement.trim() : null }
          : undefined
      )
      onClose()
    } catch {
      setError('Erreur de mise à jour. Réessayez.')
      setSaving(false)
    }
  }

  async function handleReopen() {
    setSaving(true)
    await onReopen(demande.id)
    onClose()
  }

  async function confirmDeleteAction() {
    setSaving(true)
    setError(null)
    try {
      await onDelete(demande.id)
      onClose()
    } catch {
      setError('Erreur de suppression. Réessayez.')
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="overlay" onClick={requestClose}>
      <div
        className="modal wide"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
        tabIndex={-1}
        ref={modalRef}
      >
        <div className="modal-header">
          <h3 id="detail-modal-title">{demande.client_ref}</h3>
          <button className="btn ghost small" onClick={requestClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">
          <div className="detail-section">
            <div className="detail-grid">
              <div>
                <div className="k">Objet</div>
                <div className="v">{demande.objet}</div>
              </div>
              <div>
                <div className="k">Agent créateur</div>
                <div className="v">{demande.created_by_name || '—'}</div>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="timestamps">
              <span>Créée : {formatDateTime(demande.created_at)}</span>
              <span>Dernière mise à jour : {formatDateTime(demande.last_update_at)}</span>
              {isResolved && <span>Traitée en : {formatDuration(new Date(demande.resolved_at) - new Date(demande.created_at))}</span>}
            </div>
          </div>

          <div className="detail-section detail-section--edit">
            <div className="field">
              <label htmlFor="situation-field">
                {isResolved ? 'Situation au moment du traitement' : 'Situation actuelle'}
              </label>
              {isResolved ? (
                <div className="situation-readonly">{demande.situation}</div>
              ) : (
                <textarea id="situation-field" value={situation} onChange={e => setSituation(e.target.value)} />
              )}
            </div>

            {isResolved ? (
              <StatePill state="done" />
            ) : (
              <>
                <div className="field">
                  <label id="waiting-on-label">Qui doit agir ensuite ?</label>
                  <div className="choice-row" role="group" aria-labelledby="waiting-on-label">
                    {['nous', 'client', 'departement'].map(v => (
                      <button
                        type="button"
                        key={v}
                        className={`choice-btn ${v} ${waitingOn === v ? 'active' : ''}`}
                        aria-pressed={waitingOn === v}
                        onClick={() => setWaitingOn(v)}
                      >
                        {v === 'nous' ? 'Nous' : v === 'client' ? 'Client' : 'Département'}
                      </button>
                    ))}
                  </div>
                </div>

                {waitingOn === 'departement' && (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="dept-field-detail">Département concerné</label>
                    <input id="dept-field-detail" list="dept-list-detail" value={departement} onChange={e => setDepartement(e.target.value)} />
                    <datalist id="dept-list-detail">
                      {knownDepartments.map(dep => <option key={dep} value={dep} />)}
                    </datalist>
                  </div>
                )}

                {error && <div className="msg err" role="alert">{error}</div>}

                {confirmClose && (
                  <div className="msg warn" role="alert">
                    Des modifications non enregistrées seront perdues.
                    <div className="confirm-actions">
                      <button type="button" className="btn secondary small" onClick={() => setConfirmClose(false)}>Continuer l'édition</button>
                      <button type="button" className="btn danger small" onClick={onClose}>Fermer sans enregistrer</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="modal-actions">
          {confirmDelete ? (
            <div className="confirm-delete">
              <span>Supprimer définitivement ?</span>
              <button className="btn secondary small" onClick={() => setConfirmDelete(false)} disabled={saving}>Annuler</button>
              <button className="btn danger small" onClick={confirmDeleteAction} disabled={saving}>Confirmer</button>
            </div>
          ) : (
            <button className="btn danger small btn-delete" onClick={() => setConfirmDelete(true)} disabled={saving}>
              Supprimer
            </button>
          )}
          {isResolved ? (
            <button className="btn secondary" onClick={handleReopen} disabled={saving}>Rouvrir le dossier</button>
          ) : (
            <>
              <button className="btn secondary" onClick={handleResolve} disabled={saving}>Marquer traité</button>
              <button className="btn" onClick={handleSave} disabled={saving || !dirty}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
