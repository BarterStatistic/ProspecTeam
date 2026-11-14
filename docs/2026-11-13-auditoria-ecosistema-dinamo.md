# Auditoría del ecosistema Dinamo: Marga, Alex 3.2 y la agencia de marketing

- **Fecha:** 2026-11-13
- **Alcance:** conectividad entre módulos, atención al cliente, métricas, herramientas para ventas y calidad, y la ventana de administrador para ver la publicidad y hablar con Bartersito desde Marga.
- **Estado:** solo diagnóstico y plan. No se cambió ningún workflow, tabla ni pantalla.

## Cómo se hizo

| Fuente | Qué se revisó |
|---|---|
| Supabase `ehyqexzaauvjoioafqdz` | Conteos reales de `marga_clients`, `marga_citas`, `leads_origen`, `creativo_preguntas`, `marga_push_subs` (consultas de solo lectura, 13-nov) |
| Repositorio | `marga/src` (tablero, analítica, permisos, tarjetas de Alex), spec y plan de Alex → Marga, prompt vigente de Alex 3.2 |
| Agencia | `docs/CONTINUAR.md` (fases 0 a 6 del plan de mejoras) |
| Vault Claude Mind | Páginas de Marga, Alex, Agencia y Bandeja |
| Internet | Qué ofrecen los CRM de agencias de motos (DP360, Lightspeed, Traffic Log Pro, Revvable, Rollick, Calldrip) |

**Lo que no se revisó:** los 44 nodos de ALEX 3.2 no se abrieron uno por uno en n8n, ni se leyeron conversaciones reales de Chatwoot. La parte de Alex sale del prompt, del vault y de lo que Alex deja escrito en Marga. Los puntos marcados "por confirmar" necesitan esa lectura.

---

## 1. Hallazgo principal

**El problema hoy no es conseguir leads ni contestarles: es lo que pasa después de que Alex los entrega.**

Datos del 4 al 13 de noviembre (10 días desde que Alex sube sus clientes a Marga):

| Dato | Valor |
|---|---|
| Conversaciones que llegaron de un anuncio | 168 |
| Tarjetas de Alex en Marga | 144 |
| Siguen en Prospectos | 143 |
| Pasaron a Procesos | 0 |
| Ventas | 1 |
| Marcadas "caliente" por Alex | 63 |
| Calientes sin ninguna modificación en 3 días o más | 36 |
| Con alerta "requiere acción" | 36 |
| En "Envío de docs / Cita" sin moverse en 2 días o más | 22 |
| Tarjetas de Alex con seguimiento registrado | 0 |

Reparto por columna: Primer contacto 57, Preguntas 14, Interesado en proceso 42, Envío de docs / Cita 30.

**Confirmado por Braulio (13-nov):** los vendedores sí atienden, pero desde su propio número de WhatsApp Business. En Marga solo ven la actualización del cliente, y por Telegram les llegan los que necesitan atención inmediata. Es decir, la conversación sale del número de Alex y continúa en un número que ningún sistema ve.

Consecuencias:

1. **Lo que el vendedor hace con el lead no queda en ningún lado.** Marga es el único lugar donde puede registrarse, y hoy no se registra (0 seguimientos, 0 tarjetas movidas a Procesos).
2. **Cuando cierra, crea una tarjeta nueva** en vez de mover la de Alex (de 22 ventas, solo 1 trae la conversación de origen).
3. **No se puede distinguir un lead atendido de uno olvidado.** Los 36 calientes "sin tocar" pueden estar atendidos por WhatsApp o no; nadie lo sabe.

La fase A es, entonces, una herramienta de registro lo más ligera posible (un toque), no una alarma contra los vendedores.

---

## 2. Conectividad: qué está unido y qué no

### Lo que ya funciona

| Conexión | Estado |
|---|---|
| Anuncio → conversación (`leads_origen`) | 319 conversaciones, todas con su anuncio |
| Alex → Marga (`alex_upsert_prospecto`) | Tarjeta al primer mensaje, columna según la etapa, vendedor por turno |
| Alex → vendedor (Telegram) | Trámite, cita y caso urgente |
| Marga → agencia (disponibilidad) | El Creativo solo promociona motos disponibles |
| Alex → agencia (preguntas) | Preguntas frecuentes de la semana para el Creativo |
| Dinamo → Marga (bandeja de crédito) | Etapa del crédito en la tarjeta de Procesos |
| Promociones (`promo_eventos`) | Una sola fuente para Alex, cotizador y agencia |

