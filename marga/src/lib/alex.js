// Tarjetas que sube Alex (el asistente de WhatsApp) a Prospectos. Alex escribe
// el registro desde Supabase (ver supabase/alex_prospectos.sql); aquí solo se
// decide cómo se ven: foto del bot, vendedor asignado y características
// (las etiquetas de Chatwoot) como chips de solo lectura.

/** Foto de perfil de las tarjetas creadas por el bot. */
export const ALEX_AVATAR = `${import.meta.env?.BASE_URL ?? './'}alex-avatar.jpg`;

/** ¿La tarjeta la creó el bot? (`origen` lo escribe alex_upsert_prospecto.) */
export function esDeAlex(client) {
  return client?.origen === 'alex';
}

/** "Le toca: Alejandro" — el vendedor asignado es el `createdBy` de la tarjeta. */
export function vendedorAsignado(client) {
  const primero = (client?.createdBy ?? '').trim().split(/\s+/)[0];
  return primero ? `Le toca: ${primero}` : '';
}

const COMPRA = { credito: 'Crédito', contado: 'Contado' };
const PERFIL = {
  motonomina: 'Motonómina',
  seguridad: 'Seguridad',
  pensionado: 'Pensionado',
  credinamo: 'Credinamo',
  dueno_negocio: 'Dueño de negocio',
  motoxpress: 'Motoxpress',
  enganche_50: '50% de enganche',
};
const CHATBOT = { activado: 'Chat activado', desactivado: 'Chat desactivado' };
const ALERTA = {
  requiere_accion: 'Requiere acción',
  no_califica: 'No califica',
  fuera_cobertura: 'Fuera de cobertura',
  refacciones: 'Refacciones',
  vacantes: 'Vacantes',
};

/**
 * Chips de características de una tarjeta de Prospectos, en este orden:
 * catálogo enviado (solo en la columna Preguntas), compra, perfil, Flex y
 * alertas (la temperatura y el chat van aparte, ver `indicadoresDe`).
 * Lo vacío, `sin_definir` o desconocido no genera chip.
 * Fuera de Prospectos devuelve [].
 */
export function caracteristicasDe(client) {
  const car = client?.caracteristicas;
  if (client?.section !== 'prospectos' || !car) return [];

  const chips = [];
  if (car.catalogoEnviado && client.stage === 'preguntas') {
    chips.push({ clave: 'catalogo', etiqueta: 'Catálogo enviado', tono: 'info' });
  }
  if (COMPRA[car.compra]) chips.push({ clave: 'compra', etiqueta: COMPRA[car.compra], tono: 'neutro' });
  if (PERFIL[car.perfil]) chips.push({ clave: 'perfil', etiqueta: PERFIL[car.perfil], tono: 'neutro' });
  if (car.flex === true) chips.push({ clave: 'flex', etiqueta: 'Flex', tono: 'neutro' });
  for (const a of Array.isArray(car.alertas) ? car.alertas : []) {
    if (ALERTA[a]) chips.push({ clave: `alerta-${a}`, etiqueta: ALERTA[a], tono: 'alerta' });
  }
  return chips;
}

const TEMPERATURA = { caliente: 'Lead caliente', tibio: 'Lead tibio', frio: 'Lead frío' };

/**
 * Indicadores pequeños de la cabecera de la tarjeta: temperatura del lead y
 * si el chat de Alex está activado. `tono` decide el color del ícono.
 * Fuera de Prospectos o sin datos devuelve [].
 */
export function indicadoresDe(client) {
  const car = client?.caracteristicas;
  if (client?.section !== 'prospectos' || !car) return [];

  const out = [];
  if (TEMPERATURA[car.temperatura]) {
    out.push({ clave: 'temperatura', etiqueta: TEMPERATURA[car.temperatura], tono: car.temperatura });
  }
  if (CHATBOT[car.chatbot]) {
    out.push({ clave: 'chatbot', etiqueta: CHATBOT[car.chatbot], tono: car.chatbot });
  }
  return out;
}

// Datos del cliente que Alex junta en la conversación (atributos de Chatwoot),
// en el orden en que se muestran. La moto, el tipo de compra y el perfil ya
// salen en otras partes de la tarjeta.
const ATRIBUTOS = [
  ['enganche', 'Enganche'],
  ['pago_cotizado', 'Pago cotizado'],
  ['ingresos', 'Ingresos'],
  ['antiguedad_laboral', 'Antigüedad'],
  ['municipio', 'Municipio'],
  ['documentos', 'Documentos'],
  ['proximo_paso', 'Próximo paso'],
  ['notas_cliente', 'Notas'],
];

/** Lista { clave, etiqueta, valor } de los datos del cliente; salta los vacíos. */
export function atributosDe(client) {
  const attrs = client?.atributos;
  if (client?.section !== 'prospectos' || !attrs) return [];
  return ATRIBUTOS.filter(([clave]) => String(attrs[clave] ?? '').trim() !== '').map(([clave, etiqueta]) => ({
    clave,
    etiqueta,
    valor: String(attrs[clave]).trim(),
  }));
}

/**
 * Foto de perfil de una tarjeta. La de Alex (el asistente) solo se usa mientras
 * la tarjeta del bot está en Prospectos; al pasar a Procesos (y en las demás
 * secciones) lleva la foto del vendedor encargado (`createdBy`). Las tarjetas
 * de vendedores siempre llevan la foto de quien las registró.
 */
export function fotoDeTarjeta(client, fotosVendedores) {
  if (esDeAlex(client) && client.section === 'prospectos') return ALEX_AVATAR;
  return fotosVendedores?.[client?.createdBy];
}
