# Marga 2.0 — Organizador de clientes (multiusuario)

Herramienta interna del equipo de ventas de **Dinamo Saltillo** para dar seguimiento a
clientes de venta de motos: tableros Kanban de **Prospectos** y **Procesos**, listas de
**Ventas concretadas** y **Clientes cancelados**, con base de datos compartida en la nube
para que todo el equipo vea los mismos datos desde cualquier dispositivo, en tiempo real.

> La versión anterior (un solo usuario, datos locales) se conserva intacta en `../marga/`.

## Novedades frente a Marga 1.5

### Columna "Moto Facturada" y captura de facturación

El tablero de **Procesos** suma una columna entre **EC** y **Entrega agendada**:
**Moto Facturada** (`src/lib/constants.js`, `BOARD_COLUMNS.procesos`). Soltar ahí una
tarjeta —o llevarla con el menú **"Mover a"**— abre el modal de facturación (moto,
esquema de crédito y enganche en pesos); si se cancela el modal, la tarjeta regresa a su
columna de origen. Una vez facturada, la tarjeta muestra un chip **"Facturada"** que
reabre el mismo modal para editar los datos. Si una tarjeta queda en Moto Facturada sin
comisión (movida antes de Marga 2.0, escritura parcial sin conexión o comisión
eliminada), muestra un chip **"Sin facturar"** que abre la captura.
Capturan la facturación **admin y promotor** (`src/lib/permissions.js`,
`canRegistrarFacturacion`) — los mismos roles que ya podían mover tarjetas en Procesos.

Registrar una facturación es **idempotente por cliente**: un reintento (por ejemplo tras
perder la conexión a medio guardar) no crea una segunda comisión ni infla el número de
venta, y solo notifica al vendedor una vez (`src/lib/db.js`, `registrarFacturacion`,
líneas 381-431).

### Panel de Comisiones y sistema de racha

Nueva sección **Comisiones**, visible para **admin** (ve a todo el equipo) y
**vendedor** (solo las suyas). El **promotor no tiene acceso** — su comisión no se
gestiona desde Marga (`src/lib/permissions.js`, `canViewComisiones`, líneas 112-119).

**Fórmula completa** (`src/lib/comisiones.js` y `src/lib/cotizador.js`):

1. **Monto financiado** = parcialidad al plazo máximo del esquema × ese mismo plazo
   máximo. El enganche se captura **en pesos** al facturar, no en porcentaje
   (`src/lib/cotizador.js`, `calcularFinanciamiento`, líneas 63-87). Plazo máximo: 72
   quincenas en Motonómina, Credinamo, Motoxpress y 50% de Enganche; 170 semanas en
   Motonómina Flex, Credinamo Flex y Motoxpress Flex.
2. **Comisión total** = monto financiado × 0.9575 × tasa. La tasa es 3% para Motoxpress
   y Motoxpress Flex, 4% para los demás esquemas. El 4.25% (factor 0.9575) se descuenta
   del monto financiado *antes* de aplicar la tasa, así que la comisión total ya es neta
   (`src/lib/comisiones.js`, `calcularComision`, líneas 36-38 y 51-73).
3. **Comisión del vendedor** = comisión total × porcentaje de racha, según el número de
   venta del vendedor dentro de su mes de venta: **15% / 20% / 25% / 30% / 35%**, y se
   queda en 35% a partir de la quinta venta (`src/lib/comisiones.js`, `NIVELES_RACHA`,
   línea 20, y `nivelRacha`, líneas 42-44). El "mes de venta" no es el mes calendario:
   arranca el día que configure el admin (`diaInicioMes`) y la racha reinicia en cada
   uno. El indicador de "bono mensual" del nivel 5 es solo visual — no cambia ningún
   monto.
4. **Comisión del promotor** = comisión total × 10%, **solo si el proceso tiene promotor
   asignado**; si no, es $0 y se muestra "Braulio Acosta" como responsable por omisión
   (`src/lib/comisiones.js`, `PROMOTOR_DEFAULT`, línea 26, y `calcularComision`, línea
   62).
5. **Neto admin** = comisión total − comisión del vendedor − comisión del promotor
   (`src/lib/comisiones.js`, línea 71).

