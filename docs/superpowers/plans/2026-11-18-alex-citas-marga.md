# Citas de Alex en Marga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cita que agenda Alex 3.2 exista en la agenda de Marga, que el vendedor la confirme y que admin/promotor registren la asistencia, con conteo en el panel de admin.

**Architecture:** Función SQL `alex_crear_cita` (Supabase, solo `service_role`) que escribe en `marga_citas`; la herramienta n8n de cita de Alex la llama con fecha y hora. Marga agrega dos campos de estado (`confirmacion`, `asistencia`) con helpers puros, permisos, chips y botones en Citas, y conteos en el panel.

**Tech Stack:** React + Vite + vitest (marga/), Supabase Postgres, n8n.

**Spec:** `docs/superpowers/specs/2026-11-18-alex-citas-marga-design.md`

## Global Constraints

- Proyecto Supabase `ehyqexzaauvjoioafqdz`; tablas `marga_*` con columna `data jsonb`.
- Campos nuevos opcionales; una cita sin ellos se lee `pendiente` y, con `atendida = true`, como `asistio`.
- `confirmacion` ∈ `pendiente | confirmada | no_confirmada | reagendada`; `asistencia` ∈ `pendiente | asistio | no_asistio`.
- `asistencia = asistio` ⇔ `atendida = true`.
- Zona horaria `America/Monterrey`. Fecha anterior a hoy se rechaza.
- Id de cita de Alex: `alex-cita-<conversation_id>` (con sufijo `-2`, `-3`… si la anterior ya tiene asistencia marcada).
- Solo `service_role` ejecuta `alex_crear_cita`. Un fallo de la función no detiene el Telegram ni la respuesta de Alex.
- La creación manual, el vale y el resumen de cita no cambian. Textos en español.

## Review Focus

- Dos llamadas casi simultáneas de la misma conversación: una sola cita (bloqueo por conversación).
- Fecha u hora mal formada o pasada: error claro, sin escribir nada.
- Cita manual vieja con `atendida = true` y sin campos nuevos: cuenta como asistió y no se rompe.
- Alex reagenda una cita que el vendedor ya confirmó: vuelve a `pendiente`; si ya tiene asistencia marcada, crea una nueva sin tocarla.
- Vendedor intenta marcar asistencia o confirmar cita ajena: los botones no aparecen y la acción se rechaza.

---

### Task 1: Función SQL `alex_crear_cita`

**Files:**
- Create: `marga/supabase/alex_citas.sql`, `marga/supabase/verificacion/alex_citas.sql`

**Interfaces:**
- Produces: `public.alex_crear_cita(p jsonb) returns jsonb` → `{ accion: 'creada'|'actualizada', id }`. Entrada: `conversation_id` (obligatorio), `fecha` `YYYY-MM-DD`, `hora` `HH:MM` (opcional), `telefono`, `nombre`, `moto`, `vendedor`, `motivo`.

- [ ] **Step 1:** Escribir el script de verificación (bloques `do $$` que terminan con `raise exception 'PRUEBAS OK'`, como `verificacion/alex_prospectos.sql`) con aserciones: crear (id, `origen = 'alex'`, `confirmacion = 'pendiente'`, `asistencia = 'pendiente'`, `createdBy` = vendedor, `fechaCita` = medianoche/hora en Monterrey, `hasTime`), actualizar misma conversación (misma id, confirmación vuelve a `pendiente`), asistencia ya marcada → cita nueva `-2` sin tocar la anterior, fecha pasada y formato inválido → excepción, falta `conversation_id` → excepción, notificación creada para el vendedor.
- [ ] **Step 2:** Correr la verificación en Supabase: falla porque la función no existe.
- [ ] **Step 3:** Implementar `alex_crear_cita` en `alex_citas.sql`: `plpgsql`, `set search_path = ''`, `pg_advisory_xact_lock(hashtext('alex-cita-' || conv))`, `fechaCita` en ms con `(fecha + hora)::timestamp at time zone 'America/Monterrey'`, inserta/actualiza en `public.marga_citas` con los campos del registro de `createCita` (`clientName`, `phone`, `motorcycle`, `description` = motivo, `hasTime`, `ineImage` vacío, `atendida` false, `notaAtencion` '', `fechaAtencion` null, `createdBy` = vendedor, `createdAt`, `updatedAt`) más `origen`, `conversationId`, `vendedor`, `confirmacion`, `asistencia`; inserta en `marga_notificaciones` para el vendedor `{ id, destinatario, tipo: 'cita_nueva', mensaje, clienteId: '', citaId, createdAt, leida: false }` con el texto `<vendedor> agendó una cita con <cliente> para el <fecha hora>` solo cuando la cita es nueva; `revoke all … from public, anon, authenticated; grant execute … to service_role`.
- [ ] **Step 4:** Aplicar el script con `apply_migration` y correr la verificación: todo en `PRUEBAS OK`.
- [ ] **Step 5:** Commit (solo si Braulio lo pide).

### Task 2: Helpers de estado y permisos en Marga

**Files:**
- Modify: `marga/src/lib/citas.js`, `marga/src/lib/permissions.js`, `marga/src/lib/analytics.js`
- Test: `marga/src/lib/citas.test.js`, `marga/src/lib/permissions.test.js`, `marga/src/lib/analytics.test.js`

