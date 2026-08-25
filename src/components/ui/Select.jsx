/**
 * Select standardisé (valeurs fermées) — même structure que Input
 * pour rester cohérent avec le design system existant.
 */

export default function Select({
  id,
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Sélectionner…',
  icon: Icon,
  error,
  helper,
  required = false,
  className = '',
  ...props
}) {
  return (
    <div className={`ui-field ${error ? 'ui-field--error' : ''} ${className}`}>
      {label && (
        <label htmlFor={id} className="ui-label">
          {label} {required && <span className="ui-label__req">*</span>}
        </label>
      )}
      <div className="ui-input-wrapper">
        {Icon && <Icon size={17} className="ui-input__icon" />}
        <select
          id={id}
          value={value}
          onChange={onChange}
          required={required}
          className={`ui-input ui-select ${Icon ? 'ui-input--with-icon' : ''}`}
          {...props}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="ui-field__msg ui-field__msg--error">{error}</p>}
      {helper && !error && <p className="ui-field__msg ui-field__msg--helper">{helper}</p>}
    </div>
  )
}
