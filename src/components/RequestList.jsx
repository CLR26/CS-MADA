import { useEffect, useMemo, useState } from 'react'
import RequestRow from './RequestRow'
import SegmentedControl from './ui/SegmentedControl'
import Input from './ui/Input'
import Button from './ui/Button'
import { RequestRowSkeleton } from './ui/Skeleton'
import { isStale } from '../lib/time'
import { IconSearch, IconInbox, IconAlertTriangle, IconUser, IconBuilding } from '../lib/icons'

export default function RequestList({
  demandes = [],
  loading = false,
  selectedId = null,
  onOpen,
  filter = 'tous',
  onFilterChange,
  currentUserId,
}) {
  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [, forceTick] = useState(0)

  // Rafraîchir les temps relatifs chaque minute
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  // Calcul des compteurs par état (sur les demandes non résolues sauf si showDone)
  const counts = useMemo(() => {
    const active = demandes.filter(d => !d.resolved_at)
    return {
      tous: active.length,
      nous: active.filter(d => d.waiting_on === 'nous').length,
      client: active.filter(d => d.waiting_on === 'client').length,
      departement: active.filter(d => d.waiting_on === 'departement').length,
      mine: active.filter(d => d.assigned_to === currentUserId).length,
    }
  }, [demandes, currentUserId])

  const visible = useMemo(() => {
    let list = demandes.filter(d => (showDone ? true : !d.resolved_at))
    
    if (filter === 'mine') {
      list = list.filter(d => d.assigned_to === currentUserId)
    } else if (filter !== 'tous') {
      list = list.filter(d => d.waiting_on === filter)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(d =>
        d.client_ref.toLowerCase().includes(q) ||
        d.objet.toLowerCase().includes(q) ||
        (d.situation || '').toLowerCase().includes(q) ||
        (d.departement || '').toLowerCase().includes(q)
      )
    }

    // Tri par priorité : Stale non résolu en premier, puis date de dernière mise à jour
    return [...list].sort((a, b) => {
      if (!a.resolved_at && !b.resolved_at) {
        const aStale = isStale(a.last_update_at)
        const bStale = isStale(b.last_update_at)
        if (aStale !== bStale) return aStale ? -1 : 1
      }
      return new Date(b.last_update_at) - new Date(a.last_update_at)
    })
  }, [demandes, filter, search, showDone, currentUserId])

  const hasAnyOpen = demandes.some(d => !d.resolved_at)
  const filtersActive = search.trim() !== '' || filter !== 'tous' || showDone

  function resetFilters() {
    setSearch('')
    onFilterChange?.('tous')
    setShowDone(false)
  }

  const filterOptions = [
    { value: 'tous', label: 'Tous', count: counts.tous },
    { value: 'mine', label: 'Mes demandes', count: counts.mine, icon: IconUser },
    { value: 'nous', label: 'Nous', count: counts.nous, icon: IconAlertTriangle },
    { value: 'client', label: 'Client', count: counts.client, icon: IconUser },
    { value: 'departement', label: 'Département', count: counts.departement, icon: IconBuilding },
  ]

  return (
    <div className="ui-card">
      <div className="ui-card__header">
        <h2 className="ui-card__title">
          <span>Flux des demandes</span>
          {!loading && (
            <span style={{ fontSize: 13, color: 'var(--ink-muted)', fontWeight: 500 }}>
              ({visible.length} affichée{visible.length > 1 ? 's' : ''})
            </span>
          )}
        </h2>

        {/* Toggle traités */}
        <label className="ui-toggle-check">
          <input
            type="checkbox"
            checked={showDone}
            onChange={e => setShowDone(e.target.checked)}
          />
          <span>Afficher les dossiers traités</span>
        </label>
      </div>

      {/* Toolbar avec recherche & segmented control */}
      <div className="ui-toolbar">
        <div className="ui-toolbar__left">
          <Input
            id="search-requests"
            placeholder="Rechercher par client, objet, situation, département…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={IconSearch}
            aria-label="Rechercher dans les demandes"
            style={{ marginBottom: 0 }}
          />
        </div>

        <div className="ui-toolbar__right">
          <SegmentedControl
            options={filterOptions}
            value={filter}
            onChange={onFilterChange || (() => {})}
            size="md"
          />
        </div>
      </div>

      {/* Contenu de la liste */}
      {loading ? (
        <div className="request-list">
          <RequestRowSkeleton />
          <RequestRowSkeleton />
          <RequestRowSkeleton />
          <RequestRowSkeleton />
        </div>
      ) : visible.length === 0 ? (
        <div className="ui-empty-state">
          <div className="ui-empty-state__icon">
            <IconInbox size={26} />
          </div>
          <h3 className="ui-empty-state__title">
            {search.trim()
              ? 'Aucun résultat pour cette recherche'
              : filter === 'mine'
              ? 'Aucune demande qui vous est attribuée'
              : filter !== 'tous'
              ? `Aucune demande dans la catégorie "${filter}"`
              : !hasAnyOpen && !showDone
              ? 'Tous les dossiers sont traités !'
              : 'Aucune demande à afficher'}
          </h3>
          <p className="ui-empty-state__description">
            {search.trim()
              ? 'Essayez de modifier vos termes de recherche ou de réinitialiser vos filtres.'
              : !hasAnyOpen && !showDone
              ? 'Félicitations à toute l’équipe, le tableau des demandes en cours est vide.'
              : 'Créez une nouvelle demande pour commencer le suivi.'}
          </p>
          {filtersActive && (
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="request-list-header">
            <span />
            <span>Client & Objet</span>
            <span>Situation actuelle</span>
            <span>Qui doit agir</span>
            <span className="request-list-header__time">Mise à jour</span>
          </div>

          <div className="request-list">
            {visible.map(demande => (
              <RequestRow
                key={demande.id}
                demande={demande}
                isSelected={selectedId === demande.id}
                onOpen={onOpen}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
