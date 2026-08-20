/**
 * Bouton standardisé et accessible
 * Variantes: primary, secondary, ghost, danger, outline
 * Tailles: sm, md, lg
 */

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  icon: Icon,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...props
}) {
  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    full ? 'ui-btn--full' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 15 : size === 'lg' ? 20 : 17} className="ui-btn__icon" />}
      <span>{children}</span>
    </button>
  )
}
