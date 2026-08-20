/**
 * Synchronisation d'état avec l'URL (Deep linking & partage direct de dossiers)
 */

export function getUrlParams() {
  const search = new URLSearchParams(window.location.search)
  return {
    tab: search.get('tab') || 'suivi',
    dossier: search.get('dossier') || null,
    filter: search.get('filter') || 'tous',
  }
}

export function updateUrlParams({ tab, dossier, filter }) {
  const url = new URL(window.location.href)
  
  if (tab && tab !== 'suivi') {
    url.searchParams.set('tab', tab)
  } else {
    url.searchParams.delete('tab')
  }

  if (dossier) {
    url.searchParams.set('dossier', dossier)
  } else {
    url.searchParams.delete('dossier')
  }

  if (filter && filter !== 'tous') {
    url.searchParams.set('filter', filter)
  } else {
    url.searchParams.delete('filter')
  }

  window.history.replaceState({}, '', url.toString())
}
