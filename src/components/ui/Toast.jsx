import { IconCheck, IconAlertTriangle, IconX } from '../../lib/icons'

/**
 * Toast Notification
 * Types: success, error, warning, info
 */
export default function Toast({ message, type = 'success', onClose }) {
  if (!message) return null

  const isError = type === 'error'
  const isWarn = type === 'warning'

  const Icon = isError || isWarn ? IconAlertTriangle : IconCheck

  return (
    <div
      className={`ui-toast ui-toast--${type} animate-slide-up`}
      role="status"
      aria-live="polite"
    >
      <div className="ui-toast__icon">
        <Icon size={16} />
      </div>
      <div className="ui-toast__message">{message}</div>
      {onClose && (
        <button
          type="button"
          className="ui-toast__close"
          onClick={onClose}
          aria-label="Fermer la notification"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  )
}
