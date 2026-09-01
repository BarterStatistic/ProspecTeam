"""Cálculo del RFC de persona física (13 posiciones).

Dos caminos para las 10 primeras posiciones:

1. Desde la CURP — las 10 primeras posiciones del RFC de una persona física son
   idénticas a las 10 primeras de su CURP. Es la fuente más confiable porque ya
   viene resuelta por RENAPO.
2. Desde nombre + fecha de nacimiento, aplicando las reglas del instructivo del
   SAT. Se usa cuando la CURP no se pudo leer de la INE, y como verificación
   cruzada cuando sí se leyó.

La homoclave (posiciones 11-12) y el dígito verificador (posición 13) siempre se
calculan con el algoritmo del SAT sobre el nombre completo.

ADVERTENCIA: la homoclave calculada no está validada ante el SAT. El algoritmo es
el publicado, pero el SAT puede tener asignada otra homoclave a un contribuyente
ya registrado.
"""

import re
import unicodedata

# --- Tablas del instructivo del SAT ------------------------------------------

VOCALES = "AEIOU"

# Partículas que se ignoran al tomar las iniciales de apellidos y nombres.
PARTICULAS = {
    "DA", "DAS", "DE", "DEL", "DER", "DI", "DIE", "DD", "EL", "LA", "LAS",
    "LE", "LES", "LO", "LOS", "MAC", "MC", "VAN", "VON", "Y",
}

# Nombres que se omiten cuando la persona tiene más de un nombre de pila.
NOMBRES_OMITIDOS = {"MARIA", "MA", "MA.", "JOSE", "J", "J."}

# Combinaciones malsonantes: la última letra se sustituye por X.
PALABRAS_INCONVENIENTES = {
    "BACA", "BAKA", "BUEI", "BUEY", "CACA", "CACO", "CAGA", "CAGO", "CAKA",
    "CAKO", "COGE", "COGI", "COJA", "COJE", "COJI", "COJO", "COLA", "CULO",
    "FALO", "FETO", "GETA", "GUEI", "GUEY", "JETA", "JOTO", "KACA", "KACO",
    "KAGA", "KAGO", "KAKA", "KAKO", "KOGE", "KOGI", "KOJA", "KOJE", "KOJI",
    "KOJO", "KOLA", "KULO", "LILO", "LOCA", "LOCO", "LOKA", "LOKO", "MAME",
    "MAMO", "MEAR", "MEAS", "MEON", "MIAR", "MION", "MOCO", "MOKO", "MULA",
    "MULO", "NACA", "NACO", "PEDA", "PEDO", "PENE", "PIPI", "PITO", "POPO",
    "PUTA", "PUTO", "QULO", "RATA", "ROBA", "ROBE", "ROBO", "RUIN", "SENO",
    "TETA", "VACA", "VAGA", "VAGO", "VAKA", "VUEI", "VUEY", "WUEI", "WUEY",
}

# Valor de dos dígitos por carácter, para el cálculo de la homoclave.
_VALORES_HOMOCLAVE = {
    " ": "00", "0": "00", "1": "01", "2": "02", "3": "03", "4": "04",
    "5": "05", "6": "06", "7": "07", "8": "08", "9": "09", "&": "10",
    "A": "11", "B": "12", "C": "13", "D": "14", "E": "15", "F": "16",
    "G": "17", "H": "18", "I": "19", "J": "21", "K": "22", "L": "23",
    "M": "24", "N": "25", "O": "26", "P": "27", "Q": "28", "R": "29",
    "S": "32", "T": "33", "U": "34", "V": "35", "W": "36", "X": "37",
    "Y": "38", "Z": "39", "Ñ": "40",
}

# Alfabeto de 34 símbolos con el que se expresa la homoclave (sin 0, O ni Ñ).
_ALFABETO_HOMOCLAVE = "123456789ABCDEFGHIJKLMNPQRSTUVWXYZ"

