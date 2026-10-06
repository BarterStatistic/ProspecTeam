// Genera migrations/002_seed_catalogo.sql a partir de cotizador-pt/index.html.
// Uso (desde la raíz del repo): node dinamo-catalogo/scripts/generar-seed.mjs
import { writeFileSync } from 'node:fs';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';

const LISTA_VIGENTE = '2026-08-25';
const { MODELS, SCHEMES } = leerCotizadorPT();

const txt = (s) => `'${String(s).replace(/'/g, "''")}'`;
// Normaliza nombres para emparejar Motos con el cotizador:
// mayúsculas, sin espacios/saltos de línea sobrantes, "-" equivale a espacio.
const norm = (col) => `upper(regexp_replace(btrim(${col}, E' \\n\\r\\t'), '[\\s-]+', ' ', 'g'))`;
const limpio = (col) => `nullif(btrim(${col}, E' \\n\\r\\t'), '')`;

const lineas = [];
lineas.push('-- GENERADO por dinamo-catalogo/scripts/generar-seed.mjs desde cotizador-pt/index.html.');
lineas.push('-- No editar a mano: corregir la fuente y volver a generar.');
lineas.push('');
lineas.push(`insert into public.parametros (clave, valor) values ('lista_vigente', ${txt(LISTA_VIGENTE)});`);
lineas.push('');

// Esquemas, en el orden de SCHEMES.
const filasEsquemas = Object.entries(SCHEMES).map(([id, s], i) =>
  `  (${txt(id)}, ${txt(s.label)}, ${s.min}, ${s.max}, ${txt(s.termUnit)}, ${i + 1})`);
lineas.push('insert into public.esquemas (id, etiqueta, enganche_min, enganche_max, unidad_plazo, orden) values');
lineas.push(filasEsquemas.join(',\n') + ';');
lineas.push('');

// Un statement por nivel: inserta el nivel y sus multiplicadores juntos.
for (const [id, s] of Object.entries(SCHEMES)) {
  for (const nivel of s.levels) {
    const valores = Object.entries(nivel.m).map(([plazo, factor]) => `(${plazo}, ${factor})`).join(', ');
    lineas.push(`with n as (insert into public.esquema_niveles (esquema_id, enganche_desde, enganche_hasta) values (${txt(id)}, ${nivel.range[0]}, ${nivel.range[1]}) returning id)`);
    lineas.push(`insert into public.multiplicadores (nivel_id, plazo, factor) select n.id, v.plazo, v.factor from n cross join (values ${valores}) as v(plazo, factor);`);
  }
}
lineas.push('');

// Modelos del cotizador en una tabla temporal.
// "on commit drop" en vez de "drop table": el MCP de Supabase pide confirmación
// para cualquier DROP y, sin nadie que confirme, la migración se queda colgada.
lineas.push('create temp table _cotizador (nombre text, precio_lista integer, servicio_preventivo integer, orden integer) on commit drop;');
lineas.push('insert into _cotizador values');
lineas.push(MODELS.map(([nombre, precio, servicio], i) => `  (${txt(nombre)}, ${precio}, ${servicio ?? 0}, ${i + 1})`).join(',\n') + ';');
lineas.push('');

lineas.push(`-- 1) Modelos que ya están en Motos: conservan id, tipo, descripción e imagen.
--    Se ignoran las filas duplicadas con salto de línea en el nombre ("Metro 125\\n", "Renegada\\n").
--    "R4 250" de Motos es el "R4" del cotizador; gana el precio del cotizador.
insert into public.modelos (id, nombre, precio_lista, servicio_preventivo, tipo, descripcion, imagen_url, activo, orden)
overriding system value
select m.id, c.nombre, c.precio_lista, c.servicio_preventivo,
       ${limpio('m."Tipo de moto"')}, ${limpio('m."Descripción moto"')}, m."Image_URL", true, c.orden
from _cotizador c
join public."Motos" m
  on position(E'\\n' in m."Modelo") = 0
 and (${norm('m."Modelo"')} = ${norm('c.nombre')}
      or (c.nombre = 'R4' and ${norm('m."Modelo"')} = 'R4 250'));

-- 2) Solo en Motos: se conservan inactivos (no se muestran, no se borran).
insert into public.modelos (id, nombre, precio_lista, servicio_preventivo, tipo, descripcion, imagen_url, activo, orden)
overriding system value
select m.id, btrim(m."Modelo", E' \\n\\r\\t'), m."Precio lista (promoción)",
       coalesce(m."Precio paquete" - m."Precio lista (promoción)", 0),
       ${limpio('m."Tipo de moto"')}, ${limpio('m."Descripción moto"')}, m."Image_URL", false, 1000 + m.id
from public."Motos" m
where ${norm('m."Modelo"')} in ('MONKEY', 'XTREME ROCKY');

-- 3) La identidad sigue después del mayor id de Motos (no se reusan los ids de los duplicados).
select setval(pg_get_serial_sequence('public.modelos', 'id'), (select max(id) from public."Motos"));

-- 4) Solo en el cotizador: entran con id nuevo y sin descripción.
insert into public.modelos (nombre, precio_lista, servicio_preventivo, activo, orden)
select c.nombre, c.precio_lista, c.servicio_preventivo, true, c.orden
from _cotizador c
where not exists (select 1 from public.modelos mo where mo.nombre = c.nombre);`);

const destino = new URL('../migrations/002_seed_catalogo.sql', import.meta.url);
writeFileSync(destino, lineas.join('\n') + '\n');
console.log(`Escrito ${destino.pathname} — ${MODELS.length} modelos, ${Object.keys(SCHEMES).length} esquemas`);
