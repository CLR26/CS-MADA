import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Topbar from './components/Topbar'
import RequestList from './components/RequestList'
import Dashboard from './components/Dashboard'
import NewRequestModal from './components/NewRequestModal'
import RequestDetailModal from './components/RequestDetailModal'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = chargement, null = déconnecté
  const [tab, setTab] = useState('suivi')
  const [demandes, setDemandes] = useState([])
  const [showNewModal, setShowNewModal] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return

    async function load() {
      const { data } = await supabase.from('demandes').select('*').order('created_at', { ascending: false })
      if (data) setDemandes(data)
    }
    load()

    const channel = supabase
      .channel('demandes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes' }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session])

  const knownDepartments = useMemo(() => {
    const set = new Set(demandes.map(d => d.departement).filter(Boolean))
    return [...set].sort()
  }, [demandes])

  async function handleCreate(payload) {
    const { error } = await supabase.from('demandes').insert({
      ...payload,
      situation: payload.objet,
      created_by: session.user.id,
      created_by_name: session.user.user_metadata?.name || session.user.email,
    })
    if (error) throw error
  }

  async function handleUpdate(id, changes) {
    const { data, error } = await supabase.from('demandes').update(changes).eq('id', id).select().single()
    if (error) throw error
    setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
  }

  async function handleResolve(id) {
    const { data, error } = await supabase.from('demandes').update({ resolved_at: new Date().toISOString() }).eq('id', id).select().single()
    if (!error) setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
  }

  async function handleReopen(id) {
    const { data, error } = await supabase.from('demandes').update({ resolved_at: null }).eq('id', id).select().single()
    if (!error) setDemandes(prev => prev.map(d => (d.id === id ? data : d)))
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

      {tab === 'suivi' && <RequestList demandes={demandes} onOpen={setSelected} />}
      {tab === 'dashboard' && <Dashboard demandes={demandes} />}

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
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