### Lo que falta unir

| # | Hueco | Consecuencia | Arreglo propuesto |
|---|---|---|---|
| C1 | **Marga no le regresa nada a Alex ni a Chatwoot.** El vendedor atiende desde su propio WhatsApp, así que Alex nunca ve que el cliente ya está atendido. | Alex puede mandar seguimiento a un cliente que el vendedor ya atiende o ya descartó. | Cuando el vendedor registra un seguimiento, mueve o cancela la tarjeta en Marga, un disparador escribe en Chatwoot la etiqueta correspondiente (`de vendedor`, `cita`, `no_califica`), que el seguimiento automático ya respeta. |
| C2 | **La venta no hereda la tarjeta de Alex.** El vendedor captura una nueva. | Solo 1 de 22 ventas se atribuye a un anuncio. El Creativo y el Analista aprenden de mensajes, no de ventas. | Al capturar un teléfono que ya existe, Marga ofrece "Continuar con la tarjeta de Alex" como opción principal (el aviso de duplicado ya existe; hoy solo advierte). |
| C3 | **Marga no guarda historia de movimientos.** El embudo del Panel ADMIN es una foto de hoy. | No hay tiempo de respuesta, ni tiempo por etapa, ni conversión real por periodo. | Tabla `marga_eventos` (tarjeta, de, a, quién, cuándo), llenada por un disparador. No cambia nada en pantalla. |
| C4 | **Las tarjetas de Alex se borran a los 7 días.** | Se pierde el denominador: en un mes no se sabrá cuántos leads hubo ni por qué se perdieron. | **Decidido:** archivar en vez de borrar (sección `archivados`, oculta del tablero). Si el cliente vuelve a escribir, la tarjeta regresa a Prospectos con el indicativo **"Recaptado"**. |
| C5 | **No hay un identificador único del cliente.** Conversación, tarjeta, folio de crédito y anuncio se unen por teléfono o por nombre. | Uniones frágiles (la bandeja ya une por nombre). | Vista `cliente_360` por teléfono normalizado: anuncio, conversación, tarjeta, citas, buró, crédito, venta. Es la base de la ventana de administrador. |
| C6 | **Los errores de Alex no avisan.** "Avisos de error" cubre la agencia pero no ALEX 3.2. | Si Alex deja de contestar, nadie se entera hasta que un cliente se queja. | Agregar ALEX 3.2 y sus subflujos al mismo aviso. |
| C7 | **Avisos del vendedor incompletos.** `marga_push_subs` tiene 0 suscripciones; el Telegram de Emmanuel estaba pendiente el 23-oct (por confirmar). | El aviso de "trámite comenzado" puede no llegarle a medio equipo. | Confirmar el chat de Emmanuel y activar las notificaciones en los teléfonos del equipo. |
| C8 | **El gasto real en anuncios no se ve.** Los leads llegan de la cuenta interna; la cuenta propia no gasta desde el 19-oct. | No hay costo por lead ni por venta. | Acceso de lectura a la cuenta interna (ya estaba pendiente en la agencia). |

---

## 3. Auditoría de Alex 3.2

### Lo que está bien resuelto

- Mensajes cortos, una pregunta a la vez, un solo perfil por cliente.
- Fuentes de verdad con prioridad clara (Calculadora, Motos, Manual) y regla de no inventar.
- Tope de MotoXpress decidido por precio, no por lista.
- Secuencias obligatorias para trámite, cita y caso urgente.
- Lectura de imágenes con tipo explícito (no asume que todo es INE).
- Promociones encendidas y apagadas desde Supabase, sin tocar el prompt.

### Hallazgos

