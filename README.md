# ProspecTeam — Dashboard Administrativo

Dashboard SPA y herramientas internas para el equipo de prospección digital de **Agencia Dinamo Saltillo**. Gestiona ventas, comisiones, guardias y retroalimentación del equipo de ventas de motocicletas.

---

## Estructura del repositorio

```
ProspecTeam/
├── Admin app/
│   ├── prospect-team-dashboard_1.jsx     # Código fuente React (~2,300 líneas)
│   ├── prospect-team-dashboard-v3.html   # Build compilado, listo para abrir en el navegador
│   ├── prospect-team-dashboard-v2.html   # Build anterior (referencia)
│   ├── prospectteam-schema.sql           # Esquema de base de datos SQL
│   └── esquema de base de datos.xml      # Esquema en formato XML
├── cotizador-pt/
│   ├── index.html                        # Cotizador de financiamiento de motos
│   ├── 404.html                          # Página de error personalizada
│   ├── netlify.toml                      # Configuración de deploy en Netlify
│   ├── robots.txt
│   └── Assets/
│       └── LOGO PT(1).png
├── CHANGELOG.md
└── CLAUDE.md
```

---

## Módulos del dashboard

| Sección | Descripción |
|---|---|
| Dashboard | KPIs generales y gráficas de resumen |
| Guardias | Calendario semanal de turnos (descargable como PNG) |
| Métricas | Desempeño por vendedor y tasa de conversión |
| Comisiones | Cálculo y edición de comisiones por venta |
| Pagos | Estatus de pagos por vendedor y promotor |
| Financiero | Análisis de gastos y flujo de caja |
| Retros | Retroalimentación libre por vendedor |

---

## Cómo usar el dashboard

No requiere instalación ni build. Abre directamente en el navegador:

```
Admin app/prospect-team-dashboard-v3.html
```

Los datos se guardan automáticamente en `localStorage` del navegador (clave `prospectteam_dashboard_v1`).

### Modificar el código fuente

El archivo principal es `prospect-team-dashboard_1.jsx`. Para compilarlo a HTML, usa [CodeSandbox](https://codesandbox.io) o agrega Vite:

```powershell
npm create vite@latest . -- --template react
# Mueve prospect-team-dashboard_1.jsx a src/App.jsx
npm run dev
```

---

## Cotizador PT

Herramienta estática para generar cotizaciones de financiamiento. Ver [`cotizador-pt/README.md`](cotizador-pt/README.md) para instrucciones de deploy en Netlify.

---

## Tecnologías

- **React 18** + hooks (`useState`, `useEffect`, `useMemo`)
- **Recharts** — gráficas (Bar, Line, Pie, RadialBar)
- **Lucide React** — íconos
- **Tailwind CSS** — estilos utilitarios
- **Google Fonts** — League Spartan
- Sin backend — persistencia vía `localStorage`

---

## Versiones

Consulta el [CHANGELOG](CHANGELOG.md) para el historial completo de cambios.

---

**ProspecTeam** · Agencia Dinamo Saltillo · Persevera para Triunfar
