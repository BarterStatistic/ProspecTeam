# Alex 3.2 → Marga 2.5: los clientes del bot viven en Prospectos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cliente que escriba a Alex aparezca (y avance de columna) como tarjeta en Prospectos de Marga 2.5, asignado al vendedor del turno, con sus características visibles y caducidad de 7 días.

**Architecture:** Las reglas viven en funciones de Supabase (`alex_upsert_prospecto`, `alex_caducar_prospectos`) que escriben en `marga_clients`; n8n solo las llama (una vez por mensaje desde el flujo principal y otra desde el subflujo "CRM Chatwoot"). El turno del vendedor se calcula en una función JS pura que también se pega en el nodo "Asignar Asesor". Marga solo agrega una capa de lectura en `ClientCard` (foto, insignia del vendedor, chips, resumen de Alex).

**Tech Stack:** PostgreSQL/Supabase (funciones plpgsql, `pg_cron`), n8n (flujo ALEX 3.2), React 18 + Vite + Vitest + Tailwind (Marga 2.5).

**Spec:** `docs/superpowers/specs/2026-11-03-alex-marga-prospectos-design.md`

## Global Constraints

- Proyecto Supabase `ehyqexzaauvjoioafqdz`; las tarjetas viven en `public.marga_clients` (`id text`, `data jsonb`, `updated_at`). No se crean tablas ni columnas.
- Hora de Saltillo = `America/Monterrey`. Turnos: lunes–viernes Alejandro 9:00–16:00 y Emmanuel 16:00–22:00; sábado todo el día Emmanuel (Alejandro descansa); domingo todo el día Alejandro (Emmanuel descansa); fuera de horario (22:00–9:00) 50/50 sin asignar al que descansa.
- Usernames de Marga: `Alejandro Acosta` y `Emmanuel Bernal` (verificar contra `marga_users` antes de usarlos).
- Equivalencia etapa → columna: `prospecto`→`primer_contacto`, `catalogo`→`preguntas`, `cotizado` y `calificado`→`interesado_proceso`, `documentacion` y `cita`→`envio_docs_cita`. Alex nunca escribe `proceso_comenzado`.
- Alex solo avanza de columna, nunca retrocede; no toca tarjetas con `section` distinta de `prospectos`.
- Caducidad: tarjetas con `origen = 'alex'`, `section = 'prospectos'` y `updatedAt` de hace más de 7 días.
- "Catálogo enviado" se activa con etapa `catalogo`, no se apaga, y se muestra solo en la columna `preguntas`. Las demás características se ven solo en Prospectos, de solo lectura.
- Foto de perfil de las tarjetas del bot: la imagen que Braulio mandó (perro con lentes y emoji de rock), guardada en `marga/public/alex-avatar.jpg`.
- No se tocan Chatwoot (etiquetas, campos), el prompt de Alex, el subflujo de avisos por Telegram ni Firestore.
- Un fallo al escribir en Marga nunca debe impedir que Alex conteste.
- Respuestas y textos de UI en español. Nada de commits ni push hasta que Braulio lo pida (por eso este plan no trae pasos de commit).
- Aplicar migraciones en Supabase y editar el flujo vivo de n8n son acciones sobre producción: **confirmar con Braulio antes de cada una**.

## Review Focus

- El teléfono llega con otro formato (`+52 1 844 123 4567`, con espacios, o el vendedor lo capturó como `844 123 4567`): debe reconocerse como la misma tarjeta, comparando los últimos 10 dígitos. (Task 2)
- Dos mensajes del mismo cliente procesados al mismo tiempo: una sola tarjeta, no dos. (Task 2)
- Un vendedor corrigió el nombre o la moto de una tarjeta del bot: Alex no lo pisa con su versión. (Task 2)
- Chatwoot manda nombre o teléfono vacíos, o la IA manda una etapa rara (`"Cotizado "`, mayúsculas, valor inventado): se crea la tarjeta igual y una etapa desconocida simplemente no mueve la columna, sin error. (Task 2)
- Una tarjeta del bot que pasó por Procesos y un vendedor regresó a Prospectos: no debe caducar. (Task 3)