| # | Hallazgo | Evidencia | Propuesta |
|---|---|---|---|
| A1 | **Alex no manda fotos**, y es la 5.ª pregunta más frecuente. | 30 veces "¿me mandas fotos?" y 33 "¿manejan la [modelo]?" en una semana. La tabla `modelo_imagenes` ya tiene 77 fotos "para que Alex las mande por WhatsApp", pero el prompt dice que no puede. | Herramienta "Enviar foto" (modelo y color → imagen por Chatwoot). Es la mejora de atención más directa. |
| A2 | **Alex no dice qué hay disponible.** | 29 veces "¿qué motos tienen disponibles?". Marga ya tiene la disponibilidad por modelo y el Creativo ya la usa. | Que Alex lea `marga_config.disponibilidad`: puede decir "esa la tenemos" o "esa es bajo pedido"; el color lo sigue confirmando el asesor. |
| A3 | **Alex no sabe de qué anuncio viene el cliente** (por confirmar). | `leads_origen` guarda el texto del anuncio; el prompt no lo recibe. | Pasar el anuncio al contexto del primer mensaje: si el anuncio era de la R4, Alex abre con la R4 y se salta una pregunta. |
| A4 | **El seguimiento se acaba a las 22 horas.** | El flujo de seguimiento respeta la ventana de 24 h de WhatsApp y manda uno solo. | **Descartado por ahora:** no se usarán plantillas de WhatsApp. El seguimiento después de 24 h queda a cargo del vendedor (cadencia en "Mi día"). |
| A5 | **La ubicación es la 10.ª pregunta y Alex no puede darla.** | 15 veces por semana. Es una decisión tuya, no un error. | **Decidido:** Alex puede decir "estamos en Saltillo, el asesor te comparte la ubicación exacta". La dirección sigue sin darse. |
| A6 | **Memoria de 17 mensajes.** | Un cliente que vuelve a los 10 días ya no trae contexto en la memoria. | Al inicio de cada turno, inyectar el resumen que Alex ya guarda en la tarjeta (`resumenAlex`, atributos). Cuesta pocos tokens y evita volver a preguntar. |
| A7 | **Nadie califica las conversaciones de Alex.** | No hay muestra, rúbrica ni revisión. | Ver "Módulo de aprendizaje de Alex" abajo. |
| A8 | **Tokens de Chatwoot en texto plano en nodos HTTP** (visto el 6-oct; por confirmar si sigue). | Vault. | Pasarlos a credenciales de n8n. |

### Módulo de aprendizaje de Alex

La agencia ya tiene un módulo de aprendizaje (`aprendizaje_lecciones`, por agente, con versiones y lecciones visibles y editables desde Bartersito). La propuesta es **sumar a Alex como sexto agente**, no construir algo aparte.

Tres fuentes de lecciones:

1. **Resultados.** Cada semana, cruzar las conversaciones con lo que pasó en Marga: en qué mensaje se quedaron callados los clientes, qué preguntas terminaron en "un asesor te confirma", qué respuestas precedieron a un envío de INE. Sale una lista corta: "cuando preguntan X y contestas Y, el 60 % ya no responde".
2. **Correcciones del vendedor.** Cuando un vendedor toma la conversación y corrige algo que Alex dijo, esa diferencia es una lección candidata. También un botón en la tarjeta de Marga: "Alex se equivocó aquí" con una línea de texto.
3. **Huecos del Manual.** Cada pregunta que Alex no pudo contestar con sus herramientas se junta y se propone como sección nueva del Manual.

Reglas para que sea seguro:

- **Ninguna lección entra sola al prompt.** Todas llegan a Bartersito con botones Aprobar / Rechazar, igual que las propuestas de anuncios. Lo que escribe un cliente nunca se convierte en instrucción sin que tú lo veas.
- **Las lecciones van en un bloque aparte del prompt** ("Lo aprendido"), con tope de 12, igual que en la agencia. El prompt base no se toca.
- **Un evaluador semanal** lee una muestra de 30 conversaciones contra una rúbrica (¿contestó lo que le preguntaron?, ¿inventó algo?, ¿hizo una sola pregunta?, ¿avanzó la venta?) y reporta la calificación en el resumen del lunes. Así se ve si una lección mejoró o empeoró las cosas.

---

## 4. Marga

