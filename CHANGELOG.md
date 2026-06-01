# Changelog — ProspecTeam Dashboard

Todas las versiones notables de este proyecto se documentan aquí.  
Formato: `vMAJOR.MINOR.PATCH — Descripción breve`

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
