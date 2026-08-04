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
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
