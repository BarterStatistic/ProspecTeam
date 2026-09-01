"""Servidor de la app. Solo enruta: la lógica vive en los otros módulos.

Sirve dos frentes con los mismos endpoints:

- La app original en `static/`, que sigue funcionando sola en localhost:5000.
- Marga 1.5, que porta la interfaz a React y solo necesita de aquí el llenado
  con Selenium. Por eso hay CORS y un `/api/salud` con el que Marga sabe si
  este proceso está corriendo.
"""

import os
import sys
import threading
import traceback

# La consola de Windows usa cp1252 y truena al imprimir acentos o flechas.
# Sin esto, un simple print con «á» tumba el servidor al arrancar.
for flujo in (sys.stdout, sys.stderr):
    if hasattr(flujo, "reconfigure"):
        flujo.reconfigure(encoding="utf-8", errors="replace")

from flask import Flask, Response, jsonify, request, send_from_directory

try:
    from pathlib import Path

    from dotenv import load_dotenv

    # Ruta absoluta a propósito: load_dotenv() busca desde el directorio actual,
    # y VS Code arranca desde la raíz del proyecto, no desde esta carpeta.
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass  # sin python-dotenv se leen las variables del entorno tal cual

import automatizacion
import datos
import eventos
import ocr

app = Flask(__name__, static_folder="static", static_url_path="")

# Sin esto el navegador se queda con el CSS y el JS viejos en caché, y los
# cambios en la interfaz "no aparecen" aunque el archivo ya esté modificado.
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

# Se guarda el driver de la corrida anterior para no dejar ventanas huérfanas.
_driver_actual = None
_candado = threading.Lock()

TIPOS_ACEPTADOS = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

# Orígenes de Marga que pueden hablar con este servicio: el `npm run dev` y el
# `npm run preview` de marga-1.5, más la versión publicada en Firebase Hosting.
# Si algún día cambia el dominio, se sobreescribe con MARGA_ORIGENES (separados
# por coma) sin tocar este archivo.
ORIGENES_PERMITIDOS = {
    origen.strip()
    for origen in os.environ.get(
        "MARGA_ORIGENES",
        "http://localhost:5174,"
        "http://127.0.0.1:5174,"
        "http://localhost:4173,"
        "https://marga-6bb72.web.app,"
        "https://marga-6bb72.firebaseapp.com",
    ).split(",")
    if origen.strip()
}


@app.after_request
def permitir_marga(respuesta):
    """Abre CORS solo para los orígenes de Marga, nunca para cualquiera."""
    origen = request.headers.get("Origin")
    if origen in ORIGENES_PERMITIDOS:
        respuesta.headers["Access-Control-Allow-Origin"] = origen
        respuesta.headers["Vary"] = "Origin"
        respuesta.headers["Access-Control-Allow-Headers"] = "Content-Type"
        respuesta.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        # Chrome exige este header para dejar que una página servida por HTTPS
        # hable con un servidor de la red local (Private Network Access).
        if request.headers.get("Access-Control-Request-Private-Network"):
            respuesta.headers["Access-Control-Allow-Private-Network"] = "true"
    return respuesta


@app.route("/")
def inicio():
    return send_from_directory("static", "index.html")


@app.route("/api/salud")
def salud():
    """Marga pregunta aquí antes de ofrecer el llenado automático."""
    return jsonify({"ok": True})


@app.route("/api/extraer", methods=["POST"])
def extraer():
    """Recibe la foto de la INE y devuelve los 18 campos ya poblados."""
    archivo = request.files.get("foto")
    if not archivo:
        return jsonify({"error": "No llegó ninguna foto."}), 400

    mime = archivo.mimetype or "image/jpeg"
    if mime not in TIPOS_ACEPTADOS:
        return jsonify({"error": f"Formato no soportado: {mime}"}), 400

    contenido = archivo.read()
    if not contenido:
        return jsonify({"error": "El archivo llegó vacío."}), 400

    try:
        lectura = ocr.leer_ine(contenido, mime)
    except ocr.ErrorOCR as exc:
        return jsonify({"error": str(exc)}), 502

    campos, avisos = datos.construir(lectura)
    return jsonify({
        "campos": campos,
        "avisos": avisos,
        "secciones": [{"titulo": t, "campos": c} for t, c in datos.SECCIONES],
        "origenes": datos.ORIGENES,
        "etiquetas": datos.ETIQUETAS,
        "lectura": lectura,
    })


@app.route("/api/llenar", methods=["POST"])
def llenar():
    """Dispara el llenado en un hilo aparte para no bloquear el SSE."""
    global _driver_actual

    campos = (request.get_json(silent=True) or {}).get("campos")
    if not campos:
        return jsonify({"error": "No llegaron los datos del formulario."}), 400

    faltantes = datos.obligatorios_vacios(campos)
    if faltantes:
        return jsonify({
            "error": "Refácil exige estos campos y están vacíos: " + ", ".join(faltantes)
        }), 400

    eventos.limpiar()

    def corrida():
        global _driver_actual
        with _candado:
            anterior = _driver_actual
            _driver_actual = None
        if anterior:
            try:
                anterior.quit()
            except Exception:
                pass  # la ventana anterior ya la pudo haber cerrado el usuario

        try:
            driver = automatizacion.llenar(campos)
            with _candado:
                _driver_actual = driver
        except Exception:
            traceback.print_exc()

    threading.Thread(target=corrida, daemon=True).start()
    return jsonify({"estado": "iniciado"})


@app.route("/api/eventos")
def stream_eventos():
    """SSE para la app de `static/`, que ya vive con una conexión abierta."""
    return Response(
        eventos.stream(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/eventos/desde/<int:indice>")
def eventos_desde(indice):
    """Sondeo para Marga.

    EventSource no manda preflight, así que Private Network Access lo bloquea
    cuando la página viene por HTTPS. Con un GET normal sí hay preflight y el
    header de `permitir_marga` alcanza.
    """
    nuevos, siguiente = eventos.desde(indice)
    return jsonify({"eventos": nuevos, "siguiente": siguiente})


if __name__ == "__main__":
    print("INE → Refácil disponible en http://localhost:5000")
    # threaded=True es necesario: el SSE mantiene una conexión abierta.
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
