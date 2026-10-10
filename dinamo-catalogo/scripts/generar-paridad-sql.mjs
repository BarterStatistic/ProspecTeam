// Paridad JS ↔ SQL sin pasar por PostgREST: genera una consulta para el SQL Editor
// de Supabase (o execute_sql del MCP) que compara un md5 por grupo (esquema, enganche,
// servicio) calculado aquí con el de cotizar(). Mismos casos que test/paridad.test.mjs.
// Uso: node dinamo-catalogo/scripts/generar-paridad-sql.mjs > paridad.sql
// Esperado al correrla: grupos_distintos = 0 y parcialidades_js = parcialidades_sql.
import { createHash } from 'node:crypto';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';
import { cotizarJS } from '../lib/cotizar.mjs';

const { MODELS, SCHEMES } = leerCotizadorPT();
function enganchesDe(sc) {
  const set = new Set();
  for (const { range: [a, b] } of sc.levels) {
    const lo = Math.max(a, sc.min), hi = Math.min(b, sc.max);
    if (lo > hi) continue;
    set.add(lo); set.add(hi); set.add(Math.round(((lo + hi) / 2) * 100) / 100);
  }
  return [...set].sort((x, y) => x - y);
}
const grupos = [];
let casos = 0;
for (const [e, sc] of Object.entries(SCHEMES)) for (const g of enganchesDe(sc)) for (const s of [false, true]) {
  const partes = [];
  for (const [nombre] of MODELS) {
    casos++;
    const r = cotizarJS(MODELS, SCHEMES, nombre, e, g, s);
    for (const t of Object.keys(r).map(Number).sort((a, b) => a - b)) partes.push(`${nombre}:${t}:${r[t]}`);
  }
  grupos.push({ e, g, s, md5: createHash('md5').update(partes.join(';')).digest('hex'), n: partes.length });
}
const valores = grupos.map(({ e, g, s, md5, n }) => `('${e}', ${g}::numeric, ${s}, '${md5}', ${n})`).join(',\n  ');
const sql = `begin;
set local role anon;
with g(esquema, enganche, servicio, md5_js, n_js) as (values
  ${valores}
), s as (
  select g.*, (select md5(string_agg(mo.nombre || ':' || c.plazo || ':' || c.parcialidad, ';' order by mo.orden, c.plazo))
               from public.modelos mo cross join lateral public.cotizar(mo.nombre, g.esquema, g.enganche, g.servicio) c
               where mo.activo) as md5_sql,
              (select count(*) from public.modelos mo cross join lateral public.cotizar(mo.nombre, g.esquema, g.enganche, g.servicio) c where mo.activo) as n_sql
  from g
)
select count(*) as grupos, sum(n_js) as parcialidades_js, sum(n_sql) as parcialidades_sql,
       count(*) filter (where md5_js is distinct from md5_sql) as grupos_distintos,
       string_agg(esquema || ' ' || enganche || ' ' || servicio, ', ') filter (where md5_js is distinct from md5_sql) as cuales
from s;
rollback;`;
process.stdout.write(sql + '\n');
console.error(`${casos} casos (modelo × esquema × enganche × servicio), ${grupos.length} grupos, ${grupos.reduce((a, x) => a + x.n, 0)} parcialidades`);
