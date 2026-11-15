// Leads calientes que nadie ha tocado en 24 h o más. JS plano, sin
// dependencias: lo importan la app (src/lib/seguimiento.js, "Mi día" y el
// Panel ADMIN), la Edge Function marga-avisos (push de inicio de guardia) y
// las pruebas, para que los tres cuenten exactamente lo mismo.
//
// "Tocar" = que el vendedor registre un contacto (`contacto.ultimoEn`, ver
// seguimiento.js). Si nunca lo contactó, cuenta desde que llegó la tarjeta.
// El vendedor responsable es `createdBy` (no `prospectTeamSeller`).

const HORA = 60 * 60 * 1000;
export const SIN_TOCAR_MS = 24 * HORA;

// Alertas de Alex con las que el vendedor no tiene nada que seguir.
export const ALERTAS_FUERA = ['no_califica', 'fuera_cobertura', 'refacciones', 'vacantes'];

/** Cuándo fue la última vez que alguien del equipo tocó al lead (ms), o null. */
export function ultimoToque(client) {
  return client?.contacto?.ultimoEn ?? client?.createdAt ?? null;
}

/** ¿Lead caliente de Alex en Prospectos que lleva 24 h o más sin que lo toquen? */
export function esRezagado(client, now = Date.now()) {
  if (client?.origen !== 'alex' || client.section !== 'prospectos') return false;
  const car = client.caracteristicas ?? {};
  if (car.temperatura !== 'caliente') return false;
  const alertas = Array.isArray(car.alertas) ? car.alertas : [];
  if (alertas.some((a) => ALERTAS_FUERA.includes(a))) return false;
  const ultimo = ultimoToque(client);
  return ultimo != null && now - ultimo >= SIN_TOCAR_MS;
}

/**
 * Resumen por vendedor: [{ vendedor, total, masViejoMs }], el que más
 * acumula primero. Cuenta solo a quienes tienen al menos un lead rezagado.
 */
export function resumenRezagados(clients, now = Date.now()) {
  const porVendedor = new Map();
  for (const c of clients ?? []) {
    if (!esRezagado(c, now)) continue;
    const vendedor = String(c.createdBy ?? '').trim() || 'Sin asignar';
    const espera = now - ultimoToque(c);
    const fila = porVendedor.get(vendedor) ?? { vendedor, total: 0, masViejoMs: 0 };
    fila.total += 1;
    fila.masViejoMs = Math.max(fila.masViejoMs, espera);
    porVendedor.set(vendedor, fila);
  }
  return [...porVendedor.values()].sort(
    (a, b) => b.total - a.total || b.masViejoMs - a.masViejoMs || a.vendedor.localeCompare(b.vendedor),
  );
}

/** "3 días", "1 día", "26 h". */
function esperaLegible(ms) {
  const dias = Math.floor(ms / (24 * HORA));
  if (dias >= 1) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  return `${Math.max(1, Math.floor(ms / HORA))} h`;
}

export const GUARDIAS = {
  manana: 'Guardia de la mañana',
  tarde: 'Guardia de la tarde',
};

/**
 * Push de inicio de guardia: uno por vendedor que tenga leads rezagados.
 * usuarios = [{ username, role }]. Solo avisa a rol 'vendedor'; el admin ve el
 * resumen en el Panel. Devuelve [{ destinatario, titulo, cuerpo, tag }].
 */
export function avisosDeGuardia(clients, usuarios = [], guardia = 'manana', now = Date.now()) {
  const vendedores = new Set(
    usuarios.filter((u) => u.role === 'vendedor' && u.username).map((u) => u.username),
  );
  return resumenRezagados(clients, now)
    .filter((r) => vendedores.has(r.vendedor))
    .map((r) => ({
      destinatario: r.vendedor,
      titulo: `🔥 ${r.total} ${r.total === 1 ? 'lead caliente sin tocar' : 'leads calientes sin tocar'}`,
      cuerpo: `${GUARDIAS[guardia] ?? 'Inicio de guardia'}: el más viejo lleva ${esperaLegible(r.masViejoMs)}. Ábrelos en Mi día.`,
      tag: `guardia-${guardia}`,
    }));
}
