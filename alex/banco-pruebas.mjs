// Banco de pruebas del prompt de Alex: manda conversaciones de ejemplo a un flujo de n8n
// aparte (mismo modelo y herramientas de solo lectura; sin Chatwoot, Marga ni Telegram) y
// muestra lo que contestaria Alex. No toca a ningun cliente.
//
// Uso: node alex/banco-pruebas.mjs <url-del-webhook-del-banco> [nombre-de-escenario...]
import { readFileSync } from 'node:fs';

const aqui = (f) => new URL(f, import.meta.url);
const prompt = readFileSync(aqui('./alex-3.3-system-prompt.txt'), 'utf8').replace(/^=/, '');
const armarEstado = new Function(
  readFileSync(aqui('./contexto-cliente.js'), 'utf8').split('// --- n8n ---')[0] + '\nreturn armarEstado;')();

const CONTACTO = 'Para darle seguimiento, sigue la conversacion con Alejandro Acosta por WhatsApp al 844 843 0859 \u{1F64C}';
const ANUNCIO = 'Estrena moto con credito! Tenemos modelos disponibles con 5% de enganche. Tramite sencillo, atencion por WhatsApp. Escribenos y te decimos cual se adapta mejor a ti.';

// Resuelve las expresiones de n8n del prompt igual que lo haria el flujo real (promo activa).
function render(estado) {
  const fecha = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Monterrey', dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  let s = prompt;
  s = s.replace(/\{\{ \$now[^}]*\}\}/, fecha);
  s = s.replace("{{ $('Contexto cliente').first().json.estado }}", () => estado);
  s = s.replaceAll("{{ $('Asignar Asesor').first().json.frase_contacto }}", CONTACTO);
  s = s.replaceAll("{{ $('Asignar Asesor').first().json.asesor_nombre }}", 'Alejandro Acosta');
  s = s.replace(/\{\{ \$\('Promo vigente'\)\.first\(\)\.json\.activa \? `([\s\S]*?)` : '' \}\}/, (_, bloque) => bloque);
  s = s.replace(/\{\{ \$\('Promo vigente'\)\.first\(\)\.json\.activa \? '([^']*)' : '[^']*' \}\}/g, (_, si) => si);
  if (s.includes('{{')) throw new Error('quedo una expresion sin resolver: ' + s.slice(s.indexOf('{{'), s.indexOf('{{') + 80));
  return s;
}

const completo = { moto_interes: 'Rayo 175', ingresos: 'nomina en tarjeta', antiguedad_laboral: '2 anos', municipio: 'Saltillo', enganche: '$2,245', pago_cotizado: '$1,650 quincenal a 72 quincenas' };
const INE = `[IMAGEN ANALIZADA 1 de 2]
TIPO: INE (frente)
CONTENIDO: Credencial para votar del INE, frente, a nombre de Luis Alberto Ramirez Lopez.
TEXTO VISIBLE: INSTITUTO NACIONAL ELECTORAL, CREDENCIAL PARA VOTAR
DATOS INE: nacimiento 14/03/1992 | vigencia 2031
VALIDACION INE (calculada por el sistema, es la fuente de verdad): edad 34 anos -> CUMPLE la edad para credito (20 a 68); MotoXpress (21 a 55): si; vigencia hasta 2031 -> VIGENTE.

[IMAGEN ANALIZADA 2 de 2]
TIPO: INE (reverso)
CONTENIDO: Reverso de la credencial para votar del INE.
TEXTO VISIBLE: IDMEX
DATOS INE: no aplica`;