**Regla de pago** — corte los lunes, pago los viernes (`src/lib/comisiones.js`,
`fechaPago`, líneas 131-143): facturar el día del corte (o antes, dentro de la semana) se
paga el viernes de esa misma semana; facturar después del corte se recorre al viernes de
la semana siguiente. Ejemplo de septiembre de 2026: una venta facturada el **lunes 21**
se paga el **viernes 25**; una venta facturada el **martes 22** (ya pasado el corte) se
paga hasta el **viernes 2 de octubre**.

El admin puede registrar **semanas con corte especial** — un rango de fechas más su
propia fecha de pago — que ganan sobre la regla base (`ReglasPagoCard.jsx`, y
`excepcionPara` en `src/lib/comisiones.js`, líneas 114-121). La fecha de pago **nunca se
guarda** junto con la comisión: se recalcula siempre a partir de la configuración
vigente, así que cambiar la regla base o agregar una excepción reacomoda al instante la
fecha de pago de todas las comisiones ya facturadas, en las dos vistas (Comisiones del
vendedor y Panel ADMIN).

### Notificaciones por vendedor

Cada movimiento de una tarjeta (cambio de columna, entrega, facturación) notifica
**solo al vendedor que registró a ese cliente** (`current.createdBy` /
`comision.vendedor`), nunca a quien ejecutó la acción — si el propio vendedor mueve su
tarjeta, no se notifica a sí mismo (`src/lib/db.js`, función `notificar`, líneas 42-63,
que descarta el aviso cuando `actor === destinatario`).

### Cotizador PT integrado

Nueva herramienta en el menú **Herramientas → Cotizador**, disponible para todos los
roles, con conteo de cotizaciones generadas por vendedor. Calcula moto + esquema +
enganche → tabla de **Plazo · Enganche · Parcialidad** (sin columna de total), con el
mismo formato de números que el cotizador original: los recuadros del encabezado
(precio de lista, precio con servicio, enganche en pesos, monto a financiar) llevan
centavos; el enganche y la parcialidad de cada renglón de la tabla van en pesos enteros;
los porcentajes se muestran sin ".00" cuando el decimal es exacto
(`src/components/cotizador/Cotizacion.jsx`).

El catálogo (`src/lib/motos.js`) tiene **37 modelos** y **7 esquemas de crédito**:
Motonómina, Credinamo, Motoxpress, 50% de Enganche, Motonómina Flex, Credinamo Flex y
Motoxpress Flex. Se copió de `Cotizadores/cotizador-pt/index.html` (en la raíz del
repositorio, fuera de esta carpeta) el 5 de septiembre de 2026, calibrado contra las
tablas oficiales con vigencia **25/08/2026**.

> ⚠️ **El `cotizador-pt/` que vive en este repositorio (trackeado en git) está
> desfasado** — es la versión de junio. La fuente de verdad vigente es
> `Cotizadores/cotizador-pt/index.html` en la raíz del repo. Si cambian precios o
> factores oficiales, ese es el archivo que hay que actualizar, y luego portar el
> cambio a `src/lib/motos.js`.

### Panel ADMIN

- La semana ahora arranca en **lunes**, no en el día calendario en que se abre el panel.
- **Filtro de promotor**: acota todo el panel (gráficas, tabla por vendedor, KPIs) a un
  promotor encargado específico.
- Tres **KPIs de dinero** nuevos: **Ingreso total global**, **Neto admin** (total menos
  vendedor y promotor) y **Total monto financiado**, calculados sobre el periodo y el
  filtro de promotor seleccionados.
- Tarjeta de **reglas de pago**: el admin configura el día de corte, el día de pago y el
  día de inicio del mes de venta, y agrega excepciones de corte por rango de fechas.

### Roles

- El **promotor no ve la sección Comisiones** — su comisión no se gestiona desde Marga.
- El **vendedor solo ve sus propias comisiones** en su pestaña Comisiones.
- **Admin y promotor** son quienes capturan una facturación (soltar la tarjeta en
  "Moto Facturada" o reabrir el chip "Facturada").

## Pruebas

```powershell
npm test
```

Corre **124 pruebas** con Vitest: catálogo y cotizador (`src/lib/motos.js`, con un
snapshot del catálogo completo, y `src/lib/cotizador.js`), comisiones
(`src/lib/comisiones.js`), textos de notificaciones (`src/lib/notificaciones.js`),
analítica del Panel ADMIN (`src/lib/analytics.js`) y la capa de dominio
(`src/lib/db.js`: facturación, comisiones y renumeración), esta última contra el store
de memoria del modo demo. El proyecto no tiene entorno de render configurado, así que no
hay pruebas de componentes React.