**Interfaces:**
- Produces en `citas.js`: `CONFIRMACION` (`{ pendiente, confirmada, no_confirmada, reagendada }` con etiqueta), `ASISTENCIA` (`{ pendiente, asistio, no_asistio }`), `confirmacionDe(cita) → string`, `asistenciaDe(cita) → string`, `patchConfirmacion(valor) → object`, `patchAsistencia(valor, nota, ahora) → object` (mantiene `atendida`, `notaAtencion`, `fechaAtencion` coherentes), `esDeAlex(cita) → boolean`.
- Produces en `permissions.js`: `canConfirmCita(role, cita, username) → boolean` (admin, o vendedor cuyo nombre esté en `vendedor` o `createdBy`), `canMarkAsistencia(role) → boolean` (admin o promotor).
- Produces en `analytics.js`: `sellerStats` agrega `citasAlex`, `citasConfirmadas`, `citasAsistieron`, `citasNoAsistieron`; `totals` las suma.

- [ ] **Step 1:** Escribir las pruebas: `asistenciaDe({ atendida: true }) === 'asistio'`; `asistenciaDe({}) === 'pendiente'`; `patchAsistencia('asistio', 'ok', 100)` → `{ asistencia: 'asistio', atendida: true, notaAtencion: 'ok', fechaAtencion: 100 }`; `patchAsistencia('no_asistio', '', 100)` → `atendida: false`, `fechaAtencion: 100`; `patchAsistencia('pendiente')` limpia nota y fecha; `canMarkAsistencia` true para admin y promotor, false para vendedor; `canConfirmCita('vendedor', { vendedor: 'Emmanuel Bernal' }, 'Emmanuel Bernal')` true y con otro nombre false; `sellerStats` cuenta confirmadas, asistieron y no asistieron dentro del rango.
- [ ] **Step 2:** Correr `npm test -- citas permissions analytics`: fallan.
- [ ] **Step 3:** Implementar los helpers con las firmas de arriba.
- [ ] **Step 4:** Correr `npm test`: todo pasa.

### Task 3: Interfaz de Citas

**Files:**
- Modify: `marga/src/views/CitasView.jsx`, `marga/src/context/DataContext.jsx` (solo si hace falta exponer el rol y el usuario)

**Interfaces:**
- Consumes: helpers de la Task 2.

- [ ] **Step 1:** En `CitaRow` mostrar chips de confirmación y asistencia y el chip «Alex» cuando `esDeAlex(cita)`.
- [ ] **Step 2:** Botones de confirmación (Confirmada, No confirmada, Reagendada) visibles si `canConfirmCita`; «Reagendada» abre el `ReagendarModal` existente y guarda `confirmacion: 'reagendada'` con la nueva fecha.
- [ ] **Step 3:** Reemplazar el checkbox «Cliente atendido» por botones Asistió / No asistió / Pendiente, visibles solo si `canMarkAsistencia`; «Asistió» abre `AttendModal` y usa `patchAsistencia`. Los demás roles ven el chip sin botones.
- [ ] **Step 4:** Reagendar desde el modal existente conserva su comportamiento y reinicia `asistencia` a pendiente; agregar el filtro «De Alex»; el filtro «Atendidas» usa `asistenciaDe(cita) === 'asistio'`.
- [ ] **Step 5:** `npm run build` sin errores y revisión manual en el navegador con datos de prueba.

### Task 4: Panel de admin

**Files:**
- Modify: `marga/src/views/AdminPanelView.jsx`

- [ ] **Step 1:** Agregar KPIs «Citas de Alex», «Confirmadas», «Asistieron» y «No asistieron» en el grupo Operación, con `totals`.
- [ ] **Step 2:** Agregar esas columnas a la tabla «Detalle por vendedor» y actualizar la nota al pie.
- [ ] **Step 3:** `npm run build` y revisión manual del panel con el rango de fechas.

### Task 5: Herramienta n8n y prompt de Alex

**Files:**
- Modify (n8n): workflow `jpG6VP4gpkPrqstp` y el nodo de herramienta que lo expone dentro de `hRswhOzLQtfHJo2W`, más su prompt.

- [ ] **Step 1:** Agregar entradas `fecha`, `hora`, `moto`, `nombre`, `telefono` a la herramienta (opcionales salvo para `tipo = cita`).
- [ ] **Step 2:** Después de «Armar aviso», agregar un nodo HTTP a `rpc/alex_crear_cita` (mismo patrón y credencial que «Crear boton», `onError: continueRegularOutput`) solo cuando `tipo` contiene `cita`; el Telegram incluye fecha y hora legibles.
- [ ] **Step 3:** Si la función devuelve error de fecha, la respuesta al agente le indica repreguntar la fecha al cliente.
- [ ] **Step 4:** Actualizar el paso de CITA del prompt de Alex: pasar fecha `YYYY-MM-DD`, hora `HH:MM` y moto, y repreguntar si faltan.
- [ ] **Step 5:** Validar el workflow y probar con una ejecución real.

### Task 6: Verificación y publicación

- [ ] **Step 1:** `npm test` y `npm run build` en `marga/`.
- [ ] **Step 2:** Prueba de punta a punta: cita de prueba creada por la función, vista en Citas, confirmada por vendedor, asistencia por admin, conteo en el panel; limpiar la cita de prueba.
- [ ] **Step 3:** Publicar Marga con `firebase deploy --only hosting --project marga-6bb72`.
- [ ] **Step 4:** Actualizar el vault (`Marga.md`, `ProspecTeam - Asistente Interno (Alex).md`, `index.md`, `log.md`) y el visor `docs/esquema-agencia.html` si aplica.
