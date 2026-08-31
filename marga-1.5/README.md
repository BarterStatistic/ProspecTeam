# Marga 1.5 — Organizador de clientes (multiusuario)

Herramienta interna del equipo de ventas de **Dinamo Saltillo** para dar seguimiento a
clientes de venta de motos: tableros Kanban de **Prospectos** y **Procesos**, listas de
**Ventas concretadas** y **Clientes cancelados**, con base de datos compartida en la nube
para que todo el equipo vea los mismos datos desde cualquier dispositivo, en tiempo real.

> La versión anterior (un solo usuario, datos locales) se conserva intacta en `../marga/`.

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
- Se mantiene el **respaldo**: exportar la lista de clientes a JSON (importar: solo admin).
  Los respaldos de Marga 1.0 son compatibles al importar.

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
    constants.js      # secciones, columnas, roles, cuentas semilla, transiciones
    permissions.js    # reglas de qué puede hacer cada rol
    auth.js           # hash de contraseñas (SHA-256)
    db.js             # capa de dominio: crear/mover/cancelar clientes, respaldo
    store/            # backend intercambiable: Firestore o demo (localStorage)
  context/            # AuthContext (sesión + rol), DataContext (datos vivos)
  components/         # Layout, tablero Kanban, formularios, UI base
  views/              # Prospectos, Procesos, Ventas, Cancelados, Usuarios
```
