import { STATUSES } from '../../lib/constants'

const slug = status => status.toLowerCase().replace(/\s+/g, '-')

export default function StatusPill({ status = 'Open', onChange, editable = false, disabled = false }) {
  const normalized = status || 'Open'
  const styleStatus = ({ New: 'Open', 'Waiting on Customer': 'Waiting', 'Waiting on Operations': 'Escalated', 'Waiting on External Operations': 'Escalated', Closed: 'Resolved' })[normalized] || (STATUSES.includes(normalized) ? normalized : 'Open')
  const className = `status-pill status-pill--${slug(styleStatus)}${editable ? ' status-pill--clickable' : ''}`

  if (!editable) {
    return <span className={className} aria-label={`Statut : ${normalized}`}>
      <span className="status-pill__text">{normalized}</span>
    </span>
  }

  // A native select keeps the menu inside the browser's own layer, so it cannot
  // be clipped by the queue, a scroll container, or the detail drawer.
  return <span className="status-pill-container">
    <span className={className} aria-hidden="true"><span className="status-pill__text">{normalized}</span><span className="status-pill__chevron">⌄</span></span>
    <select
      className="status-pill__select"
      aria-label="Modifier le statut"
      value={normalized}
      disabled={disabled}
      onChange={event => onChange?.(event.target.value)}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      {STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
  </span>
}
