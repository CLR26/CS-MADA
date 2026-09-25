import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import SpreadsheetGrid from './components/SpreadsheetGrid'
import DetailPanel from './components/DetailPanel'
import NewQueryModal from './components/NewQueryModal'
import NotificationCenter from './components/NotificationCenter'
import WorkflowActionModal from './components/WorkflowActionModal'
import { ACTIVE_STATUSES, STATUSES, STAGES } from './lib/constants'
import { compareTimestamps, formatDateTime, getRequestDueState } from './lib/dates'
import { supabaseMessage } from './lib/errors'

const mergeRequest = (rows, incoming) => {
  const current = rows.find(row => row.id === incoming.id)
  if (!current) return [incoming, ...rows]
  if (compareTimestamps(current.updated_at, incoming.updated_at) > 0) return rows
  return rows.map(row => row.id === incoming.id ? incoming : row)
}

const vapidBytes = value => {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [demandes, setDemandes] = useState([])
  const [agents, setAgents] = useState([])
  const [categories, setCategories] = useState([])
  const [carriers, setCarriers] = useState([])
  const [lifecycleReady, setLifecycleReady] = useState(false)
  const [events, setEvents] = useState([])
  const [escalations, setEscalations] = useState([])
  const [operationsAgents, setOperationsAgents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [stageFilter, setStageFilter] = useState('all')
  const [responsibleFilter, setResponsibleFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [carrierFilter, setCarrierFilter] = useState('all')
  const [staleOnly, setStaleOnly] = useState(false)
  const [dueFilter, setDueFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortDue, setSortDue] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingIds, setSavingIds] = useState(() => new Set())
  const savingIdsRef = useRef(new Set())
  const [now, setNow] = useState(() => new Date())
  const [notifications, setNotifications] = useState([])
  const [notificationError, setNotificationError] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [preferences, setPreferences] = useState({})
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('cs-mada-notification-sound') === 'true')
  const [browserState, setBrowserState] = useState(() => !('Notification' in window) ? 'Navigateur incompatible' : Notification.permission === 'granted' ? 'Activées' : Notification.permission === 'denied' ? 'Permission refusée' : 'Désactivées')
  const notifiedRef = useRef(new Set())

  const notify = useCallback((message, type = 'success') => setToast({ message, type, key: Date.now() }), [])
  const selected = demandes.find(d => d.id === selectedId) || null
  const activeAgents = agents.filter(a => a.active)
  const currentAgent = agents.find(a => a.user_id === session?.user?.id) || null

  const announce = useCallback(item => {
    const preferenceKey = ({ NEW_REQUEST: 'new_requests', ASSIGNED_TO_ME: 'assignments', OVERDUE: 'overdue', DUE_SOON: 'due_soon', NEW_OPERATION_REPLY: 'operation_replies' })[item.type]
    setNotifications(rows => rows.some(row => row.id === item.id) ? rows : [item, ...rows])
    if (item.read_at) return
    if (item.priority === 'high' || item.priority === 'critical') {
      if (preferences[preferenceKey] !== false) setToast({ message: `${item.title} — ${item.body}`, type: 'warning', key: Date.now(), requestId: item.request_id })
      if (soundOn && preferences[preferenceKey] !== false) {
        try {
          const Context = window.AudioContext || window.webkitAudioContext
          if (Context) {
            const context = new Context()
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.frequency.value = 660
            gain.gain.value = 0.025
            oscillator.connect(gain); gain.connect(context.destination)
            oscillator.start(); oscillator.stop(context.currentTime + 0.11)
            oscillator.onended = () => context.close()
          }
        } catch {}
      }
      if (preferences[preferenceKey] !== false && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(item.title, { body: item.body, tag: item.deduplication_key || item.id }) } catch {} }
    }
  }, [soundOn, preferences])

  const markRead = useCallback(async item => {
    const readAt = new Date().toISOString()
    setNotifications(rows => rows.map(row => row.id === item.id ? { ...row, read_at: readAt } : row))
    await supabase.from('notifications').update({ read_at: readAt }).eq('id', item.id)
  }, [])

  const savePreferences = useCallback(async next => {
    setPreferences(next)
    if (currentAgent) await supabase.from('notification_preferences').upsert({ agent_id: currentAgent.id, preferences: next, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' })
  }, [currentAgent])

  const enableBrowser = useCallback(async () => {
    if (!('Notification' in window)) { setBrowserState('Navigateur incompatible'); return }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') { setBrowserState('HTTPS requis'); return }
    if (Notification.permission === 'denied') { setBrowserState('Permission refusée dans les réglages du navigateur'); return }
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setBrowserState(result === 'granted' ? 'Activées' : result === 'denied' ? 'Permission refusée' : 'Désactivées')
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (result === 'granted' && publicKey && currentAgent && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(publicKey) })
        await supabase.from('webpush_subscriptions').upsert({ agent_id: currentAgent.id, endpoint: subscription.endpoint, subscription: subscription.toJSON() }, { onConflict: 'agent_id,endpoint' })
      } catch { setBrowserState('Activées · push distant à configurer') }
    }
  }, [currentAgent])

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => { if (error) setLoadError(supabaseMessage(error, 'vérifier la session')); setSession(data?.session ?? null) }).catch(error => { setLoadError(supabaseMessage(error, 'vérifier la session')); setSession(null) })
    const { data } = supabase.auth.onAuthStateChange((_event, value) => setSession(value))
    return () => data.subscription.unsubscribe()
  }, [])

  const loadWorkspace = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [requests, roster, categoryRows, carrierRows, memberships] = await Promise.all([
        supabase.from('demandes').select('*').order('updated_at', { ascending: false }),
        supabase.from('agents').select('*').order('name'),
        supabase.from('case_categories').select('*').eq('active', true).order('sort_order'),
        supabase.from('carriers').select('*').eq('active', true).order('sort_order'),
        supabase.from('team_memberships').select('agent_id, teams!inner(key)').eq('active', true).eq('teams.key', 'MADA-OPS'),
      ])
      if (requests.error || roster.error) { setLoadError(supabaseMessage(requests.error || roster.error, 'charger les demandes')); return }
      setLoadError('')
      setDemandes(requests.data || [])
      setAgents(roster.data || [])
      setCategories(categoryRows.error ? [] : categoryRows.data || [])
      setCarriers(carrierRows.error ? [] : carrierRows.data || [])
      setLifecycleReady(!categoryRows.error && !carrierRows.error && !memberships.error)
      const opsIds = new Set((memberships.error ? [] : memberships.data || []).map(item => item.agent_id))
      setOperationsAgents((roster.data || []).filter(agent => opsIds.has(agent.id) && agent.active))
    } catch (error) {
      setLoadError(supabaseMessage(error, 'charger les demandes'))
    } finally {
      setLoading(false)
    }
  }, [session])

  const loadAgents = useCallback(async () => {
    if (!session) return
    let result
    try { result = await supabase.from('agents').select('*').order('name') }
    catch (error) { setLoadError(supabaseMessage(error, 'charger les agents')); return }
    const { data, error } = result
    if (error) { setLoadError(supabaseMessage(error, 'charger les agents')); return }
    setAgents(data || [])
  }, [session])

  useEffect(() => { loadWorkspace() }, [loadWorkspace])

  useEffect(() => {
    if (!session) return
    if (!currentAgent) {
      if (agents.length) setNotificationError('Aucun agent CS-MADA ne correspond à ce compte connecté. Vérifie la liaison agents.user_id ↔ auth.users.id.')
      return
    }
    let live = true
    Promise.all([
      supabase.from('notifications').select('*').eq('recipient_id', currentAgent.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('notification_preferences').select('preferences').eq('agent_id', currentAgent.id).maybeSingle(),
    ]).then(([result, prefs]) => {
      if (!live) return
      if (!result.error) { setNotifications(result.data || []); setNotificationError('') }
      else setNotificationError(['42P01', 'PGRST205'].includes(result.error.code)
        ? 'Le centre est prêt, mais les tables de notifications ne sont pas encore installées dans Supabase. Applique la migration workspace.'
        : `Notifications indisponibles : ${result.error.message}`)
      if (!prefs.error && prefs.data?.preferences) setPreferences(prefs.data.preferences)
    })
    return () => { live = false }
  }, [session, currentAgent, agents.length])

  useEffect(() => {
    if (!session) return
    const channel = supabase.channel('workspace-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentAgent?.id}` }, payload => announce(payload.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentAgent?.id}` }, payload => setNotifications(rows => rows.map(row => row.id === payload.new.id ? payload.new : row)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes' }, payload => {
        if (payload.eventType === 'DELETE') setDemandes(rows => rows.filter(row => row.id !== payload.old.id))
        else setDemandes(rows => mergeRequest(rows, payload.new))
      })
    if (selectedId) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demande_events', filter: `demande_id=eq.${selectedId}` }, payload => {
        setEvents(rows => rows.some(row => row.id === payload.new.id)
          ? rows
          : [...rows, payload.new].sort((a, b) => a.created_at.localeCompare(b.created_at)))
      })
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_events', filter: `case_id=eq.${selectedId}` }, payload => {
        const item = payload.new
        const mapped = { id: item.id, demande_id: item.case_id, kind: item.event_type, content: item.message, author_name: item.actor_name, channel: 'System', created_at: item.occurred_at }
        setEvents(rows => rows.some(row => row.id === mapped.id) ? rows : [...rows, mapped].sort((a, b) => a.created_at.localeCompare(b.created_at)))
        supabase.from('case_escalations').select('*').eq('case_id', selectedId).order('opened_at').then(({ data }) => { if (data) setEscalations(data) })
      })
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, loadAgents)
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          notify('La synchronisation temps réel est momentanément indisponible. Les changements enregistrés restent conservés.', 'error')
        }
      })
    return () => supabase.removeChannel(channel)
  }, [session, selectedId, loadAgents, notify, currentAgent, announce])

  useEffect(() => {
    let ignore = false
    setEvents([])
    setEscalations([])
    if (!selectedId) return
    Promise.all([
      supabase.from('demande_events').select('*').eq('demande_id', selectedId).order('created_at', { ascending: true }),
      supabase.from('case_events').select('*').eq('case_id', selectedId).order('occurred_at', { ascending: true }),
      supabase.from('case_escalations').select('*').eq('case_id', selectedId).order('opened_at', { ascending: true }),
    ]).then(([legacy, lifecycle, escalationRows]) => {
        if (ignore) return
        if (legacy.error) { notify(supabaseMessage(legacy.error, 'charger la timeline'), 'error'); return }
        const typedEvents = lifecycle.error ? [] : (lifecycle.data || []).map(item => ({ id: item.id, demande_id: item.case_id, kind: item.event_type, content: item.message, author_name: item.actor_name, channel: 'System', created_at: item.occurred_at }))
        setEscalations(escalationRows.error ? [] : escalationRows.data || [])
        setEvents(current => [...new Map([...(legacy.data || []), ...typedEvents, ...current.filter(event => event.demande_id === selectedId)].map(event => [event.id, event])).values()]
          .sort((a, b) => a.created_at.localeCompare(b.created_at)))
      })
      .catch(error => { if (!ignore) notify(supabaseMessage(error, 'charger la timeline'), 'error') })
    return () => { ignore = true }
  }, [selectedId, notify])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.type === 'warning' ? 9000 : 2800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!currentAgent) return
    for (const request of demandes) {
      if (request.status === 'Resolved' || !request.customer_feedback_due_at || ![request.responsible_id, request.owner_id].includes(currentAgent.id)) continue
      const due = new Date(request.customer_feedback_due_at)
      const diff = due.getTime() - now.getTime()
      const type = diff < 0 ? 'OVERDUE' : diff <= 30 * 60_000 ? 'DUE_SOON' : null
      if (!type) continue
      const key = `${type}:${request.id}:${request.customer_feedback_due_at}:${currentAgent.id}`
      if (notifiedRef.current.has(key)) continue
      notifiedRef.current.add(key)
      const minutes = Math.max(1, Math.round(Math.abs(diff) / 60_000))
      const values = type === 'OVERDUE'
        ? { title: 'Demande en retard', body: `Feedback client dépassé de ${minutes} min`, priority: 'high' }
        : { title: 'Échéance imminente', body: `Feedback client attendu dans ${minutes} min`, priority: 'normal' }
      supabase.from('notifications').upsert({ recipient_id: currentAgent.id, request_id: request.id, type, ...values, deduplication_key: key }, { onConflict: 'recipient_id,deduplication_key', ignoreDuplicates: true }).select().maybeSingle().then(({ data }) => { if (data) announce(data) })
    }
  }, [currentAgent, demandes, now, announce])

  useEffect(() => {
    if (!currentAgent) return
    const resolvedIds = demandes.filter(request => request.status === 'Resolved').map(request => request.id)
    if (!resolvedIds.length) return
    const stale = notifications.filter(item => resolvedIds.includes(item.request_id) && !item.read_at && ['OVERDUE', 'DUE_SOON', 'ACTION_REQUIRED'].includes(item.type))
    if (!stale.length) return
    const readAt = new Date().toISOString()
    setNotifications(rows => rows.map(item => stale.some(done => done.id === item.id) ? { ...item, read_at: readAt } : item))
    supabase.from('notifications').update({ read_at: readAt }).in('id', stale.map(item => item.id))
  }, [currentAgent, demandes, notifications])

  useEffect(() => {
    const unread = notifications.filter(item => !item.read_at)
    const overdueCount = unread.filter(item => item.type === 'OVERDUE').length
    document.title = unread.length ? `(${overdueCount ? `${overdueCount} ` : ''}${overdueCount ? 'demande en retard' : unread.length}) CS-MADA` : 'CS-MADA'
    return () => { document.title = 'CS-MADA' }
  }, [notifications])

  useEffect(() => { localStorage.setItem('cs-mada-notification-sound', String(soundOn)) }, [soundOn])

  useEffect(() => {
    if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && location.hostname !== 'localhost')) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  const createEvent = useCallback(async (requestId, { kind, content, channel = 'Internal', metadata = null }) => {
    let result
    try {
      result = await supabase.from('demande_events').insert({
        demande_id: requestId, channel, kind, content,
        author_id: currentAgent?.id || null,
        author_name: currentAgent?.name || session?.user?.user_metadata?.name || session?.user?.email || 'Équipe CS',
        metadata,
      }).select().single()
    } catch (error) { throw new Error(supabaseMessage(error, 'ajouter cette activité')) }
    const { data, error } = result
    if (error) throw new Error(supabaseMessage(error, 'ajouter cette activité'))
    if (selectedId === data.demande_id) {
      setEvents(rows => rows.some(row => row.id === data.id) ? rows : [...rows, data].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    }
    setDemandes(rows => rows.map(row => row.id === requestId && compareTimestamps(row.updated_at, data.created_at) <= 0 ? { ...row, updated_at: data.created_at } : row))
  }, [currentAgent, session, selectedId])

  const createQuery = useCallback(async payload => {
    const initial_channel = payload.initial_channel
    const { category_id, carrier_id, priority, ...legacyPayload } = payload
    const intake = lifecycleReady ? payload : legacyPayload
    let result
    try {
      result = await supabase.from('demandes').insert({
        ...intake,
        current_stage: initial_channel === 'E-mail' ? 'CS E-mail' : 'CS WhatsApp',
        status: 'Open', owner_id: currentAgent?.id || null,
        responsible_id: payload.responsible_id || currentAgent?.id || null,
      }).select().single()
    } catch (error) { throw new Error(supabaseMessage(error, 'créer la demande')) }
    const { data, error } = result
    if (error) throw new Error(supabaseMessage(error, 'créer la demande'))
    setDemandes(rows => mergeRequest(rows, data))
    let timelineSaved = true
    try {
      await createEvent(data.id, { kind: 'created', channel: initial_channel, content: 'Demande créée à partir du contact client.' })
    } catch (eventError) {
      timelineSaved = false
      notify(`Demande créée, mais l’événement initial n’a pas été enregistré : ${eventError.message}`, 'error')
    }
    setSelectedId(data.id)
    setShowNewModal(false)
    if (timelineSaved) notify('Demande créée')
  }, [currentAgent, createEvent, notify, lifecycleReady])

  const deleteQuery = useCallback(async request => {
    const reference = request.tracking_number || request.id.slice(0, 8)
    if (!window.confirm(`Supprimer définitivement le dossier #${reference} (${request.customer_name}) et sa timeline ?`)) return false
    const { error } = await supabase.from('demandes').delete().eq('id', request.id)
    if (error) { notify(supabaseMessage(error, 'supprimer le dossier'), 'error'); return false }
    setDemandes(rows => rows.filter(row => row.id !== request.id))
    setEvents(rows => rows.filter(row => row.demande_id !== request.id))
    setSelectedId(null)
    notify(`Dossier #${reference} supprimé`)
    return true
  }, [notify])

  const updateQuery = useCallback(async (id, changes) => {
    if (savingIdsRef.current.has(id)) return null
    const before = demandes.find(d => d.id === id)
    if (!before) return
    const diff = Object.fromEntries(Object.entries(changes).filter(([key, value]) => before[key] !== value))
    if (!Object.keys(diff).length) return
    if (diff.status === 'Resolved') diff.resolved_at = new Date().toISOString()
    else if (diff.status) diff.resolved_at = null
    savingIdsRef.current.add(id)
    setSavingIds(current => new Set(current).add(id))
    try {
      let result
      try { result = await supabase.from('demandes').update(diff).eq('id', id).select().single() }
      catch (error) { notify(supabaseMessage(error, 'enregistrer les modifications'), 'error'); return null }
      const { data, error } = result
      if (error) { notify(supabaseMessage(error, 'enregistrer les modifications'), 'error'); return null }
      setDemandes(rows => mergeRequest(rows, data))
      for (const [key, value] of Object.entries(diff)) {
        if (key === 'resolved_at') continue
        const labels = { owner_id: 'Owner', responsible_id: 'Responsable', current_stage: 'Étape', status: 'Statut', customer_feedback_due_at: 'Échéance client', next_action: 'Prochaine action' }
        const agentValue = field => agents.find(a => a.id === field)?.name || 'Non attribué'
        const format = field => key === 'owner_id' || key === 'responsible_id' ? agentValue(field) : key === 'customer_feedback_due_at' ? formatDateTime(field, 'Non définie') : field || 'Non défini'
        const kind = key === 'current_stage' ? 'stage_changed' : key === 'responsible_id' ? 'responsible_changed' : key === 'owner_id' ? 'owner_changed' : key === 'status' ? (value === 'Resolved' ? 'resolved' : 'status_changed') : key === 'customer_feedback_due_at' ? 'due_date_changed' : 'field_changed'
        try { await createEvent(id, { kind, content: `${labels[key] || key} : ${format(before[key])} → ${format(value)}`, metadata: { field: key, from: before[key], to: value } }) } catch { notify('La modification est enregistrée, mais son entrée de timeline n’a pas pu être ajoutée.', 'error') }
      }
      return data
    } finally {
      savingIdsRef.current.delete(id)
      setSavingIds(current => { const next = new Set(current); next.delete(id); return next })
    }
  }, [demandes, agents, createEvent, notify])

  const addEvent = useCallback(async (id, content, channel) => {
    await createEvent(id, { kind: 'note', content, channel })
    notify('Activité ajoutée')
  }, [createEvent, notify])

  const runWorkflow = useCallback(async (action, payload) => {
    const request = demandes.find(row => row.id === selectedId)
    if (!request) throw new Error('Case not found.')
    let rpcName
    let args
    if (action === 'tier1') {
      rpcName = 'lifecycle_escalate_tier1'
      args = { p_case_id: request.id, p_reason: payload.reason, p_requested_action: payload.requested_action, p_handoff_note: payload.handoff_note || null, p_assignee_id: payload.assignee_id, p_due_at: payload.due_at }
    } else if (action === 'returnToCs') {
      rpcName = 'lifecycle_return_to_cs'
      args = { p_case_id: request.id, p_response: payload.response, p_next_customer_update_at: payload.next_customer_update_at }
    } else if (action === 'tier2') {
      rpcName = 'lifecycle_escalate_tier2'
      args = { p_case_id: request.id, p_reason: payload.reason, p_requested_action: payload.requested_action, p_information_sent: payload.information_sent || null, p_followup_owner_id: payload.followup_owner_id, p_due_at: payload.due_at, p_external_reference: payload.external_reference || null }
    } else if (action === 'externalResponse') {
      const escalation = [...escalations].reverse().find(item => item.tier === 2 && !item.resolved_at)
      if (!escalation) throw new Error('No open SEZ-OPS handoff exists.')
      rpcName = 'lifecycle_record_sez_response'
      args = { p_escalation_id: escalation.id, p_received_at: payload.received_at, p_response: payload.response, p_instructions: payload.instructions || null, p_references: payload.references, p_next_action: payload.next_action }
    } else if (action === 'tier2Return') {
      const escalation = [...escalations].reverse().find(item => item.tier === 2 && !item.resolved_at)
      if (!escalation) throw new Error('No open SEZ-OPS handoff exists.')
      rpcName = 'lifecycle_complete_tier2'
      args = { p_escalation_id: escalation.id, p_result: payload.result }
    } else if (action === 'customerUpdate') {
      rpcName = 'lifecycle_customer_update'
      args = { p_case_id: request.id, p_channel: payload.channel, p_content: payload.content, p_next_update_at: payload.next_update_at }
    } else {
      rpcName = 'lifecycle_set_status'
      args = { p_case_id: request.id, p_status: action === 'resolve' ? 'Resolved' : 'In progress', p_summary: action === 'resolve' ? payload.confirmation : payload.reason }
    }
    const { error } = await supabase.rpc(rpcName, args)
    if (error) throw new Error(error.message || 'Workflow action failed.')
    const [caseRows, legacyRows, lifecycleRows, escalationRows] = await Promise.all([
      supabase.from('demandes').select('*').eq('id', request.id).single(),
      supabase.from('demande_events').select('*').eq('demande_id', request.id).order('created_at'),
      supabase.from('case_events').select('*').eq('case_id', request.id).order('occurred_at'),
      supabase.from('case_escalations').select('*').eq('case_id', request.id).order('opened_at'),
    ])
    if (caseRows.data) setDemandes(rows => mergeRequest(rows, caseRows.data))
    const typedEvents = (lifecycleRows.data || []).map(item => ({ id: item.id, demande_id: item.case_id, kind: item.event_type, content: item.message, author_name: item.actor_name, channel: 'System', created_at: item.occurred_at }))
    setEvents([...(legacyRows.data || []), ...typedEvents].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    setEscalations(escalationRows.data || [])
    notify('Workflow action recorded')
  }, [selectedId, demandes, escalations, notify])

  const filterNow = staleOnly || dueFilter !== 'all' ? now : null
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return demandes.filter(row => {
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(row.status)) return false
      if (statusFilter !== 'all' && statusFilter !== 'active' && row.status !== statusFilter) return false
      if (stageFilter !== 'all' && row.current_stage !== stageFilter) return false
      if (responsibleFilter !== 'all' && row.responsible_id !== responsibleFilter) return false
      if (ownerFilter !== 'all' && row.owner_id !== ownerFilter) return false
      if (categoryFilter !== 'all' && row.category_id !== categoryFilter) return false
      if (carrierFilter !== 'all' && row.carrier_id !== carrierFilter) return false
      if (staleOnly && filterNow.getTime() - new Date(row.updated_at).getTime() <= 48 * 3600000) return false
      if (dueFilter !== 'all' && getRequestDueState(row, filterNow) !== dueFilter) return false
      if (query && ![row.customer_name, row.phone, row.email, row.tracking_number, row.query, row.case_reference,
        categories.find(item => item.id === row.category_id)?.name, carriers.find(item => item.id === row.carrier_id)].some(value => (value || '').toLocaleLowerCase().includes(query))) return false
      return true
    }).sort((a, b) => sortDue
      ? (a.customer_feedback_due_at || '9999').localeCompare(b.customer_feedback_due_at || '9999')
      : (b.updated_at || '').localeCompare(a.updated_at || ''))
  }, [demandes, statusFilter, stageFilter, responsibleFilter, ownerFilter, categoryFilter, carrierFilter, categories, carriers, staleOnly, dueFilter, search, sortDue, filterNow])

  const openRows = demandes.filter(d => ACTIVE_STATUSES.includes(d.status))
  const metrics = [
    { key: 'open', label: 'Ouvertes', count: openRows.length, status: 'active', due: 'all' },
    { key: 'overdue', label: 'En retard', count: openRows.filter(d => getRequestDueState(d, now) === 'overdue').length, status: 'active', due: 'overdue' },
    { key: 'today', label: 'Feedback aujourd’hui', count: openRows.filter(d => getRequestDueState(d, now) === 'due_today').length, status: 'active', due: 'due_today' },
    { key: 'ops', label: 'Chez opérations', count: openRows.filter(d => d.current_stage === 'Opérations').length, status: 'active', stage: 'Opérations' },
    { key: 'stale', label: 'Sans activité · 2j+', count: openRows.filter(d => now.getTime() - new Date(d.updated_at).getTime() > 48 * 3600000).length, status: 'active', stale: true },
  ]
  const applyMetric = metric => {
    setStatusFilter(metric.status || 'all'); setStageFilter(metric.stage || 'all'); setResponsibleFilter('all'); setOwnerFilter('all'); setDueFilter(metric.due || 'all'); setStaleOnly(Boolean(metric.stale))
  }

  if (session === undefined) return <div className="app-loading">Chargement de l’espace…</div>
  if (!session) return <Login />

  return <div className="app-root">
    <header className="app-header">
      <div className="brand"><span className="brand-mark">C</span><span>CS-MADA</span><span className="brand-context">Workspace</span></div>
      <div className="header-right"><label className="search-wrap"><span>⌕</span><input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher client, tracking…" /></label>
        <button className="notification-bell" onClick={() => setShowNotifications(value => !value)} aria-label={`Notifications ${notifications.filter(item => !item.read_at).length || ''}`} title="Notifications"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><span className="notification-button-label">Notifications</span>{notifications.filter(item => !item.read_at).length > 0 && <span className="notification-count">{Math.min(99, notifications.filter(item => !item.read_at).length)}{notifications.filter(item => !item.read_at).length > 99 ? '+' : ''}</span>}</button>
        <button className="btn-primary" onClick={() => setShowNewModal(true)}>＋ Nouvelle demande</button>
        <button className="btn-ghost-logout" onClick={() => supabase.auth.signOut()} title="Déconnexion">Déconnexion</button></div>
    </header>
    <main className="workspace">
      <section className="dashboard-strip" aria-label="Vue équipe">
        {metrics.map(metric => <button key={metric.key} className={`metric ${metric.key === 'overdue' && metric.count ? 'metric--urgent' : ''}`} onClick={() => applyMetric(metric)}>
          <span className="metric-count">{metric.count}</span><span className="metric-label">{metric.label}</span>
        </button>)}
        <div className="stage-summary">{STAGES.map(stage => <button key={stage} onClick={() => { setStageFilter(stage); setStatusFilter('active'); setDueFilter('all'); setResponsibleFilter('all'); setOwnerFilter('all'); setStaleOnly(false) }}><span>{stage}</span><b>{openRows.filter(d => d.current_stage === stage).length}</b></button>)}</div>
        <div className="agent-summary">{activeAgents.map(agent => <div className="agent-metrics" key={agent.id}><button title={`Filtrer les actions de ${agent.name}`} onClick={() => { setResponsibleFilter(v => v === agent.id ? 'all' : agent.id); setOwnerFilter('all'); setStageFilter('all'); setDueFilter('all'); setStatusFilter('active'); setStaleOnly(false) }}><span className="agent-avatar">{agent.name.slice(0, 1).toUpperCase()}</span><span>{agent.name}</span><b>{openRows.filter(d => d.responsible_id === agent.id).length}</b></button><button className="owner-count" title={`Dossiers portés par ${agent.name}`} onClick={() => { setOwnerFilter(v => v === agent.id ? 'all' : agent.id); setResponsibleFilter('all'); setStageFilter('all'); setDueFilter('all'); setStatusFilter('active'); setStaleOnly(false) }}>owner {openRows.filter(d => d.owner_id === agent.id).length}</button></div>)}</div>
      </section>
      <section className="queue-toolbar"><div><h1>Demandes</h1><span className="queue-count">{visible.length} dossier{visible.length === 1 ? '' : 's'}</span></div>
        <div className="queue-filters"><select aria-label="Filtrer par statut" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Tous les statuts</option><option value="active">Demandes ouvertes</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          <select aria-label="Filtrer par étape" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="all">Toutes les étapes</option>{STAGES.map(s => <option key={s}>{s}</option>)}</select>
          {lifecycleReady && <select aria-label="Filtrer par catégorie" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">Toutes les catégories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          {lifecycleReady && <select aria-label="Filtrer par transporteur" value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}><option value="all">Tous les transporteurs</option>{carriers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <select aria-label="Filtrer par responsable" value={responsibleFilter} onChange={e => setResponsibleFilter(e.target.value)}><option value="all">Tous les responsables</option>{activeAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select aria-label="Filtrer par owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="all">Tous les owners</option>{activeAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select aria-label="Filtrer par échéance" value={dueFilter} onChange={e => setDueFilter(e.target.value)}><option value="all">Toutes les échéances</option><option value="overdue">En retard</option><option value="due_today">Aujourd’hui</option><option value="upcoming">À venir</option><option value="none">Sans échéance</option></select>
          <button className="sort-button" onClick={() => setSortDue(value => !value)}>{sortDue ? 'Échéance ↑' : 'Activité ↓'}</button></div>
      </section>
      {loadError && <div className="workspace-error">{loadError} <button onClick={loadWorkspace}>Réessayer</button></div>}
      <section className={`workspace-split ${selected ? 'has-panel' : ''}`}>
        <div className="workspace-main"><SpreadsheetGrid demandes={visible} selectedId={selectedId} onSelectQuery={setSelectedId} agents={agents} categories={categories} carriers={carriers} loading={loading} savingIds={savingIds} now={now} onStatusChange={updateQuery} /></div>
        {selected && <DetailPanel key={selected.id} demande={{ ...selected, escalations }} events={events} agents={agents} operationsAgents={operationsAgents} categories={categories} carriers={carriers} lifecycleReady={lifecycleReady} now={now} saving={savingIds.has(selected.id)} onUpdate={updateQuery} onWorkflow={runWorkflow} onAddEvent={addEvent} onDelete={deleteQuery} onClose={() => setSelectedId(null)} />}
      </section>
    </main>
    {showNewModal && <NewQueryModal agents={activeAgents} categories={categories} carriers={carriers} lifecycleReady={lifecycleReady} onCreate={createQuery} onClose={() => setShowNewModal(false)} />}
    {showNotifications && <NotificationCenter notifications={notifications} requests={demandes} setupError={notificationError} onOpen={setSelectedId} onRead={markRead} onReadAll={async () => { const readAt = new Date().toISOString(); setNotifications(rows => rows.map(item => item.read_at ? item : { ...item, read_at: readAt })); if (currentAgent) await supabase.from('notifications').update({ read_at: readAt }).eq('recipient_id', currentAgent.id).is('read_at', null) }} onClose={() => setShowNotifications(false)} preferences={preferences} onPreferences={savePreferences} onEnableBrowser={enableBrowser} browserState={browserState} soundOn={soundOn} onSoundChange={setSoundOn} />}
    {toast && <div className="attention-toast"><div><b>{toast.message.split(' — ')[0]}</b><span>{toast.message.split(' — ').slice(1).join(' — ')}</span></div>{toast.requestId && <button onClick={() => { setSelectedId(toast.requestId); setToast(null) }}>Ouvrir la demande</button>}<button onClick={() => setToast(null)} aria-label="Fermer">×</button></div>}
  </div>
}
