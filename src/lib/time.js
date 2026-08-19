export const STALE_THRESHOLD_HOURS = 48

export function formatRelative(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffH = Math.round(diffMs / 3600000)
  if (diffH < 1) return "à l'instant"
  if (diffH < 24) return `il y a ${diffH} h`
  const diffD = Math.round(diffH / 24)
  return `il y a ${diffD} j`
}

export function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isStale(lastUpdateAt) {
  const diffH = (Date.now() - new Date(lastUpdateAt).getTime()) / 3600000
  return diffH > STALE_THRESHOLD_HOURS
}

export function formatDuration(ms) {
  const hours = ms / 3600000
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))} min`
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} j`
}
