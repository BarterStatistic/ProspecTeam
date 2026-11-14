// Seguimiento de prospectos: el vendedor atiende al cliente desde su propio
// WhatsApp Business, así que Marga es el único lugar donde queda registro de
// que ya lo contactó. Aquí vive todo lo que no depende de React:
//   - el enlace a WhatsApp con un saludo ya escrito,
//   - el registro de un contacto (campo `contacto` de la tarjeta),
//   - el reloj de espera de las tarjetas de Alex,
//   - la cola de "Mi día".
//
// `contacto` = { primeroEn, ultimoEn, ultimoTipo, ultimoPor, veces }. Alex no lo
// toca: alex_upsert_prospecto hace `data || patch` con otras llaves.

import { esDeAlex } from './alex.js';
import { normalizePhone } from './clients.js';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Sin contacto: a partir de aquí la espera se pinta como aviso / urgente. */
export const ESPERA_AVISO = 2 * HORA;
export const ESPERA_URGENTE = DIA;
/** Contactado hace más de esto y sigue en Prospectos: toca volver a buscarlo. */
export const SEGUIMIENTO_CADA = 2 * DIA;
/** Citas pasadas sin cerrar: solo se recuerdan las de los últimos días. */
export const CITAS_SIN_CERRAR_DIAS = 14;

export const TIPOS_CONTACTO = {
  whatsapp: { id: 'whatsapp', label: 'Le escribí', hecho: 'Le escribiste' },
  llamada: { id: 'llamada', label: 'Le llamé', hecho: 'Le llamaste' },
  sin_respuesta: { id: 'sin_respuesta', label: 'No contestó', hecho: 'No contestó' },
};

/**
 * Teléfono en el formato de wa.me (solo dígitos, con lada de país). Un número
 * mexicano de 10 dígitos recibe el 52; el formato viejo 521… pierde el 1.
 * Devuelve '' si no alcanza para un número válido.
 */
export function telefonoWhatsApp(phone) {
  const d = normalizePhone(phone ?? '');
  if (d.length === 10) return `52${d}`;
  if (d.length === 13 && d.startsWith('521')) return `52${d.slice(3)}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return '';
}

const primerNombre = (texto) => String(texto ?? '').trim().split(/\s+/)[0] ?? '';

/** Saludo inicial del vendedor, con lo que Alex ya sabe del cliente. */
export function saludoWhatsApp(client, vendedor) {
  const cliente = primerNombre(client?.firstName);
  const quien = primerNombre(vendedor);
  const moto = String(client?.motorcycles ?? '').trim();
  const hola = cliente ? `Hola ${cliente}` : 'Hola';
  const soy = quien ? `, soy ${quien} de Dinamo` : ', te escribo de Dinamo';
  const interes = moto ? `Vi que te interesa la ${moto}.` : 'Vi que nos escribiste por una moto.';
  return `${hola}${soy}. ${interes} ¿Te ayudo con tu trámite?`;
}

/** Enlace que abre el chat con el cliente en el WhatsApp del vendedor ('' sin teléfono). */
export function enlaceWhatsApp(client, vendedor) {
  const tel = telefonoWhatsApp(client?.phone);
  if (!tel) return '';
  return `https://wa.me/${tel}?text=${encodeURIComponent(saludoWhatsApp(client, vendedor))}`;
}

/** Parche para guardar un contacto nuevo en la tarjeta. */
export function parcheContacto(client, tipo, username, ts = Date.now()) {
  if (!TIPOS_CONTACTO[tipo]) throw new Error(`Tipo de contacto desconocido: ${tipo}`);
  const previo = client?.contacto ?? {};
  return {
    contacto: {
      primeroEn: previo.primeroEn ?? ts,
      ultimoEn: ts,
      ultimoTipo: tipo,
      ultimoPor: username ?? '',
      veces: (previo.veces ?? 0) + 1,
    },
  };
}

/** "ahora", "35 min", "5 h", "3 d". */
export function duracionCorta(ms) {
  if (!(ms >= MIN)) return 'ahora';
  if (ms < HORA) return `${Math.floor(ms / MIN)} min`;
  if (ms < DIA) return `${Math.floor(ms / HORA)} h`;
  return `${Math.floor(ms / DIA)} d`;
}

/**
 * Reloj de una tarjeta de Alex en Prospectos: cuánto lleva esperando al
 * vendedor o hace cuánto fue el último contacto. `nivel` decide el color
 * ('ok' | 'aviso' | 'urgente'). Devuelve null para las demás tarjetas: las que
 * captura un vendedor ya nacen atendidas.
 */
