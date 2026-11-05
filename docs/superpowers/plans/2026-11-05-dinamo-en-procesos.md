# Plan — Bandeja de Dinamo en Procesos

Diseño: `docs/superpowers/specs/2026-11-05-dinamo-en-procesos-design.md`.

Dos repos: **bandeja-dinamo** (API de los agentes y agente PowerShell) y
**ProspecTeam/marga**. Todo se prueba en local antes de tocar producción. Los
pasos marcados con 🔒 necesitan a Braulio o su visto bueno, porque cambian
producción.

## Fase 1 — Varias máquinas y 24/7 (bandeja-dinamo)

1. SQL `supabase/multiagente.sql`: `dinamo_agentes`; en `bandeja_estado` las
   columnas `intervalo_min` (30), `turno_agente` y `turno_hasta`; en
   `bandeja_detalle` las columnas `turno_agente` y `turno_hasta`; funciones
   `dinamo_tomar_turno` y `dinamo_tomar_detalle`.
2. `api/_agente.js`: el token se busca en `dinamo_agentes` (con el
   `AGENTE_TOKEN` legado como respaldo), acción `alta`, estado por máquina,
   `debeSincronizar` sin horario y con intervalo configurable, turno con
   candado, detalle con candado.
3. Almacén (Supabase y archivo): las mismas operaciones nuevas.
4. Agente 0.4.0: manda `x-agente-id` y el nombre de la máquina; el instalador da
   de alta la máquina con `-Codigo`. Sigue siendo solo ASCII.
5. Pruebas: varios agentes, un solo turno, el candado vence, forzar reinicia el
   contador, la 0.3.0 legada sigue funcionando.

## Fase 2 — Datos y sincronización con Marga (bandeja-dinamo + SQL)

6. SQL `dinamo_creditos`, en Realtime, con RLS para miembros (la política queda
   lista para la fase 3).
7. `api/_procesos.js` (funciones puras): etapa → columna, nombre normalizado,
   unión tarjeta ↔ crédito, regla de turnos y armado de tarjetas nuevas o
   parches.
8. En `foto`: guardar `dinamo_creditos` y aplicar los parches en `marga_clients`
   (merge de jsonb con `marga_patch_many` y `marga_set_many`, llave de servicio).
9. RPC para Marga: `dinamo_panel`, `dinamo_forzar`, `dinamo_intervalo`,
   `dinamo_revocar` y `dinamo_pedir_detalle` (revisan el rol con `marga_rol()`).

## Fase 3 — Privacidad (marga)

10. Edge Functions `marga-auth` y `marga-usuarios` (puerto de InstaTech CRM) y
    `_shared/authLogic.js` con pruebas.
11. Migración A (compatible) y migración B (cierre), cada una en su archivo.
12. App: login por Edge Function, sesión de supabase-js, Gestor de usuarios por
    `marga-usuarios`, cambio de contraseña propia con `auth.updateUser`.
13. 🔒 Producción: Braulio apaga el registro público de Auth, se aplica la A, se
    despliegan las funciones, se publica Marga, Braulio entra (su cuenta se migra
    sola) y se aplica la B.

## Fase 4 — Procesos (marga)

14. `folioDinamo` en el formulario de cliente (solo en Procesos) y chip de folio
    en la tarjeta.
15. Espejo de `dinamo_creditos` en el store (Realtime) y los 7 puntos de etapa en
    la tarjeta, con el detalle al tocarlos.
16. Panel «Agentes de Dinamo» en Herramientas o Panel ADMIN (solo admin).
17. Prueba de punta a punta en local: Dinamo falso → API local → Supabase de
    prueba o almacén local → Marga.

## Estado (2026-11-05)

Fases 1–4 programadas y probadas **en local**, sin commit ni nada en producción:

- bandeja-dinamo (worktree `bandeja-dinamo-multiagente`, rama `claude/multiagente`):
  85/85 pruebas y build OK.
- Marga: 258/258 pruebas y build OK. Vista revisada en modo demo (escritorio y
  celular): franja «En vivo», forzar, panel de máquinas, folio, puntos de etapa
  y detalle.
- SQL (`multiagente.sql`, `marga_tablas.sql`, `marga_auth_base.sql`,
  `dinamo_panel.sql` y `marga_auth_cierre.sql`): 31 comprobaciones en PGlite con
  roles anon/authenticated/service_role (turnos, candados, privacidad por rol,
  guardia de `marga_users`). El script está en el scratchpad de la sesión.

## Runbook del corte (en este orden)

1. 🔒 Supabase Auth: apagar el registro público (Authentication → Sign In /
   Providers → «Allow new users to sign up» = off). Las cuentas las crean las
   Edge Functions con la llave de servicio.
2. Aplicar `bandeja-dinamo/supabase/multiagente.sql`.
3. Aplicar `marga/supabase/marga_auth_base.sql` y luego
   `marga/supabase/dinamo_panel.sql`. Las dos son compatibles: la Marga
   publicada sigue funcionando.
4. Desplegar las Edge Functions `marga-auth` y `marga-usuarios` con
   `verify_jwt = false`.
5. Vercel (bandeja-dinamo): variable `AGENTE_CODIGO_ALTA`, merge de
   `claude/multiagente` a `main` y push. La 0.3.0 se actualiza sola a 0.4.0.
6. Publicar Marga (build desde la copia con `.env.local` de Supabase y
   `firebase deploy --only hosting`). Revisar antes qué versión está viva.
7. Braulio entra con la versión nueva: su cuenta se migra sola.
8. Antes del cierre, revisar que ningún flujo de n8n lea tablas `marga_*` con
   la llave pública (por ejemplo, el resumen diario de las 8 am que junta leads
   de Alex). En el código no hay otros usos; Alex 3.2 ya usa `service_role`.
   Después, aplicar `marga/supabase/marga_auth_cierre.sql` y verificar que la
   llave pública ya no lee `marga_clients`.
9. Cargar los folios de los procesos abiertos (o esperar la unión por nombre en
   la siguiente lectura) e instalar el agente en más máquinas.

## Fase 5 — Corte

18. 🔒 Aplicar el SQL de las fases 1 y 2 y desplegar Vercel (push a main).
19. 🔒 Instalar el agente en las otras máquinas con la línea del README.
20. Retirar la web de la bandeja: `/` redirige a Marga y la API se queda.
21. Vault y memoria al día.
