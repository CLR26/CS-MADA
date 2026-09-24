import { useState, useRef, useEffect } from 'react'
import { STATUSES } from '../../lib/constants'

export default function StatusPill({ status = 'Open', onChange, editable = false }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  const normalized = STATUSES.includes(status) ? status : 'Open'
  const statusSlug = normalized.toLowerCase().replace(/\s+/g, '-')

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSelect(newStatus, e) {
    e.stopPropagation()
    setOpen(false)
    if (newStatus !== status && onChange) {
      onChange(newStatus)
    }
  }

  return (
    <div className="status-pill-container" ref={menuRef}>
      <button
        type="button"
        className={`status-pill status-pill--${statusSlug} ${editable ? 'status-pill--clickable' : ''}`}
        onClick={editable ? (e) => { e.stopPropagation(); setOpen(!open) } : undefined}
        title={editable ? 'Click to change status' : status}
      >
        <span className="status-pill__text">{normalized}</span>
      </button>

      {open && (
        <div className="status-menu" onClick={e => e.stopPropagation()}>
          {STATUSES.map(s => {
            const sSlug = s.toLowerCase().replace(/\s+/g, '-')
            const isSelected = s === normalized
            return (
              <button
                key={s}
                type="button"
                className={`status-menu__item status-menu__item--${sSlug} ${isSelected ? 'is-selected' : ''}`}
                onClick={(e) => handleSelect(s, e)}
              >
                <span>{s}</span>
                {isSelected && <span className="status-menu__check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