export function esperaDe(client, now = Date.now()) {
  if (!esDeAlex(client) || client.section !== 'prospectos') return null;
  const c = client.contacto;
  if (!c?.ultimoEn) {
    const ms = Math.max(0, now - (client.createdAt ?? now));
    const nivel = ms >= ESPERA_URGENTE ? 'urgente' : ms >= ESPERA_AVISO ? 'aviso' : 'ok';
    return { contactado: false, ms, nivel, texto: `Esperando ${duracionCorta(ms)}` };
  }
  const ms = Math.max(0, now - c.ultimoEn);
  const hecho = TIPOS_CONTACTO[c.ultimoTipo]?.hecho ?? 'Contactado';
  const pendiente = ms >= SEGUIMIENTO_CADA || c.ultimoTipo === 'sin_respuesta';
  return {
    contactado: true,
    ms,
    nivel: pendiente ? 'aviso' : 'ok',
    texto: ms < MIN ? `${hecho} ahora` : `${hecho} hace ${duracionCorta(ms)}`,
  };
}

// Alertas de Alex con las que el vendedor no tiene nada que seguir.
const ALERTAS_FUERA = ['no_califica', 'fuera_cobertura', 'refacciones', 'vacantes'];

function inicioDelDia(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Cola de "Mi día". El vendedor ve los prospectos de Alex que le tocan
 * (`createdBy`); el admin ve los de todo el equipo. Cada tarjeta sale en una
 * sola lista, en este orden de prioridad:
 *   urgentes    → Alex pidió que alguien del equipo actúe y nadie lo ha
 *                 contactado en las últimas 24 h
 *   calientes   → lead caliente sin ningún contacto registrado
 *   seguimiento → ya contactado, pero hace 2 días o más (o no contestó)
 * Lo más reciente va primero: es lo que todavía se puede rescatar.
 * Las citas son la agenda compartida: las de hoy y las pasadas sin cerrar.
 */
export function colaDelDia(clients, citas, { username, esAdmin = false, now = Date.now() } = {}) {
  const urgentes = [];
  const calientes = [];
  const seguimiento = [];

  for (const c of clients ?? []) {
    if (!esDeAlex(c) || c.section !== 'prospectos') continue;
    if (!esAdmin && c.createdBy !== username) continue;
    const car = c.caracteristicas ?? {};
    const alertas = Array.isArray(car.alertas) ? car.alertas : [];
    if (alertas.some((a) => ALERTAS_FUERA.includes(a))) continue;

    const ultimo = c.contacto?.ultimoEn ?? null;
    if (alertas.includes('requiere_accion') && (!ultimo || now - ultimo >= DIA)) {
      urgentes.push(c);
    } else if (!ultimo) {
      if (car.temperatura === 'caliente') calientes.push(c);
    } else if (
      (car.temperatura === 'caliente' || car.temperatura === 'tibio') &&
      (now - ultimo >= SEGUIMIENTO_CADA || c.contacto.ultimoTipo === 'sin_respuesta')
    ) {
      seguimiento.push(c);
    }
  }

  const recientes = (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
  urgentes.sort(recientes);
  calientes.sort(recientes);
  // En seguimiento va primero el que lleva más tiempo sin saber de nosotros.
  seguimiento.sort((a, b) => (a.contacto?.ultimoEn ?? 0) - (b.contacto?.ultimoEn ?? 0));

  const hoy = inicioDelDia(now);
  const manana = hoy + DIA;
  const desde = hoy - CITAS_SIN_CERRAR_DIAS * DIA;
  const pendientes = (citas ?? []).filter((c) => c.fechaCita && !c.atendida);
  const citasHoy = pendientes
    .filter((c) => c.fechaCita >= hoy && c.fechaCita < manana)
    .sort((a, b) => a.fechaCita - b.fechaCita);
  // `noAsistio` lo marca "Mi día" cuando el cliente no llegó: la cita queda
  // cerrada sin contarse como atendida.
  const citasSinCerrar = pendientes
    .filter((c) => !c.noAsistio && c.fechaCita >= desde && c.fechaCita < hoy)
    .sort((a, b) => b.fechaCita - a.fechaCita);

  return { urgentes, calientes, seguimiento, citasHoy, citasSinCerrar };
}

/** Lo que cuenta el badge de "Mi día": lo que pide atención hoy. */
export function pendientesDelDia(cola) {
  return cola.urgentes.length + cola.calientes.length + cola.citasSinCerrar.length;
}
