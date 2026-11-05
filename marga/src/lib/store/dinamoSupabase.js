// Créditos de la bandeja de Dinamo dentro de Marga (pestaña Procesos).
//
// Los escribe el servidor de los agentes (bandeja-dinamo, Vercel) en la tabla
// privada `dinamo_creditos`; Marga los lee con su sesión y los recibe al
// instante por el mismo canal de Realtime que el resto de las tablas. Lo demás
// (estado de las máquinas, forzar, detalle por crédito) va por funciones RPC
// que revisan quién llama (supabase/dinamo_panel.sql).
//
// Si las tablas aún no existen (antes de aplicar el SQL) todo queda vacío y
// Marga sigue funcionando igual.

const TABLA = 'dinamo_creditos';

export function crearDinamo(sb) {
  let creditos = new Map(); // folio → { ...data, desaparecido }
  let cache = null;
  const listeners = new Set();

  const lista = () => (cache ??= [...creditos.values()]);
  const notify = () => {
    cache = null;
    const l = lista();
    for (const cb of listeners) cb(l);
  };
  const fila = (r) => ({ ...(r.data ?? {}), folio: r.folio, desaparecido: Boolean(r.desaparecio_en) });

  async function recargar() {
    let data;
    try {
      const res = await sb.from(TABLA).select('folio, data, desaparecio_en');
      if (res?.error) throw new Error(res.error.message);
      data = res?.data;
    } catch (err) {
      // Sin la tabla (o sin permiso) no hay créditos que mostrar; no es fatal.
      console.warn('[marga] créditos de Dinamo no disponibles:', err.message);
      return;
    }
    if (!Array.isArray(data)) return;
    creditos = new Map(data.map((r) => [r.folio, fila(r)]));
    notify();
  }

  function escuchar(canal) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, (payload) => {
      if (payload.eventType === 'DELETE') creditos.delete(payload.old?.folio);
      else creditos.set(payload.new.folio, fila(payload.new));
      notify();
    });
  }

  function vaciar() {
    creditos = new Map();
    notify();
  }

  async function rpc(nombre, args) {
    const { data, error } = await sb.rpc(nombre, args);
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    recargar,
    escuchar,
    vaciar,
    api: {
      getCreditos: lista,
      onCreditosChange(cb) {
        listeners.add(cb);
        cb(lista());
        return () => listeners.delete(cb);
      },
      panel: () => rpc('dinamo_panel'),
      forzar: () => rpc('dinamo_forzar'),
      intervalo: (minutos) => rpc('dinamo_intervalo', { p_minutos: minutos }),
      maquinaActiva: (id, activo) => rpc('dinamo_maquina_activa', { p_id: id, p_activo: activo }),
      detalle: (folio) => rpc('dinamo_detalle', { p_folio: String(folio) }),
      pedirDetalle: (folio) => rpc('dinamo_pedir_detalle', { p_folio: String(folio) }),
    },
  };
}
