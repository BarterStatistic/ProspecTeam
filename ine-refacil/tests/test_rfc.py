"""Pruebas del cálculo de RFC.

Las cuatro letras iniciales y la fecha se verifican contra los ejemplos del
instructivo del SAT. La homoclave y el dígito verificador se verifican por
invariantes (longitud, alfabeto, determinismo), porque no hay una fuente
oficial de casos resueltos que se pueda citar sin consultar al SAT.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import rfc  # noqa: E402


# --- Cuatro letras iniciales --------------------------------------------------

@pytest.mark.parametrize("nombres,paterno,materno,esperado", [
    # Caso base: inicial + primera vocal interna del paterno, inicial del
    # materno, inicial del nombre.
    ("Juan", "Barrios", "Fernández", "BAFJ"),
    ("Eva", "Martínez", "López", "MALE"),
    # JOSE y MARIA se omiten cuando hay un segundo nombre.
    ("José Antonio", "Ramírez", "Soto", "RASA"),
    ("María Guadalupe", "Núñez", "Ortiz", "NUOG"),
    # ...pero se usan cuando son el único nombre.
    ("José", "Hernández", "Cruz", "HECJ"),
    # Partículas ignoradas en apellidos.
    ("Luis", "de la Cruz", "del Valle", "CUVL"),
    ("Ana", "Mc Gregor", "Van Damme", "GEDA"),
    # Ñ se sustituye por X en las iniciales.
    ("Ñoño", "Ñañez", "Peña", "XAPX"),
    # Acentos y diéresis no cambian la letra.
    ("Ángel", "Güémez", "Ibáñez", "GUIA"),
])
def test_letras_iniciales(nombres, paterno, materno, esperado):
    assert rfc.letras_iniciales(nombres, paterno, materno) == esperado


def test_apellido_paterno_corto_usa_dos_letras_del_nombre():
    # Paterno de una o dos letras: una inicial por apellido y dos del nombre.
    assert rfc.letras_iniciales("Alberto", "Oz", "Pérez") == "OPAL"
    assert rfc.letras_iniciales("Pedro", "Ng", "Torres") == "NTPE"


def test_sin_vocal_interna_se_usa_x():
    assert rfc._primera_vocal_interna("NG") == "X"
    assert rfc._primera_vocal_interna("BARRIOS") == "A"


def test_sin_apellido_materno():
    # Dos letras del paterno y dos del nombre.
    assert rfc.letras_iniciales("Carlos", "Solís", "") == "SOCA"


def test_sin_apellido_paterno():
    assert rfc.letras_iniciales("Carlos", "", "Solís") == "SOCA"


def test_palabra_inconveniente_se_censura():
    # PUTA -> PUTX
    assert rfc.letras_iniciales("Alma", "Pulido", "Tapia") == "PUTX"


def test_falta_de_datos_es_error():
    with pytest.raises(ValueError):
        rfc.letras_iniciales("", "Pérez", "López")
    with pytest.raises(ValueError):
        rfc.letras_iniciales("Juan", "", "")


# --- Fecha --------------------------------------------------------------------

@pytest.mark.parametrize("entrada,esperado", [
    ("1970-12-12", "701212"),
    ("2001-01-05", "010105"),
    ("12/12/1970", "701212"),
])
def test_fecha_aammdd(entrada, esperado):
    assert rfc._fecha_aammdd(entrada) == esperado


def test_fecha_invalida_es_error():
    with pytest.raises(ValueError):
        rfc._fecha_aammdd("12 de diciembre de 1970")


# --- Homoclave y dígito verificador ------------------------------------------

def test_homoclave_tiene_dos_caracteres_del_alfabeto():
    homoclave = rfc.calcular_homoclave("Juan", "Barrios", "Fernández")
    assert len(homoclave) == 2
    assert all(c in rfc._ALFABETO_HOMOCLAVE for c in homoclave)


def test_homoclave_es_determinista_e_ignora_acentos():
    assert rfc.calcular_homoclave("Juan", "Barrios", "Fernández") == \
        rfc.calcular_homoclave("JUAN", "BARRIOS", "FERNANDEZ")


def test_homoclave_distingue_personas_distintas():
    a = rfc.calcular_homoclave("Juan", "Barrios", "Fernández")
    b = rfc.calcular_homoclave("Juana", "Barrios", "Fernández")
    assert a != b


def test_digito_verificador_es_un_caracter_valido():
    dv = rfc.calcular_digito_verificador("BAFJ701212H1")
    assert dv in "0123456789A"


def test_digito_verificador_exige_doce_caracteres():
    with pytest.raises(ValueError):
        rfc.calcular_digito_verificador("BAFJ701212")


# --- RFC completo -------------------------------------------------------------

def test_rfc_desde_nombre_tiene_trece_posiciones():
    resultado = rfc.rfc_desde_nombre("Juan", "Barrios", "Fernández", "1970-12-12")
    assert len(resultado) == 13
    assert resultado[:10] == "BAFJ701212"


def test_rfc_desde_curp_toma_las_diez_primeras():
    # CURP de ejemplo con dígito verificador correcto.
    curp = "BAFJ701212HDFRRN09"
    resultado = rfc.rfc_desde_curp(curp, "Juan", "Barrios", "Fernández")
    assert resultado[:10] == "BAFJ701212"
    assert len(resultado) == 13


def test_rfc_desde_curp_rechaza_formato_invalido():
    with pytest.raises(ValueError):
        rfc.rfc_desde_curp("NO-ES-UNA-CURP", "Juan", "Barrios", "Fernández")


def test_ambos_caminos_coinciden_en_las_diez_primeras():
    curp = "BAFJ701212HDFRRN09"
    por_curp = rfc.rfc_desde_curp(curp, "Juan", "Barrios", "Fernández")
    por_nombre = rfc.rfc_desde_nombre("Juan", "Barrios", "Fernández", "1970-12-12")
    assert por_curp == por_nombre


# --- resolver_rfc -------------------------------------------------------------

def test_resolver_prefiere_la_curp_y_no_advierte_si_coinciden():
    resultado, origen, advertencia = rfc.resolver_rfc(
        "Juan", "Barrios", "Fernández", "1970-12-12", "BAFJ701212HDFRRN09"
    )
    assert origen == "curp"
    assert advertencia is None
    assert resultado[:10] == "BAFJ701212"


def test_resolver_advierte_cuando_los_caminos_difieren():
    # Fecha de nacimiento distinta a la de la CURP.
    resultado, origen, advertencia = rfc.resolver_rfc(
        "Juan", "Barrios", "Fernández", "1985-03-04", "BAFJ701212HDFRRN09"
    )
    assert origen == "curp"
    assert resultado[:10] == "BAFJ701212"
    assert advertencia and "no coincide" in advertencia


def test_resolver_usa_el_nombre_cuando_no_hay_curp():
    resultado, origen, advertencia = rfc.resolver_rfc(
        "Juan", "Barrios", "Fernández", "1970-12-12", None
    )
    assert origen == "nombre"
    assert advertencia and "No se leyó la CURP" in advertencia
    assert resultado[:10] == "BAFJ701212"


def test_resolver_cae_al_nombre_si_la_curp_es_ilegible():
    resultado, origen, advertencia = rfc.resolver_rfc(
        "Juan", "Barrios", "Fernández", "1970-12-12", "BAFJ7012??HDF"
    )
    assert origen == "nombre"
    assert advertencia and "no es utilizable" in advertencia


# --- Validación de CURP -------------------------------------------------------

def test_curp_valida_acepta_digito_correcto():
    assert rfc.curp_valida("BAFJ701212HDFRRN09")


def test_curp_valida_rechaza_digito_alterado():
    assert not rfc.curp_valida("BAFJ701212HDFRRN08")


def test_curp_valida_rechaza_basura():
    assert not rfc.curp_valida("HOLA")
