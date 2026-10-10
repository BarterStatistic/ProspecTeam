# Catálogo Dinamo en Supabase — Plan de implementación (fases 1–3: base + Alex)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear en el Supabase de Alex el catálogo único de motos y esquemas de financiamiento, con `cotizar()` y `catalogo()`, y convertir `Motos` en una vista de compatibilidad para que Alex lea datos correctos sin cambiar su workflow.

**Architecture:** Cinco tablas normalizadas (`modelos`, `esquemas`, `esquema_niveles`, `multiplicadores`, `parametros`) se llenan desde `cotizador-pt/index.html` (fuente de verdad) más `tipo`/`descripcion` de la tabla `Motos` actual. Dos funciones SQL exponen el cálculo (`cotizar`) y el catálogo en la forma exacta de `MODELS`/`SCHEMES` (`catalogo`). Una prueba de paridad compara la fórmula SQL contra la JS del cotizador antes de tocar a Alex. Los archivos SQL viven en el repo y se aplican con el MCP de Supabase.

**Tech Stack:** Postgres 17 (Supabase, proyecto `ehyqexzaauvjoioafqdz`), PL/pgSQL, PostgREST (RPC), Node 22 (`node:test`, `fetch` nativo, ESM `.mjs`, sin dependencias).

**Spec:** `docs/superpowers/specs/2026-10-06-dinamo-catalogo-supabase-design.md`

**Fuera de este plan (planes propios después de que este termine):** fase 4 (cotizadores, un repo por vendedor) y fase 5 (Marga). Ambas dependen de que `catalogo()` ya esté en producción.

## Global Constraints

- Proyecto Supabase: `ehyqexzaauvjoioafqdz`, URL `https://ehyqexzaauvjoioafqdz.supabase.co`.
- Clave publicable (segura para navegador y pruebas): `sb_publishable_wHca_29_5WG40UG0w9TSlg_D6UnWHnP`. **Nunca** usar ni escribir la `service_role` en archivos.
- DDL y cargas se aplican con la tool MCP `apply_migration` (`project_id: ehyqexzaauvjoioafqdz`), pasando como `query` el contenido exacto del archivo `.sql` del repo y como `name` el nombre del archivo sin número ni extensión (ej. `catalogo_tablas`). Las consultas de verificación se corren con `execute_sql`.
- Directorio de trabajo: `dinamo-catalogo/` en la raíz del repo. Pruebas: `node --test dinamo-catalogo/test/` desde la raíz.
- Fuente de verdad del catálogo: `cotizador-pt/index.html` (`MODELS`, `SCHEMES`; lista vigente `2026-08-25`). No se edita en este plan.
- Fórmula (idéntica a `render()` de `cotizador-pt/index.html`, líneas 908–949): `precio = precio_lista + (servicio si con_servicio)`; `enganche_monto = precio × enganche / 100`; `a_financiar = precio − enganche_monto`; nivel = el que cumple `desde ≤ enganche ≤ hasta`; `parcialidad = round(a_financiar × factor)`.
- Validez del enganche: `enganche_min ≤ enganche ≤ enganche_max` del esquema.
- Alex **solo lee** `Motos` (confirmado por Braulio). Columnas de la vista: nombres idénticos a la tabla actual, pagos a **72 quincenas, sin servicio**: Motonomina 5 %, Credinamo 10 %, Motoxpress 15 %, 50 % de enganche (`enganche50`) 50 %, Personal de seguridad = `motonomina` 30 %.
- Disponibilidad y vendedores **no** van en esta BD.
- Textos de error y comentarios en español con acentos correctos.
- Commits: uno por tarea, locales, mensaje `feat(dinamo-catalogo): …` / `test(dinamo-catalogo): …`, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Sin push.** Ninguna acción fuera de este proyecto Supabase (n8n, cotizadores, Marga) en este plan.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `dinamo-catalogo/config.mjs` | URL y clave publicable |
| `dinamo-catalogo/lib/extraer-catalogo.mjs` | Lee `MODELS` y `SCHEMES` de un `index.html` de cotizador |
| `dinamo-catalogo/lib/cotizar.mjs` | Fórmula JS de referencia (copia fiel de `render()`) |
| `dinamo-catalogo/lib/rpc.mjs` | Llamada a RPC de PostgREST con la clave publicable |
| `dinamo-catalogo/scripts/generar-seed.mjs` | Genera `migrations/002_seed_catalogo.sql` |
| `dinamo-catalogo/migrations/001_catalogo_tablas.sql` | Tablas + RLS |
| `dinamo-catalogo/migrations/002_seed_catalogo.sql` | Carga (generado, no editar a mano) |
| `dinamo-catalogo/migrations/003_cotizar.sql` | Función `cotizar()` |
| `dinamo-catalogo/migrations/004_catalogo.sql` | Función `catalogo()` |
| `dinamo-catalogo/migrations/005_vista_motos.sql` | `Motos` → `motos_legacy` + vista `Motos` |
| `dinamo-catalogo/migrations/005_vista_motos.down.sql` | Reversa de la 005 |
| `dinamo-catalogo/verificacion/*.sql` | Consultas de verificación por fase |
| `dinamo-catalogo/test/*.test.mjs` | Pruebas `node:test` |
| `dinamo-catalogo/README.md` | Qué es, cómo probar, cómo actualizar precios, cómo revertir |

---

### Task 1: Extractor del catálogo del cotizador

**Files:**
- Create: `dinamo-catalogo/config.mjs`
- Create: `dinamo-catalogo/lib/extraer-catalogo.mjs`
- Test: `dinamo-catalogo/test/extraer-catalogo.test.mjs`

