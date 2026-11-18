# Citas de Alex en Marga: confirmación del vendedor y asistencia

- **Fecha:** 2026-11-18
- **Estado:** borrador para aprobación de Braulio (nada construido)
- **Proyecto Supabase:** `ehyqexzaauvjoioafqdz` (Alex, catálogo y Marga)
- **Flujos n8n:** "ALEX 3.2" (`hRswhOzLQtfHJo2W`) y su herramienta "ALEX 3.2 - Tramite comenzado llamada a vendedor" (`jpG6VP4gpkPrqstp`)

## Intención

Hoy Alex 3.2 agenda una cita solo de palabra: avisa al vendedor por Telegram con un motivo en texto libre y mueve la tarjeta a «Envío de docs / Cita agendada». La fecha y la hora no quedan como datos, así que no hay registro ni conteo. Queremos que **cada cita que agenda Alex exista en la agenda de Marga** con los mismos datos (fecha, hora, cliente, teléfono, moto), que **el vendedor la confirme** y que **tú o Cintia registren si el cliente fue**. Con eso el panel de admin cuenta las citas de Alex.

## Metas

1. Cada cita agendada por Alex aparece en Citas de Marga con fecha, hora, cliente, teléfono, moto, vendedor de guardia y origen «Alex».
2. El vendedor marca la cita como **confirmada**, **no confirmada** o **reagendada**.
3. Admin y promotor marcan la **asistencia**: asistió, no asistió o pendiente.
4. El panel de admin cuenta citas de Alex, confirmadas, asistieron y no asistieron, en total y por vendedor.
5. Si el cliente cambia la hora con Alex, se actualiza la misma cita en vez de crear otra.

## No metas

- La creación manual de citas, el vale de cita y el resumen de cita no cambian.
- Alex **no** revisa la agenda ni la disponibilidad: solo registra la hora que propone el cliente. El vendedor es el filtro.
- No se agrega una pestaña ni sección nueva en Marga.
- Alex no modifica la confirmación ni la asistencia.

## Anti-metas (fallaría aunque «funcione»)

- Citas duplicadas del mismo cliente por mensajes seguidos.
- Que Alex pise una confirmación o asistencia que una persona ya marcó.
- Que un fallo al escribir en Marga deje a Alex sin contestar al cliente o sin mandar el Telegram.
- Que las citas manuales ya existentes cambien de estado o desaparezcan de los conteos.

## Enfoques considerados

- **A. Ampliar la herramienta de cita que Alex ya usa (elegido por Braulio).** Alex manda fecha, hora y moto en la misma llamada; esa llamada manda el Telegram y además crea la cita con una función nueva `alex_crear_cita`.
- B. Herramienta nueva solo para guardar la cita: Alex puede llamar una y olvidar la otra, y la cita queda en Telegram pero no en Marga. Descartado.
- C. Marga lee lo que Alex deja en Chatwoot: la hora hoy es texto libre, se rompería seguido. Descartado.

## Diseño

### Datos de la cita (`marga_citas.data`, sin migración de tablas)

Campos nuevos, todos opcionales para que las citas viejas sigan válidas:

| Campo | Valores | Quién lo cambia |
|---|---|---|
| `origen` | `alex` o ausente (manual) | Alex al crear |
| `conversationId` | id de la conversación de Chatwoot | Alex al crear |
| `vendedor` | vendedor de guardia (`asesor`) | Alex al crear |
| `confirmacion` | `pendiente` (por defecto), `confirmada`, `no_confirmada`, `reagendada` | vendedor de la cita, admin |
| `asistencia` | `pendiente` (por defecto), `asistio`, `no_asistio` | admin y promotor |

`atendida` se conserva y queda ligada: `asistencia = asistio` pone `atendida = true`; cualquier otro valor la pone en `false`. Así los conteos y filtros actuales siguen funcionando. Una cita vieja sin los campos nuevos se lee como `pendiente` y, si tiene `atendida = true`, como `asistio`.

