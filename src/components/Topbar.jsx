import { supabase } from '../supabaseClient'
import Button from './ui/Button'
import SegmentedControl from './ui/SegmentedControl'
import { IconInbox, IconDashboard, IconPlus, IconLogOut } from '../lib/icons'

export default function Topbar({ tab, onTabChange, agentName, onNewRequest, openRequestsCount }) {
  const userInitials = agentName
    ? agentName
        .split(/[@.\s]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('')
    : 'AG'

  return (
    <header className="topbar" role="banner">
      {/* Brand area */}
      <div className="topbar__brand-area">
        <div className="topbar__logo" aria-hidden="true">
          <IconInbox size={20} />
        </div>
        <div className="topbar__title">
          <span>Suivi des demandes</span>
          <span className="topbar__title-tag">CLR26 · CS-MADA</span>
        </div>
      </div>

      {/* Navigation tabs */}
      <nav className="topbar__nav" aria-label="Navigation principale">
        <SegmentedControl
          value={tab}
          onChange={onTabChange}
          size="md"
          options={[
            {
              value: 'suivi',
              label: 'Suivi',
              icon: IconInbox,
              count: typeof openRequestsCount === 'number' ? openRequestsCount : undefined,
            },
            {
              value: 'dashboard',
              label: 'Tableau de bord',
              icon: IconDashboard,
            },
          ]}
        />
      </nav>

      {/* Action buttons & Session */}
      <div className="topbar__actions">
        <Button
          variant="primary"
          size="md"
          icon={IconPlus}
          onClick={onNewRequest}
          aria-label="Créer une nouvelle demande"
        >
          Nouvelle demande
        </Button>

        <div className="topbar__user-menu" title={`Connecté en tant que ${agentName}`}>
          <div className="topbar__avatar" aria-hidden="true">
            {userInitials}
          </div>
          <span className="topbar__user-name">{agentName}</span>
          <span className="topbar__realtime-dot" title="Synchronisation temps réel active" aria-label="Temps réel actif" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => supabase.auth.signOut()}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            style={{ padding: '4px 6px', minHeight: '26px' }}
          >
            <IconLogOut size={15} />
          </Button>
        </div>
      </div>
    </header>
  )
}
