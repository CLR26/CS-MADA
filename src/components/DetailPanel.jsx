import { useEffect, useState } from 'react'
import StatusPill from './ui/StatusPill'
import WorkflowActionModal from './WorkflowActionModal'
import { STATUSES } from '../lib/constants'
import { formatDateTime, fromLocalDateTimeInput, getRequestDueState, toLocalDateTimeInput } from '../lib/dates'

const eventTitle = event => ({
  created: 'Demande créée', case_created: 'Customer query received', internal_note: 'Internal note', tier1_acknowledged: 'Tier 1 acknowledged', stage_changed: 'Étape modifiée', responsible_changed: 'Responsable modifié',
  owner_changed: 'Owner modifié', status_changed: 'Statut modifié', resolved: 'Dossier résolu',
  due_date_changed: 'Échéance client modifiée', note: 'Note / échange', field_changed: 'Demande mise à jour',
  tier1_escalated: 'Escalade vers MADA-OPS · Tier 1', tier1_response: 'Réponse MADA-OPS', returned_to_cs: 'Retour à CS-MADA',
  tier2_external_sent: 'Handoff externe vers SEZ-OPS · Tier 2', external_response_received: 'Réponse SEZ-OPS enregistrée',
  tier2_returned_to_cs: 'Suivi externe terminé · retour à CS-MADA', customer_update_sent: 'Mise à jour client envoyée',
  case_resolved: 'Dossier résolu', case_closed: 'Dossier fermé', case_reopened: 'Dossier rouvert',
}[event.kind] || 'Activité')

