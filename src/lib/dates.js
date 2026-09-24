const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
})

export function getDueState(value, now = new Date()) {
  if (!value) return 'none'
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return 'none'
  if (due < now) return 'overdue'
  if (due.toDateString() === now.toDateString()) return 'due_today'
  return 'upcoming'
}

export function getRequestDueState(request, now = new Date()) {
  if (request?.status === 'Resolved' && request.customer_feedback_due_at) return 'resolved'
  return getDueState(request?.customer_feedback_due_at, now)
}

export function formatDateTime(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date)
}

export function compareTimestamps(left, right) {
  const leftTime = new Date(left || 0).getTime()
  const rightTime = new Date(right || 0).getTime()
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime
  return String(left || '').localeCompare(String(right || ''))
}

export function formatDueDate(value, now = new Date()) {
  if (!value) return 'Sans échéance'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date invalide'
  const state = getDueState(value, now)
  const label = state === 'overdue' ? 'En retard' : state === 'due_today' ? 'Aujourd’hui' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${label} · ${time}`
}

export function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function fromLocalDateTimeInput(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
