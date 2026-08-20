/**
 * Input textuel standardisé avec label, helper et icône
 */

export default function Input({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  icon: Icon,
  error,
  helper,
  required = false,
  autoFocus = false,
  list,
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
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          list={list}
          className={`ui-input ${Icon ? 'ui-input--with-icon' : ''}`}
          {...props}
        />
      </div>
      {error && <p className="ui-field__msg ui-field__msg--error">{error}</p>}
      {helper && !error && <p className="ui-field__msg ui-field__msg--helper">{helper}</p>}
    </div>
  )
}
