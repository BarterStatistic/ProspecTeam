# Buró Automático — extensión de navegador

Llena el formulario de Refácil con los 18 campos que preparó Marga, en una
pestaña del propio navegador. Es el reemplazo del servicio Python de
`../ine-refacil/`: **no necesita Python, ni servidor, ni puerto abierto.**

**No envía la solicitud.** Deja el formulario lleno y se detiene. El botón
«Registrar» lo presiona una persona después de revisar — una consulta de buró no
se deshace, y la autorización del titular (LRSIC art. 28) la da un humano.

## Qué reemplaza y qué no

Marga sigue haciendo todo lo suyo. La extensión es solo el brazo que teclea.

| Pieza | Dónde vive |
|---|---|
| Foto de la INE, OCR, cálculo del RFC, los 18 campos | Marga |
| Pantalla de revisión y corrección | Marga |
| **Escribir en el formulario de Refácil** | **Esta extensión** |
| Bitácora en vivo y comprobante PNG | Marga |

## Instalación en una computadora

1. Copia la carpeta `buro-extension` a la máquina (o clona el repo).
2. Abre **`edge://extensions`** (o `chrome://extensions`).
3. Activa **«Modo de desarrollador»**, abajo a la izquierda.
4. Clic en **«Cargar desempaquetada»** y elige la carpeta `buro-extension`.
5. Listo. En Marga → Herramientas → Buró Automático, «Llenar en Refácil» ya
   funciona en esa computadora.

Edge muestra de vez en cuando un aviso de «extensión en modo de desarrollador».
Es normal y no rompe nada. Para quitarlo habría que publicarla en Edge Add-ons,
que es gratis pero tarda unos días de revisión.

> En celulares y tablets no se puede instalar: Chrome y Edge móviles no admiten
> extensiones. Ahí la herramienta llega hasta el comprobante y ofrece «Copiar
> los 18 campos».

## Cómo funciona por dentro

```
Pestaña de Marga                    Extensión                 Pestaña de Refácil
────────────────                    ─────────                 ──────────────────
BuroAutomaticoView
  │ postMessage(campos)
  ▼
contenido-marga.js ──sendMessage──► background.js
                                      │ abre/reusa pestaña
                                      │ guarda el trabajo
                                      ▼
                                    (la página carga)   ───►  contenido-refacil.js
                                                                │ escribe los 18 campos
                                    background.js  ◄───────────-┘ publica cada evento
  ▲                                   │
  └───────── postMessage(evento) ◄─────┘
```

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Permisos: solo Refácil y los dominios de Marga |
| `background.js` | Abre la pestaña del formulario y enruta los eventos entre ambas |
| `contenido-marga.js` | Puente entre la página de Marga y la extensión |
| `contenido-refacil.js` | El llenado. Port de `automatizacion.py` |
| `campos.js` | Los 18 ids, su orden, cuáles son selects y sus etiquetas |
| `hook-alertas.js` | Captura los `alert()` de `validarRFCDINAMO()`, como hacía Selenium |

La extensión no hace peticiones de red: escribe directamente en el DOM de la
pestaña. Por eso no hay CORS, ni mixed content, ni Private Network Access — los
tres problemas que el servicio local obligaba a resolver.

### Detección desde Marga

`contenido-marga.js` pone `data-buro-extension="<versión>"` en el `<html>` de
Marga. Es el equivalente de `/api/salud`: `src/lib/buro/extension.js` lo lee y
sabe al instante si hay extensión. Si no la hay, Marga cae al servicio local, y
si tampoco, muestra el panel con las dos opciones.

## Probar cambios sin tocar Refácil

`pruebas/formulario-simulado.html` replica el formulario real: los mismos 18
ids, los cinco selects, municipio y localidad poblados por un AJAX tardío, y una
objeción de RFC vía `alert()`.

```bash
python -m http.server 8899 --bind 127.0.0.1
```

Abre <http://127.0.0.1:8899/pruebas/formulario-simulado.html> y en la consola:

```js
await window.__correr()
```

Revisa `window.__eventos`, los valores del formulario y que
`window.__registrarPresionado` siga en `false`.

Sírvela por HTTP, no como `file://`. Y no la corras con jsdom: no implementa
`event.source` en `postMessage`, así que la captura de alertas parece rota
cuando en un navegador real funciona.

## Al cambiar la lógica de llenado

`contenido-refacil.js` y `campos.js` son gemelos de
`../ine-refacil/automatizacion.py`. Si cambias el orden de los campos, un select
o la espera del AJAX, cámbialo en ambos — o el llenado se comportará distinto
según qué motor tenga instalado cada computadora.