---

## Estructura de archivos

| Archivo | Qué hace |
|---|---|
| `marga/n8n/asignar-asesor.mjs` (nuevo) | Función pura `asignarAsesor`: dado el momento y el número de conversación, devuelve el vendedor del turno. Fuente de verdad del código que se pega en n8n. |
| `marga/n8n/asignar-asesor.test.mjs` (nuevo) | Pruebas de turnos y reparto. |
| `marga/supabase/alex_prospectos.sql` (nuevo) | Funciones `alex_tel10`, `alex_stage`, `alex_upsert_prospecto`, `alex_caducar_prospectos` y el trabajo de `pg_cron`. |
| `marga/supabase/verificacion/alex_prospectos.sql` (nuevo) | Pruebas en SQL (se ejecutan y se deshacen solas). |
| `marga/src/lib/alex.js` (nuevo) | Funciones puras para la tarjeta: `esDeAlex`, `vendedorAsignado`, `caracteristicasDe`, constante `ALEX_AVATAR`. |
| `marga/src/lib/alex.test.js` (nuevo) | Pruebas de esas funciones. |
| `marga/src/components/board/ClientCard.jsx` (modifica) | Usa lo anterior: foto, insignia, chips, resumen. |
| `marga/public/alex-avatar.jpg` (nuevo) | Foto de perfil del bot. |
| `marga/README.md`, `CHANGELOG.md` (modifican) | Documentan la integración y la caducidad. |

---

### Task 1: Turno del vendedor (función pura)

**Files:**
- Create: `marga/n8n/asignar-asesor.mjs`
- Test: `marga/n8n/asignar-asesor.test.mjs`

**Interfaces:**
- Produces: `asignarAsesor(tsSegundos: number, conversationId: number): { asesor: 'alejandro' | 'emmanuel', username: 'Alejandro Acosta' | 'Emmanuel Bernal', fueraDeHorario: boolean }`. Task 5 pega esta función en el nodo "Asignar Asesor".

- [ ] **Step 1: Escribir las pruebas que fallan** en `asignar-asesor.test.mjs` (Vitest), con `const ts = (iso) => Date.parse(iso) / 1000` y fechas con `-06:00` (lunes = 2026-11-02, sábado = 2026-11-07, domingo = 2026-11-08). Casos y resultados esperados:
  - `test('lunes 10:00 es de Alejandro')`: lunes 10:00 → `asesor 'alejandro'`, `fueraDeHorario false`.
  - `test('lunes 9:00 es de Alejandro y 15:59 también')`: lunes 09:00 y lunes 15:59 → `'alejandro'`, `false`.
  - `test('lunes 16:00 es de Emmanuel y 21:59 también')`: lunes 16:00 y 21:59 → `'emmanuel'`, `false`.
  - `test('sábado todo el día es de Emmanuel')`: sábado 10:00 y 18:00 → `'emmanuel'`, `false`.
  - `test('domingo todo el día es de Alejandro')`: domingo 10:00 y 18:00 → `'alejandro'`, `false`.
  - `test('fuera de horario entre semana se reparte por paridad')`: lunes 22:00 con conversación 2 → `'alejandro'`, `fueraDeHorario true`; con conversación 3 → `'emmanuel'`; lunes 08:59 con 4 → `'alejandro'`, con 5 → `'emmanuel'`.
  - `test('fuera de horario no se asigna al que descansa')`: sábado 23:00 con conversación 2 → `'emmanuel'`; domingo 23:00 con conversación 3 → `'alejandro'`.
  - `test('usa la hora de Saltillo, no la del servidor')`: `2026-11-02T22:00:00Z` (= 16:00 en Saltillo) → `'emmanuel'`.
  - `test('devuelve el username de Marga')`: el resultado de Alejandro trae `username === 'Alejandro Acosta'` y el de Emmanuel `'Emmanuel Bernal'`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd marga && npx vitest run n8n/asignar-asesor.test.mjs`
Expected: FAIL (el módulo no existe).

- [ ] **Step 3: Implementar `asignarAsesor` en `marga/n8n/asignar-asesor.mjs`.** Sin dependencias (n8n corre este código): sacar día de la semana y hora con `Intl.DateTimeFormat('en-US', { timeZone: 'America/Monterrey', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })`. Mañana = hora 9–15, tarde = hora 16–21 (los dos rangos con día de semana como en Global Constraints). Fuera de horario: si es sábado → emmanuel, si es domingo → alejandro, si no → `conversationId % 2 === 0 ? 'alejandro' : 'emmanuel'`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd marga && npx vitest run n8n/asignar-asesor.test.mjs`
Expected: PASS (todos los casos).

