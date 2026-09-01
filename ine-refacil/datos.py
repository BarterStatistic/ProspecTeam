"""Arma el registro de 18 campos que espera el formulario de Refácil.

Une tres orígenes: lo que se leyó de la INE, lo que se calcula (RFC, correo,
celular) y las constantes del negocio, que son iguales en toda solicitud.
"""

import random
import re
import unicodedata

import rfc as calculo_rfc

# --- Constantes del negocio ---------------------------------------------------

# Los selects se guardan por su TEXTO visible, no por su value interno: así la
# pantalla de revisión muestra "COAHUILA DE ZARAGOZA" en vez de un "5" que no
# le dice nada a quien revisa, y se puede corregir escribiendo el nombre real.
ESTADO = "COAHUILA DE ZARAGOZA"       # cbEstado, value 5
MUNICIPIO = "SALTILLO"                # cbMunicipio, se puebla por AJAX
LOCALIDAD = "SALTILLO"                # cbLocalidad, también por AJAX
CP = "25000"
COLONIA = "ZONA CENTRO"
EMPRESA = "STELLANTIS"
INGRESO_MENSUAL = "20000"
TIPO_VENTA = "MOTO NOMINA"            # cbTipo_Venta, value 9
DOMINIO_CORREO = "YOPMAIL.COM"        # sí existe en la lista del formulario
LADA = "844"                          # Saltillo

# Cómo se agrupa la pantalla de revisión. Cada sección es un bloque con título
# y ocupa UNA sola fila, con tantas columnas como campos tenga: así se lee de
# corrido de arriba hacia abajo, en vez de ser una cuadrícula de 18 cajas
# iguales donde hay que buscar cada dato.
#
# Este orden NO es el del llenado: `automatizacion.ORDEN` mete el estado antes
# que el municipio porque el municipio depende del AJAX que dispara el estado.
SECCIONES = [
    ("Identidad", ["nombre", "paterno", "materno"]),
    ("Ubicación", ["cbEstado", "cbLocalidad", "cbMunicipio"]),
    ("Domicilio", ["calle", "numExt", "cp", "colonia"]),
    ("Contacto", ["numTelefono", "correo", "cbCorreo"]),
    ("Claves fiscales", ["curp", "rfc"]),
    ("Datos del crédito", ["empresa", "ingresoMensual", "cbTipo_Venta"]),
]

# De dónde salió cada dato; en la interfaz define el color del borde.
ORIGENES = {
    "nombre": "ine",
    "paterno": "ine",
    "materno": "ine",
    "cbEstado": "constante",
    "cbLocalidad": "constante",
    "cbMunicipio": "constante",
    "calle": "ine",
    "numExt": "ine",
    "cp": "constante",
    "colonia": "constante",
    "numTelefono": "calculado",
    "correo": "calculado",
    "cbCorreo": "constante",
    "curp": "ine",
    "rfc": "calculado",
    "empresa": "constante",
    "ingresoMensual": "constante",
    "cbTipo_Venta": "constante",
}

# Etiquetas para la bitácora y el formulario de revisión.
ETIQUETAS = {
    "rfc": "RFC",
    "correo": "Correo",
    "cbCorreo": "Dominio del correo",
    "curp": "CURP",
    "nombre": "Nombre(s)",
    "paterno": "Apellido paterno",
    "materno": "Apellido materno",
    "cbEstado": "Estado",
    "cbMunicipio": "Municipio",
    "cbLocalidad": "Localidad",
    "calle": "Calle",
    "numExt": "Número exterior",
    "cp": "Código postal",
    "colonia": "Colonia",
    "numTelefono": "Celular",
    "empresa": "Empresa",
    "ingresoMensual": "Ingreso mensual",
    "cbTipo_Venta": "Tipo de venta",
}


# --- Generadores --------------------------------------------------------------

def generar_celular():
    """Celular ficticio de 10 dígitos con lada de Saltillo."""
    return LADA + "".join(str(random.randint(0, 9)) for _ in range(7))


def _sin_acentos(texto):
    texto = unicodedata.normalize("NFD", (texto or "").lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def generar_usuario_correo(nombres, paterno):
    """Usuario de correo derivado del nombre, sin el dominio."""
    primero = _sin_acentos(nombres).split()[0] if nombres else "cliente"
    apellido = _sin_acentos(paterno).split()[0] if paterno else "pt"
    usuario = re.sub(r"[^a-z.]", "", f"{primero}.{apellido}")
    return f"{usuario}{random.randint(100, 999)}"


# --- Construcción del registro ------------------------------------------------

def construir(lectura):
    """Devuelve (campos, avisos) a partir del dict que entregó el OCR.

    `campos` trae las 18 llaves con los IDs exactos del formulario de Refácil.
    `avisos` son advertencias para mostrar en la página, no errores fatales.
    """
    avisos = []

    nombres = (lectura.get("nombres") or "").strip()
    paterno = (lectura.get("apellido_paterno") or "").strip()
    materno = (lectura.get("apellido_materno") or "").strip()
    curp = (lectura.get("curp") or "").strip()
    fecha = (lectura.get("fecha_nacimiento") or "").strip()

    if curp and not calculo_rfc.curp_valida(curp):
        avisos.append(
            f"La CURP leída ({curp}) no pasa su propio dígito verificador. "
            "Revísala contra la credencial antes de continuar."
        )

    try:
        valor_rfc, origen, aviso_rfc = calculo_rfc.resolver_rfc(
            nombres, paterno, materno, fecha, curp or None
        )
        if aviso_rfc:
            avisos.append(aviso_rfc)
    except ValueError as exc:
        valor_rfc, origen = "", "ninguno"
        avisos.append(f"No se pudo calcular el RFC: {exc}. Captúralo a mano.")

    campos = {
        "rfc": valor_rfc,
        "correo": generar_usuario_correo(nombres, paterno),
        "cbCorreo": DOMINIO_CORREO,
        "curp": calculo_rfc.normalizar_curp(curp),
        "nombre": nombres.upper(),
        "paterno": paterno.upper(),
        "materno": materno.upper(),
        "cbEstado": ESTADO,
        "cbMunicipio": MUNICIPIO,
        "cbLocalidad": LOCALIDAD,
        "calle": (lectura.get("calle") or "").strip().upper(),
        "numExt": (lectura.get("numero_exterior") or "").strip().upper(),
        "cp": CP,
        "colonia": COLONIA,
        "numTelefono": generar_celular(),
        "empresa": EMPRESA,
        "ingresoMensual": INGRESO_MENSUAL,
        "cbTipo_Venta": TIPO_VENTA,
    }

    faltantes = [
        ETIQUETAS[clave]
        for clave in ("curp", "nombre", "paterno", "materno", "calle", "numExt")
        if not campos[clave]
    ]
    if faltantes:
        avisos.append(
            "No se pudieron leer de la INE: " + ", ".join(faltantes) +
            ". Complétalos antes de llenar el formulario."
        )

    return campos, avisos


def obligatorios_vacios(campos):
    """Campos requeridos por Refácil que siguen vacíos."""
    return [ETIQUETAS[clave] for clave in ORIGENES if not str(campos.get(clave, "")).strip()]
