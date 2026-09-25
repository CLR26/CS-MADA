import StatusPill from './ui/StatusPill'
import { formatDateTime, formatDueDate, getRequestDueState } from '../lib/dates'

const dueInfo = (request, now) => ({
  label: request.status === 'Resolved' && request.customer_feedback_due_at
    ? `Clôturée · ${formatDateTime(request.customer_feedback_due_at)}`
    : formatDueDate(request.customer_feedback_due_at, now),
  state: getRequestDueState(request, now),
})

export default function SpreadsheetGrid({ demandes = [], selectedId, onSelectQuery, agents = [], categories = [], carriers = [], teamIds = {}, externalStatuses = {}, loading = false, onStatusChange, savingIds = new Set(), now = new Date() }) {
  const agentName = id => agents.find(agent => agent.id === id)?.name || 'Non attribué'
  const categoryName = id => categories.find(item => item.id === id)?.name || 'À classifier'
  const carrierName = id => carriers.find(item => item.id === id)?.name || 'Inconnu'
  const teamName = id => id === teamIds['MADA-OPS'] ? 'MADA-OPS' : id === teamIds['CS-MADA'] ? 'CS-MADA' : '—'
  if (loading && !demandes.length) return <div className="table-empty-cell">Chargement des demandes…</div>
  return <div className="table-container"><table className="ops-table">
    <thead><tr><th>Priority</th><th>Case · customer</th><th>Channel</th><th>Category</th><th>Carrier</th><th>Current team</th><th>Tier / external</th><th>Assignee</th><th>Status</th><th>Next customer update</th><th>Last activity</th></tr></thead>
    <tbody>{!demandes.length ? <tr><td colSpan={11} className="table-empty-cell">Aucune demande dans cette vue.</td></tr> : demandes.map(d => {
      const due = dueInfo(d, now)
      const external = externalStatuses[d.id]
      return <tr key={d.id} tabIndex={0} aria-selected={selectedId === d.id} className={`table-row ${selectedId === d.id ? 'is-selected' : ''}`} onClick={() => onSelectQuery(d.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectQuery(d.id) } }}>
        <td><span className={`priority-badge priority-badge--${d.priority || 'normal'}`}>{d.priority === 'urgent' ? 'Urgent' : d.priority === 'high' ? 'High' : d.priority === 'low' ? 'Low' : 'Normal'}</span></td>
        <td><span className="cell-text cell-text--bold">{d.case_reference || 'Case'} · {d.customer_name}</span><span className="cell-subtext">Owner: {agentName(d.case_owner_id || d.owner_id)} · {d.tracking_number || d.phone || d.email || 'No contact reference'}</span><span className="cell-subtext cell-text--truncate" title={d.query}>{d.query}</span></td>
        <td>{d.initial_channel === 'E-mail' ? 'Email' : d.initial_channel}</td>
        <td>{categoryName(d.category_id)}</td><td>{carrierName(d.carrier_id)}</td>
        <td><span className="stage-badge">{teamName(d.current_team_id)}</span></td>
        <td>{Number(d.current_escalation_tier) ? <span className="stage-badge">T{d.current_escalation_tier}{Number(d.current_escalation_tier)===2 ? ` · ${external?.status || 'SEZ-OPS'}` : ''}</span> : '—'}</td>
        <td>{agentName(d.current_assignee_id || d.responsible_id)}</td>
        <td onClick={e => e.stopPropagation()}><StatusPill status={d.current_status || d.status} /></td>
        <td><span className={`due-indicator due-indicator--${due.state}`}>{due.state === 'overdue' ? '!' : '◷'} {due.label}</span></td>
        <td className="cell-subtext">{formatDateTime(d.updated_at)}</td>
      </tr>
    })}</tbody></table>
    <div className="mobile-cards">{!demandes.length ? <div className="mobile-empty">Aucune demande dans cette vue.</div> : demandes.map(d => {
      const due = dueInfo(d, now)
      return <button key={d.id} className={`mobile-card ${selectedId === d.id ? 'is-selected' : ''}`} onClick={() => onSelectQuery(d.id)}>
        <div className="mobile-card__header"><span className="mobile-card__name">{d.customer_name}</span><StatusPill status={d.current_status || d.status} /></div>
        <div className="cell-subtext">{d.case_reference || 'Case'} · {d.tracking_number || 'No tracking'} · {d.initial_channel} · {categoryName(d.category_id)} · {carrierName(d.carrier_id)}</div>
        <div className="mobile-card__query">{d.query}</div>
        <div className="mobile-card__assignment"><span>Owner: {agentName(d.case_owner_id || d.owner_id)}</span><span>{teamName(d.current_team_id)} · {agentName(d.current_assignee_id || d.responsible_id)}</span>{Number(d.current_escalation_tier)===2 && <span>External: {externalStatuses[d.id]?.status || 'SEZ-OPS'}</span>}</div>
        <div className="mobile-card__footer"><span className={`due-indicator due-indicator--${due.state}`}>{due.label}</span><span>Dernière activité · {formatDateTime(d.updated_at)}</span></div>
      </button>
    })}</div>
  </div>
}
