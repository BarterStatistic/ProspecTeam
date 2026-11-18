# Alex 3.3 — vendedor IA de Dinamo (WhatsApp)

Fuentes de lo que corre en n8n (instancia ProspecTeam, flujo "ALEX 3.2" `hRswhOzLQtfHJo2W`).
Lo que manda es lo publicado en n8n; estos archivos son la copia de trabajo y de pruebas.

## La medida de éxito

**Clientes aptos (crédito o contado) que mandan documentación.** Todo lo demás (prompt, seguimiento,
conexión con Marga) se ajusta para subir ese número.

Se mide en Supabase (`ehyqexzaauvjoioafqdz`), definido en `marga/supabase/alex_embudo.sql`:

```sql
select * from alex_embudo_semanal;        -- embudo por semana
select * from alex_embudo_por_anuncio;    -- qué anuncio trae clientes aptos que sí mandan papeles
select alex_embudo_resumen(7);            -- últimos 7 días, en JSON
```

La columna que importa es `aptos_con_documentos` (`docs_apto_at` en la tabla `alex_embudo`). La tabla se
llena sola con un disparador sobre `marga_clients` y no caduca (las tarjetas del bot sí, a los 7 días).

## Archivos

| Archivo | Qué es |
|---|---|
| `alex-3.3-system-prompt.txt` | El prompt del agente, tal cual está en el nodo "Alex - Asesor de Ventas Dinamo2" (con sus expresiones de n8n). |
| `build_prompt_desde_3.2.py` | Cómo se armó 3.3 a partir del prompt de 3.2: qué secciones se reemplazaron y cuáles quedaron intactas. Es historial, no hace falta correrlo. |
| `contexto-cliente.js` | Nodo Code "Contexto cliente": arma el bloque CLIENT STATE y calcula el siguiente paso de la venta. |
| `contexto-cliente.test.mjs` | Pruebas de ese nodo: `node --test alex/contexto-cliente.test.mjs`. |
| `banco-pruebas.mjs` | Manda conversaciones de ejemplo a un flujo de pruebas en n8n y muestra lo que contestaría Alex. |

## Cómo funciona un mensaje

1. Chatwoot manda el mensaje al webhook; se agrupan los mensajes seguidos y se analiza audio/imagen/documento.
2. **Asignar Asesor** decide el vendedor de guardia. **Promo vigente** dice si hay promoción.
3. **Leer contexto Marga** (`alex_contexto`) trae el anuncio por el que llegó el cliente y su tarjeta en Marga.
4. **Contexto cliente** junta eso con las etiquetas y atributos de Chatwoot y escribe el estado del cliente y
   el siguiente paso (qué dato falta, o "pide la INE", o "ya lo lleva un vendedor: no pidas papeles").
5. El agente contesta siguiendo ese paso. **Limpiar respuesta** quita el formato que WhatsApp no muestra.
6. Lo que Alex guarda con la herramienta CRM Chatwoot vuelve a él como estado en el siguiente mensaje y
   actualiza la tarjeta de Marga.

## Probar un cambio de prompt sin tocar clientes

El flujo "ALEX 3.3 - Banco de pruebas (temporal)" (`TC9laERD69dPLTNc`) está **archivado**. Para usarlo:
restaurarlo y publicarlo en n8n, correr

```bash
node alex/banco-pruebas.mjs <URL-del-webhook-del-banco-de-pruebas>
```

y volver a archivarlo al terminar (su webhook queda abierto mientras esté publicado). Las conversaciones de
prueba se guardan en `n8n_chat_histories` con `session_id` que empieza con `bench-`; borrarlas al terminar.

## Volver a la versión anterior

En n8n, historial de versiones de "ALEX 3.2": publicar la versión `633f7aee…` (Alex 3.2 del 2026-11-16).
Las tablas y funciones de `alex_embudo.sql` pueden quedarse: no afectan a la versión anterior.

## Supervisor de Alex (desde el 2026-11-17)

Módulo de Bartersito que estudia a Alex con la misma medida y propone cambios.

