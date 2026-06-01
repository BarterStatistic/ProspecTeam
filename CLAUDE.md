# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Spanish (Español)**. Code identifiers, technical terms, and this file's content remain in English, but all explanations and communication with the user must be in Spanish.

## Project Description

This is an administrative single-page dashboard (SPA) built for **ProspecTeam**, a digital prospecting team currently operating under **Agencia Dinamo Saltillo**. The dashboard manages sales, commissions, shift schedules (guardias), and team feedback for a motorcycle sales team. There is no backend — data persists in the browser via the browser storage API (`window.storage`, key `'prospectteam_dashboard_v1'`).

## Main Files

- `prospect-team-dashboard_1.jsx` — React source code (~2,300 lines), primary working file
- `prospect-team-dashboard-v2.html` — Compiled HTML (~690 KB), ready to serve directly in the browser without a build step

## Viewing the Dashboard

No build system is configured (no package.json, webpack, Vite, etc.). To test changes:

1. Open `prospect-team-dashboard-v2.html` directly in the browser
2. For changes in the `.jsx`, manually recompile or use a service like CodeSandbox/StackBlitz that supports JSX in the browser

To add a build system if needed:
```powershell
npm create vite@latest . -- --template react
# Move prospect-team-dashboard_1.jsx to src/App.jsx
npm run dev
```

## Architecture

### Main Components

| Component | Purpose |
|---|---|
| `App` | Root: toggles between `LoginScreen` and `MainApp` |
| `LoginScreen` | Authentication (hardcoded credentials) |
| `MainApp` | Container: sidebar + navigation + `renderView()` |
| `DashboardView` | KPIs and general charts |
| `GuardiasView` | Weekly shift calendar (downloadable as PNG) |
| `MetricosView` | Per-seller performance (conversion rate) |
| `ComisionesView` | Commission calculation and editing per sale |
| `PagosView` | Payment status for sellers/promoters |
| `FinancieroView` | Expense analysis and cash flow |
| `RetrosView` | Free-form feedback per seller |

**Reusable UI components:** `Card`, `StatCard`, `Modal`, `Button`, `Input`, `SectionHeader`, `InfoTip`

### Commission Formula (`calcComisiones`, line ~73)

```
feeBancario        = total * fee_rate
comisiónVendedor   = (total - feeBancario) * 0.20
comisiónPromotor   = (total * 0.10) + ajustePromotor
comisiónAdmin      = total - cVendedor - cPromotor
bonoFinanciamiento = 1% of montoFinanciado (monthly)
```

This logic corrects inconsistencies from the original Excel file it was migrated from.

### Data Persistence

The data schema lives in `DEFAULT_DATA` (line ~92) and contains: `vendedores`, `promotores`, `modelosMoto`, `guardias`, `ventas`, `prospectos`, `metasMensuales`, `historicoGlobal`, `retros`, `gastos`.

Load/save occurs in `MainApp` via `useEffect` on the `data` state.

## Color Palette

Defined in the `C` object (line ~22). Dark theme with:
- Gold `#D4A24C` — primary color
- Cyan `#4FC3F7` — secondary color
- Background `#050608`

## Dependencies (bundled in the compiled HTML)

- React 18 + hooks (`useState`, `useEffect`, `useMemo`)
- Recharts (BarChart, LineChart, PieChart, RadialBarChart)
- Lucide React (icons)
- Tailwind CSS
- Google Fonts: League Spartan

## Navigation

Navigation is state-based (`active` in `MainApp`). Sections: `dashboard`, `guardias`, `metricos`, `comisiones`, `pagos`, `financiero`, `retros`.

## Access Credentials (hardcoded, demo only)

- Email: `braulioacostalong505@gmail.com`
- Password: see `ADMIN_PASS` in source code (~line 48)

## Code Conventions

- All code lives in a single monolithic JSX file
- Variable and UI names are in Spanish (e.g. `vendedores`, `guardias`, `comisiones`)
- Styles: mix of Tailwind classes and inline styles using the `C` object
- Custom CSS classes use the `pt-` prefix (e.g. `pt-card`, `pt-btn-gold`, `pt-grad-text`)