**Interfaces:**
- Produces: `extraerCatalogo(html: string) → { MODELS: Array<[string, number, number]>, SCHEMES: Record<string, {label, min, max, termUnit, terms: number[], levels: {range: [number, number], m: Record<number, number>}[]}> }`
- Produces: `leerCotizadorPT() → { MODELS, SCHEMES }` (lee `cotizador-pt/index.html` relativo a la raíz del repo)
- Produces: `SUPABASE_URL`, `SUPABASE_KEY` (strings) desde `config.mjs`

- [ ] **Step 1: Escribir la prueba que falla**

`dinamo-catalogo/test/extraer-catalogo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';

test('extrae los 37 modelos del cotizador PT', () => {
  const { MODELS } = leerCotizadorPT();
  assert.equal(MODELS.length, 37);
  assert.deepEqual(MODELS[0], ['U2', 21945, 2287]);
  assert.deepEqual(MODELS.at(-1), ['HEAVY CAB 300', 90195, 5832]);
});

test('extrae los 7 esquemas con sus niveles y multiplicadores', () => {
  const { SCHEMES } = leerCotizadorPT();
  assert.deepEqual(Object.keys(SCHEMES), [
    'motonomina', 'credinamo', 'motoxpress', 'enganche50',
    'motonomina_flex', 'credinamo_flex', 'motoxpress_flex',
  ]);
  assert.equal(SCHEMES.motonomina.min, 5);
  assert.equal(SCHEMES.motonomina.levels.length, 3);
  assert.equal(SCHEMES.motonomina.levels[2].m[72], 0.035218);
  assert.ok(SCHEMES.motoxpress_flex.terms.includes(144));
  assert.equal(SCHEMES.motonomina_flex.levels[0].m[96], 0.0207137);
});

test('falla con mensaje claro si no encuentra MODELS', () => {
  assert.throws(() => leerCotizadorPT('<html></html>'), /No se encontró "const MODELS=\["/);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `node --test dinamo-catalogo/test/extraer-catalogo.test.mjs`
Expected: FAIL con `Cannot find module` (no existe `lib/extraer-catalogo.mjs`).

- [ ] **Step 3: Implementar**

`dinamo-catalogo/config.mjs`:

```js
// Proyecto Supabase de Alex: catálogo Dinamo compartido.
// La clave publicable es segura para el navegador: solo permite lo que RLS deja leer.
export const SUPABASE_URL = 'https://ehyqexzaauvjoioafqdz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_wHca_29_5WG40UG0w9TSlg_D6UnWHnP';
```

`dinamo-catalogo/lib/extraer-catalogo.mjs`:

```js
// Lee MODELS y SCHEMES directamente del <script> de un cotizador.
// Es la única forma de usar cotizador-pt/index.html como fuente de verdad
// sin duplicar los datos a mano.
import { readFileSync } from 'node:fs';

function tomarLiteral(html, inicio, cierre) {
  const i = html.indexOf(inicio);
  if (i < 0) throw new Error(`No se encontró "${inicio}" en el cotizador`);
  const j = html.indexOf(cierre, i);
  if (j < 0) throw new Error(`No se encontró el cierre "${cierre}" después de "${inicio}"`);
  // Desde el "[" o "{" de apertura hasta el "]" o "}" de cierre, sin el ";".
  const literal = html.slice(i + inicio.length - 1, j + cierre.length - 1);
  return new Function(`return (${literal});`)();
}

export function extraerCatalogo(html) {
  return {
    MODELS: tomarLiteral(html, 'const MODELS=[', '\n];'),
    SCHEMES: tomarLiteral(html, 'const SCHEMES={', '\n};'),
  };
}

