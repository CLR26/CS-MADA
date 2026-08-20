import { useEffect, useRef } from 'react'
import { IconX } from '../../lib/icons'

/**
 * Modale accessible pour actions courtes (ex: création de demande)
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = '500px',
  ariaLabel,
}) {
  const modalRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current?.()
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    // Focus initial uniquement à l'ouverture si aucun champ n'a déjà le focus
    if (modalRef.current && !modalRef.current.contains(document.activeElement)) {
      modalRef.current.focus()
    }

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="ui-modal-overlay animate-fade-in" onClick={onClose}>
      <div
        ref={modalRef}
        className="ui-modal animate-slide-up"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        tabIndex={-1}
      >
        <div className="ui-modal__header">
          <div className="ui-modal__header-info">
            {title && <h3 className="ui-modal__title">{title}</h3>}
            {subtitle && <div className="ui-modal__subtitle">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="ui-modal__close-btn"
            onClick={onClose}
            aria-label="Fermer la boîte de dialogue"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="ui-modal__body">
          {children}
        </div>

        {footer && (
          <div className="ui-modal__footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
