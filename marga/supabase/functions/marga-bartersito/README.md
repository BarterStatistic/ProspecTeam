# marga-bartersito

Chat con Bartersito desde Marga. Solo para el administrador: la función revisa
la sesión y rechaza a vendedores y promotores.

## Qué falta para que funcione

### 1. Entrada desde Marga en n8n

Flujo: **Asistente ProspecTeam (Bartersito)** (`k6X91vXZqLguv4Cg`). Hoy solo
tiene el disparador de Telegram, y el agente lee el mensaje con
`$('Es Braulio').first().json.message`, así que la entrada nueva debe pasar por
ese mismo nodo con un mensaje en la forma de Telegram.

Los cuatro nodos ya vienen armados en `n8n-nodos-marga.json`: copia el contenido
del archivo y pégalo sobre el lienzo del flujo (Ctrl+V). Después faltan tres
cables a mano y la credencial del webhook:

1. **Datos de Marga → Es Braulio**.
2. Borra el cable **Asistente ProspecTeam → Responder en Telegram** y conecta
   **Asistente ProspecTeam → ¿Vino de Marga?**.
3. Salida *false* de **¿Vino de Marga? → Responder en Telegram**.
4. En **Mensaje desde Marga**, crea la credencial Header Auth con nombre
   `x-marga-secret` y una clave larga al azar.

Nodos nuevos:

| Nodo | Tipo | Configuración |
|---|---|---|
| Mensaje desde Marga | Webhook | POST, ruta `marga-bartersito`, autenticación Header Auth (`x-marga-secret`), responder con "Respond to Webhook" |
| Datos de Marga | Set | `message = { text: {{ $json.body.texto }}, from: { id: 7074665506 }, chat: { type: 'private' } }` y `origen = 'marga'` |
| ¿Vino de Marga? | If | `{{ $('Es Braulio').first().json.origen }}` igual a `marga` |
| Contestar a Marga | Respond to Webhook | JSON `{ "output": {{ $json.output }} }` |

Conexiones:

- Mensaje desde Marga → Datos de Marga → **Es Braulio** (el nodo que ya existe).
- **Asistente ProspecTeam** → ¿Vino de Marga? (hoy va directo a "Responder en Telegram").
- ¿Vino de Marga? → sí: Contestar a Marga · no: **Responder en Telegram**.

Es el único cambio a lo existente: la salida del agente pasa por un If antes de
llegar a Telegram. Un mensaje de Telegram no trae `origen`, así que sigue su
camino de siempre. La memoria es la misma (`asistente-braulio`): lo que se dice
en Marga se recuerda en Telegram y al revés.

Efectos conocidos de reutilizar el camino: el nodo "Escribiendo" manda el
indicador de escritura a Telegram también cuando la pregunta llega de Marga, y
las propuestas que piden aprobación siguen llegando a Telegram con sus botones.

Después de publicar el flujo, probar las dos entradas: un mensaje por Telegram
(debe contestar en Telegram como siempre) y uno desde Marga.

### 2. Secretos en Supabase

Edge Functions → Secrets:

- `BARTERSITO_WEBHOOK_URL`: la dirección de producción del webhook del paso 1.
- `BARTERSITO_WEBHOOK_SECRET`: la misma clave que se puso en el Header Auth.

### 3. Desplegar la función

Con la verificación de JWT apagada (la función revisa la sesión ella misma,
igual que `marga-usuarios`). Incluye `../_shared/authLogic.js` y
`../_shared/bartersitoLogic.js`.

## Contrato

- Marga envía `{ texto }` con la sesión del usuario.
- La función envía a n8n `{ texto, usuario, origen: 'marga' }` con el encabezado
  `x-marga-secret`.
- n8n contesta `{ output }` (o `{ texto, grafica: [{ label, value }] }`).
- Sin secretos configurados la función responde 503 y la app dice que
  Bartersito todavía no está conectado.