export function leerCotizadorPT(html) {
  const fuente = html ?? readFileSync(new URL('../../cotizador-pt/index.html', import.meta.url), 'utf8');
  return extraerCatalogo(fuente);
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `node --test dinamo-catalogo/test/extraer-catalogo.test.mjs`
Expected: PASS, 3 pruebas.

- [ ] **Step 5: Commit**

```bash
git add dinamo-catalogo/config.mjs dinamo-catalogo/lib/extraer-catalogo.mjs dinamo-catalogo/test/extraer-catalogo.test.mjs
git commit -m "feat(dinamo-catalogo): extraer MODELS y SCHEMES del cotizador PT"
```

---

### Task 2: Tablas del catálogo con RLS

**Files:**
- Create: `dinamo-catalogo/verificacion/001_tablas.sql`
- Create: `dinamo-catalogo/migrations/001_catalogo_tablas.sql`

**Interfaces:**
- Produces: tablas `public.modelos`, `public.esquemas`, `public.esquema_niveles`, `public.multiplicadores`, `public.parametros` con las columnas exactas de abajo; lectura para `anon` y `authenticated`, escritura solo `service_role`.

- [ ] **Step 1: Escribir la verificación (falla mientras no existan las tablas)**

`dinamo-catalogo/verificacion/001_tablas.sql`:

```sql
-- Esperado: 5 filas, todas con rls = true y politicas = 1.
select c.relname as tabla,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname and p.cmd = 'SELECT') as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('modelos','esquemas','esquema_niveles','multiplicadores','parametros')
order by 1;
```

- [ ] **Step 2: Correrla y ver que falla**

Run (MCP `execute_sql`): contenido de `verificacion/001_tablas.sql`.
Expected: 0 filas.

- [ ] **Step 3: Escribir y aplicar la migración**

`dinamo-catalogo/migrations/001_catalogo_tablas.sql`:

```sql
-- Catálogo Dinamo compartido: modelos y esquemas de financiamiento.
-- Fuente de verdad de los datos: cotizador-pt/index.html (lista 25/08/2026).

create table public.modelos (
  id                  bigint generated by default as identity primary key,
  nombre              text not null unique,
  precio_lista        integer not null check (precio_lista > 0),
  servicio_preventivo integer not null default 0 check (servicio_preventivo >= 0),
  tipo                text,
  descripcion         text,
  imagen_url          text,
  activo              boolean not null default true,
  orden               integer not null
);
comment on table public.modelos is 'Motos de Dinamo. precio_lista es SIN servicio preventivo.';

create table public.esquemas (
  id            text primary key,
  etiqueta      text not null,
  enganche_min  numeric(5,2) not null,
  enganche_max  numeric(5,2) not null,
  unidad_plazo  text not null check (unidad_plazo in ('quincenas','semanas')),
  orden         integer not null,
  check (enganche_min <= enganche_max)
);

create table public.esquema_niveles (
  id              bigint generated by default as identity primary key,
  esquema_id      text not null references public.esquemas(id),
  enganche_desde  numeric(5,2) not null,
  enganche_hasta  numeric(5,2) not null,
  check (enganche_desde <= enganche_hasta)
);
create index esquema_niveles_esquema_idx on public.esquema_niveles (esquema_id);

create table public.multiplicadores (
  nivel_id  bigint not null references public.esquema_niveles(id) on delete cascade,
  plazo     integer not null check (plazo > 0),
  factor    numeric(9,7) not null check (factor > 0),
  primary key (nivel_id, plazo)
);

create table public.parametros (
  clave  text primary key,
  valor  text not null
);

alter table public.modelos          enable row level security;
alter table public.esquemas         enable row level security;
alter table public.esquema_niveles  enable row level security;
alter table public.multiplicadores  enable row level security;
alter table public.parametros       enable row level security;

-- Lectura pública: los cotizadores leen con la clave publicable.
-- Sin políticas de escritura: solo service_role (Table Editor, scripts) escribe.
create policy "lectura publica" on public.modelos         for select to anon, authenticated using (true);
create policy "lectura publica" on public.esquemas        for select to anon, authenticated using (true);
create policy "lectura publica" on public.esquema_niveles for select to anon, authenticated using (true);
create policy "lectura publica" on public.multiplicadores for select to anon, authenticated using (true);
create policy "lectura publica" on public.parametros      for select to anon, authenticated using (true);
```

Run (MCP `apply_migration`): `name: catalogo_tablas`, `query`: contenido del archivo.

- [ ] **Step 4: Correr la verificación y ver que pasa**

Run (MCP `execute_sql`): `verificacion/001_tablas.sql`.
Expected: 5 filas (`esquema_niveles`, `esquemas`, `modelos`, `multiplicadores`, `parametros`), todas `rls = true`, `politicas = 1`.

- [ ] **Step 5: Commit**

```bash
git add dinamo-catalogo/migrations/001_catalogo_tablas.sql dinamo-catalogo/verificacion/001_tablas.sql
git commit -m "feat(dinamo-catalogo): tablas del catálogo con lectura pública"
```

---

### Task 3: Carga del catálogo (cotizador PT + descripciones de `Motos`)

**Files:**
- Create: `dinamo-catalogo/scripts/generar-seed.mjs`
- Create (generado): `dinamo-catalogo/migrations/002_seed_catalogo.sql`
- Create: `dinamo-catalogo/verificacion/002_seed.sql`

**Interfaces:**
- Consumes: `leerCotizadorPT()` (Task 1); tablas de Task 2; tabla existente `public."Motos"`.
- Produces: 39 filas en `modelos` (37 activas = `MODELS` en el mismo orden; `Monkey` y `Xtreme Rocky` inactivas), 7 esquemas, sus niveles y multiplicadores, `parametros.lista_vigente = '2026-08-25'`.

- [ ] **Step 1: Escribir la verificación**

`dinamo-catalogo/verificacion/002_seed.sql`:

```sql
-- Esperado (una fila):
-- total=39, activos=37, esquemas=7, niveles=13, lista='2026-08-25',
-- sin_descripcion='ADVENTURE ELITE 175, U5 175', inactivos='Monkey, Xtreme Rocky',
-- r4_id=38, r4_precio=55335, nuevos_min_id=42, multiplicadores=92
select
  (select count(*) from public.modelos) as total,
  (select count(*) from public.modelos where activo) as activos,
  (select count(*) from public.esquemas) as esquemas,
  (select count(*) from public.esquema_niveles) as niveles,
  (select valor from public.parametros where clave = 'lista_vigente') as lista,
  (select string_agg(nombre, ', ' order by nombre) from public.modelos where activo and descripcion is null) as sin_descripcion,
  (select string_agg(nombre, ', ' order by nombre) from public.modelos where not activo) as inactivos,
  (select id from public.modelos where nombre = 'R4') as r4_id,
  (select precio_lista from public.modelos where nombre = 'R4') as r4_precio,
  (select min(id) from public.modelos where nombre in ('U5 175', 'ADVENTURE ELITE 175')) as nuevos_min_id,
  (select count(*) from public.multiplicadores) as multiplicadores;
```

Cuentas esperadas, derivadas de `SCHEMES`: niveles = 3 + 4 + 1 + 1 + 1 + 2 + 1 = 13; multiplicadores = 3×7 + 4×7 + 7 + 7 + 7 + 2×7 + 8 = 92.

- [ ] **Step 2: Correrla y ver que falla**

Run (MCP `execute_sql`): `verificacion/002_seed.sql`.
Expected: `total = 0`, `esquemas = 0`, `lista = null`.

- [ ] **Step 3: Escribir el generador**

`dinamo-catalogo/scripts/generar-seed.mjs`:

```js
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
lineas.push('create temp table _cotizador (nombre text, precio_lista integer, servicio_preventivo integer, orden integer);');
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
where not exists (select 1 from public.modelos mo where mo.nombre = c.nombre);

drop table _cotizador;`);

