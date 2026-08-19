import { supabase } from '../supabaseClient'

export default function Topbar({ tab, onTabChange, agentName, onNewRequest }) {
  return (
    <div className="topbar">
      <div className="brand">Suivi des demandes</div>

      <nav className="tabs" aria-label="Navigation principale">
        <button className={tab === 'suivi' ? 'active' : ''} aria-current={tab === 'suivi' ? 'page' : undefined} onClick={() => onTabChange('suivi')}>
          Suivi
        </button>
        <button className={tab === 'dashboard' ? 'active' : ''} aria-current={tab === 'dashboard' ? 'page' : undefined} onClick={() => onTabChange('dashboard')}>
          Tableau de bord
        </button>
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" onClick={onNewRequest}>+ Nouvelle demande</button>
        <div className="session-info">
          <span>{agentName}</span>
          <button className="btn ghost small" onClick={() => supabase.auth.signOut()} aria-label="Se déconnecter">Déconnexion</button>
        </div>
      </div>
    </div>
  )
}