---

### Task 2: `alex_upsert_prospecto` en Supabase

**Files:**
- Create: `marga/supabase/alex_prospectos.sql`
- Create: `marga/supabase/verificacion/alex_prospectos.sql`

**Interfaces:**
- Produces (SQL, esquema `public`, ejecutable solo por `service_role`):
  - `alex_tel10(t text) returns text` — últimos 10 dígitos de `t`; `''` si no hay dígitos. `immutable`.
  - `alex_stage(etapa text) returns text` — id de columna de Marga o `null` si la etapa es desconocida; ignora mayúsculas y espacios. `immutable`.
  - `alex_upsert_prospecto(p jsonb) returns jsonb` — entrada y salida abajo.
- Entrada `p`: `conversation_id` (número o texto, obligatorio), `telefono`, `vendedor` (username de Marga), `nombre`, `etapa`, `moto`, `resumen`, `caracteristicas` (objeto con `compra`, `perfil`, `flex`, `temperatura`, `alertas`; `alertas` puede venir como texto separado por comas o como arreglo). Todo lo demás es opcional.
- Salida: `{"accion": "creada" | "actualizada" | "omitida", "id": text}`.
- Documento que escribe (además de los campos que ya crea `createClient` en `marga/src/lib/db.js:110-139`, con los mismos valores vacíos): `origen: 'alex'`, `conversationId`, `caracteristicas: { compra, perfil, flex (bool), temperatura, alertas (arreglo de texto), catalogoEnviado (bool) }`, `resumenAlex`, `nombreAlex`, `motoAlex`, `createdBy` = `vendedor`. `createdAt` y `updatedAt` en milisegundos desde epoch, como `Date.now()`.