## Novedades frente a Marga 1.0

- **Base de datos compartida (Firebase Firestore)**: los cambios se sincronizan al instante
  entre dispositivos y sesiones. Funciona offline y sincroniza al reconectar.
- **Multiusuario con roles**:
  - **Administrador** — ve todas las secciones, edita/elimina/inserta todo y gestiona usuarios.
  - **Vendedor** — ve Prospectos, Procesos (solo lectura), Ventas concretadas (solo lectura)
    y Citas; agrega prospectos únicamente en Prospectos. **Permisos por propiedad**: solo
    puede editar/mover/eliminar los prospectos que él mismo registró (`createdBy`), dentro
    del tablero Prospectos — incluida la entrega a *Proceso comenzado*; una vez en Procesos,
    solo el administrador los mueve. Los prospectos de otros vendedores (o del admin) le
    aparecen en solo lectura. No importa respaldos ni gestiona usuarios.
  - **Promotor** — ve únicamente **Procesos** y la agenda de Citas. **Permisos por sección**,
    no por propiedad: da seguimiento a *cualquier* proceso sin importar quién lo registró ni
    quién sea el promotor asignado. Edita, arrastra entre columnas, agrega clientes en
    Procesos, cancela, regresa a Prospectos y cierra la venta con *Moto entregada* (las
    últimas cuatro acciones sacan la tarjeta de su tablero). **No elimina clientes**, no
    importa respaldos, no gestiona usuarios ni abre el Panel ADMIN.
- **Promotor encargado por proceso**: cada tarjeta de Procesos lleva el promotor que le da
  seguimiento. Se asigna desde el formulario del cliente (admin y promotores), se ve en la
  tarjeta con el color del promotor, filtra el tablero con la fila *Promotor:* y queda
  registrado en el detalle de la venta al concretarse. Vacío se muestra como *Sin promotor*.
- **Gestor de usuarios** (solo admin): agregar, editar rol/contraseña y eliminar cuentas.
- **Notas visibles en cada tarjeta** del tablero, sin abrir el detalle.
- Cada tarjeta muestra **quién registró** al cliente.
- Se mantiene el **respaldo**: exportar la lista de clientes y citas a JSON (importar: solo
  admin). Desde Marga 2.0 (formato v3), cuando exporta un **admin** el archivo incluye
  además comisiones, la configuración de pagos y cotizaciones; los demás roles exportan
  solo clientes y citas. Los respaldos de Marga 1.0 y 1.5 siguen siendo compatibles al
  importar.

### Cuentas iniciales

Se crean automáticamente la primera vez que la app corre contra una base vacía:

| Usuario | Rol |
|---|---|
| Braulio Acosta | Administrador |
| Alejandro Acosta | Vendedor |
| Emmanuel Bernal | Vendedor |

Las contraseñas iniciales están definidas en `src/lib/constants.js` (`SEED_USERS`) y se
guardan **hasheadas** en la base. Cámbialas desde el Gestor de usuarios después del primer
inicio de sesión, especialmente si el repositorio es público.

## Configuración de Firebase (una sola vez)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) y crea un
   proyecto gratuito (plan Spark).
2. En el proyecto: **Compilación → Firestore Database → Crear base de datos** (modo
   producción, la ubicación más cercana).
3. En **Reglas** de Firestore pega y publica:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

   ⚠️ Estas reglas dejan la base abierta a quien tenga la configuración web. Es aceptable
   para una herramienta interna con datos no sensibles, pero **no publiques las llaves**
   (por eso van en `.env.local`, ignorado por git). Para endurecerla más adelante:
   Firebase Auth + reglas por usuario.

4. En **Configuración del proyecto → Tus apps → </> (app web)**, registra una app y copia
   el objeto de configuración.
5. En esta carpeta: copia `.env.example` como `.env.local` y llena las variables
   (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, etc.).
6. Arranca la app. La primera ejecución crea las tres cuentas iniciales.

### Modo demostración (sin Firebase)

`VITE_DEMO=1` en `.env.local` usa una base local del navegador (localStorage): útil para
probar la interfaz, pero **los datos no se comparten entre dispositivos**.

## Herramientas

En el menú lateral, **Herramientas** agrupa utilidades que no son secciones de
clientes. Están disponibles para **todos los roles**.

