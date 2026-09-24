self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { payload = { body: event.data?.text() || '' } }
  event.waitUntil(self.registration.showNotification(payload.title || 'CS-MADA', {
    body: payload.body || 'Une demande nécessite votre attention.',
    tag: payload.deduplication_key || payload.id,
    data: { url: payload.url || '/' },
    icon: '/favicon.ico',
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) return existing.focus().then(client => client.navigate(url))
    return clients.openWindow(url)
  }))
})
