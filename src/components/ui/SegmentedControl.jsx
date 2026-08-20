/**
 * Segmented Control moderne pour filtres et onglets
 * Options format: [{ value: 'nous', label: 'Nous', count: 5, icon: Icon }]
 */

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  full = false,
  className = '',
}) {
  return (
    <div
      role="group"
      className={`ui-segmented ${full ? 'ui-segmented--full' : ''} ui-segmented--${size} ${className}`}
    >
      {options.map((opt) => {
        const isActive = value === opt.value
        const IconComponent = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            className={`ui-segmented__btn ${isActive ? 'ui-segmented__btn--active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
          >
            {IconComponent && <IconComponent size={14} className="ui-segmented__icon" />}
            <span className="ui-segmented__label">{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span className={`ui-segmented__count ${isActive ? 'ui-segmented__count--active' : ''}`}>
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
