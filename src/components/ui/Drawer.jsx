import { useEffect, useRef } from 'react'
import { IconX } from '../../lib/icons'

/**
 * Slide-Over Drawer (Panneau latéral droit)
 */
export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = '520px',
  ariaLabel,
}) {
  const drawerRef = useRef(null)
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

    // Prise de focus initiale uniquement lors du montage du tiroir
    if (drawerRef.current && !drawerRef.current.contains(document.activeElement)) {
      drawerRef.current.focus()
    }

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="ui-drawer-overlay animate-fade-in" onClick={onClose}>
      <div
        ref={drawerRef}
        className="ui-drawer animate-slide-right"
        style={{ width, maxWidth: '100vw' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        tabIndex={-1}
      >
        {/* Drawer Header */}
        <div className="ui-drawer__header">
          <div className="ui-drawer__header-info">
            {title && <h3 className="ui-drawer__title">{title}</h3>}
            {subtitle && <div className="ui-drawer__subtitle">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="ui-drawer__close-btn"
            onClick={onClose}
            aria-label="Fermer le panneau"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="ui-drawer__body">
          {children}
        </div>

        {/* Drawer Footer */}
        {footer && (
          <div className="ui-drawer__footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