// Cada turno: lo que escribe el cliente y lo que Chatwoot/Marga ya tendrian guardado en ese momento.
const ESCENARIOS = {
  anuncio: [
    { m: 'Hola, quiero mas informacion', ctx: { anuncio: ANUNCIO } },
    { m: 'pues para el trabajo, algo economico', ctx: { anuncio: ANUNCIO } },
  ],
  camino_feliz: [
    { m: 'Que precio tiene la Rayo 175?', nombre: 'Luis' },
    { m: 'me depositan en tarjeta', nombre: 'Luis', attrs: { moto_interes: 'Rayo 175' }, labels: ['cotizado', 'credito'] },
    { m: '2 años ya', nombre: 'Luis', attrs: { moto_interes: 'Rayo 175', ingresos: 'nomina en tarjeta' }, labels: ['cotizado', 'credito', 'motonomina'] },
    { m: 'en Saltillo', nombre: 'Luis', attrs: { moto_interes: 'Rayo 175', ingresos: 'nomina en tarjeta', antiguedad_laboral: '2 anos' }, labels: ['cotizado', 'credito', 'motonomina'] },
    { m: 'ahorita que llegue a la casa se la mando', nombre: 'Luis', attrs: completo, labels: ['calificado', 'credito', 'motonomina'] },
    { m: 'como a las 7', nombre: 'Luis', attrs: completo, labels: ['calificado', 'credito', 'motonomina'] },
  ],
  catalogo: [{ m: 'Me pasas el catalogo porfa', nombre: 'Andrea' }],
  poca_antiguedad: [
    { m: 'apenas tengo 3 meses trabajando ahi', nombre: 'Angel', attrs: { moto_interes: 'U2', ingresos: 'efectivo, sin comprobante' }, labels: ['cotizado', 'credito'] },
  ],
  desconfianza: [
    { m: 'es que me da desconfianza mandar mi INE por aqui', nombre: 'Samuel', attrs: completo, labels: ['calificado', 'credito', 'motonomina'] },
  ],
  prefiere_ir: [
    { m: 'mejor voy a la agencia, donde estan ubicados?', nombre: 'Humberto', attrs: completo, labels: ['calificado', 'credito', 'motonomina'] },
  ],
  pensarlo: [
    { m: 'ok deja lo pienso y te aviso', nombre: 'Rosaura', attrs: completo, labels: ['cotizado', 'credito', 'motonomina'] },
  ],
  contado: [{ m: 'Quiero la Heavy Max 250 de contado', nombre: 'Pablo' }],
  pago_alto: [
    { m: 'uy no, esta muy alto el pago', nombre: 'Israel', attrs: completo, labels: ['cotizado', 'credito', 'motonomina'] },
  ],
  ine_valida: [
    { m: INE, nombre: 'Luis Alberto Ramirez', attrs: completo, labels: ['calificado', 'credito', 'motonomina'] },
  ],
  ya_en_proceso: [
    { m: 'oye y si paso mañana por la moto?', nombre: 'Hedit', attrs: { ...completo, documentos: 'INE ambos lados' }, labels: ['documentacion', 'credito', 'motonomina', 'cumple_requisitos'], ctx: { tarjeta: { en_proceso: true, vendedor: 'Emmanuel Bernal' } } },
  ],
};

const [url, ...solo] = process.argv.slice(2);
if (!url) throw new Error('falta la URL del webhook del banco de pruebas');
const corrida = Date.now().toString(36);

for (const [nombre, turnos] of Object.entries(ESCENARIOS)) {
  if (solo.length && !solo.includes(nombre)) continue;
  console.log(`
===== ${nombre}`);
  // Un turno por llamada: asi cada mensaje ve en la memoria los anteriores, como en produccion.
  for (const t of turnos) {
    const body = {
      sesion: `bench-${nombre}-${corrida}`,
      turnos: [{
        mensaje: t.m,
        system: render(armarEstado({ labels: t.labels, attrs: t.attrs, nombreWa: t.nombre || '', ctx: t.ctx || {} }).estado),
      }],
    };
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const txt = await r.text();
    try {
      const x = (JSON.parse(txt).turnos || [])[0];
      console.log('CLIENTE: ' + String(x.cliente).split('\n')[0].slice(0, 110));
      const h = (x.herramientas || []).map((y) => y.tool + (/CRM|Avisar/.test(y.tool || '') ? '(' + JSON.stringify(y.input).slice(0, 260) + ')' : '')).join(' | ');
      if (h) console.log('   [' + h + ']');
      console.log('ALEX:    ' + String(x.alex).replace(/\n/g, '\n         '));
    } catch (e) { console.log(r.status, txt.slice(0, 600)); }
  }
}