- [ ] **Step 1: Escribir primero las pruebas en `verificacion/alex_prospectos.sql`.** Un bloque `DO $$ ... $$` que usa teléfonos de prueba (`8440000001`…) y termina con `raise exception 'PRUEBAS OK'`, para que todo lo que insertó se deshaga. Cada caso llama a la función y hace `assert` sobre `marga_clients`. Casos:
  - `alex_tel10('+52 1 844 123 4567') = '8441234567'` y `alex_tel10('844 123 4567') = '8441234567'`.
  - `alex_stage` devuelve `primer_contacto`, `preguntas`, `interesado_proceso`, `interesado_proceso`, `envio_docs_cita`, `envio_docs_cita` para `prospecto, catalogo, cotizado, calificado, documentacion, cita`; `alex_stage(' Cotizado ') = 'interesado_proceso'`; `alex_stage('inventada') is null`; `alex_stage('') is null`.
  - **Crear:** primer mensaje (sin etapa) → `accion 'creada'`, `id 'alex-<conversation_id>'`, `section 'prospectos'`, `stage 'primer_contacto'`, `origen 'alex'`, `createdBy` = el vendedor enviado, `phone` = últimos 10 dígitos, `firstName`/`lastName` partidos de `nombre` (3 o más palabras → los dos últimos son `lastName`; 2 palabras → la segunda es `lastName`; 1 → solo `firstName`), `order` = máximo de la columna + 1.
  - **Avanzar:** segunda llamada con `etapa 'catalogo'` → `accion 'actualizada'`, `stage 'preguntas'`, `caracteristicas.catalogoEnviado = true`; tercera con `etapa 'cotizado'` → `stage 'interesado_proceso'` y `catalogoEnviado` sigue `true`.
  - **No retroceder:** una llamada con `etapa 'prospecto'` sobre la tarjeta en `interesado_proceso` deja `stage 'interesado_proceso'`, pero sí refresca `updatedAt`.
  - **Teléfono con otro formato (Review Focus):** una conversación distinta con `+52 1 844 000 0001` cae en la tarjeta ya existente (mismo `id`, `accion 'actualizada'`), no crea otra. Lo mismo contra una tarjeta creada por un vendedor (sin `origen`) con teléfono `844 000 0002`: se actualiza **sin** ponerle `origen`, sin cambiar `createdBy`, sin tocar `firstName`, `motorcycles` ni `notes`; solo avanza columna y mezcla `caracteristicas`.
  - **Tarjeta fuera de Prospectos:** con una tarjeta cuyo `section` es `procesos` y el mismo teléfono → `accion 'omitida'` y la tarjeta queda igual; no se crea otra.
  - **Respeta lo que editó el vendedor (Review Focus):** se cambia a mano `firstName` y `motorcycles` de una tarjeta del bot; una llamada nueva con otro `nombre` y otra `moto` no los cambia, pero `resumenAlex` sí se actualiza. Mientras sigan iguales a `nombreAlex` y `motoAlex`, Alex sí los reemplaza.
  - **Datos raros (Review Focus):** `nombre` vacío y `telefono` vacío crean tarjeta con `firstName ''`, `phone ''` y no fallan; `etapa 'inventada'` no cambia `stage` y no falla; `alertas` como texto `'requiere_accion, no_califica'` queda como arreglo de dos elementos; `perfil 'sin_definir'` y `compra 'sin_definir'` se guardan vacíos.
  - **Sin vendedor y sin tarjeta:** llamada sin `vendedor` para una conversación que no tiene tarjeta → `accion 'omitida'`.
  - **Concurrencia (Review Focus):** la función toma `pg_advisory_xact_lock(hashtext(<tel10 o conversation_id>))` antes de buscar; la prueba verifica que dos llamadas seguidas con el mismo teléfono y conversaciones distintas dejan exactamente una fila.

- [ ] **Step 2: Correr y ver que fallan.** Pedir a Braulio el visto bueno para ejecutar SQL en producción (solo crea funciones nuevas, no cambia tablas), y correr el archivo con `mcp__0d0f1f3b-ba6c-4f4e-a755-ad4d70dc7136__execute_sql` (`project_id ehyqexzaauvjoioafqdz`).
Expected: error `function public.alex_tel10(text) does not exist`.

- [ ] **Step 3: Implementar las tres funciones en `alex_prospectos.sql`.** `language plpgsql`, `set search_path = ''`. Reglas para `alex_upsert_prospecto` que las pruebas no dictan:
  - Buscar tarjeta: primero por `id = 'alex-' || conversation_id`; si no hay y el teléfono tiene 10 dígitos, por `alex_tel10(data->>'phone')` igual (cualquier `section`).
  - Si hay tarjeta y su `section` no es `prospectos` → `omitida`, sin escribir nada.
  - Tarjeta del bot (`origen = 'alex'`): reemplaza nombre y moto solo si el valor actual es igual a `nombreAlex` / `motoAlex` (o está vacío); siempre reemplaza `resumenAlex` y mezcla `caracteristicas` (los valores vacíos no borran los guardados; `catalogoEnviado` solo puede pasar de falso a verdadero).
  - Tarjeta de vendedor: solo avanza `stage` y mezcla `caracteristicas`; no escribe `origen`.
  - Todo `update` refresca `updatedAt`; el avance de columna recalcula `order` al final de la columna destino.
  - Funciones `alex_*` con `revoke all ... from public, anon, authenticated` y `grant execute ... to service_role`.

- [ ] **Step 4: Aplicar y ver que pasan.** Con el visto bueno de Braulio: `mcp__0d0f1f3b-ba6c-4f4e-a755-ad4d70dc7136__apply_migration` (`name: alex_prospectos`) con el contenido de `alex_prospectos.sql`, y volver a correr `verificacion/alex_prospectos.sql`.
Expected: el único mensaje es `PRUEBAS OK` (el `raise exception` final), sin ningún `assert` fallido y sin filas de prueba en `marga_clients` (comprobar con `select count(*) from marga_clients where id like 'alex-%'` antes y después: mismo número).