# Valor por carácter para el dígito verificador.
_VALORES_VERIFICADOR = {
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "A": 10, "B": 11, "C": 12, "D": 13, "E": 14, "F": 15, "G": 16,
    "H": 17, "I": 18, "J": 19, "K": 20, "L": 21, "M": 22, "N": 23, "&": 24,
    "O": 25, "P": 26, "Q": 27, "R": 28, "S": 29, "T": 30, "U": 31, "V": 32,
    "W": 33, "X": 34, "Y": 35, "Z": 36, " ": 37, "Ñ": 38,
}


# --- Normalización ------------------------------------------------------------

def normalizar(texto):
    """Mayúsculas, sin acentos y sin caracteres ajenos al alfabeto del RFC.

    La Ñ se conserva en esta etapa porque la homoclave sí la puntúa; su
    sustitución por X ocurre solo en las cuatro letras iniciales.
    """
    if not texto:
        return ""
    texto = texto.upper().replace("Ñ", "\x01")
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    texto = texto.replace("\x01", "Ñ")
    texto = re.sub(r"[^A-ZÑ&. ]", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_curp(curp):
    """Deja la CURP en mayúsculas y solo con letras y dígitos.

    No reutiliza `normalizar` porque aquélla descarta los dígitos, que en una
    CURP son la mitad del dato.
    """
    if not curp:
        return ""
    texto = unicodedata.normalize("NFD", curp.upper())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]", "", texto)


def _quitar_particulas(palabras):
    """Descarta artículos y preposiciones, sin dejar la lista vacía."""
    filtradas = [p for p in palabras if p not in PARTICULAS]
    return filtradas or palabras


def limpiar_apellido(apellido):
    """Devuelve el apellido normalizado y sin partículas, como una sola palabra."""
    palabras = _quitar_particulas(normalizar(apellido).split())
    return "".join(palabras)


def primer_nombre(nombres):
    """Primer nombre de pila útil, omitiendo JOSE/MARIA cuando hay otro."""
    palabras = _quitar_particulas(normalizar(nombres).split())
    if not palabras:
        return ""
    if len(palabras) > 1 and palabras[0] in NOMBRES_OMITIDOS:
        return palabras[1]
    return palabras[0]


def _primera_vocal_interna(palabra):
    """Primera vocal después de la letra inicial; X si la palabra no tiene."""
    for letra in palabra[1:]:
        if letra in VOCALES:
            return letra
    return "X"


def _sin_enie(texto):
    return texto.replace("Ñ", "X")


# --- Las cuatro letras iniciales ---------------------------------------------

def letras_iniciales(nombres, paterno, materno):
    """Cuatro letras iniciales del RFC según las reglas del SAT."""
    pat = limpiar_apellido(paterno)
    mat = limpiar_apellido(materno)
    nom = primer_nombre(nombres)

    if not nom:
        raise ValueError("Se requiere al menos un nombre de pila")
    if not pat and not mat:
        raise ValueError("Se requiere al menos un apellido")

    if not pat:
        # Sin apellido paterno: dos letras del materno y dos del nombre.
        letras = (mat[:2] + nom[:2].ljust(2, "X"))[:4]
    elif not mat:
        # Sin apellido materno: dos letras del paterno y dos del nombre.
        letras = (pat[:2].ljust(2, "X") + nom[:2].ljust(2, "X"))[:4]
    elif len(pat) <= 2:
        # Apellido paterno de una o dos letras: una de cada apellido, dos del nombre.
        letras = pat[0] + mat[0] + nom[:2].ljust(2, "X")
    else:
        letras = pat[0] + _primera_vocal_interna(pat) + mat[0] + nom[0]

    letras = _sin_enie(letras.ljust(4, "X")[:4])
    if letras in PALABRAS_INCONVENIENTES:
        letras = letras[:3] + "X"
    return letras


def _fecha_aammdd(fecha_nacimiento):
    """Convierte 'AAAA-MM-DD' (o 'DD/MM/AAAA') en 'AAMMDD'."""
    texto = (fecha_nacimiento or "").strip()
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", texto)
    if iso:
        anio, mes, dia = iso.groups()
        return anio[2:] + mes + dia
    barras = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", texto)
    if barras:
        dia, mes, anio = barras.groups()
        return anio[2:] + mes + dia
    raise ValueError(f"Fecha de nacimiento no reconocida: {fecha_nacimiento!r}")


# --- Homoclave y dígito verificador ------------------------------------------

