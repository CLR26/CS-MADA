import { useState } from 'react'
import Modal from './ui/Modal'
import { fromLocalDateTimeInput } from '../lib/dates'

export default function NewQueryModal({ agents = [], categories = [], carriers = [], lifecycleReady = false, onCreate, onClose }) {
  const [form, setForm] = useState({ customer_name: '', phone: '', email: '', tracking_number: '', query: '', initial_channel: 'WhatsApp', category_id: '', carrier_id: '', priority: 'normal', customer_feedback_due_at: '', next_action: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const change = key => event => setForm(value => ({ ...value, [key]: event.target.value }))
  async function submit(event) {
    event.preventDefault(); setError('')
    if (!form.customer_name.trim() || !form.query.trim()) { setError('Le nom du client et le sujet sont obligatoires.'); return }
    setSaving(true)
    try { await onCreate({ ...form, category_id: form.category_id || null, carrier_id: form.carrier_id || null, customer_name: form.customer_name.trim(), query: form.query.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, tracking_number: form.tracking_number.trim().toUpperCase() || null, customer_feedback_due_at: fromLocalDateTimeInput(form.customer_feedback_due_at), next_action: form.next_action.trim() || null }) }
    catch (reason) { setError(reason.message || 'Création impossible. Réessayez.'); setSaving(false) }
  }
  return <Modal isOpen onClose={onClose} title="Nouvelle demande" maxWidth="520px" footer={<div className="new-query-footer"><button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>Annuler</button><button type="submit" form="create-query" className="btn-submit" disabled={saving}>{saving ? 'Création…' : 'Créer la demande'}</button></div>}>
    <form id="create-query" className="new-query-form" onSubmit={submit}>
      <div className="form-grid-2"><label className="form-row"><span className="form-label">Client *</span><input className="form-input" autoFocus value={form.customer_name} onChange={change('customer_name')} /></label><label className="form-row"><span className="form-label">Canal initial</span><select className="form-input" value={form.initial_channel} onChange={change('initial_channel')}><option>WhatsApp</option><option>E-mail</option></select></label></div>
      {lifecycleReady && <><div className="form-grid-2"><label className="form-row"><span className="form-label">Catégorie</span><select className="form-input" value={form.category_id} onChange={change('category_id')}><option value="">À classifier</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-row"><span className="form-label">Transporteur</span><select className="form-input" value={form.carrier_id} onChange={change('carrier_id')}><option value="">Inconnu</option>{carriers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label className="form-row"><span className="form-label">Priorité</span><select className="form-input" value={form.priority} onChange={change('priority')}><option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option></select></label></>}
      <div className="form-grid-2"><label className="form-row"><span className="form-label">Téléphone</span><input className="form-input" value={form.phone} onChange={change('phone')} /></label><label className="form-row"><span className="form-label">E-mail</span><input type="email" className="form-input" value={form.email} onChange={change('email')} /></label></div>
      <label className="form-row"><span className="form-label">Numéro de tracking</span><input className="form-input form-input--mono" value={form.tracking_number} onChange={change('tracking_number')} /></label>
      <label className="form-row"><span className="form-label">Demande client *</span><textarea className="form-textarea" rows="4" value={form.query} onChange={change('query')} /></label>
      <div className="form-grid-2"><label className="form-row"><span className="form-label">Next customer update due *</span><input type="datetime-local" className="form-input" value={form.customer_feedback_due_at} onChange={change('customer_feedback_due_at')} required /></label><label className="form-row"><span className="form-label">Responsable initial</span><select className="form-input" value={form.responsible_id || ''} onChange={change('responsible_id')}><option value="">Moi / non attribué</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label></div>
      <label className="form-row"><span className="form-label">Prochaine action</span><input className="form-input" placeholder="Ex. vérifier le suivi du colis" value={form.next_action} onChange={change('next_action')} /></label>
      {error && <div className="form-error">{error}</div>}
    </form>
  </Modal>
}
