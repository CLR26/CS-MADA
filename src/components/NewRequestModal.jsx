import { useState } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import { IconAlertTriangle, IconUser, IconBuilding, IconPlus } from '../lib/icons'

export default function NewRequestModal({ knownDepartments = [], onCreate, onClose }) {
  const [clientRef, setClientRef] = useState('')
  const [objet, setObjet] = useState('')
  const [waitingOn, setWaitingOn] = useState('nous')
  const [departement, setDepartement] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const dirty = clientRef.trim() !== '' || objet.trim() !== '' || departement.trim() !== ''

  function handleRequestClose() {
    if (confirmClose) {
      setConfirmClose(false)
      return
    }
    if (dirty && !saving) {
      setConfirmClose(true)
      return
    }
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!clientRef.trim() || !objet.trim()) {
      setError('Le nom du client et l’objet de la demande sont obligatoires.')
      return
    }
    if (waitingOn === 'departement' && !departement.trim()) {
      setError('Veuillez préciser le département concerné.')
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
    } catch {
      setError("Erreur lors de l'enregistrement de la demande. Réessayez.")
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={handleRequestClose}
      title="Créer une nouvelle demande"
      subtitle="Ajoutez un dossier pour démarrer le suivi d'équipe en direct."
      maxWidth="480px"
      footer={
        confirmClose ? (
          <div className="ui-confirm-box" style={{ width: '100%', margin: 0 }}>
            <span>⚠️ Fermer sans enregistrer la saisie en cours ?</span>
            <div className="ui-confirm-box__actions">
              <Button variant="secondary" size="sm" onClick={() => setConfirmClose(false)}>
                Continuer la saisie
              </Button>
              <Button variant="danger" size="sm" onClick={onClose}>
                Fermer sans enregistrer
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={handleRequestClose} disabled={saving}>
              Annuler
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={IconPlus}
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : 'Créer la demande'}
            </Button>
          </>
        )
      }
    >
      <form onSubmit={handleSubmit}>
        <Input
          id="new-client-field"
          label="Client"
          value={clientRef}
          onChange={e => setClientRef(e.target.value)}
          placeholder="Ex : M. Dupont, SARL Dubois, 06 12 34 56 78..."
          required
          autoFocus
          helper="Nom, référence client ou numéro de téléphone."
        />

        <Input
          id="new-objet-field"
          label="Objet de la demande"
          value={objet}
          onChange={e => setObjet(e.target.value)}
          placeholder="Ex : Colis non reçu, facture en double, devis..."
          required
          helper="Résumé clair en une ligne."
        />

        {/* Qui doit agir ensuite */}
        <div className="ui-field">
          <label className="ui-label">Qui doit agir ensuite ? *</label>
          <div className="ui-choice-grid" role="group" aria-label="Qui doit agir ensuite">
            <button
              type="button"
              className={`ui-choice-card ui-choice-card--nous ${waitingOn === 'nous' ? 'ui-choice-card--active' : ''}`}
              onClick={() => setWaitingOn('nous')}
              aria-pressed={waitingOn === 'nous'}
            >
              <IconAlertTriangle size={18} />
              <span className="ui-choice-card__label">Nous</span>
              <span className="ui-choice-card__sublabel">Action équipe</span>
            </button>

            <button
              type="button"
              className={`ui-choice-card ui-choice-card--client ${waitingOn === 'client' ? 'ui-choice-card--active' : ''}`}
              onClick={() => setWaitingOn('client')}
              aria-pressed={waitingOn === 'client'}
            >
              <IconUser size={18} />
              <span className="ui-choice-card__label">Client</span>
              <span className="ui-choice-card__sublabel">En attente</span>
            </button>

            <button
              type="button"
              className={`ui-choice-card ui-choice-card--dept ${waitingOn === 'departement' ? 'ui-choice-card--active' : ''}`}
              onClick={() => setWaitingOn('departement')}
              aria-pressed={waitingOn === 'departement'}
            >
              <IconBuilding size={18} />
              <span className="ui-choice-card__label">Département</span>
              <span className="ui-choice-card__sublabel">Service tiers</span>
            </button>
          </div>
        </div>

        {waitingOn === 'departement' && (
          <Input
            id="new-dept-field"
            label="Département concerné"
            value={departement}
            onChange={e => setDepartement(e.target.value)}
            placeholder="Ex : Comptabilité, Logistique, SAV..."
            list="new-dept-list"
            required
            icon={IconBuilding}
          />
        )}
        <datalist id="new-dept-list">
          {knownDepartments.map(dep => (
            <option key={dep} value={dep} />
          ))}
        </datalist>

        {error && <div className="ui-field__msg ui-field__msg--error" style={{ marginTop: 8 }}>{error}</div>}
      </form>
    </Modal>
  )
}
