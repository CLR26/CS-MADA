import StatusPill from './ui/StatusPill'

const dueInfo = value => {
  if (!value) return { label: 'Sans échéance', state: 'none' }
  const date = new Date(value), now = new Date()
  const state = date < now && date.toDateString() !== now.toDateString() ? 'overdue' : date.toDateString() === now.toDateString() ? 'due_today' : 'upcoming'
  const label = state === 'overdue' ? 'En retard' : state === 'due_today' ? 'Aujourd’hui' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  return { label: `${label} · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, state }
}
const stamp = value => value ? new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function SpreadsheetGrid({ demandes = [], selectedId, onSelectQuery, agents = [], loading = false, onStatusChange }) {
  const agentName = id => agents.find(agent => agent.id === id)?.name || '—'
  if (loading && !demandes.length) return <div className="table-empty-cell">Chargement des demandes…</div>
  return <div className="table-container"><table className="ops-table">
    <thead><tr><th>Échéance client</th><th>Client / tracking</th><th>Sujet</th><th>Étape</th><th>Owner</th><th>Responsable</th><th>Statut</th><th>Activité</th></tr></thead>
    <tbody>{!demandes.length ? <tr><td colSpan={8} className="table-empty-cell">Aucune demande dans cette vue.</td></tr> : demandes.map(d => {
      const due = dueInfo(d.customer_feedback_due_at)
      return <tr key={d.id} className={`table-row ${selectedId === d.id ? 'is-selected' : ''}`} onClick={() => onSelectQuery(d.id)}>
        <td><span className={`due-indicator due-indicator--${due.state}`}>{due.state === 'overdue' ? '!' : '◷'} {due.label}</span></td>
        <td><span className="cell-text cell-text--bold">{d.customer_name}</span><span className="cell-subtext">{d.tracking_number || d.phone || d.email || '—'}</span></td>
        <td><span className="cell-text cell-text--truncate" title={d.query}>{d.query}</span></td>
        <td><span className="stage-badge">{d.current_stage}</span></td>
        <td>{agentName(d.owner_id)}</td><td>{agentName(d.responsible_id)}</td>
        <td onClick={e => e.stopPropagation()}><StatusPill status={d.status} editable onChange={status => onStatusChange(d.id, { status })} /></td>
        <td className="cell-subtext">{stamp(d.updated_at)}</td>
      </tr>
    })}</tbody></table>
    <div className="mobile-cards">{demandes.map(d => {
      const due = dueInfo(d.customer_feedback_due_at)
      return <button key={d.id} className={`mobile-card ${selectedId === d.id ? 'is-selected' : ''}`} onClick={() => onSelectQuery(d.id)}>
        <div className="mobile-card__header"><span className="mobile-card__name">{d.customer_name}</span><StatusPill status={d.status} /></div>
        <div className="cell-subtext">{d.tracking_number || 'Sans tracking'} · {d.current_stage}</div>
        <div className="mobile-card__query">{d.query}</div>
        <div className="mobile-card__footer"><span className={`due-indicator due-indicator--${due.state}`}>{due.label}</span><span>{agentName(d.responsible_id)}</span></div>
      </button>
    })}</div>
  </div>
}