- **Flujo n8n**: "Supervisor de Alex (ProspecTeam)" `DuiBFvH47R77Zutd`. Lunes 9:20 reporte semanal
  con hasta 3 propuestas (botones ✅/❌ en Telegram); jueves 9:20 avance sin propuestas. Bartersito
  lo llama con la herramienta `supervisor_alex`. Modelo: gpt-5.4.
- **Base**: `marga/supabase/alex_supervisor.sql` (tablas `alex_reportes`, `alex_propuestas`,
  `alex_directivas`, `alex_costos_config`; funciones `alex_supervisor_datos`, `alex_decidir`,
  `alex_costos`, `alex_panel`, y `marga_panel_alex` / `marga_alex_decidir` para Marga).
- **Cómo cambia a Alex sin tocar n8n**: una propuesta `agregar` aprobada se vuelve una directiva activa.
  `alex_contexto` la entrega al nodo "Contexto cliente" y Alex la lee en cada mensaje, bajo el
  bloque SUPERVISOR DIRECTIVES (tope de 8). `retirar` la apaga. `infraestructura` solo queda anotada.
- **Cada propuesta se decide una sola vez**, desde Telegram o desde Marga (Panel ADMIN → Alex IA).
  Lo que no se decide caduca con el siguiente reporte semanal.
- **Costo de Alex**: `select alex_costos(30)`. Es un estimado: llamadas al modelo × tokens promedio
  (medido: 15,169 de entrada por llamada) × precio de Gemini 3.1 Flash-Lite, más los mensajes de
  servicio de WhatsApp que Meta cobra desde el 2026-10-01 después de 1,000 gratis al mes por número
  (las respuestas dentro de las 72 h de un cliente que llegó por anuncio no cuentan). Los precios y
  supuestos están en `alex_costos_config`; la tarifa de servicio de WhatsApp a México no se pudo leer
  en la página de Meta y es la de terceros: confirmarla.
- La hora de cada mensaje (`n8n_chat_histories.creado_en`) se guarda desde el 2026-11-17; la INE
  cuenta como documento en cuanto llega al chat (disparador `alex_embudo_desde_chat`), aunque Alex
  no la anote en el CRM.

## Vendedor de cada cliente y contacto por etiqueta (desde el 2026-11-17)

- **El vendedor se reinicia cuando el cliente vuelve.** Antes el turno salía de la fecha en que se creó la
  conversación en Chatwoot (un cliente de octubre seguía siendo del vendedor de octubre). Ahora el nodo
  "Turno del cliente" llama a `alex_turno` (`marga/supabase/alex_turnos.sql`): si el cliente escribe después de
  más de 24 h sin escribir, el turno cuenta desde ese momento; dentro de las 24 h se queda con quien lo atiende.
  "Asignar Asesor" calcula el vendedor con `momentoDelTurno` (`marga/n8n/asignar-asesor.mjs`, con pruebas), y de
  ahí salen el contacto que da Alex, el aviso de Telegram y la tarjeta de Marga. "Reasignar en Marga"
  (`alex_reasignar`) pasa la tarjeta al vendedor nuevo solo si sigue en Prospectos y la creó Alex.
- **La etiqueta del vendedor = ya le escribió.** El flujo "Marga - Contacto por etiqueta de Chatwoot"
  (`KjAL0LFdlADd8t9c`, cada 2 min) busca chats con etiqueta `alejandro` / `emmanuel` y, si la etiqueta es nueva y
  el cliente es de ese vendedor en Marga, registra el contacto en la tarjeta (`contacto`, via `etiqueta_chatwoot`),
  igual que el botón "Le escribí". La etiqueta de otro vendedor no cuenta. Tabla de estado:
  `alex_etiquetas_vendedor`.
- **Cotizaciones con crédito abierto.** Alex presenta todo pago a crédito con el plazo como máximo, pregunta
  "¿Has escuchado lo que es un crédito de esquema abierto?" y lo explica (abonos a capital desde el tercer mes,
  entre más pronto se liquida menos interés). Nunca multiplica pago por plazo. El cambio está en
  `alex-3.3-system-prompt.txt`; `credito_abierto_3.3.py` muestra exactamente qué se agregó.
