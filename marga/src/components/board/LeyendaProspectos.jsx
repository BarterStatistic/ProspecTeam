import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { ALEX_AVATAR } from '../../lib/alex.js';
import { INDICADOR, TONO_CHIP } from './ClientCard.jsx';

const CLAVE = 'marga_leyenda_prospectos';

function leerAbierta() {
  try {
    return localStorage.getItem(CLAVE) === 'abierta';
  } catch {
    return false;
  }
}

function Icono({ tono, etiqueta }) {
  const { Icon, clase } = INDICADOR[tono];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon size={14} className={clase} aria-hidden="true" />
      <span>{etiqueta}</span>
    </span>
  );
}

function Chip({ tono, children }) {
  return <span className={`m-chip ${TONO_CHIP[tono]}`}>{children}</span>;
}

/**
 * Simbología del tablero de Prospectos: qué significa cada foto, ícono y chip
 * de las tarjetas que sube Alex. Se puede ocultar; se recuerda por navegador.
 */
export default function LeyendaProspectos() {
  const [abierta, setAbierta] = useState(leerAbierta);

  function alternar() {
    const siguiente = !abierta;
    setAbierta(siguiente);
    try {
      localStorage.setItem(CLAVE, siguiente ? 'abierta' : 'cerrada');
    } catch {
      /* sin almacenamiento: solo se recuerda mientras la página esté abierta */
    }
  }

  return (
    <div className="px-4 pt-3 sm:px-6">
      <div className="rounded-xl border border-white/10 bg-navy-800/60">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierta}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-ink-muted transition hover:text-ink"
        >
          <Info size={14} className="text-sky2" />
          Simbología
          {!abierta && (
            <span className="ml-2 hidden min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap font-normal md:flex">
              <Icono tono="caliente" etiqueta="Caliente" />
              <Icono tono="tibio" etiqueta="Tibio" />
              <Icono tono="frio" etiqueta="Frío" />
              <Icono tono="activado" etiqueta="Chat activado" />
              <Icono tono="desactivado" etiqueta="Chat desactivado" />
              <span>· Foto del perro = lead de Alex</span>
            </span>
          )}
          <ChevronDown size={14} className={`ml-auto transition ${abierta ? 'rotate-180' : ''}`} />
        </button>

        {abierta && (
          <dl className="grid gap-x-6 gap-y-2 border-t border-white/10 px-3 py-2.5 text-[11px] leading-snug text-ink-muted sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex items-center gap-2">
              <img src={ALEX_AVATAR} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
              <span>
                <b className="text-ink">Foto del perro:</b> lo subió Alex (el asistente de WhatsApp).
                Al pasar a Procesos lleva la foto del vendedor.
              </span>
            </div>

            <div className="space-y-1">
              <b className="text-ink">Temperatura del lead</b>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <Icono tono="caliente" etiqueta="Caliente" />
                <Icono tono="tibio" etiqueta="Tibio" />
                <Icono tono="frio" etiqueta="Frío" />
              </div>
            </div>

            <div className="space-y-1">
              <b className="text-ink">Chat de Alex</b>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <Icono tono="activado" etiqueta="Activado" />
                <Icono tono="desactivado" etiqueta="Desactivado" />
              </div>
            </div>

            <div className="space-y-1">
              <b className="text-ink">Le toca: …</b>
              <p>Vendedor que atiende al cliente, según el turno en que escribió.</p>
            </div>

            <div className="space-y-1">
              <b className="text-ink">Etiquetas</b>
              <div className="flex flex-wrap gap-1">
                <Chip tono="info">Catálogo enviado</Chip>
                <Chip tono="neutro">Crédito</Chip>
                <Chip tono="neutro">Motonómina</Chip>
                <Chip tono="neutro">Flex</Chip>
                <Chip tono="alerta">Requiere acción</Chip>
              </div>
              <p>
                «Catálogo enviado» solo sale en la columna Preguntas; en amarillo, las alertas para
                el vendedor.
              </p>
            </div>

            <div className="space-y-1">
              <b className="text-ink">Resumen y datos</b>
              <p>
                El bloque «Alex:» y la lista de enganche, pago, ingresos, etc. son lo que Alex juntó
                en la conversación (solo lectura).
              </p>
            </div>

            <div className="space-y-1 sm:col-span-2 xl:col-span-3">
              <b className="text-ink">Caducidad</b>
              <p>
                Las tarjetas de Alex que nadie mueve ni edita en 7 días se eliminan solas. Mover o
                editar una tarjeta reinicia ese plazo, y al pasar a Procesos ya no caduca.
              </p>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
