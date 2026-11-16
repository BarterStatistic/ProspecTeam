# marga-agencia

Decidir lo de la agencia de marketing desde Marga (Fase C del plan 2026-11-14 de la agencia). Solo administrador.

**Una sola puerta.** Marga no cambia el estado por su cuenta: esta función busca el token del botón (llave de
servicio) y llama al **mismo webhook de n8n** que el botón de Telegram, con `origen=marga`. n8n llama a
`public.decidir_*` (sql/043 del repo `Agencia Marketing IA`), hace lo externo (Meta, Productor, aprendizaje) y edita
el mensaje de Telegram ("✅ … desde Marga"). Si la fila ya no estaba pendiente, no llama a n8n y contesta
"Ya se decidió desde Telegram / Marga / el cierre del día".

| tipo | acciones | webhook |
|---|---|---|
| `idea` | autorizar, descartar (motivo) | POST `creativo-idea` |
| `pieza` | publicar, programar (cuando) | POST `creativo-idea` |
| `pieza` | cambios (texto), rechazar (texto opcional) | POST `creativo-revision` |
| `propuesta` | aprobar, rechazar | POST `meta-ads-propuesta` (aprobar con `accion_meta` SE APLICA en Meta) |
| `campana` | crear, no | GET `campana-decidir` |
| `cuenta` | agregar, no | GET `investigador-cuenta` |
| `comentario` | responder (texto), ignorar | POST `comentario-decidir` (responder publica en Facebook) |

Lógica pura y pruebas: `../_shared/agenciaLogic.js` y `agenciaLogic.test.js`.

## Despliegue

**Hecho el 2026-11-15** (con el visto bueno de Braulio): SQL aplicado y función desplegada (versión 1, `verify_jwt` falso).
Probado sin sesión: 403 «Solo el administrador…», CORS de marga-6bb72.web.app, GET 405. Falta la prueba de punta a punta
con la sesión del admin, que se hace con Marga publicada.

Para volver a desplegar:

1. Aplicar `supabase/marga_centro_de_mando.sql` en el panel de Supabase (bandeja `marga_por_decidir()` solo admin,
   lectura solo admin en las 5 tablas para Realtime, tablas en la publicación `supabase_realtime`).
2. `supabase functions deploy marga-agencia --no-verify-jwt --project-ref ehyqexzaauvjoioafqdz`
3. Opcional: secreto `AGENCIA_WEBHOOK_BASE` si n8n cambia de dirección.

Ojo: n8n descarta peticiones sin User-Agent de navegador (`ignoreBots`); la función manda uno de Chrome tal cual (uno con URL o `compatible;` también cuenta como bot y da 403).
