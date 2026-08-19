import { useMemo, useState } from 'react'
import { formatRelative, isStale } from '../lib/time'

export default function RequestList({ demandes, onOpen }) {
  const [filter, setFilter] = useState('tous')
  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)

  const visible = useMemo(() => {
    let list = demandes.filter(d => showDone ? true : !d.resolved_at)
    if (filter !== 'tous') list = list.filter(d => d.waiting_on === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(d =>
        d.client_ref.toLowerCase().includes(q) ||
        d.objet.toLowerCase().includes(q)
      )
    }
    // Dossiers non touchés depuis longtemps en premier, puis les plus récents.
    return [...list].sort((a, b) => {
      if (!a.resolved_at && !b.resolved_at) {
        const aStale = isStale(a.last_update_at)
        const bStale = isStale(b.last_update_at)
        if (aStale !== bStale) return aStale ? -1 : 1
      }
      return new Date(b.last_update_at) - new Date(a.last_update_at)
    })
  }, [demandes, filter, search, showDone])

  return (
    <div className="card">
      <h2>Demandes en cours</h2>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Rechercher un client ou un objet…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="filter-group">
          <button className={filter === 'tous' ? 'active' : ''} onClick={() => setFilter('tous')}>Tous</button>
          <button className={filter === 'nous' ? 'active' : ''} onClick={() => setFilter('nous')}>Nous</button>
          <button className={filter === 'client' ? 'active' : ''} onClick={() => setFilter('client')}>Client</button>
          <button className={filter === 'departement' ? 'active' : ''} onClick={() => setFilter('departement')}>Département</button>
        </div>
        <label className="toggle-line">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Afficher les dossiers traités
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">Aucune demande à afficher.</div>
      ) : (
        <div className="list">
          {visible.map(d => (
            <Row key={d.id} d={d} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ d, onOpen }) {
  const stateClass = d.resolved_at ? 'done' : d.waiting_on
  const stale = !d.resolved_at && isStale(d.last_update_at)

  return (
    <div className="request-row" onClick={() => onOpen(d)}>
      <div className={`stripe ${stateClass}`} />
      <div className="r-main">
        <div className="r-client">{d.client_ref}</div>
        <div className="r-objet">{d.objet}</div>
      </div>
      <div className="r-situation">
        {d.situation}
        {d.waiting_on === 'departement' && d.departement && (
          <span className="r-dept-tag"> · {d.departement}</span>
        )}
      </div>
      <div className={`r-meta ${stale ? 'stale' : ''}`}>
        {d.resolved_at ? 'Traité' : (stale ? 'Oubliée ?' : 'À jour')}
      </div>
      <div className="r-meta">{formatRelative(d.last_update_at)}</div>
    </div>
  )
}
