import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Topbar from './components/Topbar'
import RequestList from './components/RequestList'
import Dashboard from './components/Dashboard'
import NewRequestModal from './components/NewRequestModal'
import RequestDrawer from './components/RequestDrawer'
import Toast from './components/ui/Toast'
import { getUrlParams, updateUrlParams } from './lib/urlState'

export default function App() {
  const initialParams = useMemo(() => getUrlParams(), [])

  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState(initialParams.tab || 'suivi')
  const [filter, setFilter] = useState(initialParams.filter || 'tous')
  const [selectedId, setSelectedId] = useState(initialParams.dossier || null)
  const [demandes, setDemandes] = useState([])
  const [demandesLoading, setDemandesLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [showNewModal, setShowNewModal] = useState(false)
  const [toast, setToast] = useState(null)

  // Synchronisation de l'URL quand l'état change
  useEffect(() => {
    updateUrlParams({
      tab,
      dossier: selectedId,
      filter,
    })
  }, [tab, selectedId, filter])

  const selected = useMemo(
    () => demandes.find(d => d.id === selectedId) || null,
    [demandes, selectedId]
  )

  const selectedEvents = useMemo(
    () => events.filter(e => e.demande_id === selectedId),
    [events, selectedId]
  )

  function notify(message, type = 'success') {
    setToast({ message, type, key: Date.now() })
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return

    async function load() {
      setDemandesLoading(true)
      const { data } = await supabase
        .from('demandes')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setDemandes(data)
      setDemandesLoading(false)
    }
    load()

    const channel = supabase
      .channel('demandes-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demandes' }, ({ new: row }) => {
        setDemandes(prev => (prev.some(d => d.id === row.id) ? prev : [row, ...prev]))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'demandes' }, ({ new: row }) => {
        setDemandes(prev => prev.map(d => (d.id === row.id ? row : d)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'demandes' }, ({ old: row }) => {
        setDemandes(prev => prev.filter(d => d.id !== row.id))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session])

  useEffect(() => {
    if (!session) return

    async function loadEvents() {
      const { data } = await supabase
        .from('demande_events')
        .select('*')
        .order('created_at', { ascending: true })
      if (data) setEvents(data)
    }
    loadEvents()

    const channel = supabase
      .channel('demande-events-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demande_events' }, ({ new: row }) => {
        setEvents(prev => (prev.some(e => e.id === row.id) ? prev : [...prev, row]))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session])

  const knownDepartments = useMemo(() => {
    const set = new Set(demandes.map(d => d.departement).filter(Boolean))
    return [...set].sort()
  }, [demandes])

  const openRequestsCount = useMemo(
    () => demandes.filter(d => !d.resolved_at).length,
    [demandes]
  )

  async function handleCreate(payload) {
    const { data, error } = await supabase
      .from('demandes')
      .insert({
        ...payload,
        situation: payload.objet,
        created_by: session.user.id,
        created_by_name: session.user.user_metadata?.name || session.user.email,
      })
      .select()
      .single()
    if (error) throw error
    setDemandes(prev => (prev.some(d => d.id === data.id) ? prev : [data, ...prev]))
    notify('Demande enregistrée avec succès.')
  }

  async function handleUpdate(id, changes) {
    const { data, error } = await supabase
      .from('demandes')
      .update(changes)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
    notify('Modifications enregistrées.')
  }

  async function handleAssign(id) {
    const { data, error } = await supabase
      .from('demandes')
      .update({
        assigned_to: session.user.id,
        assigned_to_name: session.user.user_metadata?.name || session.user.email,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
    notify('Dossier pris en charge.')
  }

  async function handleAddEvent(demandeId, content) {
  const { data, error } = await supabase
    .from('demande_events')
    .insert({
      demande_id: demandeId,
      kind: 'message',
      content,
      author: session.user.id,
      author_name: session.user.user_metadata?.name || session.user.email,
    })
    .select()
    .single()
  if (error) throw error
  setEvents(prev => (prev.some(e => e.id === data.id) ? prev : [...prev, data]))
}
  
  async function handleResolve(id, pendingChanges) {
    const { data, error } = await supabase
      .from('demandes')
      .update({
        ...(pendingChanges || {}),
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
    notify('Dossier marqué comme traité.')
  }

  async function handleReopen(id) {
    const { data, error } = await supabase
      .from('demandes')
      .update({ resolved_at: null })
      .eq('id', id)
      .select()
      .single()
    if (error) {
      notify('Erreur lors de la réouverture du dossier.', 'error')
      return
    }
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
    notify('Dossier rouvert pour traitement.')
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('demandes').delete().eq('id', id)
    if (error) throw error
    setDemandes(prev => prev.filter(d => d.id !== id))
    notify('Demande supprimée.')
  }

  function handleSelectFilter(newTab, newFilter) {
    setTab(newTab)
    if (newFilter) setFilter(newFilter)
  }

  if (session === undefined) {
    return (
      <div className="login-shell">
        <div style={{ color: 'var(--ink-muted)', fontWeight: 600, fontSize: 14 }}>
          Chargement de l'application…
        </div>
      </div>
    )
  }

  if (!session) return <Login />

  const agentName = session.user.user_metadata?.name || session.user.email

  return (
    <div className="app-shell">
      <Topbar
        tab={tab}
        onTabChange={setTab}
        agentName={agentName}
        openRequestsCount={openRequestsCount}
        onNewRequest={() => setShowNewModal(true)}
      />

      <main role="main">
        {tab === 'suivi' && (
          <RequestList
            demandes={demandes}
            loading={demandesLoading}
            selectedId={selectedId}
            onOpen={setSelectedId}
            filter={filter}
            onFilterChange={setFilter}
            currentUserId={session.user.id}
          />
        )}

        {tab === 'dashboard' && (
          <Dashboard
            demandes={demandes}
            loading={demandesLoading}
            onSelectFilter={handleSelectFilter}
          />
        )}
      </main>

      {showNewModal && (
        <NewRequestModal
          knownDepartments={knownDepartments}
          onCreate={handleCreate}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {selected && (
        <RequestDrawer
          demande={selected}
          knownDepartments={knownDepartments}
          currentUserId={session.user.id}
          events={selectedEvents}
          onUpdate={handleUpdate}
          onAssign={handleAssign}
          onAddEvent={handleAddEvent}
          onResolve={handleResolve}
          onReopen={handleReopen}
          onDelete={handleDelete}
          onClose={() => setSelectedId(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
