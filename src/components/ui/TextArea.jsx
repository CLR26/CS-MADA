/**
 * Zone de texte standardisée
 */

export default function TextArea({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
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
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        required={required}
        className="ui-textarea"
        {...props}
      />
      {error && <p className="ui-field__msg ui-field__msg--error">{error}</p>}
      {helper && !error && <p className="ui-field__msg ui-field__msg--helper">{helper}</p>}
    </div>
  )
}
