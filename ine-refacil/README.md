# INE → Refácil

Subes la foto de una INE, se leen los datos, se calcula el RFC y se llena el formulario
de Refácil en una ventana de Edge que puedes ver en vivo.

**La app no envía la solicitud.** Deja el formulario lleno y el botón «Registrar» lo
presionas tú después de revisar.

> ## Esta herramienta ahora vive dentro de Marga
>
> La interfaz se portó a **Marga 1.5 → Herramientas → Buró Automático**
> (`../marga-1.5/`), donde funciona desde cualquier dispositivo y sin instalar nada.
>
> Lo que queda aquí es el **servicio de llenado**: Selenium abriendo Edge y escribiendo
> en Refácil, que es lo único que un navegador no puede hacer por su cuenta. Marga lo
> llama en `http://localhost:5000` y detecta si no está corriendo.
>
> La app suelta de `static/` sigue funcionando igual en <http://localhost:5000> — no se
> le quitó nada. Úsala si prefieres no abrir Marga.
>
> **Al cambiar la lógica de `rfc.py` o `datos.py`, cambia también su gemelo en
> `../marga-1.5/src/lib/buro/`** y corre las dos suites:
>
> ```bash
> python -m pytest ine-refacil/tests -q
> node marga-1.5/scripts/paridad-buro.mjs
> ```

## Instalarlo en la computadora de un vendedor

El llenado automático corre **en la máquina de quien captura**, no en un servidor. Cada
PC que vaya a usarlo necesita esto una sola vez. Son PCs con Windows y Edge: en celulares
y tablets no hay forma de hacerlo funcionar (Selenium no existe ahí), y esos dispositivos
se quedan con el OCR, la revisión y «Copiar los 18 campos».

1. Instala **Python** desde <https://www.python.org/downloads/>.
   Durante la instalación marca **«Add python.exe to PATH»** — si se salta esa casilla,
   nada de lo demás funciona.
2. Instala **Microsoft Edge** si no lo tiene: <https://www.microsoft.com/edge>
3. Copia la carpeta del proyecto a la computadora (clonando el repo o descargándolo
   como ZIP desde GitHub y descomprimiéndolo).
4. Entra a la carpeta `ine-refacil` y haz **doble clic en `iniciar-servicio.bat`**.
   La primera vez tarda un par de minutos instalando dependencias; después arranca en
   segundos.
5. Se abre una ventana negra que dice *«El servicio queda escuchando en
   <http://localhost:5000>»*. **Déjala abierta** mientras se capturan clientes.

Listo. En Marga → Herramientas → Buró Automático, el botón «Llenar en Refácil» ya
funciona en esa computadora.

> **No necesitas API key de Gemini para esto.** Marga lee la credencial por su cuenta; el
> servicio solo maneja Edge. La `GEMINI_API_KEY` del `.env` es únicamente para la app
> suelta de `static/`.

### Si Marga dice «El servicio de llenado no responde»

| Causa | Qué hacer |
|---|---|
| La ventana negra está cerrada | Vuelve a dar doble clic en `iniciar-servicio.bat` |
| Estás en un celular o tablet | No tiene arreglo; usa «Copiar los 18 campos» |
| Estás en otra PC sin instalarlo | Sigue los 5 pasos de arriba en esa máquina |
| El `.bat` dice que no encuentra Python | Reinstala Python marcando «Add python.exe to PATH» |

`localhost` siempre significa *la computadora donde está abierta la página*. Por eso el
servicio de tu laptop no le sirve a nadie más: cada quien necesita el suyo.

## Instalación

```bash
pip install -r ine-refacil/requirements.txt
```