def calcular_homoclave(nombres, paterno, materno):
    """Homoclave de dos caracteres, calculada sobre el nombre completo."""
    completo = " ".join(
        parte for parte in (normalizar(paterno), normalizar(materno), normalizar(nombres))
        if parte
    )
    # El instructivo puntúa el nombre tal cual, incluidas partículas y espacios.
    digitos = "0" + "".join(_VALORES_HOMOCLAVE.get(c, "00") for c in completo)

    suma = 0
    for i in range(len(digitos) - 1):
        suma += int(digitos[i:i + 2]) * int(digitos[i + 1])

    residuo = suma % 1000
    return _ALFABETO_HOMOCLAVE[residuo // 34] + _ALFABETO_HOMOCLAVE[residuo % 34]


def calcular_digito_verificador(rfc12):
    """Último carácter del RFC, a partir de sus 12 posiciones previas."""
    if len(rfc12) != 12:
        raise ValueError("El dígito verificador se calcula sobre 12 caracteres")

    suma = sum(
        _VALORES_VERIFICADOR.get(caracter, 0) * (13 - posicion)
        for posicion, caracter in enumerate(rfc12)
    )
    residuo = suma % 11
    if residuo == 0:
        return "0"
    if residuo == 1:
        return "A"
    return str(11 - residuo)


# --- Entradas públicas --------------------------------------------------------

def rfc_desde_curp(curp, nombres, paterno, materno):
    """RFC de 13 posiciones tomando las 10 primeras de la CURP."""
    curp = normalizar_curp(curp)
    if not re.fullmatch(r"[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[0-9A-Z]\d", curp):
        raise ValueError(f"CURP con formato inválido: {curp!r}")
    rfc12 = curp[:10] + calcular_homoclave(nombres, paterno, materno)
    return rfc12 + calcular_digito_verificador(rfc12)


def rfc_desde_nombre(nombres, paterno, materno, fecha_nacimiento):
    """RFC de 13 posiciones calculado desde el nombre y la fecha de nacimiento."""
    base = letras_iniciales(nombres, paterno, materno) + _fecha_aammdd(fecha_nacimiento)
    rfc12 = base + calcular_homoclave(nombres, paterno, materno)
    return rfc12 + calcular_digito_verificador(rfc12)


def curp_valida(curp):
    """Verifica formato y dígito verificador de la CURP."""
    curp = normalizar_curp(curp)
    if not re.fullmatch(r"[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[0-9A-Z]\d", curp):
        return False

    alfabeto = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ"
    suma = sum(alfabeto.index(c) * (18 - i) for i, c in enumerate(curp[:17]))
    esperado = (10 - (suma % 10)) % 10
    return int(curp[17]) == esperado


def resolver_rfc(nombres, paterno, materno, fecha_nacimiento, curp=None):
    """Determina el RFC y reporta discrepancias entre ambos caminos de cálculo.

    Devuelve (rfc, origen, advertencia). La CURP gana cuando ambos difieren,
    porque sus 10 primeras posiciones ya vienen resueltas por RENAPO.
    """
    por_nombre = None
    error_nombre = None
    try:
        por_nombre = rfc_desde_nombre(nombres, paterno, materno, fecha_nacimiento)
    except ValueError as exc:
        error_nombre = str(exc)

    if curp:
        try:
            por_curp = rfc_desde_curp(curp, nombres, paterno, materno)
        except ValueError as exc:
            if por_nombre:
                return por_nombre, "nombre", f"La CURP no es utilizable ({exc}); se usó el cálculo por nombre."
            raise
        if por_nombre and por_nombre[:10] != por_curp[:10]:
            return por_curp, "curp", (
                f"El RFC calculado por nombre ({por_nombre[:10]}) no coincide con el "
                f"derivado de la CURP ({por_curp[:10]}). Se usó el de la CURP; verifica "
                "que el nombre y la fecha de nacimiento se hayan leído bien."
            )
        return por_curp, "curp", None

    if por_nombre:
        return por_nombre, "nombre", "No se leyó la CURP; el RFC se calculó solo con el nombre y la fecha."
    raise ValueError(error_nombre or "Datos insuficientes para calcular el RFC")