### Función de Supabase `alex_crear_cita(p jsonb)`

- Entrada: `conversation_id` (obligatorio), `fecha` (`YYYY-MM-DD`), `hora` (`HH:MM`), `telefono`, `nombre`, `moto`, `vendedor`, `motivo`.
- Interpreta fecha y hora en `America/Monterrey` y las guarda como `fechaCita` (ms) y `hasTime`, igual que las citas manuales.
- Rechaza fecha inválida o anterior a hoy y devuelve un error claro para que Alex vuelva a preguntar al cliente.
- Id determinista por conversación: `alex-cita-<conversation_id>`. Si ya existe y su `asistencia` sigue pendiente, **actualiza** fecha, hora y moto y regresa `confirmacion` a `pendiente`. Si ya tiene asistencia marcada, crea una cita nueva con sufijo, sin tocar la anterior.
- Bloqueo por conversación (como `alex_upsert_prospecto`) contra mensajes casi simultáneos.
- Solo `service_role` puede ejecutarla. Devuelve `{ accion: 'creada' | 'actualizada', id }`.
- Crea la notificación de Marga para el vendedor asignado, con el mismo texto que usa `mensajeCitaNueva`.

### Flujo n8n

- La herramienta `jpG6VP4gpkPrqstp` recibe `fecha`, `hora`, `moto` cuando `tipo = cita`. Después de armar el aviso llama a `alex_crear_cita` con el mismo patrón que usa hoy para `alex_toma_crear` (sin detener el flujo si falla).
- El Telegram al vendedor incluye fecha y hora legibles.
- El prompt de Alex, en el paso de cita, exige pasar fecha y hora y repreguntar si el cliente no las dio. Si la función devuelve error de fecha, Alex lo corrige con el cliente.
- Un fallo de la función no cambia la respuesta de Alex al cliente ni el Telegram.

### Marga (interfaz)

- **Citas:** cada cita muestra dos chips (confirmación y asistencia). El vendedor de la cita y el admin ven botones para confirmación; admin y promotor ven botones para asistencia. «Reagendada» abre el modal de reagendar que ya existe y deja la nueva fecha guardada.
- **Origen:** chip «Alex» en las citas creadas por el bot; filtro nuevo «De Alex».
- **Panel de admin:** la tabla por vendedor y los KPIs agregan citas de Alex, confirmadas, asistieron y no asistieron, con el rango de fechas que ya existe. «Citas agendadas / atendidas» se mantiene.
- Permisos en `permissions.js`: el vendedor edita confirmación solo de las citas con su nombre en `vendedor` o `createdBy`; asistencia solo admin y promotor.

### Pruebas

- Pruebas unitarias de los helpers de estado y del conteo (`citas.js`, `analytics.js`).
- Script SQL de verificación (como `verificacion/alex_prospectos.sql`): crear, actualizar, duplicado, fecha pasada, asistencia ya marcada.
- Prueba de punta a punta con una conversación real de Alex antes de publicar.

## Llamadas del diseño (mías, para que las revises)

1. El vendedor de la cita es el de guardia que ya asigna Alex; el admin también puede cambiar la confirmación.
2. Después de «reagendada», el vendedor puede volver a marcarla «confirmada» con la nueva fecha.
3. Si Alex cambia la hora, la confirmación vuelve a «pendiente» para que el vendedor la reconfirme.
4. Fecha anterior a hoy se rechaza.
5. El aviso en la campana de Marga al vendedor se agrega aunque ya reciba el Telegram.

## Para el constructor

Orden sugerido: función SQL y verificación, helpers y permisos de Marga, interfaz de Citas, panel de admin, herramienta de n8n y prompt de Alex, publicación. Marga se publica a mano con `firebase deploy` (`marga-6bb72`); los cambios de n8n se publican por separado.
