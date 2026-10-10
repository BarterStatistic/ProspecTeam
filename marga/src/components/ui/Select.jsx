export default function Select({
  label,
  id,
  options = [],
  placeholder = 'Selecciona…',
  className = '',
  ...props
}) {
  // Sin valor elegido, el texto del placeholder ("Opcional", "Selecciona…") va
  // en gris: en blanco se leía como si ya hubiera un dato capturado.
  const vacio = placeholder !== null && (props.value === '' || props.value == null);
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="m-label">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`m-input appearance-none pr-8 ${vacio ? 'text-ink-faint' : ''}`}
        {...props}
      >
        {placeholder !== null && (
          <option value="" className="text-ink-faint">
            {placeholder}
          </option>
        )}
        {options.map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value;
          const label = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={value} value={value} className="text-ink">
              {label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