const destino = new URL('../migrations/002_seed_catalogo.sql', import.meta.url);
writeFileSync(destino, lineas.join('\n') + '\n');
console.log(`Escrito ${destino.pathname} — ${MODELS.length} modelos, ${Object.keys(SCHEMES).length} esquemas`);
```

- [ ] **Step 4: Generar y revisar el SQL**

Run: `node dinamo-catalogo/scripts/generar-seed.mjs`
Expected: `Escrito …/002_seed_catalogo.sql — 37 modelos, 7 esquemas`.

Revisar a ojo en el archivo: 13 líneas `with n as (insert into public.esquema_niveles`, 37 filas en `_cotizador`, y que el nivel `motonomina_flex` tenga `(96, 0.0207137)`.

- [ ] **Step 5: Aplicar y verificar**

Run (MCP `apply_migration`): `name: seed_catalogo`, `query`: contenido de `002_seed_catalogo.sql`.
Run (MCP `execute_sql`): `verificacion/002_seed.sql`.
Expected: `total=39, activos=37, esquemas=7, niveles=13, lista=2026-08-25, sin_descripcion='ADVENTURE ELITE 175, U5 175', inactivos='Monkey, Xtreme Rocky', r4_id=38, r4_precio=55335, nuevos_min_id=42, multiplicadores=92`.

Si `activos` < 37 o `sin_descripcion` lista más modelos, algún nombre no emparejó: correr
`select c.nombre from public.modelos c where c.activo and c.descripcion is null;`, corregir la normalización en el generador, y aplicar una migración `reseed_catalogo` con `truncate public.multiplicadores, public.esquema_niveles, public.esquemas, public.modelos, public.parametros restart identity cascade;` seguido del SQL regenerado.

- [ ] **Step 6: Commit**

```bash
git add dinamo-catalogo/scripts/generar-seed.mjs dinamo-catalogo/migrations/002_seed_catalogo.sql dinamo-catalogo/verificacion/002_seed.sql
git commit -m "feat(dinamo-catalogo): cargar catálogo desde cotizador PT y descripciones de Motos"
```

---

### Task 4: Función `cotizar()` con prueba de paridad contra el cotizador

**Files:**
- Create: `dinamo-catalogo/lib/cotizar.mjs`
- Create: `dinamo-catalogo/lib/rpc.mjs`
- Create: `dinamo-catalogo/migrations/003_cotizar.sql`
- Test: `dinamo-catalogo/test/cotizar-errores.test.mjs`
- Test: `dinamo-catalogo/test/paridad.test.mjs`

**Interfaces:**
- Consumes: `leerCotizadorPT()`, `SUPABASE_URL`, `SUPABASE_KEY`; datos de Task 3.
- Produces (SQL): `public.cotizar(p_modelo text, p_esquema text, p_enganche numeric, p_con_servicio boolean default true) returns table (plazo integer, unidad text, precio numeric, enganche_monto numeric, a_financiar numeric, parcialidad integer)`.
- Produces (JS): `cotizarJS(MODELS, SCHEMES, nombre, esquemaId, enganche, conServicio) → Record<plazo, parcialidad> | null`; `rpc(nombre, args) → Promise<any>` (lanza `Error` con `.status` y `.cuerpo` si la respuesta no es 2xx).

- [ ] **Step 1: Escribir las pruebas que fallan**

`dinamo-catalogo/lib/rpc.mjs` (infraestructura que necesitan las pruebas):

```js
import { SUPABASE_URL, SUPABASE_KEY } from '../config.mjs';

export async function rpc(nombre, args = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const cuerpo = await r.json();
  if (!r.ok) {
    const e = new Error(cuerpo?.message ?? `HTTP ${r.status}`);
    e.status = r.status;
    e.cuerpo = cuerpo;
    throw e;
  }
  return cuerpo;
}
```

`dinamo-catalogo/test/cotizar-errores.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../lib/rpc.mjs';

const args = (extra) => ({ p_modelo: 'U2', p_esquema: 'motonomina', p_enganche: 5, p_con_servicio: false, ...extra });

test('U2 Motonomina 5 % sin servicio a 72 quincenas = 844 (igual que Motos)', async () => {
  const filas = await rpc('cotizar', args());
  const f72 = filas.find((f) => f.plazo === 72);
  assert.equal(f72.parcialidad, 844);
  assert.equal(f72.unidad, 'quincenas');
  assert.equal(filas.length, 7);
});

test('con servicio suma el preventivo al precio', async () => {
  const [f] = await rpc('cotizar', args({ p_con_servicio: true }));
  assert.equal(Number(f.precio), 21945 + 2287);
});

test('modelo inexistente da error en español', async () => {
  await assert.rejects(rpc('cotizar', args({ p_modelo: 'NO EXISTE' })), /Modelo no encontrado o inactivo/);
});

test('modelo inactivo da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_modelo: 'Monkey' })), /Modelo no encontrado o inactivo/);
});

test('esquema inexistente da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_esquema: 'nada' })), /Esquema no encontrado/);
});

test('enganche bajo el mínimo da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_esquema: 'credinamo', p_enganche: 5 })), /fuera del rango/);
});

