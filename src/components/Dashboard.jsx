import { useMemo } from 'react'
import { isStale, formatDuration } from '../lib/time'

export default function Dashboard({ demandes, loading }) {
  const stats = useMemo(() => {
    const open = demandes.filter(d => !d.resolved_at)
    const resolved = demandes.filter(d => d.resolved_at)
    const stale = open.filter(d => isStale(d.last_update_at))

    const avgMs = resolved.length
      ? resolved.reduce((sum, d) => sum + (new Date(d.resolved_at) - new Date(d.created_at)), 0) / resolved.length
      : null

    const byAgent = groupCount(open, d => d.created_by_name)
    const byDept = groupCount(open.filter(d => d.waiting_on === 'departement'), d => d.departement || '—')

    return { open: open.length, stale: stale.length, avgMs, resolvedCount: resolved.length, byAgent, byDept }
  }, [demandes])

  return (
    <div className="card">
      <h2>Tableau de bord</h2>

      {loading ? (
        <div className="empty-state">Chargement des données…</div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="num">{stats.open}</div>
              <div className="lbl">Dossiers ouverts</div>
            </div>
            <div className={`kpi ${stats.stale > 0 ? 'warn' : ''}`}>
              <div className="num">{stats.stale}</div>
              <div className="lbl">Sans mise à jour depuis 48h+</div>
            </div>
            <div className="kpi">
              <div className="num">{stats.avgMs ? formatDuration(stats.avgMs) : '—'}</div>
              <div className="lbl">Délai moyen de traitement</div>
            </div>
            <div className="kpi">
              <div className="num">{stats.resolvedCount}</div>
              <div className="lbl">Dossiers traités (total)</div>
            </div>
          </div>

          <div className="breakdown">
            <BreakdownList title="Charge par créateur" data={stats.byAgent} />
            <BreakdownList title="Charge par département" data={stats.byDept} />
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

function BreakdownList({ title, data }) {
  const max = data.length ? Math.max(...data.map(([, c]) => c)) : 1
  return (
    <div>
      <h3 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', margin: '0 0 8px' }}>
        {title}
      </h3>
      {data.length === 0 ? (
        <div className="empty-state" style={{ padding: 16 }}>Aucune donnée.</div>
      ) : (
        data.map(([label, count]) => (
          <div className="bd-row" key={label}>
            <span className="bd-label">{label}</span>
            <span className="bd-bar" style={{ width: `${(count / max) * 60}px` }} />
            <span className="bd-count">{count}</span>
          </div>
        ))
      )}
    </div>
  )
}
