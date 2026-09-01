"""Lectura de la INE con Gemini 2.5 Flash.

Se llama la API REST directamente con `requests` en vez del SDK: es una sola
petición y evita una dependencia más. La respuesta viene forzada a JSON con
`responseSchema`, así que no hay que parsear texto libre.
"""

import base64
import io
import json
import os

import requests

MODELO = "gemini-2.5-flash"
URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
LADO_MAXIMO = 1600  # píxeles; acota el costo sin perder legibilidad de la CURP

INSTRUCCIONES = """Eres un lector de credenciales para votar del INE mexicano.

Extrae los datos del anverso de la credencial que se te muestra. Reglas:

- Transcribe EXACTAMENTE lo que ves. No corrijas, no completes y no inventes.
- Si un dato no se alcanza a leer con certeza, devuélvelo como null.
- El campo NOMBRE de la INE viene en tres renglones: primero el apellido
  paterno, luego el materno y al final los nombres de pila. Sepáralos así.
- El DOMICILIO viene en varios renglones: calle y número, después colonia y
  código postal, y al final municipio y estado. Sepáralos.
- La CURP tiene exactamente 18 caracteres. Si no puedes leer los 18, null.
- La fecha de nacimiento devuélvela en formato AAAA-MM-DD.
"""

ESQUEMA = {
    "type": "object",
    "properties": {
        "nombres": {"type": "string", "nullable": True},
        "apellido_paterno": {"type": "string", "nullable": True},
        "apellido_materno": {"type": "string", "nullable": True},
        "curp": {"type": "string", "nullable": True},
        "fecha_nacimiento": {"type": "string", "nullable": True},
        "sexo": {"type": "string", "nullable": True},
        "calle": {"type": "string", "nullable": True},
        "numero_exterior": {"type": "string", "nullable": True},
        "colonia": {"type": "string", "nullable": True},
        "cp": {"type": "string", "nullable": True},
        "municipio": {"type": "string", "nullable": True},
        "estado": {"type": "string", "nullable": True},
    },
    "required": [
        "nombres", "apellido_paterno", "apellido_materno", "curp",
        "fecha_nacimiento", "calle", "numero_exterior",
    ],
}


class ErrorOCR(Exception):
    """La foto no se pudo leer o la API respondió con un error."""


def _reducir(imagen_bytes, mime):
    """Baja la resolución si la foto es enorme. Si Pillow no está, la deja igual."""
    try:
        from PIL import Image
    except ImportError:
        return imagen_bytes, mime

    try:
        imagen = Image.open(io.BytesIO(imagen_bytes))
    except Exception:
        return imagen_bytes, mime

    if max(imagen.size) <= LADO_MAXIMO:
        return imagen_bytes, mime

    proporcion = LADO_MAXIMO / max(imagen.size)
    nuevo = (int(imagen.width * proporcion), int(imagen.height * proporcion))
    imagen = imagen.convert("RGB").resize(nuevo, Image.LANCZOS)

    salida = io.BytesIO()
    imagen.save(salida, format="JPEG", quality=88)
    return salida.getvalue(), "image/jpeg"


def leer_ine(imagen_bytes, mime="image/jpeg"):
    """Devuelve un dict con los datos leídos de la credencial."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ErrorOCR(
            "Falta GEMINI_API_KEY. Consíguela en https://aistudio.google.com/apikey "
            "y ponla en el archivo .env"
        )

    imagen_bytes, mime = _reducir(imagen_bytes, mime)

    cuerpo = {
        "contents": [{
            "parts": [
                {"text": INSTRUCCIONES},
                {"inline_data": {
                    "mime_type": mime,
                    "data": base64.b64encode(imagen_bytes).decode("ascii"),
                }},
            ],
        }],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": ESQUEMA,
        },
    }

    try:
        respuesta = requests.post(
            URL.format(modelo=MODELO),
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json=cuerpo,
            timeout=90,
        )
    except requests.RequestException as exc:
        raise ErrorOCR(f"No se pudo contactar a Gemini: {exc}") from exc

    if respuesta.status_code != 200:
        raise ErrorOCR(f"Gemini respondió {respuesta.status_code}: {respuesta.text[:300]}")

    try:
        contenido = respuesta.json()["candidates"][0]["content"]["parts"][0]["text"]
        datos = json.loads(contenido)
    except (KeyError, IndexError, ValueError) as exc:
        raise ErrorOCR(f"Respuesta de Gemini inesperada: {respuesta.text[:300]}") from exc

    # Normaliza cadenas vacías a None para que la UI las marque como faltantes.
    return {
        clave: (valor.strip() if isinstance(valor, str) and valor.strip() else None)
        for clave, valor in datos.items()
    }