---

### Task 3: Caducidad de 7 días

**Files:**
- Modify: `marga/supabase/alex_prospectos.sql`
- Modify: `marga/supabase/verificacion/alex_prospectos.sql`

**Interfaces:**
- Consumes: el documento que crea `alex_upsert_prospecto` (Task 2).
- Produces: `alex_caducar_prospectos() returns integer` — borra las tarjetas vencidas y devuelve cuántas borró. Programada con `pg_cron` bajo el nombre `marga_caducar_alex` todos los días a las 09:00 UTC (03:00 en Saltillo).

- [ ] **Step 1: Escribir las pruebas que fallan** (otro bloque `DO` con rollback, al final del archivo de verificación). Insertar tarjetas con `updatedAt` manipulado y llamar a la función:
  - `origen alex`, `prospectos`, `updatedAt` de hace 8 días → se borra (la función devuelve 1).
  - Igual pero de hace 6 días 23 horas → se queda.
  - Tarjeta de vendedor (sin `origen`) de hace 30 días en prospectos → se queda.
  - `origen alex` en `procesos` de hace 30 días → se queda.
  - **Review Focus:** `origen alex` en `prospectos` de hace 30 días pero con `fechaInicioProceso` con valor (pasó por Procesos y un vendedor la regresó) → se queda.
  - Una tarjeta del bot vencida a la que `alex_upsert_prospecto` le hace una actualización → ya no está vencida y se queda.

- [ ] **Step 2: Correr y ver que fallan.**
Expected: `function public.alex_caducar_prospectos() does not exist`.

- [ ] **Step 3: Implementar `alex_caducar_prospectos`** en `alex_prospectos.sql`: un solo `delete ... returning` sobre `marga_clients` con las tres condiciones de Global Constraints más `data->>'fechaInicioProceso' is null`, comparando `(data->>'updatedAt')::bigint` contra `now() - interval '7 days'` en milisegundos. Mismos permisos que Task 2. Al final del archivo, programarla: consultar si `pg_cron` está disponible (`select name from pg_available_extensions where name = 'pg_cron'`); si lo está, `create extension if not exists pg_cron` y `cron.schedule('marga_caducar_alex', '0 9 * * *', 'select public.alex_caducar_prospectos()')`. Si no está disponible, dejar la función sola y anotar en el README (Task 6) que un disparador diario de n8n debe llamarla por RPC.

- [ ] **Step 4: Aplicar y ver que pasan.** Con el visto bueno de Braulio, `apply_migration` (`name: alex_caducidad`) y correr la verificación.
Expected: `PRUEBAS OK` en los dos bloques; `select jobname, schedule from cron.job where jobname = 'marga_caducar_alex'` devuelve una fila (si se usó `pg_cron`).

---

### Task 4: Tarjeta de Marga: foto, vendedor, características y resumen

**Files:**
- Create: `marga/src/lib/alex.js`
- Test: `marga/src/lib/alex.test.js`
- Create: `marga/public/alex-avatar.jpg` (copiar desde `C:\Users\braul\AppData\Local\Temp\claude\c8d7f0939f3ba03c\5c152616-0e53-4b18-a341-789b26ea1896\images\1.jpg`; si ese archivo ya no existe, pedirle la foto de nuevo a Braulio)
- Modify: `marga/src/components/board/ClientCard.jsx` (avatar en `:135-141`, línea "Registró" en `:280-285`, bloque de chips en `:314`)

