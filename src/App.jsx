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
  const [teamIds, setTeamIds] = useState({})
  const [events, setEvents] = useState([])
  const [escalations, setEscalations] = useState([])
  const [externalStatuses, setExternalStatuses] = useState({})
  const [operationsAgents, setOperationsAgents] = useState([])
  const [csAgents, setCsAgents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [queueFilter, setQueueFilter] = useState('all')
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
  const [showMoreFilters, setShowMoreFilters] = useState(false)
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
      const [requests, roster, categoryRows, carrierRows, memberships, cutover, externalRows] = await Promise.all([
        supabase.from('demandes').select('*').order('updated_at', { ascending: false }),
        supabase.from('agents').select('*').order('name'),
        supabase.from('case_categories').select('*').eq('active', true).order('sort_order'),
        supabase.from('carriers').select('*').eq('active', true).order('sort_order'),
        supabase.from('team_memberships').select('agent_id, teams!inner(key,id)').eq('active', true),
        supabase.from('routing_rule_assignees').select('routing_rule_id').limit(1),
        supabase.from('case_escalations').select('case_id,status,due_at,resolved_at,opened_at').eq('tier', 2).order('opened_at'),
      ])
      if (requests.error || roster.error) { setLoadError(supabaseMessage(requests.error || roster.error, 'charger les demandes')); return }
      setLoadError('')
      setDemandes(requests.data || [])
      setAgents(roster.data || [])
      setCategories(categoryRows.error ? [] : categoryRows.data || [])
      setCarriers(carrierRows.error ? [] : carrierRows.data || [])
      setLifecycleReady(!categoryRows.error && !carrierRows.error && !memberships.error && !cutover.error)
      const membershipRows = memberships.error ? [] : memberships.data || []
      setTeamIds(Object.fromEntries(membershipRows.map(item => [item.teams.key, item.teams.id])))
      const opsIds = new Set(membershipRows.filter(item => item.teams.key === 'MADA-OPS').map(item => item.agent_id))
      const csIds = new Set(membershipRows.filter(item => item.teams.key === 'CS-MADA').map(item => item.agent_id))
      setOperationsAgents((roster.data || []).filter(agent => opsIds.has(agent.id) && agent.active))
      setCsAgents((roster.data || []).filter(agent => csIds.has(agent.id) && agent.active))
      setExternalStatuses((externalRows.error ? [] : externalRows.data || []).reduce((all, row) => { all[row.case_id] = row; return all }, {}))
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_escalations' }, payload => {
        const item = payload.new
        if (item?.tier === 2) setExternalStatuses(rows => ({ ...rows, [item.case_id]: item }))
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
        supabase.from('case_escalations').select('*').eq('case_id', selectedId).order('opened_at').then(({ data }) => { if (data) { setEscalations(data); setExternalStatuses(rows => ({ ...rows, [selectedId]: [...data].reverse().find(row => row.tier === 2) || null })) } })
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
    if (!currentAgent || lifecycleReady) return
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
  }, [currentAgent, demandes, now, announce, lifecycleReady])

  useEffect(() => {
    if (!currentAgent || !lifecycleReady) return
    const refreshDueNotifications = () => supabase.rpc('lifecycle_notify_due_deadlines').then(({ error }) => {
      if (error) setNotificationError(`Échéances indisponibles : ${error.message}`)
    })
    refreshDueNotifications()
    const timer = setInterval(refreshDueNotifications, 5 * 60_000)
    return () => clearInterval(timer)
  }, [currentAgent, lifecycleReady])

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
    if (lifecycleReady) {
      const { data: caseId, error } = await supabase.rpc('lifecycle_create_case', { p_case: payload })
      if (error) throw new Error(supabaseMessage(error, 'créer la demande'))
      const { data, error: readError } = await supabase.from('demandes').select('*').eq('id', caseId).single()
      if (readError) throw new Error(supabaseMessage(readError, 'charger la demande créée'))
      setDemandes(rows => mergeRequest(rows, data))
      setSelectedId(data.id)
      setShowNewModal(false)
      notify('Demande créée et routée')
      return
    }
    const intake = legacyPayload
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
      if (lifecycleReady) {
        const lifecycleChanges = { ...diff }
        delete lifecycleChanges.resolved_at
        if ('owner_id' in lifecycleChanges) { lifecycleChanges.case_owner_id = lifecycleChanges.owner_id; delete lifecycleChanges.owner_id }
        if ('responsible_id' in lifecycleChanges) { lifecycleChanges.current_assignee_id = lifecycleChanges.responsible_id; delete lifecycleChanges.responsible_id }
        if ('status' in lifecycleChanges) {
          const status = lifecycleChanges.status
          const mapped = status === 'Resolved' ? 'Resolved' : status === 'Closed' ? 'Closed' : status === 'Waiting' ? 'Waiting on Customer' : 'In progress'
          const { error } = await supabase.rpc('lifecycle_set_status', { p_case_id: id, p_status: mapped, p_summary: null })
          if (error) { notify(supabaseMessage(error, 'changer le statut'), 'error'); return null }
          delete lifecycleChanges.status
        }
        if (Object.keys(lifecycleChanges).length) {
          const { error } = await supabase.rpc('lifecycle_update_case', { p_case_id: id, p_changes: lifecycleChanges })
          if (error) { notify(supabaseMessage(error, 'enregistrer les modifications'), 'error'); return null }
        }
        const fresh = await supabase.from('demandes').select('*').eq('id', id).single()
        if (fresh.error) { notify(supabaseMessage(fresh.error, 'recharger la demande'), 'error'); return null }
        setDemandes(rows => mergeRequest(rows, fresh.data))
        return fresh.data
      }
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
  }, [demandes, agents, createEvent, notify, lifecycleReady])

  const addEvent = useCallback(async (id, content, channel) => {
    if (lifecycleReady) {
      const { error } = await supabase.rpc('lifecycle_add_internal_note', { p_case_id: id, p_content: content })
      if (error) throw new Error(supabaseMessage(error, 'ajouter la note interne'))
      notify('Note interne ajoutée')
      return
    }
    await createEvent(id, { kind: 'note', content, channel })
    notify('Activité ajoutée')
  }, [createEvent, notify, lifecycleReady])

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
    } else if (action === 'ackTier1') {
      const escalation = [...escalations].reverse().find(item => item.tier === 1 && !item.resolved_at)
      if (!escalation) throw new Error('No open Tier 1 escalation exists.')
      rpcName = 'lifecycle_ack_tier1'
      args = { p_escalation_id: escalation.id }
    } else {
      rpcName = 'lifecycle_set_status'
      args = { p_case_id: request.id, p_status: action === 'resolve' ? 'Resolved' : action === 'close' ? 'Closed' : 'In progress', p_summary: action === 'resolve' ? payload.confirmation : payload.reason }
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

  const suggestTier1Assignee = useCallback(async caseId => {
    const { data, error } = await supabase.rpc('lifecycle_suggest_tier1_assignee', { p_case_id: caseId })
    if (error) { notify(supabaseMessage(error, 'charger le routage opérations'), 'error'); return null }
    return data || null
  }, [notify])

  const filterNow = staleOnly || dueFilter !== 'all' ? now : null
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return demandes.filter(row => {
      if (queueFilter === 'my' && row.current_assignee_id !== currentAgent?.id) return false
      if (queueFilter === 'new' && (row.current_status || row.status) !== 'New') return false
      if (queueFilter === 'waiting_customer' && row.current_status !== 'Waiting on Customer') return false
      if (queueFilter === 'cs' && row.current_team_id !== teamIds['CS-MADA']) return false
      if (queueFilter === 'ops' && row.current_team_id !== teamIds['MADA-OPS']) return false
      if (queueFilter === 'tier1' && Number(row.current_escalation_tier) !== 1) return false
      if (queueFilter === 'external' && (row.current_escalation_tier !== 2 || ['Resolved','Closed'].includes(row.current_status))) return false
      if (queueFilter === 'due' && !['overdue','due_today'].includes(getRequestDueState(row, filterNow || now))) return false
      if (queueFilter === 'overdue' && getRequestDueState(row, filterNow || now) !== 'overdue') return false
      if (queueFilter === 'resolved' && (row.current_status || row.status) !== 'Resolved') return false
      if (queueFilter === 'closed' && row.current_status !== 'Closed') return false
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
  }, [demandes, statusFilter, queueFilter, teamIds, currentAgent, stageFilter, responsibleFilter, ownerFilter, categoryFilter, carrierFilter, categories, carriers, staleOnly, dueFilter, search, sortDue, filterNow, now])

  const openRows = demandes.filter(d => ACTIVE_STATUSES.includes(d.status))
  const metrics = [
    { key: 'open', label: 'Ouvertes', count: openRows.length, status: 'active', due: 'all' },
    { key: 'overdue', label: 'En retard', count: openRows.filter(d => getRequestDueState(d, now) === 'overdue').length, status: 'active', due: 'overdue' },
    { key: 'today', label: 'Feedback aujourd’hui', count: openRows.filter(d => getRequestDueState(d, now) === 'due_today').length, status: 'active', due: 'due_today' },
    { key: 'ops', label: 'Chez opérations', count: openRows.filter(d => d.current_stage === 'Opérations').length, status: 'active', stage: 'Opérations' },
    { key: 'stale', label: 'Sans activité · 2j+', count: openRows.filter(d => now.getTime() - new Date(d.updated_at).getTime() > 48 * 3600000).length, status: 'active', stale: true },
  ]
  const applyMetric = metric => {
    setQueueFilter('all'); setStatusFilter(metric.status || 'all'); setStageFilter(metric.stage || 'all'); setResponsibleFilter('all'); setOwnerFilter('all'); setDueFilter(metric.due || 'all'); setStaleOnly(Boolean(metric.stale))
  }
  const queueCounts = {
    my: demandes.filter(row => row.current_assignee_id === currentAgent?.id && !['Resolved','Closed'].includes(row.current_status)).length,
    new: demandes.filter(row => row.current_status === 'New').length,
    waiting_customer: demandes.filter(row => row.current_status === 'Waiting on Customer').length,
    cs: demandes.filter(row => row.current_team_id === teamIds['CS-MADA'] && !['Resolved','Closed'].includes(row.current_status)).length,
    ops: demandes.filter(row => row.current_team_id === teamIds['MADA-OPS'] && !['Resolved','Closed'].includes(row.current_status)).length,
    tier1: demandes.filter(row => row.current_escalation_tier === 1 && !['Resolved','Closed'].includes(row.current_status)).length,
    external: demandes.filter(row => row.current_escalation_tier === 2 && !['Resolved','Closed'].includes(row.current_status)).length,
    due: demandes.filter(row => !['Resolved','Closed'].includes(row.current_status) && ['overdue','due_today'].includes(getRequestDueState(row, now))).length,
    overdue: demandes.filter(row => !['Resolved','Closed'].includes(row.current_status) && getRequestDueState(row, now)==='overdue').length,
    resolved: demandes.filter(row => row.current_status === 'Resolved').length,
    closed: demandes.filter(row => row.current_status === 'Closed').length,
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
      </section>
      {lifecycleReady && <nav className="lifecycle-queues" aria-label="Lifecycle queues">{[
        ['my','My work'],['new','New'],['cs','CS-MADA'],['waiting_customer','Waiting on Customer'],['ops','MADA-OPS'],['tier1','Tier 1'],['external','External · SEZ-OPS'],['due','Customer updates due'],['overdue','Overdue'],['resolved','Resolved'],['closed','Closed'],
      ].map(([key,label]) => <button type="button" key={key} className={queueFilter===key?'is-selected':''} onClick={() => { setQueueFilter(queueFilter===key?'all':key); setStatusFilter('all'); setStageFilter('all'); setResponsibleFilter('all'); setOwnerFilter('all'); setDueFilter('all'); setStaleOnly(false) }}><span>{label}</span><b>{queueCounts[key]}</b></button>)}</nav>}
      <section className="queue-toolbar"><div><h1>Demandes</h1><span className="queue-count">{visible.length} dossier{visible.length === 1 ? '' : 's'}</span></div>
        <div className="queue-filter-panel"><div className="queue-filters"><select aria-label="Filtrer par statut" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Tous les statuts</option><option value="active">Demandes ouvertes</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          <select aria-label="Filtrer par étape" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="all">Toutes les étapes</option>{STAGES.map(s => <option key={s}>{s}</option>)}</select>
          <button type="button" className={`filter-toggle ${showMoreFilters ? 'is-open' : ''}`} aria-expanded={showMoreFilters} onClick={() => setShowMoreFilters(value => !value)}>Plus de filtres{[categoryFilter,carrierFilter,responsibleFilter,ownerFilter,dueFilter].filter(value => value !== 'all').length > 0 && <span>{[categoryFilter,carrierFilter,responsibleFilter,ownerFilter,dueFilter].filter(value => value !== 'all').length}</span>}</button>
          <button className="sort-button" onClick={() => setSortDue(value => !value)}>{sortDue ? 'Échéance ↑' : 'Activité ↓'}</button></div>
          {showMoreFilters && <div className="queue-filters queue-filters--advanced">
            {lifecycleReady && <select aria-label="Filtrer par catégorie" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">Toutes les catégories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            {lifecycleReady && <select aria-label="Filtrer par transporteur" value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}><option value="all">Tous les transporteurs</option>{carriers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            <select aria-label="Filtrer par responsable" value={responsibleFilter} onChange={e => setResponsibleFilter(e.target.value)}><option value="all">Tous les responsables</option>{activeAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select aria-label="Filtrer par owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="all">Tous les owners</option>{activeAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select aria-label="Filtrer par échéance" value={dueFilter} onChange={e => setDueFilter(e.target.value)}><option value="all">Toutes les échéances</option><option value="overdue">En retard</option><option value="due_today">Aujourd’hui</option><option value="upcoming">À venir</option><option value="none">Sans échéance</option></select>
          </div>}</div>
      </section>
      {loadError && <div className="workspace-error">{loadError} <button onClick={loadWorkspace}>Réessayer</button></div>}
      <section className={`workspace-split ${selected ? 'has-panel' : ''}`}>
        <div className="workspace-main"><SpreadsheetGrid demandes={visible} selectedId={selectedId} onSelectQuery={setSelectedId} agents={agents} categories={categories} carriers={carriers} teamIds={teamIds} externalStatuses={externalStatuses} loading={loading} savingIds={savingIds} now={now} onStatusChange={updateQuery} /></div>
        {selected && <DetailPanel key={selected.id} demande={{ ...selected, escalations }} events={events} agents={agents} operationsAgents={operationsAgents} csAgents={csAgents} categories={categories} carriers={carriers} lifecycleReady={lifecycleReady} now={now} saving={savingIds.has(selected.id)} onUpdate={updateQuery} onWorkflow={runWorkflow} onSuggestTier1={suggestTier1Assignee} onAddEvent={addEvent} onClose={() => setSelectedId(null)} />}
      </section>
    </main>
    {showNewModal && <NewQueryModal agents={activeAgents} categories={categories} carriers={carriers} lifecycleReady={lifecycleReady} onCreate={createQuery} onClose={() => setShowNewModal(false)} />}
    {showNotifications && <NotificationCenter notifications={notifications} requests={demandes} setupError={notificationError} onOpen={setSelectedId} onRead={markRead} onReadAll={async () => { const readAt = new Date().toISOString(); setNotifications(rows => rows.map(item => item.read_at ? item : { ...item, read_at: readAt })); if (currentAgent) await supabase.from('notifications').update({ read_at: readAt }).eq('recipient_id', currentAgent.id).is('read_at', null) }} onClose={() => setShowNotifications(false)} preferences={preferences} onPreferences={savePreferences} onEnableBrowser={enableBrowser} browserState={browserState} soundOn={soundOn} onSoundChange={setSoundOn} />}
    {toast && <div className="attention-toast"><div><b>{toast.message.split(' — ')[0]}</b><span>{toast.message.split(' — ').slice(1).join(' — ')}</span></div>{toast.requestId && <button onClick={() => { setSelectedId(toast.requestId); setToast(null) }}>Ouvrir la demande</button>}<button onClick={() => setToast(null)} aria-label="Fermer">×</button></div>}
  </div>
}
