export default function Card({ className = '', children, ...props }) {
  return (
    <div className={`m-glass rounded-2xl ${className}`} {...props}>
      {children}
    </div>
  );
}
