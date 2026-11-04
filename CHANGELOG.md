# Changelog — ProspecTeam Dashboard

Todas las versiones notables de este proyecto se documentan aquí.  
Formato: `vMAJOR.MINOR.PATCH — Descripción breve`

---

## [Marga 2.5 + Alex 3.2] — 2026-11-03

### Clientes de Alex en Prospectos

- Alex sube cada cliente que le escribe como tarjeta a Prospectos de Marga y la mueve de columna según su etapa; "Proceso comenzado" lo sigue moviendo un vendedor.
- Las tarjetas del bot se asignan al vendedor del turno (lunes–viernes Alejandro 9–16 y Emmanuel 16–22; sábado Emmanuel; domingo Alejandro; fuera de horario 50/50) y muestran "Le toca: …", la foto del bot, el resumen de Alex y chips de características (solo lectura, solo en Prospectos).
- Caducidad: las tarjetas del bot sin modificar en 7 días se eliminan solas (`pg_cron`, 03:00 hora de Saltillo).
- Indicadores de temperatura y chat en la cabecera de la tarjeta, resumen y datos del cliente, simbología arriba de Prospectos y, en Procesos, foto del vendedor encargado en lugar de la de Alex. Publicado en Firebase Hosting el 2026-11-03.
- Corrección en "Asignar Asesor": los turnos del sábado y el domingo estaban invertidos.
- Archivos: `marga/supabase/alex_prospectos.sql`, `marga/n8n/asignar-asesor.mjs`, `marga/src/lib/alex.js`.

---

## [v1.0.0] — 2026-06-01

### Lanzamiento inicial

**Admin app (Dashboard SPA)**
- Dashboard principal con KPIs y gráficas generales
- Vista de Guardias: calendario semanal de turnos descargable como PNG
- Vista de Métricas: desempeño por vendedor (tasa de conversión)
- Vista de Comisiones: cálculo y edición de comisiones por venta
- Vista de Pagos: estatus de pagos por vendedor/promotor
- Vista Financiero: análisis de gastos y flujo de caja
- Vista de Retros: retroalimentación libre por vendedor
- Persistencia de datos vía `localStorage` (clave `prospectteam_dashboard_v1`)
- Esquema de base de datos en XML y SQL (para migración futura)

**Cotizador PT**
- Herramienta de cotización de motocicletas
- Configurado para deploy en Netlify

---

<!-- Agrega nuevas versiones arriba de esta línea -->
