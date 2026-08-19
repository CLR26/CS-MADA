const LABELS = {
  nous: 'Nous',
  client: 'Client',
  departement: 'Département',
  done: 'Traité',
}

export default function StatePill({ state, label }) {
  return (
    <span className={`state-pill ${state}`}>
      <span className={`state-dot ${state}`} />
      {label || LABELS[state]}
    </span>
  )
}
