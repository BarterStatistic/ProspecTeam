# Alex 3.2 → Marga 2.5: los clientes del bot viven en Prospectos

- **Fecha:** 2026-11-03
- **Estado:** borrador para aprobación de Braulio (nada construido)
- **Proyecto Supabase:** `ehyqexzaauvjoioafqdz` (el de Alex, el catálogo y Marga 2.5)
- **Flujo n8n:** "ALEX 3.2" (id `hRswhOzLQtfHJo2W`, activo) y su subflujo "ALEX 3.0 - CRM Chatwoot (tool)" (id `GwZxdXLhl2tP8Ezq`)

## Intención

Marga 2.5 ya es el CRM del equipo (tablero de Prospectos y Procesos). Alex atiende a los clientes por WhatsApp a través de Chatwoot, pero lo que sabe de cada uno se queda en Chatwoot. Queremos que **cada cliente que le escriba a Alex aparezca como tarjeta en Prospectos de Marga**, en la columna que corresponde, con los datos que Alex fue juntando y con el vendedor al que le toca atenderlo. Así los vendedores trabajan desde un solo lugar y Marga sirve también para obtener clientes con facilidad.

Alex no cambia su forma de trabajar. Lo único nuevo es que **refleja** en Marga lo que ya hace en Chatwoot.

## Metas

1. Todo cliente que escriba por primera vez a Alex tiene una tarjeta en Prospectos (columna *Primer contacto*) desde su primer mensaje, sin depender de que el modelo decida llamar una herramienta.
2. La columna de la tarjeta sigue el avance que Alex le registra al cliente (tabla de equivalencias abajo).
3. Cada tarjeta del bot se asigna al vendedor que cubre el turno en que llegó el cliente, y la tarjeta lo muestra.
4. Las tarjetas del bot que nadie modifica en 7 días se eliminan solas.
5. Las "etiquetas" de Chatwoot (compra, perfil, temperatura, alertas, catálogo enviado) se ven en la tarjeta como **características** solo de lectura.
6. La infraestructura de Chatwoot, sus etiquetas, el prompt de Alex y los avisos por Telegram quedan como están.

## No metas

- Alex **no** mueve tarjetas a *Proceso comenzado*. Eso lo hace un vendedor a mano, después de revisar y confirmar lo que la IA le dijo al cliente.
- No se cambian ni se quitan etiquetas, campos ni lógica de Chatwoot.
- Las características no se editan en Marga ni se usan para filtrar o calcular nada: son una ayuda visual.
- No se crean secciones nuevas en Marga ni un apartado "Chatbot".
- Firestore no se toca (Marga ya lee de Supabase; Firestore solo es respaldo viejo).
- No se notifica a los administradores cuando Alex crea o mueve una tarjeta.

## Anti-metas (fallaría aunque "funcione")

- Tarjetas duplicadas del mismo cliente (mismo teléfono).
- Alex pisando algo que un vendedor ya movió o editó: regresar una tarjeta de columna, o escribir encima de una tarjeta que ya pasó a Procesos.
- Borrar una tarjeta con la que un vendedor sí trabajó en los últimos 7 días.
- Que un fallo al escribir en Marga haga que Alex deje de contestar al cliente.

## Reglas decididas por Braulio

**Columnas.** Alex ya registra una "etapa" con seis valores. Equivalencias:

| Etapa de Alex | Columna de Marga |
|---|---|
| `prospecto` | Primer contacto |
| `catalogo` | Preguntas (con la característica "Catálogo enviado") |
| `cotizado`, `calificado` | Interesado en proceso |
| `documentacion`, `cita` | Envío de docs / Cita agendada |
| (ninguna) | Proceso comenzado: solo lo mueve un vendedor |

**Catálogo.** Si el cliente pidió el catálogo y Alex se lo mandó, no es una columna aparte: es una característica "Catálogo enviado", y se muestra **únicamente mientras la tarjeta está en la columna Preguntas**.

**Características.** Hay dos cosas distintas: las *fases* (las columnas del CRM de Marga) y las *características* (las etiquetas de Chatwoot reflejadas como atributos del prospecto). Las características se ven **solo en la pestaña de Prospectos**, como chips de lectura en la tarjeta.

**Turnos** (hora de Saltillo, `America/Monterrey`):

| Día | Alejandro | Emmanuel |
|---|---|---|
| Lunes a viernes | 9:00–16:00 | 16:00–22:00 |
| Sábado | descansa | todo el día |
| Domingo | todo el día | descansa |

Fuera de horario (22:00–9:00) los clientes se reparten 50/50, uno a cada uno, **sin asignar al que descansa ese día** (el sábado fuera de horario va a Emmanuel, el domingo a Alejandro).

**Caducidad.** Una tarjeta creada por el bot que siga en Prospectos y cuya última modificación tenga más de 7 días se elimina automáticamente. Cualquier modificación del folio reinicia los 7 días: que un vendedor la edite o la mueva, o que Alex la actualice porque el cliente siguió escribiendo. Al pasar a Procesos deja de caducar. La limpieza debe quedar documentada en el README de Marga.

