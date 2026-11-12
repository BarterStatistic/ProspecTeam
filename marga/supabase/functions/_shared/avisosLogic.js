// Qué avisar y a quién cuando cambia algo en Marga. JS plano, sin
// dependencias: lo importan la Edge Function marga-avisos (Deno) y las pruebas
// (Vitest). La Edge Function la dispara el trigger `marga_avisar` de Supabase,
// así que cubre lo que mueve la app, Alex (n8n) y la bandeja de Dinamo.
//
// Canales:
//   push      → notificación al teléfono / navegador (Web Push), aunque Marga
//               esté cerrada. Para todo lo de abajo.
//   telegram  → mensaje del bot de avisos. Solo para lo que pidió Braulio:
//               clientes que llegan a "Envío de docs / Cita agendada" y citas.

export const COLUMNAS = {
  prospectos: {
    primer_contacto: 'Primer contacto',
    preguntas: 'Preguntas',
    interesado_proceso: 'Interesado en proceso',
    envio_docs_cita: 'Envío de docs / Cita agendada',
    proceso_comenzado: 'Proceso comenzado',
  },
  procesos: {
    credito_por_subir: 'Crédito por subir',
    bnc: 'BNC',
    vfs_call_center: 'VFS / Call center',
    ec: 'EC',
    moto_facturada: 'Moto Facturada',
    entrega_agendada: 'Entrega agendada',
    moto_entregada: 'Moto entregada',
  },
};

/** Un registro insertado hace más de esto no avisa (p. ej. restaurar un respaldo). */
export const MAX_ANTIGUEDAD_ALTA = 60 * 60 * 1000;

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function nombreCliente(d) {
  return `${d?.firstName ?? ''} ${d?.lastName ?? ''}`.trim() || 'Sin nombre';
}

/** "vie 7 nov, 4:30 p.m." en hora de Saltillo (o solo la fecha). */
export function fechaCorta(ts, conHora = true) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
  const opts = { timeZone: 'America/Monterrey', weekday: 'short', day: 'numeric', month: 'short' };
  if (conHora) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return new Intl.DateTimeFormat('es-MX', opts).format(new Date(ts));
}

/**
 * Avisos que tocan por un evento del trigger.
 * evento = { tabla, op: 'INSERT' | 'UPDATE', antes: {section, stage} | {fechaCita} | null, data }
 * usuarios = [{ username, role }]
 * Devuelve [{ destinatario, titulo, cuerpo, telegram (texto HTML o null), tag }].
 */
export function decidirAvisos(evento, usuarios = [], ahora = Date.now()) {
  const { tabla, op, antes, data } = evento ?? {};
  if (!data) return [];
  if (op === 'INSERT' && typeof data.createdAt === 'number' && ahora - data.createdAt > MAX_ANTIGUEDAD_ALTA) {
    return [];
  }
  const admins = usuarios.filter((u) => u.role === 'admin' && u.username).map((u) => u.username);
  const avisos = [];
  const agregar = (destinatarios, aviso) => {
    for (const d of new Set(destinatarios.filter(Boolean))) avisos.push({ destinatario: d, ...aviso });
  };

  if (tabla === 'marga_clients') {
    const de = antes ?? { section: null, stage: null };
    const a = { section: data.section, stage: data.stage };
    if (de.section === a.section && de.stage === a.stage) return [];
    const nombre = nombreCliente(data);
    const tag = `cliente-${data.id}`;

    if (a.section === 'prospectos' && a.stage === 'envio_docs_cita') {
      const lineas = [
        '📄 <b>Envío de docs / Cita agendada</b>',
        '',
        `Cliente: ${esc(nombre)}`,
        `Tel: ${esc(data.phone || 'Sin teléfono')}`,
      ];
      if (data.motorcycles) lineas.push(`Moto: ${esc(data.motorcycles)}`);
      lineas.push(`Vendedor: ${esc(data.createdBy || 'Sin asignar')}`);
      if (data.origen === 'alex' && data.resumenAlex) {
        lineas.push('', '<b>Resumen de Alex</b>', esc(String(data.resumenAlex).slice(0, 1500)));
      } else if (data.notes) {
        lineas.push('', '<b>Notas</b>', esc(String(data.notes).slice(0, 1500)));
      }
      agregar([data.createdBy], {
        titulo: '📄 Envío de docs / Cita agendada',
        cuerpo: `${nombre} ya está en Envío de docs / Cita agendada`,
        telegram: lineas.join('\n'),
        tag,
      });
      return avisos;
    }

    if (a.section === 'procesos') {
      const columna = COLUMNAS.procesos[a.stage] ?? a.stage;
      if (de.section !== 'procesos') {
        agregar(admins, {
          titulo: '🆕 Nuevo proceso',
          cuerpo: `${nombre} entró a Procesos (${columna})`,
          telegram: null,
          tag,
        });
      }
      agregar([data.createdBy, data.promotorEncargado], {
        titulo: `🏍️ ${nombre}`,
        cuerpo: `Su crédito pasó a ${columna}`,
        telegram: null,
        tag,
      });
      return avisos;
    }

    if (a.section === 'ventas' && de.section !== 'ventas') {
      agregar([data.createdBy, data.promotorEncargado, ...admins], {
        titulo: '🎉 Moto entregada',
        cuerpo: `La moto de ${nombre} ya fue entregada`,
        telegram: null,
        tag,
      });
      return avisos;
    }

    if (a.section === 'cancelados' && de.section !== 'cancelados') {
      agregar([data.createdBy], {
        titulo: 'Cliente cancelado',
        cuerpo: `${nombre} pasó a Clientes cancelados`,
        telegram: null,
        tag,
      });
    }
    return avisos;
  }

  if (tabla === 'marga_citas') {
    const reagendada = op === 'UPDATE';
    if (reagendada && antes?.fechaCita === data.fechaCita) return [];
    const nombre = String(data.clientName || '').trim() || 'un cliente';
    const cuando = fechaCorta(data.fechaCita, !!data.hasTime);
    const titulo = reagendada ? '📅 Cita reagendada' : '📅 Cita agendada';
    const lineas = [
      `📅 <b>${reagendada ? 'Cita reagendada' : 'Cita agendada'}</b>`,
      '',
      `Cliente: ${esc(nombre)}`,
      `Cuándo: ${esc(cuando || 'Sin fecha')}`,
    ];
    if (data.phone) lineas.push(`Tel: ${esc(data.phone)}`);
    if (data.motorcycle) lineas.push(`Moto: ${esc(data.motorcycle)}`);
    lineas.push(`Agendó: ${esc(data.createdBy || 'Sin asignar')}`);
    if (data.description) lineas.push('', esc(String(data.description).slice(0, 1500)));
    agregar([data.createdBy, ...admins], {
      titulo,
      cuerpo: `${nombre}${cuando ? ` · ${cuando}` : ''}`,
      telegram: lineas.join('\n'),
      tag: `cita-${data.id}`,
    });
  }
  return avisos;
}