Copia `.env.example` como `.env` y pon tu API key de Gemini (se saca gratis en
[Google AI Studio](https://aistudio.google.com/apikey)):

```
GEMINI_API_KEY=tu_key_aqui
```

Necesitas Microsoft Edge instalado. El driver lo descarga Selenium solo.

## Uso

```bash
python ine-refacil/app.py
```

### Desde VS Code

Abre la carpeta **raíz del proyecto** (la que contiene `ine-refacil/`, `marga/` y
`cotizador-pt/`), no la subcarpeta. Ya hay un `.vscode/launch.json`, así que basta con
presionar **F5** y elegir «INE → Refácil: servidor»: arranca en la terminal integrada,
abre el navegador solo y puedes poner puntos de interrupción en cualquier archivo.

Si prefieres la terminal integrada (Ctrl+Ñ), el comando de arriba funciona igual desde
la raíz. Las pruebas aparecen en el panel de Testing (el matraz) gracias a
`.vscode/settings.json`.

Ojo: este proyecto vive en un **git worktree**, así que la ruta es
`ProspecTeam\.claude\worktrees\marga-1-5-updates-b131ae\`, no la carpeta `ProspecTeam`
de siempre. Si abres la de siempre no vas a ver `ine-refacil/`.

Abre <http://localhost:5000> y sigue los tres pasos:

1. **Foto** — arrastra el anverso de la credencial.
2. **Revisa** — los 18 campos aparecen poblados y editables, agrupados en secciones
   (Identidad, Ubicación, Domicilio, Contacto, Claves fiscales, Datos del crédito). El
   punto junto a cada etiqueta dice de dónde salió el dato: azul = leído de la INE,
   dorado = calculado, gris = constante del negocio. Corrige lo que el OCR leyó mal.
3. **Llena** — se abre Edge y los campos se van llenando uno por uno. La barra de
   progreso avanza y cada campo se marca en verde conforme se escribe.

Al terminar se genera un **comprobante de captura** en PNG y se descarga solo. Lleva la
foto de la credencial, el nombre completo, el RFC y la fecha de captura, en blanco con
detalles en azul y amarillo. Es un documento informativo: **no acredita la autorización
del titular** para consultar su buró.

## De dónde sale cada campo

| Campo (id en Refácil) | Origen |
|---|---|
| `rfc` | Calculado: 10 posiciones de la CURP + homoclave y dígito verificador del SAT |
| `correo` | Generado del nombre del cliente |
| `cbCorreo` | Constante: `YOPMAIL.COM` |
| `curp` | Leído de la INE |
| `nombre`, `paterno`, `materno` | Leídos de la INE |
| `cbEstado` | Constante: COAHUILA DE ZARAGOZA |
| `cbMunicipio`, `cbLocalidad` | Constante: SALTILLO (se esperan a que cargue el AJAX) |
| `calle`, `numExt` | Leídos de la INE |
| `cp`, `colonia` | Constantes: `25000`, `ZONA CENTRO` |
| `numTelefono` | Generado: lada 844 + 7 dígitos aleatorios |
| `empresa` | Constante: `STELLANTIS` |
| `ingresoMensual` | Constante: `20000` |
| `cbTipo_Venta` | Constante: MOTO NOMINA |

Las listas desplegables se eligen por su **texto visible**, no por el número interno
que Refácil usa como `value`. Así la pantalla de revisión muestra «COAHUILA DE
ZARAGOZA» en vez de un «5», y si algún día quieres otro tipo de venta basta con
escribir su nombre (`CREDINAMO`, `2DA_VENTA`…) en el campo.

## Cómo se calcula el RFC

Dos caminos, en `rfc.py`:

1. **Desde la CURP** — las 10 primeras posiciones del RFC de persona física son las
   10 primeras de su CURP. Es la fuente preferida porque ya viene resuelta por RENAPO.
2. **Desde nombre + fecha de nacimiento** — reglas del instructivo del SAT: inicial y
   primera vocal interna del paterno, inicial del materno, inicial del nombre, con el
   filtro de partículas (`DE`, `LA`, `VAN`, `MC`…), `Ñ`→`X`, omisión de `JOSE`/`MARIA`
   cuando hay segundo nombre y censura de combinaciones malsonantes.

Si ambos caminos dan resultados distintos, gana la CURP y la app te lo advierte: casi
siempre significa que el nombre o la fecha se leyeron mal.

La homoclave y el dígito verificador se calculan con el algoritmo del SAT sobre el
nombre completo.

## Pruebas

```bash
python -m pytest ine-refacil/tests -q
```

Cubren las cuatro letras iniciales, el manejo de partículas, `Ñ`, apellidos faltantes,
palabras inconvenientes, formatos de fecha, y los dos caminos de cálculo del RFC.

### Qué está verificado y qué no

- **Llenado del formulario real**: los 18 campos se llenan, incluidos los selects de
  municipio y localidad que cargan por AJAX, y el RFC calculado pasó la validación
  `validarRFCDINAMO()` del sitio sin objeciones.
- **OCR con Gemini**: probado con una imagen sintética. Separó bien los tres renglones
  del nombre, partió «AV UNIVERSIDAD 1520» en calle y número exterior, y normalizó la
  fecha a ISO.

**Falta probarlo con una foto de una INE de verdad.** Una credencial real tiene reflejos,
ángulo y tipografía comprimida; ahí es donde el OCR se equivoca. Por eso existe la
pantalla de revisión.

## Advertencias

- **Autorización del titular.** Consultar buró de crédito requiere autorización expresa
  de la persona (LRSIC art. 28). Esta herramienta no la recaba ni la guarda.
- **La homoclave no está validada ante el SAT.** El algoritmo es el publicado, pero el
  SAT puede tener otra homoclave asignada a un contribuyente ya registrado. Si el
  formulario objeta el RFC, la app te lo dice en la bitácora y lo corriges a mano en la
  ventana de Edge.
- **El correo y el celular son ficticios.** Sirven para pasar la validación del
  formulario, no para contactar al cliente.
- **La foto no se guarda.** Se procesa en memoria y se manda a la API de Gemini; no
  toca el disco.

## Estructura

| Archivo | Qué hace |
|---|---|
| `app.py` | Servidor Flask. Solo enruta |
| `ocr.py` | Lee la INE con Gemini 2.5 Flash |
| `rfc.py` | Cálculo de RFC, homoclave, dígito verificador y validación de CURP |
| `datos.py` | Une lo leído con las constantes del negocio |
| `automatizacion.py` | Selenium sobre Edge |
| `eventos.py` | Cola que alimenta el llenado en vivo (SSE) |
| `static/app.js` | La interfaz: pasos, formulario, bitácora en vivo |
| `static/comprobante.js` | Dibuja y descarga el comprobante PNG |
| `static/estilos.css` | Tema oscuro, animaciones y estados |
