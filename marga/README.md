# Marga

Organizador de clientes para el equipo de ventas de **Dinamo Saltillo** (venta de
motos a crédito/financiamiento). Tablero tipo Kanban al estilo Kommo CRM para
mover clientes por el embudo de venta, con búsqueda, prevención de duplicados y
respaldo de datos.

> Toda la interfaz está en español. El código, comentarios y nombres de variables
> están en inglés.

## Stack

- **Vite + React 18** (SPA, navegación por estado, sin router)
- **Tailwind CSS** para estilos
- **Dexie.js** sobre **IndexedDB** para persistencia local
- **@dnd-kit** para arrastrar y soltar (ratón + táctil)
- **lucide-react** para iconos

## Persistencia

Los datos se guardan en **IndexedDB** dentro del navegador (base `marga`, tabla
`clients`). Sobreviven recargas y reinicios del navegador.

> ⚠️ **Sin backend:** los datos viven por navegador/dispositivo. No hay
> sincronización automática entre dispositivos. Usa **Respaldo → Exportar** para
> descargar un JSON con toda la base y **Respaldo → Importar** para restaurarlo en
> otro equipo (fusionar o reemplazar).

## Desarrollo

```bash
cd marga
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
npm run preview  # sirve el build localmente
```

## Acceso (demo, credenciales fijas)

- **Usuario:** `Braulio Acosta`
- **Contraseña:** `xbox2015`

La casilla "Recordarme" guarda el usuario (nunca la contraseña) para el próximo
inicio de sesión.

> El login es una barrera de front-end para una herramienta interna de un solo
> usuario; **no es seguridad real** (no hay servidor que valide las credenciales).

## Secciones y flujo

| Sección | Tipo | Columnas / notas |
|---|---|---|
| **Prospectos** | Tablero | Primer contacto → Preguntas → Interesado en proceso → Envío de docs / Cita agendada → Proceso comenzado |
| **Procesos** | Tablero | Crédito por subir → BNC → VFS / Call center → EC → Entrega agendada → Moto entregada |
| **Ventas concretadas** | Lista | Datos completos + fecha de inicio, fecha de entrega y notas post venta |
| **Clientes cancelados** | Lista | Nombre, apellidos, teléfono, moto y notas de rechazo |

**Auto-transiciones:**
- Mover un cliente a **Proceso comenzado** lo envía automáticamente a **Procesos**.
- Mover un cliente a **Moto entregada** lo envía automáticamente a **Ventas concretadas**.
- La acción **Cancelar cliente** (menú de la tarjeta) lo mueve a **Clientes cancelados**.

Cada tarjeta tiene una casilla **Buró de crédito autorizado** y un sello de
**última modificación** que se actualiza en cada alta, edición o movimiento.

## Estructura

```
src/
  lib/         db.js (Dexie + reglas de negocio), constants.js, clients.js, format.js
  context/     AuthContext, DataContext (useLiveQuery), UIContext
  components/  ui/ (Button, Input, Select, Modal, Checkbox, Card),
               Layout/, board/, forms/, lists/, Search/, AnimatedBackground
  views/       ProspectosView, ProcesosView, VentasView, CanceladosView
```

## Despliegue en GitHub Pages

El workflow `.github/workflows/deploy-marga.yml` (en la raíz del repositorio)
compila `marga/` y publica `marga/dist` en GitHub Pages en cada push a `master`
que toque `marga/`.

Para activarlo: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. La URL resultante será del tipo
`https://<usuario>.github.io/<repositorio>/`.

`vite.config.js` usa `base: './'` (rutas relativas), por lo que el build funciona
desde cualquier subruta de Pages sin configuración adicional.