**Foto de perfil.** Las tarjetas del bot usan como foto la imagen que Braulio mandó (perro con lentes y emoji de rock), no el ícono de Prospect Team.

## Lo que decidí yo (Braulio, corrígeme)

- **Hasta qué punto Alex toca una tarjeta.** Solo mientras esté en Prospectos. Solo avanza de columna, nunca retrocede. Si el teléfono ya tiene tarjeta (del bot o de un vendedor), Alex actualiza esa en vez de crear otra. Si la tarjeta ya está en Procesos o más allá, no la toca.
- **Quién es el "dueño" de la tarjeta.** El vendedor asignado queda como `createdBy` (así lo ve y lo edita según los permisos que Marga ya tiene, y sale con su color). El origen del bot se marca con un campo propio (`origen: 'alex'`), que es lo que decide qué caduca.
- **Reparto 50/50.** Determinístico: según si el número de conversación de Chatwoot es par o impar. Así una misma conversación siempre cae con el mismo vendedor y no hace falta guardar estado.
- **Qué datos llenan los campos que Marga ya tiene.** Nombre (el de WhatsApp si el cliente no ha dado el suyo), teléfono, moto de interés y notas (descripción, próximo paso y notas de Alex). Lo que Alex no sepa se deja vacío, no se deduce.
- **Qué se guarda como característica.** Compra (crédito/contado), perfil, Flex, temperatura, alertas y "catálogo enviado". "Catálogo enviado" se activa cuando la etapa es `catalogo` y, una vez activa, no se apaga. No se llenan `saleType` ni `creditScheme` de Marga: esos los confirma el vendedor.
- **Dónde vive la lógica.** En Supabase, no en n8n: una función `alex_upsert_prospecto` (crea o actualiza una tarjeta con todas las reglas de arriba, de forma atómica) y una función de limpieza programada con `pg_cron` (si la extensión no está disponible, un disparador diario en n8n que llame a la misma función). n8n solo llama a la función con los datos. Así las reglas se prueban en SQL y no hay que editar nodos para ajustarlas.
- **Dónde se engancha en n8n.** La creación al primer mensaje va en el flujo principal, después de "Asignar Asesor", sin depender del modelo. Las actualizaciones posteriores se hacen dentro del subflujo "CRM Chatwoot (tool)", que ya recibe el cuadro completo en cada llamada. No se agrega ninguna herramienta nueva para el modelo ni se cambia su prompt.
- **Corrección a "Asignar Asesor".** Hoy tiene los turnos del sábado y el domingo al revés de lo que Braulio indicó (sábado Alejandro y domingo Emmanuel, por la tarde). Se reemplaza por la tabla de turnos de arriba. Ese mismo nodo decide con quién le dice Alex al cliente que siga la conversación: el mensaje al cliente no cambia de forma (fuera de horario sigue sin dar teléfono), pero cambia a quién nombra cuando el turno cambia.
- **Falla segura.** Si la llamada a Supabase falla, el flujo sigue y Alex contesta igual; el error queda en el historial de n8n.

## Cómo se ve en Marga (a cargo del constructor)

Tarjetas de Prospectos con origen `alex` llevan:
- foto de perfil: la imagen entregada (archivo dentro de `marga/public/`);
- una insignia con el vendedor asignado ("Le toca: Alejandro");
- chips de características en gris/cian discretos, sin aumentar demasiado la altura de la tarjeta; "Catálogo enviado" solo en Preguntas.

Las tarjetas capturadas por vendedores no cambian.

## Restricciones técnicas

- Marga guarda cada cliente como documento JSON (`id`, `data`, `updated_at`) en `marga_clients`; hay que respetar la forma que Marga espera (`section`, `stage`, `order`, `createdAt`, `updatedAt`, `createdBy`…) y su formato de fecha. El constructor debe leer `marga/src/lib/db.js` y `clients.js` antes de escribir la función SQL.
- `id` determinístico por conversación (por ejemplo `alex-<conversation_id>`) para que las repeticiones del webhook no dupliquen.
- El flujo en producción está activo: los cambios en n8n se hacen sin interrumpir a Alex, con respaldo de la versión anterior.
- Pruebas: la función SQL (crear, avanzar, no retroceder, no duplicar por teléfono, turnos y reparto, caducidad) con casos escritos antes; la vista de Marga con los tests existentes de Vitest más los casos nuevos; una prueba de extremo a extremo con una conversación de prueba en Chatwoot, avisando a Braulio antes de tocarla.

## Queda para el constructor

- El nombre exacto de las funciones, y de las columnas o campos JSON nuevos.
- El diseño fino de los chips y de la insignia.
- Cómo se compara el nombre del vendedor con la tabla `marga_users` (por `username`).
- El detalle del `order` dentro de cada columna.