| # | Mejora | Por qué | Tamaño |
|---|---|---|---|
| M1 | **"Mi día"**: pantalla de inicio del vendedor con su cola ordenada: requiere acción, calientes sin tocar, citas de hoy, documentos pendientes. | Hoy el vendedor tiene que recorrer un tablero con 143 tarjetas para encontrar las 36 urgentes. | Mediano |
| M2 | **Reloj en la tarjeta**: tiempo desde que Alex la entregó; cambia de color a las 2 h y a las 24 h. Aviso al admin si un caliente pasa 24 h sin tocar. | Es el indicador que más pesa en los CRM de agencias de motos (tiempo de respuesta por vendedor). | Chico |
| M3 | **Seguimiento en un toque**: botones "Le llamé", "Le escribí", "No contestó" que llenan `ultimoSeguimiento`. | El campo existe y nadie lo usa (0 de 144). | Chico |
| M4 | **Abrir WhatsApp desde la tarjeta**: botón que abre el chat con el cliente en el WhatsApp Business del vendedor, con un saludo ya escrito a partir del resumen de Alex. Tocar el botón cuenta como primer contacto. | El vendedor atiende desde su número; así el primer contacto queda registrado sin pedirle nada extra. | Chico |
| M5 | **Cita atendida**: recordatorio al vendedor al final del día para marcar si el cliente llegó. | 13 citas en 30 días y 0 marcadas como atendidas: no se puede medir la asistencia. | Chico |
| M6 | **Motivo de cancelación de un toque** (sin enganche, buró, compró en otro lado, ya no contestó, fuera de zona) más la nota libre. | Hoy es texto libre; no se puede graficar. | Chico |
| M7 | **Lista de documentos por perfil** en la tarjeta (palomitas), llenada con lo que Alex ya recibió. | El vendedor sabe qué falta sin leer la conversación. | Mediano |
| M8 | **Embudo real en el Panel ADMIN** (depende de C3). | Conversión y tiempos por etapa, por vendedor y por anuncio. | Mediano |

---

## 5. Herramientas para ventas y calidad

Tomadas de lo que usan otras agencias de motos y ajustadas a lo que ya existe aquí.

### Para vender más

| Herramienta | Qué hace | De dónde sale |
|---|---|---|
| Puntaje del lead | Ordena la cola por probabilidad de cierre: temperatura, perfil, documentos, antigüedad del último mensaje. | Rollick / Lightspeed califican y ordenan los leads así. Aquí los datos ya los llena Alex. |
| Cadencia de seguimiento | Tareas automáticas día 1, 3 y 7 con el mensaje sugerido listo para enviar. | Traffic Log Pro y Calldrip. |
| Respuestas rápidas | Mensajes aprobados por tema (requisitos por perfil, cómo llegar, promoción vigente) para copiar o enviar. | Revvable / Lightspeed. |
| Cotización como imagen desde Alex | Alex manda la misma imagen que arma el cotizador de Marga. | El cotizador ya existe; falta generarla en servidor. |
| Aviso de crédito al cliente | Cuando la bandeja de Dinamo marca "autorizado", el vendedor recibe un mensaje listo para avisarle al cliente con un toque. | Propio: la bandeja ya lee el estado cada 30 min. |
| Recordatorio de cita | Aviso al vendedor 24 h y 2 h antes, con el mensaje listo para mandarlo desde su WhatsApp (sin plantillas de Meta). | Práctica común en concesionarios. |

### Para la calidad del equipo

| Herramienta | Qué hace |
|---|---|
| Tarjeta semanal por vendedor | Tiempo medio de primer contacto, % de calientes tocados en 24 h, citas atendidas, conversión. Se manda el lunes junto al Control de vendedores que ya existe. |
| Simulador de cliente | En Telegram, un cliente ficticio (sin nómina, con buró, indeciso) para que el vendedor practique; al final recibe su calificación. Reutiliza el Manual. |
| Asistente interno | La tabla `asistente` ("bot ayuda de vendedores") ya existe: el vendedor pregunta requisitos o esquemas y recibe la respuesta del Manual. Vale la pena ponerlo dentro de Marga. |

### Después de la venta

| Herramienta | Qué hace |
|---|---|
| Encuesta a los 3 días | Una pregunta (0 a 10) y un comentario, enviada por el vendedor con un enlace corto (sin plantillas de Meta). Los detractores avisan al admin; los promotores reciben la liga para dejar reseña en Google. |
| Recordatorio del primer servicio | Mensaje al mes de la entrega. |
| Programa de referidos | Folio por cliente; si un referido compra, se registra en Marga y se avisa al vendedor. |
| Entregas reales para la agencia | La foto de la entrega con permiso escrito ya tiene flujo en la agencia (5.5); falta el botón en la venta de Marga para pedir el permiso. |

---

## 6. Agencia de marketing: retoques

