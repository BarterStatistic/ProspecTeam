# Bandeja de Dinamo en vivo dentro de Procesos (Marga) — diseño

Fecha: 2026-11-05 · Rama: `claude/marga-dynamo-realtime-capture-6242d3`

## Objetivo

Que la pestaña **Procesos** de Marga refleje, sin intervención, en qué parte del
trámite de crédito de Dinamo va cada cliente. El dato lo trae un agente oculto
instalado en una o varias máquinas de la agencia. La web
`bandeja-dinamo.vercel.app` se retira y todo se ve en Marga.

## Decisiones de Braulio (2026-11-05)

1. Todas las máquinas usan el mismo usuario de Dinamo (`BAACOSTAL`).
2. **Marga conserva su formato:** las mismas columnas y tarjetas de hoy. Solo se
   agrega el **folio** a la tarjeta y la tarjeta se mueve sola a la columna que
   corresponde a la etapa de Dinamo.
3. **Los datos de crédito, y los de los clientes en general, deben ser
   privados.** Marga deja de estar abierta a la llave pública: Supabase Auth +
   RLS, con el mismo patrón ya probado en InstaTech CRM.
4. Se retira la web de la bandeja. La API de Vercel queda solo como servidor de
   los agentes (ahí se lee el HTML y vive la contraseña de Dinamo).
5. Asignación: se mantiene la lógica de Marga. El vendedor es Alejandro o
   Emmanuel. El promotor se asigna a mano.
6. Lectura **24/7**. Por defecto, una actualización global cada **30 min**,
   más un botón «Forzar actualización» que **reinicia** el contador de 30 min.

## Arquitectura

```
agente.ps1 (máquinas 1..N, mismo usuario de Dinamo)
   │  latido cada 60 s, token propio por máquina
   ▼
Vercel /api/agente  (lee el HTML, guarda la contraseña de Dinamo, reparte turnos)
   │  llave de servicio
   ▼
Supabase ehyqexzaauvjoioafqdz
   ├─ dinamo_agentes, bandeja_estado, bandeja_foto, bandeja_detalle (privadas)
   ├─ dinamo_creditos        (lectura: usuarios con sesión de Marga)
   └─ marga_clients          (la API mueve la etapa / pone el folio)
   │  Realtime
   ▼
Marga → Procesos
```

### Varias máquinas

- `dinamo_agentes`: id, nombre, hash del token, versión, último latido, último
  error y bandera `activo`. Cada máquina se da de alta sola con el instalador
  (acción `alta` + `AGENTE_CODIGO_ALTA`) y recibe su propio token, que se puede
  revocar sin tocar a las demás. El `AGENTE_TOKEN` viejo se sigue aceptando
  como «máquina legada» hasta que la 0.3.0 se actualice sola.
- **Turno con candado:** cuando toca leer (`ahora − última lectura ≥ intervalo`,
  o hay una solicitud forzada), la función `dinamo_tomar_turno` de Postgres le da
  el turno a **una** máquina por 3 min (un `update … where` atómico). Las demás
  responden «al día». Si esa máquina falla o se apaga, el candado vence y otra
  toma el turno.
- Lo mismo para el detalle por crédito: cada solicitud la atiende una sola
  máquina, también con candado.
- Ya no hay horario: lectura 24/7. `bandeja_estado.intervalo_min` vale 30 por
  defecto y el admin lo cambia desde Marga. «Forzar» pone `solicitud_desde`; al
  terminar la lectura, `ultima_sync = ahora` y el contador vuelve a empezar.

### Datos para Marga

- `dinamo_creditos (folio pk, data jsonb, visto_en, desaparecio_en, actualizado_en)`:
  cliente, esquema, moto, punto de venta, fechas, las 7 etapas y el resumen del
  detalle. RLS: lectura solo para miembros de Marga (sesión de Supabase Auth);
  escritura solo con la llave de servicio. Está en Realtime.
