import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import SpreadsheetGrid from './components/SpreadsheetGrid'
import DetailPanel from './components/DetailPanel'
import NewQueryModal from './components/NewQueryModal'
import Toast from './components/ui/Toast'
import { ACTIVE_STATUSES, STATUSES, STAGES } from './lib/constants'
import { compareTimestamps, formatDateTime, getRequestDueState } from './lib/dates'
import { supabaseMessage } from './lib/errors'

const mergeRequest = (rows, incoming) => {
  const current = rows.find(row => row.id === incoming.id)
  if (!current) return [incoming, ...rows]
  if (compareTimestamps(current.updated_at, incoming.updated_at) > 0) return rows
  return rows.map(row => row.id === incoming.id ? incoming : row)
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [demandes, setDemandes] = useState([])
  const [agents, setAgents] = useState([])
  const [events, setEvents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [stageFilter, setStageFilter] = useState('all')
  const [responsibleFilter, setResponsibleFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
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

  const notify = useCallback((message, type = 'success') => setToast({ message, type, key: Date.now() }), [])
  const selected = demandes.find(d => d.id === selectedId) || null
  const activeAgents = agents.filter(a => a.active)
  const currentAgent = agents.find(a => a.user_id === session?.user?.id) || null

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => { if (error) setLoadError(supabaseMessage(error, 'vérifier la session')); setSession(data?.session ?? null) }).catch(error => { setLoadError(supabaseMessage(error, 'vérifier la session')); setSession(null) })
    const { data } = supabase.auth.onAuthStateChange((_event, value) => setSession(value))
    return () => data.subscription.unsubscribe()
  }, [])

  const loadWorkspace = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [requests, roster] = await Promise.all([
        supabase.from('demandes').select('*').order('updated_at', { ascending: false }),
        supabase.from('agents').select('*').order('name'),
      ])
      if (requests.error || roster.error) { setLoadError(supabaseMessage(requests.error || roster.error, 'charger les demandes')); return }
      setLoadError('')
      setDemandes(requests.data || [])
      setAgents(roster.data || [])
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
    const channel = supabase.channel('workspace-live')
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
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, loadAgents)
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          notify('La synchronisation temps réel est momentanément indisponible. Les changements enregistrés restent conservés.', 'error')
        }
      })
    return () => supabase.removeChannel(channel)
  }, [session, selectedId, loadAgents, notify])

  useEffect(() => {
    let ignore = false
    setEvents([])
    if (!selectedId) return
    supabase.from('demande_events').select('*').eq('demande_id', selectedId).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (ignore) return
        if (error) { notify(supabaseMessage(error, 'charger la timeline'), 'error'); return }
        setEvents(current => [...new Map([...(data || []), ...current.filter(event => event.demande_id === selectedId)].map(event => [event.id, event])).values()]
          .sort((a, b) => a.created_at.localeCompare(b.created_at)))
      })
      .catch(error => { if (!ignore) notify(supabaseMessage(error, 'charger la timeline'), 'error') })
    return () => { ignore = true }
  }, [selectedId, notify])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
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
    let result
    try {
      result = await supabase.from('demandes').insert({
        ...payload,
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
  }, [currentAgent, createEvent, notify])

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

  const filterNow = staleOnly || dueFilter !== 'all' ? now : null
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return demandes.filter(row => {
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(row.status)) return false
      if (statusFilter !== 'all' && statusFilter !== 'active' && row.status !== statusFilter) return false
      if (stageFilter !== 'all' && row.current_stage !== stageFilter) return false
      if (responsibleFilter !== 'all' && row.responsible_id !== responsibleFilter) return false
      if (ownerFilter !== 'all' && row.owner_id !== ownerFilter) return false
      if (staleOnly && filterNow.getTime() - new Date(row.updated_at).getTime() <= 48 * 3600000) return false
      if (dueFilter !== 'all' && getRequestDueState(row, filterNow) !== dueFilter) return false
      if (query && ![row.customer_name, row.phone, row.email, row.tracking_number, row.query].some(value => (value || '').toLocaleLowerCase().includes(query))) return false
      return true
    }).sort((a, b) => sortDue
      ? (a.customer_feedback_due_at || '9999').localeCompare(b.customer_feedback_due_at || '9999')
      : (b.updated_at || '').localeCompare(a.updated_at || ''))
  }, [demandes, statusFilter, stageFilter, responsibleFilter, ownerFilter, staleOnly, dueFilter, search, sortDue, filterNow])

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
          <select aria-label="Filtrer par responsable" value={responsibleFilter} onChange={e => setResponsibleFilter(e.target.value)}><option value="all">Tous les responsables</option>{activeAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select aria-label="Filtrer par owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="all">Tous les owners</option>{activeAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select aria-label="Filtrer par échéance" value={dueFilter} onChange={e => setDueFilter(e.target.value)}><option value="all">Toutes les échéances</option><option value="overdue">En retard</option><option value="due_today">Aujourd’hui</option><option value="upcoming">À venir</option><option value="none">Sans échéance</option></select>
          <button className="sort-button" onClick={() => setSortDue(value => !value)}>{sortDue ? 'Échéance ↑' : 'Activité ↓'}</button></div>
      </section>
      {loadError && <div className="workspace-error">{loadError} <button onClick={loadWorkspace}>Réessayer</button></div>}
      <section className={`workspace-split ${selected ? 'has-panel' : ''}`}>
        <div className="workspace-main"><SpreadsheetGrid demandes={visible} selectedId={selectedId} onSelectQuery={setSelectedId} agents={agents} loading={loading} savingIds={savingIds} now={now} onStatusChange={updateQuery} /></div>
        {selected && <DetailPanel key={selected.id} demande={selected} events={events} agents={agents} now={now} saving={savingIds.has(selected.id)} onUpdate={updateQuery} onAddEvent={addEvent} onClose={() => setSelectedId(null)} />}
      </section>
    </main>
    {showNewModal && <NewQueryModal agents={activeAgents} onCreate={createQuery} onClose={() => setShowNewModal(false)} />}
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
  </div>
}