test('enganche sobre el máximo da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_enganche: 80 })), /fuera del rango/);
});

test('enganche en un hueco entre niveles da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_enganche: 24.995 })), /No hay nivel/);
});
```

`dinamo-catalogo/lib/cotizar.mjs`:

```js
// Copia fiel del cálculo de render() en cotizador-pt/index.html (líneas 908–949).
// Es la referencia contra la que se prueba cotizar() de Postgres.
export function cotizarJS(MODELS, SCHEMES, nombre, esquemaId, enganche, conServicio) {
  const fila = MODELS.find(([n]) => n === nombre);
  const sc = SCHEMES[esquemaId];
  if (!fila || !sc || !(enganche >= sc.min && enganche <= sc.max)) return null;
  const [, listPrice, svcPrice = 0] = fila;
  const price = listPrice + (conServicio ? svcPrice : 0);
  const downAmt = price * (enganche / 100);
  const fin = price - downAmt;
  const lvl = sc.levels.find((l) => enganche >= l.range[0] && enganche <= l.range[1]);
  if (!lvl) return null;
  return Object.fromEntries(sc.terms.map((t) => [t, Math.round(fin * lvl.m[t])]));
}
```

`dinamo-catalogo/test/paridad.test.mjs`:

```js
// Paridad JS ↔ SQL: bloqueante para cambiar a Alex (Task 6).
// Recorre modelo × esquema × enganche representativo × con/sin servicio y
// compara cada parcialidad al peso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';
import { cotizarJS } from '../lib/cotizar.mjs';
import { rpc } from '../lib/rpc.mjs';

const { MODELS, SCHEMES } = leerCotizadorPT();

// Bordes y punto medio de cada nivel, recortados al rango válido del esquema.
function enganchesDe(sc) {
  const set = new Set();
  for (const { range: [a, b] } of sc.levels) {
    const lo = Math.max(a, sc.min);
    const hi = Math.min(b, sc.max);
    if (lo > hi) continue;
    set.add(lo);
    set.add(hi);
    set.add(Math.round(((lo + hi) / 2) * 100) / 100);
  }
  return [...set].sort((x, y) => x - y);
}

const casos = [];
for (const [esquemaId, sc] of Object.entries(SCHEMES)) {
  for (const enganche of enganchesDe(sc)) {
    for (const [nombre] of MODELS) {
      for (const conServicio of [false, true]) casos.push({ nombre, esquemaId, enganche, conServicio });
    }
  }
}

