import { useEffect, useState } from 'react'
import StatusPill from './ui/StatusPill'

const STAGES = ['CS WhatsApp', 'CS E-mail', 'Opérations']
const localInputValue = value => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const eventTitle = event => ({ created: 'Demande créée', stage_changed: 'Étape modifiée', responsible_changed: 'Responsable modifié', owner_changed: 'Owner modifié', status_changed: 'Statut modifié', resolved: 'Dossier résolu', due_date_changed: 'Échéance client modifiée', note: 'Note / échange', field_changed: 'Demande mise à jour' }[event.kind] || event.kind)

export default function DetailPanel({ demande, events = [], agents = [], onUpdate, onAddEvent, onClose }) {
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState('Internal')
  const [saving, setSaving] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const [nextAction, setNextAction] = useState(demande.next_action || '')
  useEffect(() => setNextAction(demande.next_action || ''), [demande.next_action])
  const agentName = id => agents.find(agent => agent.id === id)?.name || 'Non attribué'
  const assignableAgents = agents.filter(agent => agent.active || agent.id === demande.owner_id || agent.id === demande.responsible_id)
  const due = demande.customer_feedback_due_at ? new Date(demande.customer_feedback_due_at) : null
  const dueState = !due ? 'none' : due < new Date() && due.toDateString() !== new Date().toDateString() ? 'overdue' : due.toDateString() === new Date().toDateString() ? 'due_today' : 'upcoming'
  async function submit(event) {
    event.preventDefault()
    if (!content.trim() || saving) return
    setSaving(true)
    setSubmissionError('')
    try { await onAddEvent(demande.id, content.trim(), channel); setContent('') }
    catch (error) { setSubmissionError(error.message || 'Impossible d’ajouter l’activité. Réessaie.') }
    finally { setSaving(false) }
  }
  return <aside className="detail-panel" aria-label="Détail de la demande">
    <div className="panel-header"><div className="panel-header-main"><div><div className="eyebrow">DEMANDE · {demande.initial_channel}</div><h2 className="panel-name">{demande.customer_name}</h2><div className="panel-track-no">{demande.tracking_number || 'Sans numéro de tracking'}</div></div><button type="button" className="panel-close-btn" onClick={onClose} aria-label="Fermer">×</button></div>
      <div className="panel-contact">{demande.phone && <span>{demande.phone}</span>}{demande.email && <span>{demande.email}</span>}</div>
    </div>
    <div className="panel-body">
      <section className="panel-section"><h3 className="panel-section-title">Suivi</h3><div className="detail-fields">
        <div className="detail-field"><span>Statut</span><StatusPill status={demande.status} editable onChange={status => onUpdate(demande.id, { status })} /></div>
        <label><span>Étape actuelle</span><select className="panel-select" value={demande.current_stage} onChange={event => onUpdate(demande.id, { current_stage: event.target.value })}>{STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label>
        <label><span>Owner du dossier</span><select className="panel-select" value={demande.owner_id || ''} onChange={event => onUpdate(demande.id, { owner_id: event.target.value || null })}><option value="">Non attribué</option>{assignableAgents.map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.role}{agent.active ? '' : ' · Inactif'}</option>)}</select></label>
        <label><span>Responsable de l’action</span><select className="panel-select" value={demande.responsible_id || ''} onChange={event => onUpdate(demande.id, { responsible_id: event.target.value || null })}><option value="">Non attribué</option>{assignableAgents.map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.role}{agent.active ? '' : ' · Inactif'}</option>)}</select></label>
        <label className="due-field"><span>Feedback client attendu</span><span className={`due-indicator due-indicator--${dueState}`}>{dueState === 'overdue' ? 'En retard' : dueState === 'due_today' ? 'Aujourd’hui' : dueState === 'upcoming' ? 'À venir' : 'Non définie'}{due && ` · ${due.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</span><input type="datetime-local" className="panel-datetime-input" value={localInputValue(demande.customer_feedback_due_at)} onChange={event => onUpdate(demande.id, { customer_feedback_due_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
        <label className="field-wide"><span>Prochaine action interne</span><input className="panel-select" placeholder="À préciser" value={nextAction} onChange={event => setNextAction(event.target.value)} onBlur={() => onUpdate(demande.id, { next_action: nextAction.trim() || null })} /></label>
      </div><div className="ownership-summary"><b>{agentName(demande.owner_id)}</b><span>porte le dossier</span><i>→</i><b>{agentName(demande.responsible_id)}</b><span>agit maintenant</span><i>·</i><b>{demande.current_stage}</b><span>·</span><b>{due ? due.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sans délai'}</b></div></section>
      <section className="panel-section"><h3 className="panel-section-title">Demande initiale</h3><div className="panel-query-text">{demande.query}</div></section>
      <section className="panel-section panel-timeline"><div className="timeline-heading"><h3 className="panel-section-title">Timeline</h3><span>{events.length} activité{events.length === 1 ? '' : 's'}</span></div>
        {!events.length && <p className="activity-empty">Aucune activité enregistrée.</p>}
        <div className="activity-list">{events.map(event => <article key={event.id} className="activity-entry"><div className="activity-meta"><span className="activity-dot" /><b>{eventTitle(event)}</b><span>{event.channel}</span></div><p className="activity-text">{event.content}</p><div className="activity-byline">{event.author_name} · {new Date(event.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></article>)}</div>
      </section>
      <form className="panel-composer" onSubmit={submit}><textarea className="composer-textarea" placeholder="Ajouter une note ou tracer un échange…" rows="3" value={content} onChange={event => setContent(event.target.value)} />{submissionError && <p className="form-error">{submissionError}</p>}<div className="composer-footer"><select className="composer-channel-select" value={channel} onChange={event => setChannel(event.target.value)}><option>Internal</option><option>WhatsApp</option><option>E-mail</option></select><button className="btn-submit" disabled={saving || !content.trim()}>{saving ? 'Ajout…' : 'Ajouter à la timeline'}</button></div></form>
    </div>
  </aside>
}
