import { formatDateTime } from '../lib/time'

export default function ActivityFeed({ events = [] }) {
  if (events.length === 0) {
    return <div className="activity-feed__empty">Aucune activité pour l'instant.</div>
  }

  return (
    <div className="activity-feed">
      {events.map(event =>
        event.kind === 'message' ? (
          <div key={event.id} className="activity-feed__message">
            <div className="activity-feed__message-meta">
              <span className="activity-feed__author">{event.author_name}</span>
              <span className="activity-feed__time">{formatDateTime(event.created_at)}</span>
            </div>
            <div className="activity-feed__message-content">{event.content}</div>
          </div>
        ) : (
          <div key={event.id} className="activity-feed__system">
            <span>{event.content}</span>
            <span className="activity-feed__time">{formatDateTime(event.created_at)}</span>
          </div>
        )
      )}
    </div>
  )
}
