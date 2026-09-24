import { useMemo, useState } from 'react'

const labels = { NEW_REQUEST: 'Nouvelle demande', ASSIGNED_TO_ME: 'Demande assignée', TRANSFERRED_TO_MY_QUEUE: 'Nouvelle demande dans votre périmètre', STATUS_CHANGED: 'Statut modifié', STAGE_CHANGED: 'Changement de périmètre', DUE_SOON: 'Échéance imminente', OVERDUE: 'Demande en retard', NEW_OPERATION_REPLY: 'Réponse des opérations', ACTION_REQUIRED: 'Action requise' }
const icons = { OVERDUE: '!', DUE_SOON: '◷', ASSIGNED_TO_ME: '↗', TRANSFERRED_TO_MY_QUEUE: '⇢', NEW_OPERATION_REPLY: '↩', NEW_REQUEST: '+', STATUS_CHANGED: '◉', STAGE_CHANGED: '⇄', ACTION_REQUIRED: '•' }
const priorityRank = { critical: 0, high: 1, normal: 2, low: 3 }
const dayStart = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date }

export default function NotificationCenter({ notifications, requests, setupError, onOpen, onRead, onReadAll, onClose, preferences, onPreferences, onEnableBrowser, browserState, soundOn, onSoundChange }) {
  const [filter, setFilter] = useState('unread')
  const requestMap = useMemo(() => new Map(requests.map(request => [request.id, request])), [requests])
  const filtered = useMemo(() => notifications.filter(item => {
    if (item.request_id && requestMap.get(item.request_id)?.status === 'Resolved' && ['OVERDUE', 'DUE_SOON', 'ACTION_REQUIRED'].includes(item.type)) return false
    if (filter === 'unread') return !item.read_at
    if (filter === 'critical') return ['critical', 'high'].includes(item.priority)
    if (filter === 'today') return new Date(item.created_at) >= dayStart()
    if (filter === 'older') return new Date(item.created_at) < dayStart()
    return true
  }).sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || new Date(b.created_at) - new Date(a.created_at)), [notifications, filter, requestMap])
  const openNotification = item => { onRead(item); if (item.request_id && requestMap.has(item.request_id)) onOpen(item.request_id); onClose() }
  return <>
    <button className="notification-backdrop" aria-label="Fermer les notifications" onClick={onClose} />
    <aside className="notification-center" aria-label="Centre de notifications">
      <header className="notification-head"><div><h2>Notifications</h2><span>{notifications.filter(item => !item.read_at).length} non lue(s)</span></div><button onClick={onClose} aria-label="Fermer">×</button></header>
      <div className="notification-settings">
        <button className="notification-setting-action" onClick={onEnableBrowser}>Activer les notifications</button>
        <span>{browserState}</span>
        <label><input type="checkbox" checked={soundOn} onChange={event => onSoundChange(event.target.checked)} /> Son</label>
        {Object.entries({ new_requests: 'Nouvelles demandes', assignments: 'Assignations', overdue: 'Demandes en retard', due_soon: 'Échéances imminentes', operation_replies: 'Réponses opérations' }).map(([key, label]) => <label key={key}><input type="checkbox" checked={preferences[key] !== false} onChange={event => onPreferences({ ...preferences, [key]: event.target.checked })} /> {label}</label>)}
      </div>
      <nav className="notification-filters">{[['unread', 'Non lues'], ['all', 'Toutes'], ['critical', 'Prioritaires'], ['today', "Aujourd’hui"], ['older', 'Plus anciennes']].map(([key, label]) => <button key={key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</nav>
      {notifications.some(item => !item.read_at) && <button className="notification-read-all" onClick={onReadAll}>Tout marquer comme lu</button>}
      {setupError && <div className="notification-setup-error" role="status">{setupError}</div>}
      <div className="notification-list">{filtered.length ? filtered.map(item => {
        const request = requestMap.get(item.request_id)
        return <article key={item.id} className={`notification-item priority-${item.priority} ${item.read_at ? 'is-read' : 'is-unread'}`}>
          <button className="notification-main" onClick={() => openNotification(item)}><span className="notification-icon">{icons[item.type] || '•'}</span><span className="notification-copy"><b>{item.title || labels[item.type] || item.type}</b><span>{item.body}</span>{request && <small>#{request.tracking_number || request.id.slice(0, 8)} · {request.customer_name}{request.status === 'Resolved' ? ' · Résolue' : ''}</small>}<time>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at))}</time></span><span className="priority-label">{item.priority}</span>{!item.read_at && <i />}</button>
          {!item.read_at && <button className="notification-mark-read" onClick={() => onRead(item)}>Marquer comme lue</button>}
        </article>
      }) : <div className="notification-empty">Rien ne demande votre attention ici.</div>}</div>
    </aside>
  </>
}
