import { useState, useMemo } from 'react'
import { isStale, formatDuration } from '../lib/time'
import { IconInbox, IconClock, IconCheck, IconAlertTriangle, IconUsers, IconBuilding } from '../lib/icons'
import { Skeleton } from './ui/Skeleton'
import SegmentedControl from './ui/SegmentedControl'

export default function Dashboard({ demandes = [], loading = false, onSelectFilter }) {
  const [period, setPeriod] = useState('all')

  const periodFilteredDemandes = useMemo(() => {
    if (period === 'all') return demandes

    const now = Date.now()
    let cutoff = 0

    if (period === 'today') {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      cutoff = todayStart.getTime()
    } else if (period === '7d') {
      cutoff = now - 7 * 24 * 3600 * 1000
    } else if (period === '30d') {
      cutoff = now - 30 * 24 * 3600 * 1000
    }

    return demandes.filter(d => {
      const createdTime = new Date(d.created_at).getTime()
      const resolvedTime = d.resolved_at ? new Date(d.resolved_at).getTime() : null
      // Inclure les dossiers créés ou résolus dans la fenêtre sélectionnée
      return createdTime >= cutoff || (resolvedTime && resolvedTime >= cutoff)
    })
  }, [demandes, period])

  const stats = useMemo(() => {
    const list = periodFilteredDemandes
    const open = list.filter(d => !d.resolved_at)
    const resolved = list.filter(d => d.resolved_at)
    const stale = open.filter(d => isStale(d.last_update_at))

    const avgMs = resolved.length
      ? resolved.reduce((sum, d) => sum + (new Date(d.resolved_at) - new Date(d.created_at)), 0) / resolved.length
      : null

    const byAgent = groupCount(open, d => d.created_by_name || 'Inconnu')
    const byDept = groupCount(
      open.filter(d => d.waiting_on === 'departement'),
      d => d.departement || 'Non spécifié'
    )
    const byState = {
      nous: open.filter(d => d.waiting_on === 'nous').length,
      client: open.filter(d => d.waiting_on === 'client').length,
      departement: open.filter(d => d.waiting_on === 'departement').length,
    }

    return {
      openCount: open.length,
      staleCount: stale.length,
      avgMs,
      resolvedCount: resolved.length,
      byAgent,
      byDept,
      byState,
    }
  }, [periodFilteredDemandes])

  const periodOptions = [
    { value: 'today', label: "Aujourd'hui" },
    { value: '7d', label: '7 jours' },
    { value: '30d', label: '30 jours' },
    { value: 'all', label: 'Tout' },
  ]

  const periodLabel =
    period === 'today'
      ? "aujourd'hui"
      : period === '7d'
      ? 'sur les 7 derniers jours'
      : period === '30d'
      ? 'sur les 30 derniers jours'
      : "sur l'ensemble de l'historique"

  return (
    <div className="ui-card">
      <div className="ui-card__header">
        <div>
          <h2 className="ui-card__title">
            <span>Tableau de bord & Activité de l'équipe</span>
          </h2>
          <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
            Statistiques et charge {periodLabel}
          </span>
        </div>

        {/* Sélecteur de période */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SegmentedControl
            options={periodOptions}
            value={period}
            onChange={setPeriod}
            size="sm"
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="dashboard-kpis">
            <Skeleton height="110px" borderRadius="var(--radius-lg)" />
            <Skeleton height="110px" borderRadius="var(--radius-lg)" />
            <Skeleton height="110px" borderRadius="var(--radius-lg)" />
            <Skeleton height="110px" borderRadius="var(--radius-lg)" />
          </div>
          <div className="dashboard-breakdown">
            <Skeleton height="220px" borderRadius="var(--radius-lg)" />
            <Skeleton height="220px" borderRadius="var(--radius-lg)" />
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="dashboard-kpis">
            {/* Dossiers ouverts */}
            <div
              className="kpi-card"
              onClick={() => onSelectFilter?.('suivi', 'tous')}
              title="Voir tous les dossiers ouverts"
              role="button"
              tabIndex={0}
            >
              <div className="kpi-card__top">
                <span className="kpi-card__title">Dossiers ouverts</span>
                <IconInbox size={18} />
              </div>
              <div className="kpi-card__value">{stats.openCount}</div>
              <div className="kpi-card__meta">
                {stats.byState.nous} équipe · {stats.byState.client} client · {stats.byState.departement} dept
              </div>
            </div>

            {/* Dossiers sans màj > 48h */}
            <div
              className={`kpi-card ${stats.staleCount > 0 ? 'kpi-card--warn' : 'kpi-card--success'}`}
              onClick={() => onSelectFilter?.('suivi', 'tous')}
              title="Voir les dossiers prioritaires"
              role="button"
              tabIndex={0}
            >
              <div className="kpi-card__top">
                <span className="kpi-card__title">Sans màj depuis 48h+</span>
                <IconAlertTriangle size={18} />
              </div>
              <div className="kpi-card__value">{stats.staleCount}</div>
              <div className="kpi-card__meta">
                {stats.staleCount > 0
                  ? '⚠️ Attention requise prioritaire'
                  : '✓ Aucun dossier en souffrance'}
              </div>
            </div>

            {/* Délai moyen de traitement */}
            <div className="kpi-card kpi-card--info">
              <div className="kpi-card__top">
                <span className="kpi-card__title">Délai moyen de résolution</span>
                <IconClock size={18} />
              </div>
              <div className="kpi-card__value">
                {stats.avgMs ? formatDuration(stats.avgMs) : '—'}
              </div>
              <div className="kpi-card__meta">
                Calculé sur les {stats.resolvedCount} dossiers résolus
              </div>
            </div>

            {/* Total traités */}
            <div className="kpi-card kpi-card--success">
              <div className="kpi-card__top">
                <span className="kpi-card__title">Dossiers traités</span>
                <IconCheck size={18} />
              </div>
              <div className="kpi-card__value">{stats.resolvedCount}</div>
              <div className="kpi-card__meta">
                {stats.openCount + stats.resolvedCount > 0
                  ? `${Math.round(
                      (stats.resolvedCount / (stats.openCount + stats.resolvedCount)) * 100
                    )}% de taux de clôture`
                  : 'Historique de période'}
              </div>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="dashboard-breakdown">
            <BreakdownCard
              title="Charge en cours par agent créateur"
              icon={IconUsers}
              data={stats.byAgent}
              emptyMsg="Aucun dossier ouvert sur cette période."
            />
            <BreakdownCard
              title="Demandes en attente par département"
              icon={IconBuilding}
              data={stats.byDept}
              emptyMsg="Aucune demande en attente d'un service tiers sur cette période."
            />
          </div>
        </>
      )}
    </div>
  )
}

function groupCount(list, keyFn) {
  const map = {}
  for (const item of list) {
    const k = keyFn(item)
    map[k] = (map[k] || 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1])
}

function BreakdownCard({ title, icon: Icon, data = [], emptyMsg }) {
  const max = data.length ? Math.max(...data.map(([, c]) => c)) : 1

  return (
    <div className="breakdown-card">
      <h3 className="breakdown-card__title">
        {Icon && <Icon size={16} />}
        <span>{title}</span>
      </h3>
      {data.length === 0 ? (
        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
          {emptyMsg}
        </div>
      ) : (
        <div className="breakdown-list">
          {data.map(([label, count]) => {
            const pct = Math.round((count / max) * 100)
            return (
              <div className="breakdown-item" key={label}>
                <span className="breakdown-item__name">{label}</span>
                <div className="breakdown-item__bar-wrapper" title={`${count} dossier(s)`}>
                  <div className="breakdown-item__bar" style={{ width: `${pct}%` }} />
                </div>
                <span className="breakdown-item__count">{count}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