- Panel «Agentes de Dinamo» (solo admin): máquinas vivas o caídas, versión,
  último latido, intervalo y «Forzar actualización». Lee y escribe con funciones
  RPC que revisan el rol (`dinamo_panel()`, `dinamo_forzar()`,
  `dinamo_intervalo(n)`, `dinamo_revocar(id)`).
- El detalle (BNC, VF, CC, EC) se sigue pidiendo bajo demanda con
  `dinamo_pedir_detalle(folio)`. Los enlaces los arma el servidor en el latido.

### Sincronización con Procesos (en el servidor, en cada lectura)

Etapa de Dinamo → columna de Marga (las columnas de hoy no cambian):

| Primera etapa de Dinamo sin cumplir | Columna de Marga |
|---|---|
| Captura o DOC | Crédito por subir |
| BNC | BNC |
| VF o CC | VFS / Call center |
| EC o Aut (y también con todo autorizado) | EC |

- Solo mueve tarjetas que están en esas 4 columnas (también hacia atrás si
  Dinamo regresa el crédito). De Moto Facturada en adelante, nada cambia: sigue
  siendo manual.
- Rechazado o «corregir información» no mueve ni cancela la tarjeta: se ve como
  un chip en ella.
- **Unión tarjeta ↔ crédito** por el campo nuevo `folioDinamo`:
  1. Una tarjeta que ya tiene ese folio es la que se mueve.
  2. Si no hay, se busca por nombre normalizado (sin acentos, mismas palabras en
     cualquier orden) entre las tarjetas de Prospectos y Procesos que no tienen
     folio. Si coincide exactamente una, se le pone el folio. Si estaba en
     Prospectos, pasa a Procesos.
  3. Si no coincide ninguna, se crea una tarjeta en Procesos. El vendedor sale de
     la regla de turnos de Saltillo aplicada a la fecha y hora de captura (la
     misma que usa Alex). En horario partido par/impar se usa el folio. El
     promotor queda vacío y se asigna a mano.
  4. Si coincide más de una, no se adivina: se crea la tarjeta nueva y en la
     terminal de la API queda un aviso.
- Tarjeta: chip `Folio 441352` y los 7 puntos de etapa de Dinamo, con los mismos
  colores de la leyenda de Dinamo. Al tocarlos se abre el detalle. Nada más
  cambia.

### Privacidad: Supabase Auth en Marga

Mismo patrón que InstaTech CRM (2026-10-09):

- Edge Function `marga-auth` (login por nombre de usuario, migración perezosa del
  hash SHA-256 y freno de 5 intentos en 15 min) y `marga-usuarios` (alta,
  restablecer contraseña, baja; solo admin).
- Migración A (compatible): `marga_legacy_passwords`, `marga_login_failures`,
  `auth_id` en el usuario, funciones `marga_rol()` y `marga_es_miembro()`.
- Migración B (cierre): las tablas `marga_*` y `dinamo_creditos` solo para
  `authenticated` y miembros. El `passwordHash` sale de `marga_users`. La llave
  pública ya no lee nada.
- Alex 3.2 ya escribe con `service_role`, así que el cierre no lo afecta.
- Queda para después: RLS fina por rol, espejo de `permissions.js`. El cierre
  cubre la privacidad frente a terceros.

## Fuera de alcance

- Mover la API de los agentes a Edge Functions. jsdom es el único parser que
  aguantó el HTML roto de Dinamo y no corre bien en Deno.
- Permisos por rol en la base de datos (siguen en la app, como hoy).

## Riesgos

- Dinamo podría no permitir sacar estos datos (decisión de Braulio).
- La cuenta de Windows de las máquinas es compartida: el token de cada máquina
  se puede revocar, pero no está protegido frente a quien use esa cuenta.
- El cierre de Auth en producción necesita a Braulio: apagar el registro
  público de Auth y entrar primero, para migrar su cuenta.