async function enParalelo(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

test(`cotizar() coincide al peso con el cotizador PT (${casos.length} casos)`, { timeout: 600_000 }, async () => {
  const diferencias = [];
  await enParalelo(casos, 16, async (c) => {
    const esperado = cotizarJS(MODELS, SCHEMES, c.nombre, c.esquemaId, c.enganche, c.conServicio);
    const filas = await rpc('cotizar', {
      p_modelo: c.nombre, p_esquema: c.esquemaId, p_enganche: c.enganche, p_con_servicio: c.conServicio,
    });
    const obtenido = Object.fromEntries(filas.map((f) => [f.plazo, f.parcialidad]));
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) diferencias.push({ ...c, esperado, obtenido });
  });
  assert.deepEqual(diferencias.slice(0, 10), [], `${diferencias.length} casos difieren`);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test dinamo-catalogo/test/cotizar-errores.test.mjs`
Expected: FAIL; los errores de PostgREST dicen que no existe la función `public.cotizar` (código `PGRST202`).

- [ ] **Step 3: Escribir y aplicar la función**

`dinamo-catalogo/migrations/003_cotizar.sql`:

```sql
-- Cotiza un modelo en un esquema: una fila por plazo del nivel aplicable.
-- Misma fórmula que render() de cotizador-pt/index.html.
create or replace function public.cotizar(
  p_modelo text,
  p_esquema text,
  p_enganche numeric,
  p_con_servicio boolean default true
)
returns table (
  plazo integer,
  unidad text,
  precio numeric,
  enganche_monto numeric,
  a_financiar numeric,
  parcialidad integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_modelo   public.modelos%rowtype;
  v_esquema  public.esquemas%rowtype;
  v_nivel    bigint;
  v_precio   numeric;
  v_enganche numeric;
begin
  select * into v_modelo from public.modelos where nombre = p_modelo and activo;
  if not found then
    raise exception 'Modelo no encontrado o inactivo: %', p_modelo;
  end if;

  select * into v_esquema from public.esquemas where id = p_esquema;
  if not found then
    raise exception 'Esquema no encontrado: %', p_esquema;
  end if;

  if p_enganche is null or p_enganche < v_esquema.enganche_min or p_enganche > v_esquema.enganche_max then
    raise exception 'Enganche de % %% fuera del rango de % (% %% a % %%)',
      p_enganche, v_esquema.etiqueta, v_esquema.enganche_min, v_esquema.enganche_max;
  end if;

  select n.id into v_nivel
  from public.esquema_niveles n
  where n.esquema_id = p_esquema
    and p_enganche between n.enganche_desde and n.enganche_hasta
  order by n.enganche_desde
  limit 1;
  if v_nivel is null then
    raise exception 'No hay nivel de % para un enganche de % %%', v_esquema.etiqueta, p_enganche;
  end if;

  v_precio   := v_modelo.precio_lista + case when p_con_servicio then v_modelo.servicio_preventivo else 0 end;
  v_enganche := v_precio * p_enganche / 100;

  return query
    select m.plazo,
           v_esquema.unidad_plazo,
           v_precio,
           v_enganche,
           v_precio - v_enganche,
           round((v_precio - v_enganche) * m.factor)::integer
    from public.multiplicadores m
    where m.nivel_id = v_nivel
    order by m.plazo;
end;
$$;

grant execute on function public.cotizar(text, text, numeric, boolean) to anon, authenticated;
```

Run (MCP `apply_migration`): `name: cotizar`, `query`: contenido del archivo.

- [ ] **Step 4: Correr las pruebas de errores y ver que pasan**

Run: `node --test dinamo-catalogo/test/cotizar-errores.test.mjs`
Expected: PASS, 8 pruebas.

- [ ] **Step 5: Correr la paridad y ver que pasa**

Run: `node --test dinamo-catalogo/test/paridad.test.mjs`
Expected: PASS con `0 casos difieren`. El título muestra el total de casos (≈ 2,900).

Si hay diferencias, **no seguir a la Task 6**. Revisar las primeras 10 del reporte: si todas son ±1 en casos donde `a_financiar × factor` termina exactamente en `.5`, es redondeo de punto flotante del JS; reportarlo a Braulio con los casos concretos, porque decide cuál cifra es la oficial. Cualquier otra diferencia es un error de datos o de fórmula y se corrige antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add dinamo-catalogo/lib/cotizar.mjs dinamo-catalogo/lib/rpc.mjs dinamo-catalogo/migrations/003_cotizar.sql dinamo-catalogo/test/cotizar-errores.test.mjs dinamo-catalogo/test/paridad.test.mjs
git commit -m "feat(dinamo-catalogo): función cotizar() con paridad contra el cotizador PT"
```

---

### Task 5: Función `catalogo()` en la forma de `MODELS`/`SCHEMES`

**Files:**
- Create: `dinamo-catalogo/migrations/004_catalogo.sql`
- Test: `dinamo-catalogo/test/catalogo.test.mjs`

**Interfaces:**
- Consumes: `rpc()`, `leerCotizadorPT()`; datos de Task 3.
- Produces (SQL): `public.catalogo() returns json` con `{ lista_vigente: string, modelos: [nombre, precio_lista, servicio][], esquemas: { [id]: { label, min, max, termUnit, terms, levels: [{ range: [desde, hasta], m: { [plazo]: factor } }] } } }`. Modelos solo activos, en `orden`; esquemas en `orden` (se devuelve `json`, no `jsonb`, para conservar el orden de las llaves, del que depende el orden en pantalla de los cotizadores).

- [ ] **Step 1: Escribir la prueba que falla**

`dinamo-catalogo/test/catalogo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../lib/rpc.mjs';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';

const { MODELS, SCHEMES } = leerCotizadorPT();

// JSON convierte las llaves numéricas de "m" en texto; se normaliza igual que la respuesta.
const comoJSON = (x) => JSON.parse(JSON.stringify(x));

test('catalogo() trae la lista vigente', async () => {
  const cat = await rpc('catalogo');
  assert.equal(cat.lista_vigente, '2026-08-25');
});

test('catalogo().modelos es idéntico a MODELS del cotizador', async () => {
  const cat = await rpc('catalogo');
  assert.deepStrictEqual(cat.modelos, MODELS);
});

test('catalogo().esquemas es idéntico a SCHEMES, en el mismo orden', async () => {
  const cat = await rpc('catalogo');
  assert.deepEqual(Object.keys(cat.esquemas), Object.keys(SCHEMES));
  assert.deepStrictEqual(cat.esquemas, comoJSON(SCHEMES));
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test dinamo-catalogo/test/catalogo.test.mjs`
Expected: FAIL (`PGRST202`, no existe `public.catalogo`).

- [ ] **Step 3: Escribir y aplicar la función**

`dinamo-catalogo/migrations/004_catalogo.sql`:

```sql
-- Todo el catálogo en la forma exacta de MODELS y SCHEMES de los cotizadores,
-- para que cambien su fuente de datos sin tocar su lógica de cálculo.
-- Devuelve json (no jsonb) para conservar el orden de los esquemas.
create or replace function public.catalogo()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'lista_vigente', (select valor from public.parametros where clave = 'lista_vigente'),
    'modelos', coalesce((
      select json_agg(json_build_array(mo.nombre, mo.precio_lista, mo.servicio_preventivo) order by mo.orden)
      from public.modelos mo
      where mo.activo
    ), '[]'::json),
    'esquemas', coalesce((
      select json_object_agg(e.id, json_build_object(
        'label', e.etiqueta,
        'min', e.enganche_min,
        'max', e.enganche_max,
        'termUnit', e.unidad_plazo,
        'terms', (
          select json_agg(t.plazo order by t.plazo)
          from (
            select distinct m.plazo
            from public.multiplicadores m
            join public.esquema_niveles n on n.id = m.nivel_id
            where n.esquema_id = e.id
          ) t
        ),
        'levels', (
          select json_agg(json_build_object(
            'range', json_build_array(n.enganche_desde, n.enganche_hasta),
            'm', (
              select json_object_agg(m.plazo::text, m.factor order by m.plazo)
              from public.multiplicadores m
              where m.nivel_id = n.id
            )
          ) order by n.enganche_desde)
          from public.esquema_niveles n
          where n.esquema_id = e.id
        )
      ) order by e.orden)
      from public.esquemas e
    ), '{}'::json)
  );
$$;

grant execute on function public.catalogo() to anon, authenticated;
```

Run (MCP `apply_migration`): `name: catalogo`, `query`: contenido del archivo.

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test dinamo-catalogo/test/catalogo.test.mjs`
Expected: PASS, 3 pruebas. (Los `numeric` salen como `5.00` / `0.1014490` en el JSON y `JSON.parse` los vuelve `5` / `0.101449`, iguales a `SCHEMES`.)

- [ ] **Step 5: Commit**

```bash
git add dinamo-catalogo/migrations/004_catalogo.sql dinamo-catalogo/test/catalogo.test.mjs
git commit -m "feat(dinamo-catalogo): función catalogo() con la forma de MODELS y SCHEMES"
```

---

### Task 6: Vista `Motos` para Alex (con reversa)

**Prerrequisito:** `node --test dinamo-catalogo/test/` pasa completo (incluida la paridad de la Task 4). Si no, no empezar.

**Files:**
- Create: `dinamo-catalogo/migrations/005_vista_motos.sql`
- Create: `dinamo-catalogo/migrations/005_vista_motos.down.sql`
- Create: `dinamo-catalogo/verificacion/005_motos_vs_legacy.sql`

**Interfaces:**
- Consumes: `public.cotizar()` (Task 4), `public.modelos` (Task 3).
- Produces: tabla `public.motos_legacy` (la `Motos` original, intacta) y vista `public."Motos"` con las columnas exactas de abajo.

- [ ] **Step 1: Escribir la verificación**

`dinamo-catalogo/verificacion/005_motos_vs_legacy.sql`:

```sql
-- Compara la vista nueva contra la tabla original, columna por columna.
-- Esperado: solo las diferencias conocidas (ver Step 4).
with v as (select * from public."Motos"),
     l as (select * from public.motos_legacy)
select coalesce(v.id, l.id) as id,
       coalesce(v."Modelo", btrim(l."Modelo", E' \n')) as modelo,
       case when v.id is null then 'solo en legacy'
            when l.id is null then 'solo en vista'
            else 'difiere' end as caso,
       l."Precio lista (promoción)" as precio_antes, v."Precio lista (promoción)" as precio_ahora,
       l."Precio paquete" as paquete_antes, v."Precio paquete" as paquete_ahora,
       l."Pago quincenal en Motonomina" as mn_antes, v."Pago quincenal en Motonomina" as mn_ahora,
       l."Pago quincenal en credinamo, pensionados o dueño de negocio" as cr_antes,
       v."Pago quincenal en credinamo, pensionados o dueño de negocio" as cr_ahora,
       l."Pago quincenal en motoxpress" as mx_antes, v."Pago quincenal en motoxpress" as mx_ahora,
       l."Pago quincenal 50% de enganche" as e50_antes, v."Pago quincenal 50% de enganche" as e50_ahora,
       l."Pago quincenal para personal de seguridad" as seg_antes, v."Pago quincenal para personal de seguridad" as seg_ahora
from v
full join l on l.id = v.id
where v.id is null or l.id is null
   or v."Precio lista (promoción)" is distinct from l."Precio lista (promoción)"
   or v."Precio paquete" is distinct from l."Precio paquete"
   or v."Pago quincenal en Motonomina" is distinct from l."Pago quincenal en Motonomina"
   or v."Pago quincenal en credinamo, pensionados o dueño de negocio" is distinct from l."Pago quincenal en credinamo, pensionados o dueño de negocio"
   or v."Pago quincenal en motoxpress" is distinct from l."Pago quincenal en motoxpress"
   or v."Pago quincenal 50% de enganche" is distinct from l."Pago quincenal 50% de enganche"
   or v."Pago quincenal para personal de seguridad" is distinct from l."Pago quincenal para personal de seguridad"
order by 1;
```

- [ ] **Step 2: Escribir la migración y su reversa**

`dinamo-catalogo/migrations/005_vista_motos.sql`:

```sql
-- Alex (workflow n8n "ALEX 3.0", id hRswhOzLQtfHJo2W) solo lee "Motos".
-- La tabla original se guarda como motos_legacy y "Motos" pasa a ser una vista
-- con las mismas columnas, calculadas desde el catálogo compartido.
-- Pagos: 72 quincenas, sin servicio, enganche mínimo de cada esquema.
-- "Personal de seguridad" = Motonomina con 30 % de enganche.
alter table public."Motos" rename to motos_legacy;

create view public."Motos"
with (security_invoker = true)
as
select
  mo.id,
  mo.tipo                                   as "Tipo de moto",
  mo.nombre                                 as "Modelo",
  mo.precio_lista::bigint                   as "Precio lista (promoción)",
  mo.descripcion                            as "Descripción moto",
  (select c.parcialidad from public.cotizar(mo.nombre, 'motonomina', 5, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal en Motonomina",
  mo.imagen_url                             as "Image_URL",
  (select c.parcialidad from public.cotizar(mo.nombre, 'enganche50', 50, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal 50% de enganche",
  (select c.parcialidad from public.cotizar(mo.nombre, 'credinamo', 10, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal en credinamo, pensionados o dueño de negocio",
  (select c.parcialidad from public.cotizar(mo.nombre, 'motoxpress', 15, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal en motoxpress",
  (select c.parcialidad from public.cotizar(mo.nombre, 'motonomina', 30, false) c where c.plazo = 72)::bigint
                                            as "Pago quincenal para personal de seguridad",
  (mo.precio_lista + mo.servicio_preventivo)::bigint
                                            as "Precio paquete"
from public.modelos mo
where mo.activo
order by mo.orden;

comment on view public."Motos" is 'Compatibilidad con Alex: catálogo compartido con las columnas de la tabla original (ver motos_legacy).';
```

`dinamo-catalogo/migrations/005_vista_motos.down.sql`:

```sql
-- Reversa de 005: regresa la tabla original a su nombre.
drop view public."Motos";
alter table public.motos_legacy rename to "Motos";
```

- [ ] **Step 3: Aplicar**

Run (MCP `apply_migration`): `name: vista_motos`, `query`: contenido de `005_vista_motos.sql`.

- [ ] **Step 4: Verificar contra la tabla original**

Run (MCP `execute_sql`): `verificacion/005_motos_vs_legacy.sql`.

Expected — **solo** estas clases de diferencias; cualquier otra fila se investiga antes de seguir:
- `solo en legacy`: ids 36 (Monkey), 39 (Xtreme Rocky), 40 (`Metro 125`), 41 (`Renegada`).
- `solo en vista`: `U5 175` y `ADVENTURE ELITE 175` (ids ≥ 42).
- `difiere`, con las correcciones ya conocidas: RAYO 175 `mn` 1692 → 1652; U5 `mx` 1025 → 1064; KF-RACER `paquete` 24431 → 24258; R4 (id 38) `precio` 51135 → 55335 y sus pagos recalculados; HEAVY MAX 250 `paquete` null → 101509.
- `difiere` por ±1 peso en cualquier columna de pago (la tabla vieja truncaba; la vista redondea), ej. U5 `seg` 644 → 645.

Además:

```sql
select count(*) as filas, count(*) filter (where "Pago quincenal en Motonomina" is null) as pagos_nulos from public."Motos";
```

Expected: `filas = 37`, `pagos_nulos = 0`.

- [ ] **Step 5: Revisar los avisos de seguridad**

Run (MCP `get_advisors`, `type: security`).
Expected: ningún aviso nuevo sobre `Motos`, `modelos`, `esquemas`, `esquema_niveles`, `multiplicadores`, `parametros`, `cotizar` o `catalogo` (en particular, nada de "security definer view" ni "function search_path mutable"). Si aparece alguno, corregirlo con una migración nueva antes de seguir.

- [ ] **Step 6: Prueba con Alex (la hace Braulio)**

Pedirle a Braulio que le escriba a Alex por WhatsApp: *"¿Cuánto pagaría por una RAYO 175 en Motonomina?"*. Expected: Alex responde con **1,652** quincenal (antes daba 1,692). Esperar su confirmación.

Si Alex falla o responde raro: aplicar `005_vista_motos.down.sql` con `apply_migration` (`name: vista_motos_reversa`), confirmar que Alex vuelve a responder, y reportar.

- [ ] **Step 7: Commit**

```bash
git add dinamo-catalogo/migrations/005_vista_motos.sql dinamo-catalogo/migrations/005_vista_motos.down.sql dinamo-catalogo/verificacion/005_motos_vs_legacy.sql
git commit -m "feat(dinamo-catalogo): Motos como vista del catálogo compartido para Alex"
```

---

### Task 7: README y registro

**Files:**
- Create: `dinamo-catalogo/README.md`
- Modify: memoria `project_dinamo_supabase_unification.md` y vault `Claude mind` (`log.md`, página `ProspecTeam - Asistente Interno (Alex)`) — fuera del repo, sin commit.

- [ ] **Step 1: Escribir el README**

`dinamo-catalogo/README.md`:

````markdown
# Catálogo Dinamo (Supabase)

Catálogo único de motos y esquemas de financiamiento de Dinamo, en el proyecto
Supabase de Alex (`ehyqexzaauvjoioafqdz`). Diseño:
`docs/superpowers/specs/2026-10-06-dinamo-catalogo-supabase-design.md`.

## Qué hay en la base

- Tablas: `modelos`, `esquemas`, `esquema_niveles`, `multiplicadores`, `parametros`.
  Lectura pública; escritura solo con `service_role`.
- `cotizar(modelo, esquema, enganche, con_servicio)` → una fila por plazo.
- `catalogo()` → JSON con la forma exacta de `MODELS` y `SCHEMES` de los cotizadores.
- Vista `Motos` → lo que lee Alex. La tabla original quedó como `motos_legacy`.

## Pruebas

Desde la raíz del repo:

```bash
node --test dinamo-catalogo/test/
```

`paridad.test.mjs` compara `cotizar()` contra el cálculo de `cotizador-pt` en
todas las combinaciones. Correrla después de cualquier cambio de fórmula o de multiplicadores.

## Cambiar precios o multiplicadores

1. Editar en el Table Editor de Supabase (`modelos`, `multiplicadores`) o con SQL.
2. Actualizar `parametros.lista_vigente` si es una lista nueva.
3. Correr las pruebas; la paridad fallará hasta que `cotizador-pt/index.html`
   tenga los mismos datos, lo cual es intencional mientras el cotizador tenga
   datos embebidos.

## Revertir la vista de Alex

Aplicar `migrations/005_vista_motos.down.sql`.
````

- [ ] **Step 2: Correr la suite completa**

Run: `node --test dinamo-catalogo/test/`
Expected: PASS en las 4 suites (extraer, errores, paridad, catálogo).

- [ ] **Step 3: Commit**

```bash
git add dinamo-catalogo/README.md
git commit -m "docs(dinamo-catalogo): README del catálogo compartido"
```

- [ ] **Step 4: Actualizar memoria y vault**

En la memoria `project_dinamo_supabase_unification.md`: fases 1–3 terminadas, fecha, y que el siguiente paso es el plan de la fase 4 (cotizadores). En el vault: entrada en `log.md` y, en la página de Alex, que `Motos` ahora es una vista del catálogo compartido (`motos_legacy` conserva la tabla original).
