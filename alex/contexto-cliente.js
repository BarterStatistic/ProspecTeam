// Nodo Code "Contexto cliente" de ALEX 3.3 (n8n). Fuente de verdad: este archivo.
//
// Arma el bloque CLIENT STATE del prompt con lo que ya se sabe del cliente, para que
// Alex no dependa de su memoria corta ni vuelva a preguntar:
//   - etiquetas y atributos de la conversacion en Chatwoot (lo que Alex guardo con CRM Chatwoot)
//   - el anuncio por el que llego y su tarjeta en Marga (RPC alex_contexto)
// y calcula el siguiente paso del metodo de venta.
//
// La funcion armarEstado es pura (se prueba con contexto-cliente.test.mjs); lo de abajo
// es lo unico que depende de n8n.

function armarEstado({ labels = [], attrs = {}, nombreWa = '', descripcion = '', ctx = {} }) {
  const L = labels.map((l) => String(l).toLowerCase());
  const txt = (v) => String(v == null ? '' : v).trim();
  const ETAPAS = ['cita', 'documentacion', 'calificado', 'cotizado', 'catalogo', 'prospecto'];
  const PERFILES = ['motonomina', 'seguridad', 'pensionado', 'credinamo', 'dueno_negocio', 'motoxpress', 'enganche_50'];
  const TEMP = { lead_caliente: 'caliente', lead_tibio: 'tibio', lead_frio: 'frio' };

  const etapa = ETAPAS.find((e) => L.includes(e)) || '';
  const compra = L.includes('contado') ? 'contado' : (L.includes('credito') ? 'credito' : txt(attrs.tipo_compra));
  const perfil = PERFILES.find((p) => L.includes(p)) || txt(attrs.perfil_credito);
  const temp = TEMP[Object.keys(TEMP).find((t) => L.includes(t))] || '';
  const requisitos = L.includes('no_cumple_requisitos') ? 'no_cumple' : (L.includes('cumple_requisitos') ? 'cumple' : '');
  const moto = txt(attrs.moto_interes);
  const ingresos = txt(attrs.ingresos);
  const antiguedad = txt(attrs.antiguedad_laboral);
  const municipio = txt(attrs.municipio);
  const documentos = txt(attrs.documentos);
  const tarjeta = (ctx && ctx.tarjeta) || null;
  const anuncio = txt(ctx && ctx.anuncio);
  // Directivas del Supervisor de Alex que Braulio aprobo (tabla alex_directivas).
  const directivas = txt(ctx && ctx.directivas);
  const nombre = /^[\d\s+()-]{7,}$/.test(nombreWa) ? '' : txt(nombreWa);

  const lineas = [];
  const dato = (k, v) => { if (txt(v)) lineas.push('- ' + k + ': ' + txt(v)); };
  dato('Nombre en WhatsApp', nombre);
  dato('Etapa', etapa);
  dato('Compra', compra);
  dato('Perfil (interno, no se dice)', perfil + (perfil && L.includes('flex') ? ' (pagos semanales)' : ''));
  dato('Moto de interes', moto);
  dato('Ingresos', ingresos);
  dato('Antiguedad laboral', antiguedad);
  dato('Municipio', municipio);
  dato('Enganche', attrs.enganche);
  dato('Pago cotizado', attrs.pago_cotizado);
  dato('Documentos recibidos', documentos);
  dato('Requisitos', requisitos + (txt(attrs.requisitos_motivos) ? ' (' + txt(attrs.requisitos_motivos) + ')' : ''));
  dato('Temperatura', temp);
  dato('Proximo paso guardado', attrs.proximo_paso);
  dato('Notas', attrs.notas_cliente);
  dato('Resumen', descripcion);
  if (anuncio) lineas.push('- Anuncio por el que llego (lo que el cliente espera): "' + anuncio + '"');

  // Siguiente paso del metodo de venta, decidido aqui y no por el modelo.
  let paso;
  const contado = compra === 'contado';
  const sinAntiguedad = perfil === 'motoxpress';
  if (L.includes('chatbot_desactivado')) {
    paso = 'Un vendedor atiende esta conversacion.';
  } else if (tarjeta && tarjeta.en_proceso) {
    paso = 'Su tramite YA lo lleva ' + (txt(tarjeta.vendedor) || 'un vendedor') + ' del equipo. No pidas documentos otra vez ni vuelvas a cotizar: resuelve su duda en corto y, si pregunta por su tramite, manda el CONTACT MESSAGE.';
  } else if (L.includes('cita')) {
    paso = 'Ya pidio cita y un asesor la coordina. Resuelve dudas en corto; si aun no manda su INE, ofrece adelantarla para llegar con el credito revisado.';
  } else if (requisitos === 'no_cumple') {
    paso = 'No cumple un requisito. Trabaja la alternativa (persona de confianza, mas enganche o contado) hasta conseguir una INE valida. No lo despidas.';
  } else if (/ine/i.test(documentos)) {
    paso = 'Ya mando su INE y su tramite esta iniciado. No la pidas de nuevo; resuelve dudas en corto.';
  } else if (!moto) {
    paso = 'PASO 1: saber que moto quiere (o recomendarle una).';
  } else if (contado) {
    paso = 'CIERRE DE CONTADO: ya sabes la moto. Da el precio si falta y pide la INE para iniciar su compra.';
  } else if (!ingresos && !perfil) {
    paso = 'PASO 3: falta saber como recibe sus ingresos (da antes el precio o pago aproximado si no lo has dado).';
  } else if (!antiguedad && !sinAntiguedad) {
    paso = 'PASO 4: falta saber cuanto tiempo lleva en su trabajo.';
  } else if (!municipio) {
    paso = 'PASO 5: falta saber en que municipio vive.';
  } else {
    paso = 'PASO 6, CIERRE: ya tienes moto, ingresos, antiguedad y municipio. Si nada falla, confirma que si entra y PIDE LA INE en este mensaje.';
  }

  const cuerpo = lineas.length
    ? lineas.join('\n')
    : '- Cliente nuevo: todavia no hay datos guardados. Es su primer contacto (ver OPENING).';
  const bloqueDirectivas = directivas
    ? '\n\nSUPERVISOR DIRECTIVES (approved by the owner after studying real conversations; apply them in this reply when they fit. They refine the SALES METHOD, but they never override the NEXT STEP when it says a salesperson has the tramite or the documents were received, the CONTACT MESSAGE, the credit rules or the numbers from the tools):\n' + directivas
    : '';
  return {
    estado: cuerpo + '\n\nNEXT STEP (computed by the system): ' + paso + bloqueDirectivas,
    siguiente_paso: paso,
    directivas,
  };
}

// --- n8n ---
let body = {};
try { body = $('Mensaje').first().json.body || {}; } catch (e) {}
let ctx = {};
try { ctx = $('Leer contexto Marga').first().json || {}; } catch (e) {}
const conv = body.conversation || {};
const sender = body.sender || {};

const r = armarEstado({
  labels: conv.labels || [],
  attrs: conv.custom_attributes || {},
  nombreWa: String(sender.name || ''),
  descripcion: (sender.additional_attributes || {}).description || '',
  ctx,
});

return [{ json: r }];
