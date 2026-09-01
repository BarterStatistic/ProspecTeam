"""Pruebas de la construcción del registro que se manda a Refácil."""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import datos  # noqa: E402

LECTURA_COMPLETA = {
    "nombres": "Juan",
    "apellido_paterno": "Barrios",
    "apellido_materno": "Fernández",
    "curp": "BAFJ701212HDFRRN09",
    "fecha_nacimiento": "1970-12-12",
    "calle": "Av. Universidad",
    "numero_exterior": "123",
}


def test_construye_los_dieciocho_campos():
    campos, _ = datos.construir(LECTURA_COMPLETA)
    assert set(campos) == set(datos.ORIGENES)
    assert len(campos) == 18


def test_orden_de_la_pantalla_de_revision():
    # Cada sección es una fila en pantalla, en este orden.
    titulos = [titulo for titulo, _ in datos.SECCIONES]
    assert titulos == [
        "Identidad", "Ubicación", "Domicilio", "Contacto",
        "Claves fiscales", "Datos del crédito",
    ]

    por_titulo = dict(datos.SECCIONES)
    assert por_titulo["Identidad"] == ["nombre", "paterno", "materno"]
    assert por_titulo["Ubicación"] == ["cbEstado", "cbLocalidad", "cbMunicipio"]
    assert por_titulo["Claves fiscales"] == ["curp", "rfc"]


def test_las_secciones_cubren_todos_los_campos_sin_repetir():
    # Si un campo se cae de las secciones, desaparece de la pantalla sin avisar.
    en_secciones = [clave for _, claves in datos.SECCIONES for clave in claves]
    assert len(en_secciones) == len(set(en_secciones)), "hay un campo repetido"
    assert set(en_secciones) == set(datos.ORIGENES)


def test_ninguna_seccion_excede_cuatro_columnas():
    # Más de cuatro campos por fila deja las cajas demasiado angostas.
    for titulo, claves in datos.SECCIONES:
        assert 1 <= len(claves) <= 4, f"la sección {titulo} tiene {len(claves)} campos"


def test_constantes_del_negocio():
    # Los selects van por texto visible, no por el value interno de Refácil.
    campos, _ = datos.construir(LECTURA_COMPLETA)
    assert campos["cbEstado"] == "COAHUILA DE ZARAGOZA"
    assert campos["cbMunicipio"] == "SALTILLO"
    assert campos["cbLocalidad"] == "SALTILLO"
    assert campos["cp"] == "25000"
    assert campos["colonia"] == "ZONA CENTRO"
    assert campos["empresa"] == "STELLANTIS"
    assert campos["ingresoMensual"] == "20000"
    assert campos["cbTipo_Venta"] == "MOTO NOMINA"
    assert campos["cbCorreo"] == "YOPMAIL.COM"


def test_datos_de_la_ine_van_en_mayusculas():
    campos, _ = datos.construir(LECTURA_COMPLETA)
    assert campos["nombre"] == "JUAN"
    assert campos["paterno"] == "BARRIOS"
    assert campos["materno"] == "FERNÁNDEZ"
    assert campos["calle"] == "AV. UNIVERSIDAD"
    assert campos["numExt"] == "123"


def test_rfc_se_calcula_desde_la_curp():
    campos, avisos = datos.construir(LECTURA_COMPLETA)
    assert campos["rfc"][:10] == "BAFJ701212"
    assert len(campos["rfc"]) == 13
    assert avisos == []


def test_celular_tiene_diez_digitos_con_lada_de_saltillo():
    campos, _ = datos.construir(LECTURA_COMPLETA)
    assert re.fullmatch(r"844\d{7}", campos["numTelefono"])


def test_correo_sale_del_nombre_y_no_trae_acentos():
    campos, _ = datos.construir({**LECTURA_COMPLETA, "nombres": "José Ángel"})
    assert re.fullmatch(r"[a-z.]+\d{3}", campos["correo"])
    assert campos["correo"].startswith("jose.barrios")


def test_avisa_cuando_la_curp_no_pasa_su_digito():
    campos, avisos = datos.construir({**LECTURA_COMPLETA, "curp": "BAFJ701212HDFRRN08"})
    assert any("dígito verificador" in a for a in avisos)


def test_avisa_cuando_faltan_datos_de_la_ine():
    lectura = {**LECTURA_COMPLETA, "calle": None, "numero_exterior": None}
    campos, avisos = datos.construir(lectura)
    assert campos["calle"] == ""
    assert any("No se pudieron leer de la INE" in a for a in avisos)
    assert any("Calle" in a for a in avisos)


def test_sin_curp_el_rfc_sale_del_nombre_y_lo_advierte():
    campos, avisos = datos.construir({**LECTURA_COMPLETA, "curp": None})
    assert campos["rfc"][:10] == "BAFJ701212"
    assert any("No se leyó la CURP" in a for a in avisos)


def test_sin_datos_para_el_rfc_no_truena():
    lectura = {**LECTURA_COMPLETA, "curp": None, "nombres": None, "apellido_paterno": None,
               "apellido_materno": None}
    campos, avisos = datos.construir(lectura)
    assert campos["rfc"] == ""
    assert any("No se pudo calcular el RFC" in a for a in avisos)


def test_obligatorios_vacios_detecta_faltantes():
    campos, _ = datos.construir(LECTURA_COMPLETA)
    assert datos.obligatorios_vacios(campos) == []

    campos["calle"] = ""
    campos["curp"] = "   "
    faltantes = datos.obligatorios_vacios(campos)
    assert "Calle" in faltantes and "CURP" in faltantes