**Interfaces:**
- Produces (`marga/src/lib/alex.js`):
  - `ALEX_AVATAR: string` — `` `${import.meta.env.BASE_URL}alex-avatar.jpg` ``.
  - `esDeAlex(client): boolean` — `client.origen === 'alex'`.
  - `vendedorAsignado(client): string` — `"Le toca: Alejandro"` (primera palabra de `createdBy`); `''` si no hay `createdBy`.
  - `caracteristicasDe(client): Array<{ clave: string, etiqueta: string, tono: 'info' | 'ok' | 'alerta' | 'neutro' }>` — `[]` si `section !== 'prospectos'` o no hay `caracteristicas`. Orden: catálogo enviado (solo con `stage === 'preguntas'`), compra, perfil, Flex, temperatura, alertas. Etiquetas: compra `credito`→"Crédito", `contado`→"Contado"; perfil `motonomina`→"Motonómina", `seguridad`→"Seguridad", `pensionado`→"Pensionado", `credinamo`→"Credinamo", `dueno_negocio`→"Dueño de negocio", `motoxpress`→"Motoxpress", `enganche_50`→"50% de enganche"; flex verdadero→"Flex"; temperatura `caliente`→"Caliente", `tibio`→"Tibio", `frio`→"Frío"; alertas `requiere_accion`→"Requiere acción", `no_califica`→"No califica", `fuera_cobertura`→"Fuera de cobertura", `refacciones`→"Refacciones", `vacantes`→"Vacantes"; catálogo→"Catálogo enviado". Valores vacíos, `sin_definir` o desconocidos no producen chip.

- [ ] **Step 1: Escribir las pruebas que fallan** en `alex.test.js`:
  - `test('esDeAlex distingue las tarjetas del bot')`: `{origen:'alex'}` → `true`; `{}` → `false`.
  - `test('vendedorAsignado usa el primer nombre')`: `{createdBy:'Alejandro Acosta'}` → `'Le toca: Alejandro'`; `{createdBy:'Emmanuel Bernal'}` → `'Le toca: Emmanuel'`; `{}` → `''`.
  - `test('catálogo enviado solo se ve en Preguntas')`: con `caracteristicas.catalogoEnviado = true`, en `stage 'preguntas'` hay un chip "Catálogo enviado"; en `interesado_proceso` no.
  - `test('las características solo se ven en Prospectos')`: la misma tarjeta con `section 'procesos'` → `[]`.
  - `test('traduce los valores de Alex a etiquetas')`: `{compra:'credito', perfil:'dueno_negocio', flex:true, temperatura:'frio', alertas:['requiere_accion']}` → `['Crédito','Dueño de negocio','Flex','Frío','Requiere acción']` en ese orden.
  - `test('ignora vacíos y valores desconocidos')`: `compra:'sin_definir'`, `perfil:''`, `temperatura:'raro'`, `flex:false`, `alertas:[]` → `[]`.
  - `test('tarjeta sin características no revienta')`: `{section:'prospectos'}` → `[]`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd marga && npx vitest run src/lib/alex.test.js`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `alex.js`** con las firmas de arriba (mapas de etiquetas como constantes del módulo).

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd marga && npx vitest run src/lib/alex.test.js`
Expected: PASS (7 pruebas).

- [ ] **Step 5: Copiar la foto** a `marga/public/alex-avatar.jpg`.

- [ ] **Step 6: Conectar `ClientCard.jsx`** (solo para tarjetas donde `esDeAlex(client)`; las demás se ven exactamente igual que hoy):
  - Avatar: `photo={esDeAlex(client) ? ALEX_AVATAR : sellerAvatars[client.createdBy]}` (el aro sigue en el color del vendedor asignado).
  - La línea "Registró: …" se cambia por `vendedorAsignado(client)`, con el mismo color del vendedor y el ícono actual.
  - Si hay `caracteristicasDe(client)`, mostrar un renglón de `m-chip` (con colores por `tono`: `info` → `bg-sky2/15 text-sky2-light`, `ok` → `bg-state-success/15 text-state-success`, `alerta` → `bg-state-warning/15 text-state-warning`, `neutro` → `bg-white/5 text-ink-muted`) arriba del bloque de `saleType`/esquema.
  - Si `client.resumenAlex`, mostrar debajo de `client.notes` un bloque con el mismo estilo que las notas, con el texto en `line-clamp-2` y el rótulo "Alex:".

- [ ] **Step 7: Correr toda la suite y compilar**

Run: `cd marga && npm test && npm run build`
Expected: todas las pruebas en PASS (las existentes más las nuevas) y `vite build` termina sin errores.