export default function DetailPanel({ demande, events = [], agents = [], operationsAgents = [], csAgents = [], categories = [], carriers = [], lifecycleReady = false, onUpdate, onWorkflow, onSuggestTier1, onAddEvent, onClose, saving = false, now = new Date() }) {
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState('Internal')
  const [savingEvent, setSavingEvent] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const [nextAction, setNextAction] = useState(demande.next_action || '')
  const [dueDate, setDueDate] = useState(toLocalDateTimeInput(demande.customer_feedback_due_at))
  const [workflowAction, setWorkflowAction] = useState(null)
  const [suggestedAssigneeId, setSuggestedAssigneeId] = useState('')

  useEffect(() => setNextAction(demande.next_action || ''), [demande.next_action])
  useEffect(() => setDueDate(toLocalDateTimeInput(demande.customer_feedback_due_at)), [demande.customer_feedback_due_at])

  const dueState = getRequestDueState(demande, now)
  const inOperations = demande.current_stage === 'Opérations' || demande.current_team_key === 'MADA-OPS'
  const ownerOptions = csAgents.filter(agent => agent.active || agent.id === (demande.case_owner_id || demande.owner_id))
  const assigneePool = inOperations ? operationsAgents : csAgents
  const assignableAgents = assigneePool.filter(agent => agent.active || agent.id === (demande.current_assignee_id || demande.responsible_id))
  const activeExternal = [...(demande.escalations || [])].reverse().find(item => item.tier === 2 && !item.resolved_at)
  const tier = Number(demande.current_escalation_tier || (inOperations ? 1 : 0))

  async function submit(event) {
    event.preventDefault()
    if (!content.trim() || savingEvent) return
    setSavingEvent(true)
    setSubmissionError('')
    try {
      await onAddEvent(demande.id, content.trim(), channel)
      setContent('')
    } catch (error) {
      setSubmissionError(error.message || 'Impossible d’ajouter l’activité. Réessaie.')
    } finally {
      setSavingEvent(false)
    }
  }

  async function saveDueDate(event) {
    const draft = event.currentTarget.value
    const nextValue = fromLocalDateTimeInput(draft)
    if (draft === toLocalDateTimeInput(demande.customer_feedback_due_at)) return
    const saved = await onUpdate(demande.id, { customer_feedback_due_at: nextValue })
    if (!saved) setDueDate(toLocalDateTimeInput(demande.customer_feedback_due_at))
  }

  async function saveNextAction(event) {
    const nextValue = event.currentTarget.value.trim() || null
    if (nextValue === (demande.next_action || null)) { setNextAction(nextValue || ''); return }
    const saved = await onUpdate(demande.id, { next_action: nextValue })
    if (!saved) setNextAction(demande.next_action || '')
  }

  async function openTier1Escalation() {
    setSuggestedAssigneeId(await onSuggestTier1?.(demande.id) || '')
    setWorkflowAction('tier1')
  }

  return <aside className="detail-panel" aria-label="Détail de la demande">
    <div className="panel-header">
      <div className="panel-header-main">
        <div className="panel-identity">
          <div className="eyebrow">{demande.case_reference || 'DEMANDE'} · {demande.initial_channel}</div>
          <h2 className="panel-name">{demande.customer_name || 'Client inconnu'}</h2>
          <div className="panel-track-no">{demande.tracking_number || 'Sans numéro de tracking'}</div>
        </div>
        <div className="panel-header-actions">{lifecycleReady && demande.current_status === 'Resolved' && <button type="button" className="workflow-close-button" onClick={() => setWorkflowAction('close')}>Close case</button>}<button type="button" className="panel-close-btn" onClick={onClose} aria-label="Fermer">×</button></div>
      </div>
      {(demande.phone || demande.email) && <div className="panel-contact">{demande.phone && <span>{demande.phone}</span>}{demande.email && <span>{demande.email}</span>}</div>}
    </div>

    <div className="panel-body">
      {lifecycleReady && <section className="panel-section">
        <h3 className="panel-section-title">Lifecycle actions</h3>
        <div className="workflow-ownership"><span><small>Current team</small><b>{inOperations ? 'MADA-OPS' : 'CS-MADA'}</b></span><span><small>Escalation tier</small><b>{tier ? `Tier ${tier}` : 'None'}</b></span><span><small>Current assignee</small><b>{agents.find(agent => agent.id === (demande.current_assignee_id || demande.responsible_id))?.name || 'Unassigned'}</b></span></div>
        <div className="workflow-ownership workflow-ownership--detail"><span><small>Case owner</small><b>{agents.find(agent => agent.id === (demande.case_owner_id || demande.owner_id))?.name || 'Unassigned'}</b></span>{activeExternal && <><span><small>External destination</small><b>SEZ-OPS · {activeExternal.status}</b></span><span><small>Internal follow-up owner</small><b>{agents.find(agent => agent.id === activeExternal.internal_followup_owner_id)?.name || 'Unassigned'}</b></span><span><small>Next follow-up</small><b>{formatDateTime(activeExternal.due_at, 'Not set')}</b></span></>}</div>
        <div className="workflow-actions">
      {(demande.current_status || demande.status) === 'Resolved' || (demande.current_status || demande.status) === 'Closed' ? <button type="button" onClick={() => setWorkflowAction('reopen')}>Reopen case</button> : <>
            {inOperations && tier === 1 && ![...(demande.escalations || [])].reverse().find(item => item.tier === 1 && !item.resolved_at)?.acknowledged_at && <button type="button" onClick={() => setWorkflowAction('ackTier1')}>Acknowledge Tier 1</button>}
            {inOperations && tier !== 2 && <><button type="button" onClick={() => setWorkflowAction('returnToCs')}>Return to CS-MADA</button><button type="button" onClick={() => setWorkflowAction('tier2')}>Escalate to SEZ-OPS</button></>}
            {activeExternal && <><button type="button" onClick={() => setWorkflowAction('externalResponse')}>Record SEZ-OPS response</button><button type="button" onClick={() => setWorkflowAction('tier2Return')}>Complete external follow-up</button></>}
            {!inOperations && !activeExternal && <button type="button" onClick={openTier1Escalation}>Escalate to MADA-OPS</button>}
            {!inOperations && <button type="button" className="workflow-action-secondary" onClick={() => setWorkflowAction('customerUpdate')}>Log customer update</button>}
            <button type="button" className="workflow-action-secondary" onClick={() => setWorkflowAction('resolve')}>Resolve case</button>
          </>}
        </div>
        {!!demande.escalations?.length && <div className="escalation-history">{[...demande.escalations].reverse().map(item => <article key={item.id}><b>Tier {item.tier} · {item.external_destination || 'MADA-OPS'}</b><span>{item.status} · {formatDateTime(item.opened_at)}</span><small>{item.reason}</small></article>)}</div>}
      </section>}
      {!lifecycleReady && <div className="workflow-unavailable" role="status">Lifecycle actions will be available after the workspace database migration is installed.</div>}
      <section className="panel-section">
        <h3 className="panel-section-title">Suivi du dossier</h3>
        <div className="detail-fields">
          <div className="detail-field"><span>Statut</span><StatusPill status={demande.current_status || demande.status} /></div>
          {lifecycleReady && <><label><span>Catégorie</span><select className="panel-select" disabled={saving} value={demande.category_id || ''} onChange={event => onUpdate(demande.id, { category_id: event.target.value || null })}><option value="">À classifier</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Transporteur</span><select className="panel-select" disabled={saving} value={demande.carrier_id || ''} onChange={event => onUpdate(demande.id, { carrier_id: event.target.value || null })}><option value="">Inconnu</option>{carriers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Priorité</span><select className="panel-select" disabled={saving} value={demande.priority || 'normal'} onChange={event => onUpdate(demande.id, { priority: event.target.value })}><option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option></select></label></>}
          <div className="detail-field"><span>Current team</span><b>{inOperations ? 'MADA-OPS' : 'CS-MADA'}</b></div>
          <label><span>Case owner · customer relationship</span><select className="panel-select" disabled={saving} value={demande.case_owner_id || demande.owner_id || ''} onChange={event => onUpdate(demande.id, { owner_id: event.target.value || null })}><option value="" disabled>Unassigned</option>{ownerOptions.map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.role}{agent.active ? '' : ' · Inactive'}</option>)}</select></label>
          <label><span>Current assignee · next action</span><select className="panel-select" disabled={saving} value={demande.current_assignee_id || demande.responsible_id || ''} onChange={event => onUpdate(demande.id, { responsible_id: event.target.value || null })}><option value="">Unassigned</option>{assignableAgents.map(agent => <option value={agent.id} key={agent.id}>{agent.name} · {agent.role}{agent.active ? '' : ' · Inactive'}</option>)}</select></label>
          <label className="due-field"><span>Next customer update · {dueState === 'resolved' ? 'Closed' : dueState === 'overdue' ? 'Overdue' : dueState === 'due_today' ? 'Due today' : dueState === 'upcoming' ? 'Upcoming' : 'Not set'}</span><span className={`due-indicator due-indicator--${dueState}`}>{demande.next_customer_update_at || demande.customer_feedback_due_at ? formatDateTime(demande.next_customer_update_at || demande.customer_feedback_due_at, 'Invalid date') : 'No deadline'}</span><input type="datetime-local" className="panel-datetime-input" disabled={saving} value={dueDate} onChange={event => setDueDate(event.target.value)} onBlur={saveDueDate} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} /></label>
          {lifecycleReady && <div className="detail-field"><span>Tier 1 response due</span><b>{formatDateTime(demande.tier1_response_due_at, 'Not set')}</b></div>}
          {lifecycleReady && <div className="detail-field"><span>Tier 2 follow-up due</span><b>{formatDateTime(demande.tier2_followup_due_at, 'Not set')}</b></div>}
          {lifecycleReady && <div className="detail-field"><span>Resolution target</span><b>{formatDateTime(demande.resolution_due_at, 'Not set')}</b></div>}
          <label className="field-wide"><span>Prochaine action interne</span><input className="panel-select" disabled={saving} placeholder="À préciser" value={nextAction} onChange={event => setNextAction(event.target.value)} onBlur={saveNextAction} /></label>
        </div>
      </section>

      <section className="panel-section">
        <h3 className="panel-section-title">Demande initiale</h3>
        <div className="panel-query-text">{demande.query || 'Aucun détail fourni.'}</div>
      </section>

      <section className="panel-section panel-timeline">
        <div className="timeline-heading"><h3 className="panel-section-title">Timeline</h3><span className="timeline-heading__meta">{saving && <span className="save-indicator" role="status">Enregistrement…</span>}{events.length} activité{events.length === 1 ? '' : 's'}</span></div>
        {!events.length ? <p className="activity-empty">Aucune activité enregistrée.</p> : <div className="activity-list">{events.map(event => {
          const system = event.channel === 'System' || event.kind === 'field_changed'
          const statusChange = event.metadata?.field === 'status' && STATUSES.includes(event.metadata.from) && STATUSES.includes(event.metadata.to)
          return <article key={event.id} className={`activity-entry${system ? ' activity-entry--system' : ''}`}>
            <span className="activity-marker" aria-hidden="true">{system ? '·' : '•'}</span>
            <div className="activity-main">
              <div className="activity-heading"><b>{eventTitle(event)}</b>{event.channel && <span className="activity-channel">{event.channel}</span>}</div>
              <div className="activity-byline"><span>{event.author_name || (system ? 'Système' : 'Agent non identifié')}</span><time dateTime={event.created_at || undefined}>{formatDateTime(event.created_at, 'Date inconnue')}</time></div>
              {statusChange ? <p className="activity-text">Statut : <StatusPill status={event.metadata.from} /> → <StatusPill status={event.metadata.to} /></p> : event.content && <p className="activity-text">{event.content}</p>}
            </div>
          </article>
        })}</div>}
      </section>
    </div>

    <form className="panel-composer" onSubmit={submit}>
      <textarea className="composer-textarea" aria-label={lifecycleReady ? 'Internal note' : 'Contenu de l’activité'} placeholder={lifecycleReady ? 'Add an internal note…' : 'Ajouter une note ou tracer un échange…'} rows="2" value={content} onChange={event => setContent(event.target.value)} />
      {submissionError && <p className="form-error" role="alert">{submissionError}</p>}
      <div className="composer-footer">{!lifecycleReady && <select aria-label="Canal de l’activité" className="composer-channel-select" value={channel} onChange={event => setChannel(event.target.value)}><option>Internal</option><option>WhatsApp</option><option>E-mail</option></select>}<button type="submit" className="btn-submit" disabled={savingEvent || !content.trim()}>{savingEvent ? 'Ajout…' : lifecycleReady ? 'Add internal note' : 'Ajouter à la timeline'}</button></div>
    </form>
    {workflowAction && <WorkflowActionModal action={workflowAction} agents={operationsAgents} suggestedAssigneeId={suggestedAssigneeId} channel={demande.initial_channel === 'E-mail' ? 'E-mail' : 'WhatsApp'} onSubmit={onWorkflow} onClose={() => setWorkflowAction(null)} />}
  </aside>
}
