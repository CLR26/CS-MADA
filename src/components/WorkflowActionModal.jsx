import { useState } from 'react'
import Modal from './ui/Modal'
import { fromLocalDateTimeInput, toLocalDateTimeInput } from '../lib/dates'

const headings = {
  tier1: 'Escalate to MADA-OPS', returnToCs: 'Return case to CS-MADA',
  tier2: 'External handoff to SEZ-OPS', externalResponse: 'Record SEZ-OPS response', tier2Return: 'Complete SEZ-OPS follow-up',
  customerUpdate: 'Log customer update', resolve: 'Resolve case', reopen: 'Reopen case',
}
const defaults = {
  tier1: { reason: '', requested_action: '', handoff_note: '', assignee_id: '', due_at: '' },
  returnToCs: { response: '', next_customer_update_at: '' },
  tier2: { reason: '', requested_action: '', information_sent: '', followup_owner_id: '', external_reference: '', due_at: '' },
  externalResponse: { received_at: toLocalDateTimeInput(new Date()), response: '', instructions: '', references: '', next_action: '' },
  tier2Return: { result: '' },
  customerUpdate: { channel: 'WhatsApp', content: '', next_update_at: '' },
  resolve: { confirmation: '' }, reopen: { reason: '' },
}

export default function WorkflowActionModal({ action, agents = [], channel = 'WhatsApp', onSubmit, onClose }) {
  const [form, setForm] = useState(() => ({ ...defaults[action], ...(action === 'customerUpdate' ? { channel } : {}) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = key => event => setForm(value => ({ ...value, [key]: event.target.value }))
  const operations = agents.filter(agent => agent.active && /opération|ops/i.test(agent.role || ''))
  const field = (key, label, { type = 'text', required = false, multiline = false, options } = {}) => (
    <label className="form-row" key={key}><span className="form-label">{label}{required ? ' *' : ''}</span>
      {options ? <select className="form-input" value={form[key]} onChange={set(key)} required={required}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
        : multiline ? <textarea className="form-textarea" rows="3" value={form[key]} onChange={set(key)} required={required} />
          : <input className="form-input" type={type} value={form[key]} onChange={set(key)} required={required} />}
    </label>
  )

  async function submit(event) {
    event.preventDefault(); setError(''); setSaving(true)
    const payload = { ...form }
    for (const key of ['due_at', 'next_customer_update_at', 'next_update_at']) payload[key] = fromLocalDateTimeInput(payload[key])
    if (payload.received_at) payload.received_at = fromLocalDateTimeInput(payload.received_at)
    if (action === 'externalResponse') payload.references = payload.references.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    try { await onSubmit(action, payload); onClose() }
    catch (reason) { setError(reason.message || 'Action impossible. Réessaie.'); setSaving(false) }
  }

  return <Modal isOpen onClose={saving ? () => {} : onClose} title={headings[action]} maxWidth="560px" footer={<div className="new-query-footer"><button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>Annuler</button><button type="submit" form="workflow-action" className="btn-submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Confirmer'}</button></div>}>
    <form id="workflow-action" className="new-query-form" onSubmit={submit}>
      {action === 'tier1' && <>{field('reason', 'Reason', { required: true })}{field('requested_action', 'Requested action', { required: true, multiline: true })}{field('handoff_note', 'Internal handoff note', { multiline: true })}{field('assignee_id', 'MADA-OPS assignee', { required: true, options: [['', 'Choose an assignee'], ...operations.map(agent => [agent.id, agent.name])] })}{field('due_at', 'Tier 1 response deadline', { type: 'datetime-local', required: true })}</>}
      {action === 'returnToCs' && <>{field('response', 'Operations response / result', { required: true, multiline: true })}{field('next_customer_update_at', 'Next customer update due', { type: 'datetime-local' })}</>}
      {action === 'tier2' && <>{field('reason', 'Reason for SEZ-OPS handoff', { required: true })}{field('requested_action', 'Requested action', { required: true, multiline: true })}{field('information_sent', 'Information sent to SEZ-OPS', { multiline: true })}{field('external_reference', 'External reference')}{field('followup_owner_id', 'Internal follow-up owner', { required: true, options: [['', 'Choose an internal owner'], ...operations.map(agent => [agent.id, agent.name])] })}{field('due_at', 'Next follow-up deadline', { type: 'datetime-local', required: true })}</>}
      {action === 'externalResponse' && <>{field('received_at', 'Response received at', { type: 'datetime-local', required: true })}{field('response', 'Response content', { required: true, multiline: true })}{field('instructions', 'Operational instructions', { multiline: true })}{field('references', 'References (one per line)', { multiline: true })}{field('next_action', 'Next internal action', { required: true })}</>}
      {action === 'tier2Return' && field('result', 'Follow-up result', { required: true, multiline: true })}
      {action === 'customerUpdate' && <>{field('channel', 'Customer channel', { options: [['WhatsApp', 'WhatsApp'], ['E-mail', 'Email']] })}{field('content', 'Message sent to customer', { required: true, multiline: true })}{field('next_update_at', 'Next customer update due', { type: 'datetime-local', required: true })}</>}
      {action === 'resolve' && <>{field('confirmation', 'Resolution summary', { required: true, multiline: true })}</>}
      {action === 'reopen' && <>{field('reason', 'Why is this case reopening?', { required: true, multiline: true })}</>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
  </Modal>
}
