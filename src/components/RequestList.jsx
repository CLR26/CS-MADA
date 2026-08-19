import { useEffect, useMemo, useState } from 'react'
import { formatRelative, formatDateTime, isStale } from '../lib/time'
import StatePill from './StatePill'

export default function RequestList({ demandes, loading, onOpen }) {
  const [filter, setFilter] = useState('tous')
  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const visible = useMemo(() => {
    let list = demandes.filter(d => showDone ? true : !d.resolved_at)
    if (filter !== 'tous') list = list.filter(d => d.waiting_on === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(d =>
        d.client_ref.toLowerCase().includes(q) ||
        d.objet.toLowerCase().includes(q) ||
        (d.situation || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (!a.resolved_at && !b.resolved_at) {
        const aStale = isStale(a.last_update_at)
        const bStale = isStale(b.last_update_at)
        if (aStale !== bStale) return aStale ? -1 : 1
      }
      return new Date(b.last_update_at) - new Date(a.last_update_at)
    })
  }, [demandes, filter, search, showDone])

  const hasAnyOpen = demandes.some(d => !d.resolved_at)
  const filtersActive = search.trim() !== '' || filter !== 'tous'

  function resetFilters() {
    setSearch('')
    setFilter('tous')
  }

  return (
    <div className="card">
      <h2>Demandes en cours</h2>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Rechercher un client, un objet ou une situation…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Rechercher"
        />
        <div className="filter-group" role="group" aria-label="Filtrer par qui doit agir">
          {[['tous', 'Tous'], ['nous', 'Nous'], ['client', 'Client'], ['departement', 'Département']].map(([v, label]) => (
            <button key={v} className={filter === v ? 'active' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>
              {label}
            </button>
          ))}
        </div>
        <label className="toggle-line">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Afficher les dossiers traités
        </label>
      </div>

      {loading ? (
        <div className="empty-state">Chargement des demandes…</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <div>
            {search.trim() ? 'Aucun résultat pour cette recherche.'
              : filter !== 'tous' ? 'Aucune demande ne correspond à ce filtre.'
              : !hasAnyOpen && !showDone ? 'Aucun dossier en cours. Tout est traité.'
              : 'Aucune demande à afficher.'}
          </div>
          {filtersActive && (
            <button className="btn secondary small" style={{ marginTop: 12 }} onClick={resetFilters}>
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="list-header">
            <span />
            <span>Client / Objet</span>
            <span>Situation</span>
            <span>Qui doit agir</span>
            <span>Mise à jour</span>
          </div>
          <div className="list">
            {visible.map(d => <Row key={d.id} d={d} onOpen={onOpen} />)}
          </div>
        </>
      )}
    </div>
  )
}

function Row({ d, onOpen }) {
  const stateClass = d.resolved_at ? 'done' : d.waiting_on
  const stale = !d.resolved_at && isStale(d.last_update_at)
  const situationDiffersFromObjet = d.situation && d.situation.trim() !== d.objet.trim()

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(d.id)
    }
  }

  return (
    <div
      className="request-row"
      onClick={() => onOpen(d.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${d.client_ref} — ${d.objet}${stale ? ', sans mise à jour depuis plus de 48h' : ''}`}
    >
      <div className={`stripe ${stateClass}`} />
      <div className="r-main">
        <div className="r-client">{d.client_ref}</div>
        <div className="r-objet">{d.objet}</div>
      </div>
      <div className="r-situation">
        {situationDiffersFromObjet ? d.situation : <span className="r-new">Nouvelle demande</span>}
        {d.waiting_on === 'departement' && d.departement && <span className="r-dept-tag"> · {d.departement}</span>}
      </div>
      <div className="r-who">
        <StatePill state={stateClass} />
        {stale && <span className="urgency-badge">⚠ Oubliée</span>}
      </div>
      <div className="r-meta r-time" title={`Créée : ${formatDateTime(d.created_at)}`}>
        {formatRelative(d.last_update_at)}
      </div>
    </div>
  )
}
