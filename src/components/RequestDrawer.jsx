import { useEffect, useState } from 'react'
import Drawer from './ui/Drawer'
import Badge from './ui/Badge'
import Button from './ui/Button'
import Select from './ui/Select'
import ActivityFeed from './ActivityFeed'
import { DEPARTMENTS } from '../lib/constants'
import { formatDateTime, formatDuration, isStale } from '../lib/time'
import { IconCheck, IconRotateCcw, IconTrash, IconBuilding, IconUser, IconAlertTriangle } from '../lib/icons'

export default function RequestDrawer({
  demande,
  events = [],
  onUpdate,
  onAddEvent,
  onResolve,
  onReopen,
  onDelete,
  onClose,
}) {
  const [waitingOn, setWaitingOn] = useState(demande?.waiting_on || 'nous')
  const [departement, setDepartement] = useState(demande?.departement || '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  // Mettre à jour l'état interne quand la demande sélectionnée change
  useEffect(() => {
    if (demande) {
      setWaitingOn(demande.waiting_on || 'nous')
      setDepartement(demande.departement || '')
      setError(null)
      setConfirmDelete(false)
      setConfirmClose(false)
    }
  }, [demande])

  if (!demande) return null

  const isResolved = !!demande.resolved_at
  const stale = !isResolved && isStale(demande.last_update_at)

  const dirty =
    waitingOn !== demande.waiting_on ||
    departement !== (demande.departement || '')

  function handleRequestClose() {
    if (confirmDelete) {
      setConfirmDelete(false)
      return
    }
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

  async function handleSave() {
    if (waitingOn === 'departement' && !departement) {
      setError('Veuillez sélectionner le département concerné.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onUpdate(demande.id, {
        waiting_on: waitingOn,
        departement: waitingOn === 'departement' ? departement : null,
      })
      onClose()
    } catch {
      setError('Erreur lors de la mise à jour. Veuillez réessayer.')
      setSaving(false)
    }
  }

  async function handleResolveAction() {
    if (waitingOn === 'departement' && !departement) {
      setError('Veuillez sélectionner le département concerné.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onResolve(
        demande.id,
        dirty
          ? {
              waiting_on: waitingOn,
              departement: waitingOn === 'departement' ? departement : null,
            }
          : undefined
      )
      onClose()
    } catch {
      setError('Erreur lors de la clôture du dossier.')
      setSaving(false)
    }
  }

  async function handleReopenAction() {
    setSaving(true)
    setError(null)
    try {
      await onReopen(demande.id)
      onClose()
    } catch {
      setError('Erreur lors de la réouverture.')
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    setSaving(true)
    setError(null)
    try {
      await onDelete(demande.id)
      onClose()
    } catch {
      setError('Erreur lors de la suppression.')
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  const stateClass = isResolved ? 'done' : waitingOn

  return (
    <Drawer
      isOpen={!!demande}
      onClose={handleRequestClose}
      title={demande.client_ref}
      subtitle={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Badge
            state={stateClass}
            label={
              isResolved
                ? 'Dossier traité'
                : waitingOn === 'nous'
                ? 'Action : Notre équipe'
                : waitingOn === 'client'
                ? 'Action : Client'
                : `Action : Département ${departement ? `(${departement})` : ''}`
            }
            size="sm"
          />
          {stale && <Badge state="stale" label="Sans màj depuis +48h" size="sm" />}
        </div>
      }
      width="540px"
      footer={
        <>
          {/* Confirmation de fermeture avec modifications non enregistrées */}
          {confirmClose ? (
            <div className="ui-confirm-box" style={{ width: '100%', margin: 0 }}>
              <span>⚠️ Des modifications non enregistrées seront perdues.</span>
              <div className="ui-confirm-box__actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmClose(false)}
                >
                  Continuer l'édition
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={onClose}
                >
                  Fermer sans enregistrer
                </Button>
              </div>
            </div>
          ) : confirmDelete ? (
            /* Confirmation de suppression définitive */
            <div className="ui-confirm-box" style={{ width: '100%', margin: 0 }}>
              <span>⚠️ Supprimer définitivement cette demande ?</span>
              <div className="ui-confirm-box__actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={saving}
                >
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={saving}
                >
                  {saving ? 'Suppression…' : 'Confirmer la suppression'}
                </Button>
              </div>
            </div>
          ) : (
            /* Actions normales */
            <>
              <Button
                variant="outline-danger"
                size="sm"
                icon={IconTrash}
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                aria-label="Supprimer cette demande"
              >
                Supprimer
              </Button>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isResolved ? (
                  <Button
                    variant="secondary"
                    size="md"
                    icon={IconRotateCcw}
                    onClick={handleReopenAction}
                    disabled={saving}
                  >
                    Rouvrir le dossier
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="md"
                      icon={IconCheck}
                      onClick={handleResolveAction}
                      disabled={saving}
                    >
                      Marquer traité
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleSave}
                      disabled={saving || !dirty}
                    >
                      {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      }
    >
      {/* Carte des détails initiaux */}
      <div className="detail-card">
        <div className="detail-grid">
          <div>
            <div className="detail-grid__item-label">Objet</div>
            <div className="detail-grid__item-value">{demande.objet}</div>
          </div>
          <div>
            <div className="detail-grid__item-label">Agent</div>
            <div className="detail-grid__item-value">{demande.created_by_name || 'Non spécifié'}</div>
          </div>
        </div>
      </div>

      {/* Frise chronologique métadonnées */}
      <div className="detail-meta-timeline">
        <span>Créée : {formatDateTime(demande.created_at)}</span>
        <span>Dernière mise à jour : {formatDateTime(demande.last_update_at)}</span>
        {isResolved && demande.resolved_at && (
          <span style={{ color: 'var(--state-done-text)', fontWeight: 600 }}>
            Traitée en : {formatDuration(new Date(demande.resolved_at) - new Date(demande.created_at))}
          </span>
        )}
      </div>

      {/* Situation actuelle : chronologie opérationnelle unique */}
      <div className="detail-edit-section">
        <label className="ui-label" style={{ marginBottom: 6, display: 'block' }}>
          Situation actuelle
        </label>
        <ActivityFeed
          events={events}
          onSend={isResolved ? undefined : (content, file) => onAddEvent(demande.id, content, file)}
        />
        {isResolved && error && <div className="ui-field__msg ui-field__msg--error">{error}</div>}
      </div>

      {!isResolved && (
        <div className="detail-edit-section">
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
                <span className="ui-choice-card__sublabel">En attente retour</span>
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

          {/* Si département sélectionné */}
          {waitingOn === 'departement' && (
            <Select
              id="detail-dept-select"
              label="Département concerné"
              value={departement}
              onChange={e => setDepartement(e.target.value)}
              options={DEPARTMENTS}
              required
              icon={IconBuilding}
            />
          )}

          {/* Message d'erreur */}
          {error && <div className="ui-field__msg ui-field__msg--error">{error}</div>}
        </div>
      )}
    </Drawer>
  )
}
