import { useEffect, useRef, useState } from 'react'

export default function NewRequestModal({ knownDepartments, onCreate, onClose }) {
  const [clientRef, setClientRef] = useState('')
  const [objet, setObjet] = useState('')
  const [waitingOn, setWaitingOn] = useState('nous')
  const [departement, setDepartement] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const modalRef = useRef(null)

  const dirty = clientRef.trim() !== '' || objet.trim() !== '' || departement.trim() !== ''

  useEffect(() => { modalRef.current?.focus() }, [])

  function requestClose() {
    if (dirty && !saving) { setConfirmClose(true); return }
    onClose()
  }

  useEffect(() => {
    function handleKeyDown(e) { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dirty, saving])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!clientRef.trim() || !objet.trim()) { setError('Le client et l’objet sont obligatoires.'); return }
    if (waitingOn === 'departement' && !departement.trim()) { setError('Précisez le département concerné.'); return }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        client_ref: clientRef.trim(),
        objet: objet.trim(),
        waiting_on: waitingOn,
        departement: waitingOn === 'departement' ? departement.trim() : null,
      })
      onClose()
    } catch {
      setError("Erreur d'enregistrement. Réessayez.")
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={requestClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-modal-title" tabIndex={-1} ref={modalRef}>
        <div className="modal-header">
          <h3 id="new-modal-title">Nouvelle demande</h3>
          <button className="btn ghost small" onClick={requestClose} aria-label="Fermer">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field">
              <label htmlFor="client-field">Client *</label>
              <input id="client-field" value={clientRef} onChange={e => setClientRef(e.target.value)} placeholder="Nom ou téléphone du client" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="objet-field">Objet *</label>
              <input id="objet-field" value={objet} onChange={e => setObjet(e.target.value)} placeholder="Ex : Colis non reçu, facturation double…" />
            </div>
            <div className="field">
              <label id="new-waiting-on-label">Qui doit agir ensuite ? *</label>
              <div className="choice-row" role="group" aria-labelledby="new-waiting-on-label">
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
              <div className="field">
                <label htmlFor="dept-field">Département concerné *</label>
                <input id="dept-field" list="dept-list" value={departement} onChange={e => setDepartement(e.target.value)} placeholder="Ex : Comptabilité, Logistique…" />
                <datalist id="dept-list">
                  {knownDepartments.map(dep => <option key={dep} value={dep} />)}
                </datalist>
              </div>
            )}
            {error && <div className="msg err" role="alert">{error}</div>}
            {confirmClose && (
              <div className="msg warn" role="alert">
                Cette demande n'a pas été enregistrée.
                <div className="confirm-actions">
                  <button type="button" className="btn secondary small" onClick={() => setConfirmClose(false)}>Continuer la saisie</button>
                  <button type="button" className="btn danger small" onClick={onClose}>Fermer sans enregistrer</button>
                </div>
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={requestClose}>Annuler</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
