import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Topbar from './components/Topbar'
import RequestList from './components/RequestList'
import Dashboard from './components/Dashboard'
import NewRequestModal from './components/NewRequestModal'
import RequestDetailModal from './components/RequestDetailModal'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('suivi')
  const [demandes, setDemandes] = useState([])
  const [demandesLoading, setDemandesLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [toast, setToast] = useState(null)
  const selected = useMemo(() => demandes.find(d => d.id === selectedId) || null, [demandes, selectedId])

  function notify(message, type = 'success') {
    setToast({ message, type, key: Date.now() })
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
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
      const { data } = await supabase.from('demandes').select('*').order('created_at', { ascending: false })
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

  const knownDepartments = useMemo(() => {
    const set = new Set(demandes.map(d => d.departement).filter(Boolean))
    return [...set].sort()
  }, [demandes])

  async function handleCreate(payload) {
    const { data, error } = await supabase.from('demandes').insert({
      ...payload,
      situation: payload.objet,
      created_by: session.user.id,
      created_by_name: session.user.user_metadata?.name || session.user.email,
    }).select().single()
    if (error) throw error
    setDemandes(prev => (prev.some(d => d.id === data.id) ? prev : [data, ...prev]))
    notify('Demande créée.')
  }

  async function handleUpdate(id, changes) {
    const { data, error } = await supabase.from('demandes').update(changes).eq('id', id).select().single()
    if (error) throw error
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
    notify('Modifications enregistrées.')
  }

  async function handleResolve(id, pendingChanges) {
    const { data, error } = await supabase.from('demandes')
      .update({ ...(pendingChanges || {}), resolved_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw error
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
    notify('Dossier marqué comme traité.')
  }

  async function handleReopen(id) {
    const { data, error } = await supabase.from('demandes').update({ resolved_at: null }).eq('id', id).select().single()
    if (error) { notify("Erreur lors de la réouverture.", 'error'); return }
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
    notify('Dossier rouvert.')
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('demandes').delete().eq('id', id)
    if (error) throw error
    setDemandes(prev => prev.filter(d => d.id !== id))
    notify('Demande supprimée.')
  }

  if (session === undefined) return <div className="loading-screen">Chargement…</div>
  if (!session) return <Login />

  const agentName = session.user.user_metadata?.name || session.user.email

  return (
    <div className="app-shell">
      <Topbar
        tab={tab}
        onTabChange={setTab}
        agentName={agentName}
        onNewRequest={() => setShowNewModal(true)}
      />

      {tab === 'suivi' && <RequestList demandes={demandes} loading={demandesLoading} onOpen={setSelectedId} />}
      {tab === 'dashboard' && <Dashboard demandes={demandes} loading={demandesLoading} />}

      {showNewModal && (
        <NewRequestModal
          knownDepartments={knownDepartments}
          onCreate={handleCreate}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {selected && (
        <RequestDetailModal
          demande={selected}
          knownDepartments={knownDepartments}
          onUpdate={handleUpdate}
          onResolve={handleResolve}
          onReopen={handleReopen}
          onDelete={handleDelete}
          onClose={() => setSelectedId(null)}
        />
      )}

      {toast && (
        <div className={`toast ${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  )
}