La agencia se auditó el 10-nov y su plan quedó completo. Solo lo que cambia con esta auditoría:

1. **Aprender de ventas, no de mensajes.** En cuanto C2 esté resuelto, el Analista y el Creativo deben recibir por anuncio: leads, calientes, documentos, procesos y ventas. Un anuncio con muchos mensajes fríos deja de parecer bueno.
2. **Preguntas sin respuesta como contenido.** Además de las preguntas frecuentes, pasar al Creativo las objeciones (buró, intereses, no comprobar ingresos) para piezas que las contesten antes de que el cliente escriba.
3. **Anuncio en el contexto de Alex** (A3): la agencia y Alex comparten `leads_origen`; falta el último paso.
4. **Eventos de la agencia en una sola tabla** (`agencia_eventos`): cada vez que un flujo manda un mensaje a Telegram, inserta también una fila. Es lo que alimenta la ventana de Marga sin tocar la lógica de cada flujo.
5. **Aprendizaje de Alex en el mismo módulo** (sección 3).

---

## 7. Ventana de administrador en Marga: "Centro de mando"

### Qué es

Una sección nueva en Marga, visible solo para el rol administrador, con tres cosas en una pantalla:

1. **Lo que está pasando ahora** en la publicidad y en los agentes.
2. **Gráficas y el embudo completo**, de anuncio a venta.
3. **Un chat con Bartersito**, el mismo de Telegram, que además puede contestar con una gráfica.

### Distribución

```
┌───────────────────────────────────────────────────────────┬──────────────────────┐
│  Hoy:  Leads 18 │ Calientes 7 │ Sin atender 4 │ Gasto $— │                      │
├───────────────────────────────────────────────────────────┤   Bartersito         │
│  [ En vivo ] [ Publicidad ] [ Embudo ] [ Agentes ]        │                      │
├──────────────────────────────┬────────────────────────────┤   Tú: ¿qué anuncio   │
│  EN VIVO                     │  EMBUDO (7 días)           │   trae más leads     │
│  12:41 Lead nuevo · R4       │  Anuncio      168          │   calientes?         │
│        anuncio "Reel v2"     │  Conversación 144          │                      │
│  12:38 Alex pidió asesor     │  Caliente      63          │   B: El de la R4.    │
│        Juan P. · urgente     │  Documentos    30          │   [gráfica de barras]│
│  12:20 Idea #41 en revisión  │  Proceso        0          │                      │
│        [Publicar] [Cambios]  │  Venta          1          │                      │
│  11:55 Propuesta #44         ├────────────────────────────┤                      │
│        [Aprobar] [Rechazar]  │  LEADS POR ANUNCIO         │   ┌────────────────┐ │
│  11:30 ⚠ Recolector falló    │  ▇▇▇▇▇▇▇ Reel R4           │   │ Escribe…       │ │
│                              │  ▇▇▇▇ Catálogo amarillo    │   └────────────────┘ │
└──────────────────────────────┴────────────────────────────┴──────────────────────┘
```

En el teléfono: las pestañas arriba y el chat como botón flotante que abre a pantalla completa.

### Pestañas

| Pestaña | Contenido | Tablas que ya existen |
|---|---|---|
| En vivo | Línea de tiempo: leads nuevos con su anuncio, alertas de Alex, ideas y propuestas esperando decisión, errores | `leads_origen`, `marga_clients`, `creativo_ideas`, `ads_propuestas`, `ads_alertas` (+ `agencia_eventos` nueva) |
| Publicidad | Gasto, alcance, costo por conversación por anuncio; rendimiento de las publicaciones de la página | `ads_insights`, `ads_externos`, `fb_publicaciones` |
| Embudo | Anuncio → conversación → caliente → documentos → proceso → venta, filtrable por anuncio, vendedor y fechas | `cliente_360` y `marga_eventos` (nuevas) |
| Agentes | Los cinco agentes y Alex: última corrida, estado, costo de IA del mes, lecciones activas | `agencia_costos`, `aprendizaje_lecciones`, `creativo_tandas` |

### Chat con Bartersito

- **Mismo agente y misma memoria** que en Telegram (`k6X91vXZqLguv4Cg`, `asistente_braulio_memoria`): lo que le dices en Marga lo recuerda en Telegram y al revés.
- **Respuestas con gráfica:** Bartersito devuelve texto y, cuando aplica, los datos de una gráfica (`tipo`, `series`). Marga la dibuja con sus propias gráficas SVG, sin librerías nuevas.
- **Acciones con dinero:** siguen pidiendo confirmación, igual que en Telegram. Desde Marga se ven como botones en la línea de tiempo.

