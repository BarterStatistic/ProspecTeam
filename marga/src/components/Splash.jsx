import { useEffect, useState } from 'react';

/**
 * Entrada animada, una vez por carga de la página. Con "reducir movimiento"
 * activado no se muestra: sus animaciones quedarían congeladas tapando la app.
 */
export default function Splash() {
  const [visible, setVisible] = useState(
    () =>
      typeof window !== 'undefined' &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!visible) return undefined;
    const id = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(id);
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="m-splash" aria-hidden="true">
      <div className="relative text-center">
        <div className="m-splash-word text-ink">
          {[...'Marga'].map((letra, i) => (
            <span key={i} style={{ '--i': i }}>
              {letra}
            </span>
          ))}
        </div>
        <i className="m-splash-line" />
        <small className="m-splash-sub">Dinamo Saltillo</small>
      </div>
    </div>
  );
}