### Buró Automático

Captura asistida de INE hacia Refácil. Sustituye a la app suelta que vivía en
`../ine-refacil/`: la interfaz ahora es parte de Marga y funciona en cualquier
dispositivo.

1. **Foto** — arrastra el anverso de la credencial.
2. **Revisa** — los 18 campos aparecen poblados y editables, agrupados en
   secciones. El punto junto a cada etiqueta dice de dónde salió el dato: azul =
   leído de la INE, dorado = calculado, gris = constante del negocio. Corrige lo
   que el OCR haya leído mal.
3. **Llena** — se abre Edge y los campos se escriben uno por uno, con la
   bitácora en vivo y la barra de progreso.
4. **Comprobante** — al terminar se descarga un PNG con la foto, el nombre, el
   RFC y la fecha de captura.

**La app no envía la solicitud.** Deja el formulario lleno y el botón
«Registrar» lo presionas tú, después de revisar. Una consulta de buró no se
deshace.

#### Qué necesita cada paso

| Paso | Requisito |
|---|---|
| Foto, revisión y comprobante | Solo `VITE_GEMINI_API_KEY` (ver `.env.example`). Funciona en cualquier dispositivo, celular incluido. |
| Llenado automático | Un motor de llenado instalado **en esa misma computadora** (ver abajo). |

#### Los dos motores de llenado

Escribir en el formulario real de Refácil no se puede hacer desde una página web
cualquiera, así que cada computadora necesita una de estas dos piezas. Marga detecta cuál
hay y usa la que encuentre, prefiriendo la extensión:

| | Extensión de navegador | Servicio local |
|---|---|---|
| Dónde | [`../buro-extension/`](../buro-extension/README.md) | [`../ine-refacil/`](../ine-refacil/README.md) |
| Necesita Python | No | Sí |
| Instalación | Cargar la carpeta en `edge://extensions` | Doble clic en `iniciar-servicio.bat` |
| Dónde se llena | En una pestaña del navegador | En una ventana de Edge que abre Selenium |
| Hay que dejar algo abierto | No | Sí, la ventana negra |

**La extensión es la vía recomendada.** El servicio local se conserva porque ya está
funcionando y sirve de respaldo.

Ninguno de los dos existe en celulares ni tablets: no admiten extensiones ni corren
Python. Ahí la herramienta llega hasta el comprobante y ofrece «Copiar los 18 campos».

Si el servicio no responde, la herramienta lo detecta y ofrece **«Copiar los 18
campos»** para pegarlos a mano. Para que el servicio acepte peticiones desde la
Marga publicada, agrega su dominio a `MARGA_ORIGENES` en el `.env` de
`ine-refacil` (por omisión solo permite `localhost:5174` y `localhost:4173`).

#### Paridad con el original

`src/lib/buro/rfc.js` y `datos.js` son traducciones 1:1 de `ine-refacil/rfc.py`
y `datos.py`. El script de paridad corre los mismos casos que las pruebas de
Python y falla si los dos lados dejan de coincidir:

```powershell
node scripts/paridad-buro.mjs
python -m pytest ../ine-refacil/tests -q
```

## Desarrollo

```powershell
npm install
npm run dev        # http://localhost:5174
npm run build      # genera dist/
```

## Hosting

El build (`dist/`) es estático: puede servirse desde Netlify, Vercel, Firebase Hosting o
cualquier hosting estático. La base de datos vive en Firestore, así que el hosting solo
entrega archivos. Recuerda configurar las variables de entorno de Firebase en el proveedor
al momento de compilar.

## Estructura

```
src/
  lib/
    constants.js      # secciones, columnas, roles, cuentas semilla, transiciones, herramientas
    permissions.js    # reglas de qué puede hacer cada rol
    auth.js           # hash de contraseñas (SHA-256)
    db.js             # capa de dominio: crear/mover/cancelar clientes, respaldo
    store/            # backend intercambiable: Firestore o demo (localStorage)
    buro/             # Buró Automático: rfc, datos, ocr, comprobante, servicio
  context/            # AuthContext (sesión + rol), DataContext (datos vivos)
  components/         # Layout, tablero Kanban, formularios, UI base, buro/
  views/              # Prospectos, Procesos, Ventas, Cancelados, Usuarios, BuroAutomatico
scripts/
  paridad-buro.mjs    # verifica que el port JS del buró coincide con el Python
```
