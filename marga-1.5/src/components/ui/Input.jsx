export default function Input({ label, id, required, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="m-label">
          {label} {required && <span className="text-gold">*</span>}
        </label>
      )}
      <input id={id} className="m-input" {...props} />
    </div>
  );
}

export function Textarea({ label, id, className = '', rows = 3, ...props }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="m-label">
          {label}
        </label>
      )}
      <textarea id={id} rows={rows} className="m-input resize-y" {...props} />
    </div>
  );
}
