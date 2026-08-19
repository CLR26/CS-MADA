import { useState } from 'react'

export default function NewRequestModal({ knownDepartments, onCreate, onClose }) {
  const [clientRef, setClientRef] = useState('')
  const [objet, setObjet] = useState('')
  const [waitingOn, setWaitingOn] = useState('nous')
  const [departement, setDepartement] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!clientRef.trim() || !objet.trim()) {
      setError('Le client et l’objet sont obligatoires.')
      return
    }
    if (waitingOn === 'departement' && !departement.trim()) {
      setError('Précisez le département concerné.')
      return
    }
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
    } catch (err) {
      setError("Erreur d'enregistrement. Réessayez.")
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nouvelle demande</h3>
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field">
              <label>Client *</label>
              <input
                value={clientRef}
                onChange={e => setClientRef(e.target.value)}
                placeholder="Nom ou téléphone du client"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Objet *</label>
              <input
                value={objet}
                onChange={e => setObjet(e.target.value)}
                placeholder="Ex : Colis non reçu, facturation double…"
              />
            </div>
            <div className="field">
              <label>Qui doit agir ensuite ? *</label>
              <div className="choice-row">
                {['nous', 'client', 'departement'].map(v => (
                  <button
                    type="button"
                    key={v}
                    className={`choice-btn ${v} ${waitingOn === v ? 'active' : ''}`}
                    onClick={() => setWaitingOn(v)}
                  >
                    {v === 'nous' ? 'Nous' : v === 'client' ? 'Client' : 'Département'}
                  </button>
                ))}
              </div>
            </div>
            {waitingOn === 'departement' && (
              <div className="field">
                <label>Département concerné *</label>
                <input
                  list="dept-list"
                  value={departement}
                  onChange={e => setDepartement(e.target.value)}
                  placeholder="Ex : Comptabilité, Logistique…"
                />
                <datalist id="dept-list">
                  {knownDepartments.map(dep => <option key={dep} value={dep} />)}
                </datalist>
              </div>
            )}
            {error && <div className="msg err">{error}</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
