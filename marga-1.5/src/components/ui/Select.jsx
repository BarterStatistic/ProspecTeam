export default function Select({
  label,
  id,
  options = [],
  placeholder = 'Selecciona…',
  className = '',
  ...props
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="m-label">
          {label}
        </label>
      )}
      <select id={id} className="m-input appearance-none pr-8" {...props}>
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value;
          const label = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