- [ ] **Step 8: Revisión visual.** Levantar `VITE_DEMO=1 npm run dev` (con las herramientas del navegador integrado), crear en el almacén de demostración una tarjeta con `origen: 'alex'`, `createdBy: 'Alejandro Acosta'`, `stage: 'preguntas'` y características variadas (la clave de `localStorage` está en `marga/src/lib/store/memoryStore.js`), y comprobar con captura: foto del perro, "Le toca: Alejandro", chips con "Catálogo enviado", bloque "Alex:", y que al mover la tarjeta a otra columna "Catálogo enviado" desaparece. Revisar también en ancho de teléfono (375 px) que los chips no desbordan la tarjeta.

---

### Task 5: n8n: asignación por turno, alta al primer mensaje y actualización desde el CRM

**Files:**
- Modify: flujo "ALEX 3.2" (id `hRswhOzLQtfHJo2W`) y subflujo "ALEX 3.0 - CRM Chatwoot (tool)" (id `GwZxdXLhl2tP8Ezq`), con el servidor MCP de n8n `mcp__41f8a6e0-7971-487c-aeb2-d1f1849f459a__*` (es el que ve estos flujos; el otro servidor n8n no los encuentra).

**Interfaces:**
- Consumes: `asignarAsesor` (Task 1) y `alex_upsert_prospecto` (Task 2, por RPC en `https://ehyqexzaauvjoioafqdz.supabase.co/rest/v1/rpc/alex_upsert_prospecto`, con la credencial de Supabase que ya usa el nodo "Motos Dinamo1").
- Produces: tarjetas en `marga_clients` desde el primer mensaje y cada vez que el CRM de Alex se actualiza.

- [ ] **Step 1: Confirmar con Braulio que se puede editar el flujo vivo, y respaldar.** Guardar la versión actual (`get_workflow_details` de los dos flujos, o `get_workflow_history`) en el scratchpad antes de editar. Cargar `get_workflow_sdk_reference` antes de escribir los cambios.

- [ ] **Step 2: Reemplazar la lógica de turnos del nodo "Asignar Asesor".** Pegar el cuerpo de `asignarAsesor` de `marga/n8n/asignar-asesor.mjs` al inicio del código del nodo y calcular `asignarAsesor(ts, Number(conversation_id))`. Conservar la forma de salida actual (`fuera_de_horario`, `asesor_nombre`, `asesor_telefono`, `frase_contacto`, `recibido`) para no romper el prompt de Alex; el teléfono sale del mapa `{ alejandro: '844 843 0859', emmanuel: '844 159 6835' }` que ya tiene el nodo, y fuera de horario sigue sin compartirse teléfono. Agregar a la salida `asesor_username` (el `username` que devuelve la función).
  Verificación: ejecutar el nodo con datos fijados de un lunes 10:00, un sábado 10:00 y un domingo 10:00 y comprobar `asesor_nombre` = Alejandro, Emmanuel, Alejandro.

- [ ] **Step 3: Agregar el nodo "Subir a Marga"** (HTTP Request, POST al RPC) conectado a la salida de "Asignar Asesor" **en paralelo** con la conexión actual hacia "Alex - Asesor de Ventas Dinamo2" (no intercalado, para no cambiar el `$json` que lee el agente). Opciones del nodo: `onError: continueRegularOutput` y reintentos desactivados. Cuerpo: `{ "p": { conversation_id, telefono: $('Mensaje').first().json.body.sender.phone_number, nombre: $('Mensaje').first().json.body.sender.name, vendedor: asesor_username } }`. No manda `etapa`, así que sobre una tarjeta existente solo funciona como "el cliente escribió" (refresca la fecha) y sobre un cliente nuevo crea la tarjeta en Primer contacto.

- [ ] **Step 4: Actualizar el subflujo "CRM Chatwoot (tool)".** Después de su paso que actualiza Chatwoot, agregar un nodo HTTP al mismo RPC (también `onError: continueRegularOutput`) con `{ "p": { conversation_id, etapa, nombre: nombre_completo, moto: moto_interes, resumen: <descripcion + proximo_paso + notas en líneas separadas>, caracteristicas: { compra, perfil, flex, temperatura, alertas } } }`. El subflujo no manda `vendedor` ni teléfono: la tarjeta ya existe por el paso anterior. Su salida hacia el agente no cambia.

