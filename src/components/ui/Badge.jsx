/**
 * Badge sémantique d'état & d'alerte
 * États: nous, client, departement, done, stale, neutral
 */
import { IconAlertTriangle, IconCheck, IconClock, IconBuilding, IconUser } from '../../lib/icons'

const STATE_CONFIG = {
  nous: {
    label: 'Nous',
    sublabel: 'Action requise',
    icon: IconAlertTriangle,
    className: 'badge--nous',
  },
  client: {
    label: 'Client',
    sublabel: 'En attente',
    icon: IconUser,
    className: 'badge--client',
  },
  departement: {
    label: 'Département',
    sublabel: 'En attente tiers',
    icon: IconBuilding,
    className: 'badge--dept',
  },
  done: {
    label: 'Traité',
    sublabel: 'Résolu',
    icon: IconCheck,
    className: 'badge--done',
  },
  stale: {
    label: 'Sans update > 48h',
    sublabel: 'En retard',
    icon: IconClock,
    className: 'badge--stale',
  },
}

export default function Badge({
  state,
  label,
  sublabel,
  size = 'md',
  showDot = false,
  showIcon = true,
  className = '',
}) {
  const config = STATE_CONFIG[state] || {
    label: label || state,
    className: 'badge--neutral',
  }

  const displayLabel = label || config.label
  const IconComponent = config.icon

  return (
    <span className={`ui-badge ${config.className} ui-badge--${size} ${className}`}>
      {showDot && <span className="ui-badge__dot" />}
      {showIcon && IconComponent && <IconComponent size={size === 'sm' ? 12 : 14} className="ui-badge__icon" />}
      <span className="ui-badge__label">{displayLabel}</span>
      {sublabel && <span className="ui-badge__sublabel">{sublabel}</span>}
    </span>
  )
}
