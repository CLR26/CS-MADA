import StatusPill from './ui/StatusPill'
import { formatDateTime, formatDueDate, getRequestDueState } from '../lib/dates'

const dueInfo = (request, now) => ({
  label: request.status === 'Resolved' && request.customer_feedback_due_at
    ? `Clôturée · ${formatDateTime(request.customer_feedback_due_at)}`
    : formatDueDate(request.customer_feedback_due_at, now),
  state: getRequestDueState(request, now),
})

export default function SpreadsheetGrid({ demandes = [], selectedId, onSelectQuery, agents = [], categories = [], carriers = [], loading = false, onStatusChange, savingIds = new Set(), now = new Date() }) {
  const agentName = id => agents.find(agent => agent.id === id)?.name || 'Non attribué'
  const categoryName = id => categories.find(item => item.id === id)?.name || 'À classifier'
  const carrierName = id => carriers.find(item => item.id === id)?.name || 'Inconnu'
  if (loading && !demandes.length) return <div className="table-empty-cell">Chargement des demandes…</div>
  return <div className="table-container"><table className="ops-table">
    <thead><tr><th>Échéance client</th><th>Client / tracking</th><th>Sujet</th><th>Catégorie</th><th>Transporteur</th><th>Priorité</th><th>Étape</th><th>Owner</th><th>Responsable</th><th>Statut</th><th>Activité</th></tr></thead>
    <tbody>{!demandes.length ? <tr><td colSpan={11} className="table-empty-cell">Aucune demande dans cette vue.</td></tr> : demandes.map(d => {
      const due = dueInfo(d, now)
      return <tr key={d.id} tabIndex={0} aria-selected={selectedId === d.id} className={`table-row ${selectedId === d.id ? 'is-selected' : ''}`} onClick={() => onSelectQuery(d.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectQuery(d.id) } }}>
        <td><span className={`due-indicator due-indicator--${due.state}`}>{due.state === 'overdue' ? '!' : '◷'} {due.label}</span></td>
        <td><span className="cell-text cell-text--bold">{d.customer_name}</span><span className="cell-subtext">{d.case_reference || '—'} · {d.tracking_number || d.phone || d.email || '—'}</span></td>
        <td><span className="cell-text cell-text--truncate" title={d.query}>{d.query}</span></td>
        <td>{categoryName(d.category_id)}</td><td>{carrierName(d.carrier_id)}</td><td><span className={`priority-badge priority-badge--${d.priority || 'normal'}`}>{d.priority === 'urgent' ? 'Urgente' : d.priority === 'high' ? 'Haute' : d.priority === 'low' ? 'Basse' : 'Normale'}</span></td>
        <td><span className="stage-badge">{d.current_stage}</span></td>
        <td>{agentName(d.owner_id)}</td><td>{agentName(d.responsible_id)}</td>
        <td onClick={e => e.stopPropagation()}><StatusPill status={d.current_status || d.status} /></td>
        <td className="cell-subtext">{formatDateTime(d.updated_at)}</td>
      </tr>
    })}</tbody></table>
    <div className="mobile-cards">{!demandes.length ? <div className="mobile-empty">Aucune demande dans cette vue.</div> : demandes.map(d => {
      const due = dueInfo(d, now)
      return <button key={d.id} className={`mobile-card ${selectedId === d.id ? 'is-selected' : ''}`} onClick={() => onSelectQuery(d.id)}>
        <div className="mobile-card__header"><span className="mobile-card__name">{d.customer_name}</span><StatusPill status={d.current_status || d.status} /></div>
        <div className="cell-subtext">{d.tracking_number || 'Sans tracking'} · {categoryName(d.category_id)} · {carrierName(d.carrier_id)}</div>
        <div className="mobile-card__query">{d.query}</div>
        <div className="mobile-card__assignment"><span>Owner : {agentName(d.owner_id)}</span><span>Agit : {agentName(d.responsible_id)}</span></div>
        <div className="mobile-card__footer"><span className={`due-indicator due-indicator--${due.state}`}>{due.label}</span><span>Dernière activité · {formatDateTime(d.updated_at)}</span></div>
      </button>
    })}</div>
  </div>
}
