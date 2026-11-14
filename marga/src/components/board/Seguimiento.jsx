import { useEffect, useState } from 'react';
import { Hourglass, MessageCircle, PhoneCall, PhoneOff, CheckCheck } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canEditClient } from '../../lib/permissions.js';
import { enlaceWhatsApp, esperaDe, TIPOS_CONTACTO } from '../../lib/seguimiento.js';

const NIVEL = {
  ok: 'bg-white/5 text-ink-muted',
  aviso: 'bg-state-warning/15 text-state-warning',
  urgente: 'bg-state-danger/15 text-state-danger',
};

/** Reloj de la tarjeta: se vuelve a calcular cada minuto. */
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

/** Chip con el tiempo de espera o el último contacto (solo tarjetas de Alex en Prospectos). */
export function RelojEspera({ client }) {
  const ahora = useAhora();
  const espera = esperaDe(client, ahora);
  if (!espera) return null;
  const Icon = espera.contactado ? CheckCheck : Hourglass;
  return (
    <span className={`m-chip inline-flex items-center gap-1 ${NIVEL[espera.nivel]}`}>
      <Icon size={11} /> {espera.texto}
    </span>
  );
}

/**
 * Acciones de seguimiento de un cliente: abrir su chat en el WhatsApp del
 * vendedor (con el saludo ya escrito) y registrar en un toque qué pasó.
 * Abrir WhatsApp ya cuenta como contacto, para que el registro no le cueste
 * nada extra al vendedor. `noDrag` evita que el tablero lo tome como arrastre.
 */
export default function Seguimiento({ client, noDrag = {}, className = '' }) {
  const { registrarContacto } = useData();
  const { user, role } = useAuth();
  const [error, setError] = useState('');

  const puede = canEditClient(role, client, user?.username);
  const enlace = enlaceWhatsApp(client, user?.username);
  const conReloj = esperaDe(client) !== null;
  if (!enlace && !conReloj) return null;

  const registrar = (tipo) => {
    if (!puede) return;
    setError('');
    registrarContacto(client.id, tipo).catch((err) =>
      setError(err?.message || 'No se pudo guardar el seguimiento.'),
    );
  };

  const boton =
    'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition';

  return (
    <div className={className} {...noDrag}>
      <div className="flex flex-wrap items-center gap-1.5">
        <RelojEspera client={client} />
        {enlace && (
          <a
            href={enlace}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrar('whatsapp')}
            className={`${boton} bg-state-success/15 text-state-success hover:bg-state-success/25`}
            title="Abrir su chat en tu WhatsApp con el saludo ya escrito"
          >
            <MessageCircle size={12} /> WhatsApp
          </a>
        )}
        {conReloj && puede && (
          <>
            <button
              type="button"
              onClick={() => registrar('llamada')}
              className={`${boton} bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink`}
            >
              <PhoneCall size={12} /> {TIPOS_CONTACTO.llamada.label}
            </button>
            <button
              type="button"
              onClick={() => registrar('sin_respuesta')}
              className={`${boton} bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink`}
            >
              <PhoneOff size={12} /> {TIPOS_CONTACTO.sin_respuesta.label}
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-state-danger">{error}</p>}
    </div>
  );
}