### Cómo se construye

| Pieza | Decisión |
|---|---|
| Tiempo real | Supabase Realtime sobre las tablas de arriba; Marga ya lo usa para el tablero. |
| Permisos | Políticas RLS de solo lectura para el rol administrador en las tablas de la agencia (Marga ya entra con Supabase Auth). Los vendedores no ven nada de esto, ni en pantalla ni en la base. |
| Consultas | Funciones `panel_*` en Supabase (embudo, leads por anuncio, estado de agentes). La lógica se prueba en SQL, como `alex_upsert_prospecto`. |
| Chat | Edge Function `marga-bartersito`: comprueba que la sesión sea de administrador y reenvía el mensaje al webhook de n8n con una clave que vive en el servidor. El navegador nunca conoce la dirección ni la clave de n8n. |
| Botones de decisión | La misma Edge Function llama a los webhooks que hoy usan los botones de Telegram, con su token por decisión. |

### Etapas

| Etapa | Entrega | Estimado |
|---|---|---|
| 1 | Solo lectura: indicadores de hoy, En vivo, Publicidad | 2 a 3 días |
| 2 | Chat con Bartersito (texto) | 2 días |
| 3 | Embudo y Agentes (necesita C3 y C5) | 2 a 3 días |
| 4 | Gráficas a pedido en el chat y botones de decisión | 2 días |

---

## 8. Plan por prioridad

| Fase | Objetivo | Incluye | Estimado |
|---|---|---|---|
| **A** | Que ningún lead caliente se enfríe | M1, M2, M3, M4, M5, C6, C7 | 1 semana |
| **B** | Que todo se pueda medir | C2, C3, C4, C5, C1, M6, M8 | 1 semana |
| **C** | Que Alex atienda mejor | A1, A2, A3, A6, A4, módulo de aprendizaje | 1 a 2 semanas |
| **D** | Centro de mando en Marga | Sección 7, etapas 1 a 4 | 1,5 semanas |
| **E** | Calidad y posventa | Tarjeta semanal, encuesta, referidos, simulador | 2 semanas |

**Orden recomendado: A → B → D (etapas 1 y 2) → C → resto de D → E.** La fase A es la que más ventas puede recuperar con menos trabajo. La B va antes del Centro de mando porque sin ella el embudo y las gráficas no tendrían datos confiables. Las etapas 1 y 2 de la ventana no dependen de B y pueden adelantarse.

## 9. Decisiones de Braulio (2026-11-13)

| Tema | Decisión |
|---|---|
| Cómo se atienden los leads de Alex | Los vendedores atienden desde su propio WhatsApp Business. Marga solo les muestra la actualización del cliente y Telegram les avisa de los urgentes. |
| Tarjetas de Alex a los 7 días | Se archivan, no se borran. Si la tarjeta se reactiva, lleva el indicativo "Recaptado". |
| Ubicación | Alex puede decir "estamos en Saltillo" sin dar la dirección. |
| Plantillas de WhatsApp | No se usarán por ahora. |
| Revisión de conversaciones de vendedores con IA | No es necesaria. |

## Fuentes externas

- [Dealership Performance 360 CRM: reporte de tiempo de respuesta](https://powersportsbusiness.com/?p=42339)
- [Traffic Log Pro: seguimiento automático y sincronización con el DMS](https://www.motorcyclepowersportsnews.com/traffic-log-pro-advanced-ai-capabilities-enhanced-crm-engine/)
- [Revvable: CRM y bandeja compartida para agencias de motos](https://revvable.com/crm-lead-management)
- [Rollick y Lightspeed: puntaje de leads](https://rollick.io/rollick-and-lightspeed-announce-strategic-partnership-to-support-recreation-dealers/)
- [Calldrip: respuesta inmediata a leads](https://www.calldrip.com/powersports)
- [Leadsales: WhatsApp API en el sector automotriz](https://leadsales.io/blog/estrategias-usar-whatsapp-api-sector-automotriz/)

Casi todas son páginas de proveedores: sirven para saber qué funciones existen, no como prueba de resultados.
