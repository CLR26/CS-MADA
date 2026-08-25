import Badge from './ui/Badge'
import { formatRelative, formatDateTime, isStale } from '../lib/time'
import { IconAlertTriangle, IconBuilding } from '../lib/icons'

export default function RequestRow({ demande, isSelected, onOpen }) {
  const isDone = !!demande.resolved_at
  const stateClass = isDone ? 'done' : demande.waiting_on
  const stale = !isDone && isStale(demande.last_update_at)
  const situationDiffersFromObjet = demande.situation && demande.situation.trim() !== demande.objet.trim()

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(demande.id)
    }
  }

  return (
    <div
      className={`request-row ${isSelected ? 'request-row--selected' : ''} ${stale ? 'request-row--stale' : ''}`}
      onClick={() => onOpen(demande.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${demande.client_ref} — ${demande.objet}${stale ? ' — Attention : sans mise à jour depuis plus de 48 heures' : ''}`}
    >
      {/* Lateral indicator stripe */}
      <div className={`request-row__stripe request-row__stripe--${stateClass}`} />

      {/* Client & Objet */}
      <div className="request-row__client-block">
        <div className="request-row__client-name">{demande.client_ref}</div>
        <div className="request-row__objet" title={demande.objet}>{demande.objet}</div>
      </div>

      {/* Situation actuelle */}
      <div className="request-row__situation-block">
        {situationDiffersFromObjet ? (
          <span>{demande.situation}</span>
        ) : (
          <span className="request-row__new-tag">Nouvelle demande enregistrée</span>
        )}
        {demande.waiting_on === 'departement' && demande.departement && (
          <span className="request-row__dept-tag">
            <IconBuilding size={11} /> {demande.departement}
          </span>
        )}
      </div>

      {/* Qui doit agir / Statut & Alerte */}
      <div className="request-row__who-block">
        <Badge
          state={stateClass}
          label={
            isDone
              ? 'Traité'
              : demande.waiting_on === 'nous'
              ? 'Nous'
              : demande.waiting_on === 'client'
              ? 'Client'
              : 'Département'
          }
          size="sm"
        />
        {stale && (
          <Badge
            state="stale"
            label="> 48h sans màj"
            size="sm"
          />
        )}
      </div>

      {/* Métadonnées & Horodatage */}
      <div
        className={`request-row__time-block ${stale ? 'request-row__time-block--stale' : ''}`}
        title={`Créée : ${formatDateTime(demande.created_at)}\nDernière mise à jour : ${formatDateTime(demande.last_update_at)}`}
      >
        {formatRelative(demande.last_update_at)}
      </div>
    </div>
  )
}