- [ ] **Step 5: Prueba de extremo a extremo.** Avisar a Braulio y, con una conversación de prueba en Chatwoot (número de Braulio):
  1. Mandar "Hola": en Marga aparece una tarjeta en Primer contacto con la foto del perro y "Le toca: <vendedor del turno>".
  2. Pedir el catálogo: la tarjeta pasa a Preguntas con el chip "Catálogo enviado".
  3. Pedir una cotización: pasa a Interesado en proceso con chips de compra/perfil.
  4. Reenviar otro mensaje: no se crea una segunda tarjeta.
  5. Revisar en Chatwoot que etiquetas y notas siguen exactamente como antes.
  6. Con "Subir a Marga" apagado a propósito (o con la clave mal), mandar un mensaje y comprobar que Alex contesta igual.
  Expected: los seis puntos se cumplen. Al terminar, borrar a mano la tarjeta de prueba de Marga.

---

### Task 6: Documentación y vault

**Files:**
- Modify: `marga/README.md` (nueva sección "Clientes de Alex" cerca de "Prospectos")
- Modify: `CHANGELOG.md` (entrada nueva)
- Vault (fuera del repo, sin commit): `C:\Users\braul\OneDrive\Documentos\Claude\Claude mind\` — páginas de Marga y de Alex en `Proyectos/`, más `log.md`

- [ ] **Step 1: README de Marga.** Documentar: de dónde vienen las tarjetas del bot y cómo se reconocen (`origen: 'alex'`, foto del perro); la tabla de etapas → columnas; los turnos y el reparto fuera de horario; que "Proceso comenzado" lo mueve siempre un vendedor; los chips de características y que son de solo lectura; **la caducidad de 7 días** (qué cuenta como modificación, que al pasar a Procesos deja de caducar, que corre a diario a las 03:00 hora de Saltillo vía `pg_cron` o, si no está disponible, con un disparador de n8n); y los archivos `marga/supabase/alex_prospectos.sql` y `marga/n8n/asignar-asesor.mjs`.

- [ ] **Step 2: CHANGELOG** con una entrada fechada 2026-11-03 que resuma el cambio y la corrección de los turnos de sábado y domingo en "Asignar Asesor".

- [ ] **Step 3: Vault.** Siguiendo `Claude mind\CLAUDE.md` §5.1: actualizar las páginas de Marga y de Alex con la integración (tarjetas del bot, turnos, caducidad, dónde vive cada pieza), agregar la entrada en `log.md` y revisar `index.md`.

- [ ] **Step 4: Verificación final**

Run: `cd marga && npm test && npm run build`
Expected: todo en verde. Releer la sección nueva del README una vez para comprobar que los turnos y la caducidad coinciden con Global Constraints.

---

## Autorevisión

- **Cobertura del spec:** columnas y catálogo (Tasks 2 y 4), asignación por turno y 50/50 (Task 1, y 5 para n8n), caducidad (Task 3), foto, insignia y chips solo en Prospectos (Task 4), Chatwoot intacto y falla segura (Task 5, pasos 3–5), corrección de "Asignar Asesor" (Task 5, paso 2), README de caducidad (Task 6).
- **Tipos y nombres consistentes:** `asignarAsesor` (Task 1) → nodo de Task 5; `alex_upsert_prospecto` y sus claves de entrada (Task 2) → cuerpos de los nodos de Task 5; campos `origen`, `caracteristicas`, `resumenAlex` (Task 2) → `alex.js` y `ClientCard` (Task 4); `fechaInicioProceso` (Task 3) existe en `db.js:249`.
- **Un cambio respecto al spec:** el spec decía que n8n "solo llama a la función con los datos"; el turno (quién atiende) lo calcula el nodo "Asignar Asesor" y llega ya resuelto, porque ese nodo también arma el mensaje que Alex le da al cliente y los turnos no deben vivir en dos sitios.
