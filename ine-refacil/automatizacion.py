"""Llenado del formulario de Refácil con Selenium sobre Edge.

Dos reglas que no se rompen:

1. Edge se abre VISIBLE (nada de headless). Ver el llenado es el punto.
2. NUNCA se hace clic en los botones "Registrar". La solicitud la envía una
   persona después de revisar. Una consulta de buró no se puede deshacer.
"""

import os
import time

from selenium import webdriver
from selenium.common.exceptions import NoAlertPresentException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

import datos
import eventos

URL_FORMULARIO = os.environ.get(
    "REFACIL_FORM_URL",
    "https://www.refacil.com.mx/formularioDinamo.php?id=33628&intranet=0",
)

# Orden de llenado: el mismo que sigue una persona, y estado antes que
# municipio porque municipio depende de lo que cargue el AJAX del estado.
ORDEN = [
    "rfc", "correo", "cbCorreo", "curp", "nombre", "paterno", "materno",
    "cbEstado", "cbMunicipio", "cbLocalidad", "calle", "numExt", "cp",
    "colonia", "numTelefono", "empresa", "ingresoMensual", "cbTipo_Venta",
]

# Todos los selects se eligen por texto visible, no por value: el value es un
# número interno de Refácil que cambiaría sin aviso y que nadie puede verificar
# al revisar la pantalla.
SELECTS = {"cbCorreo", "cbEstado", "cbMunicipio", "cbLocalidad", "cbTipo_Venta"}

# Estos dos los puebla un AJAX, así que hay que esperar a que carguen.
SELECTS_DINAMICOS = {"cbMunicipio", "cbLocalidad"}


def _pausa():
    return float(os.environ.get("PAUSA_ENTRE_CAMPOS", "0.4"))


def _abrir_edge():
    opciones = webdriver.EdgeOptions()
    opciones.add_argument("--start-maximized")
    # Sin headless a propósito: la ventana visible es parte del requisito.
    driver = webdriver.Edge(options=opciones)
    return driver


def _escribir_texto(driver, id_campo, valor):
    campo = driver.find_element(By.ID, id_campo)
    campo.clear()
    campo.send_keys(str(valor))


def _esperar_opciones(driver, id_campo, espera_segundos=15):
    """Espera a que el AJAX pueble el select (más de la opción -SELECCIONE-)."""
    WebDriverWait(driver, espera_segundos).until(
        lambda d: len(Select(d.find_element(By.ID, id_campo)).options) > 1
    )


def _seleccionar_por_texto(driver, id_campo, texto):
    """Elige la opción cuyo texto coincide; si no, la que lo contenga."""
    select = Select(driver.find_element(By.ID, id_campo))
    objetivo = texto.strip().upper()

    for opcion in select.options:
        if opcion.text.strip().upper() == objetivo:
            select.select_by_visible_text(opcion.text)
            return opcion.text.strip()

    for opcion in select.options:
        if objetivo in opcion.text.strip().upper():
            select.select_by_visible_text(opcion.text)
            return opcion.text.strip()

    disponibles = ", ".join(o.text.strip() for o in select.options[1:6])
    raise ValueError(f"No se encontró «{texto}» en {id_campo}. Opciones: {disponibles}…")


def _revisar_alerta(driver):
    """Consume una alerta del navegador si el formulario disparó una."""
    try:
        alerta = driver.switch_to.alert
        texto = alerta.text
        alerta.accept()
        return texto
    except NoAlertPresentException:
        return None


def llenar(campos):
    """Abre Edge, llena el formulario y lo deja listo para revisión humana.

    Devuelve el driver, que se mantiene abierto a propósito.
    """
    pausa = _pausa()
    driver = None

    try:
        eventos.publicar("inicio", "Abriendo Microsoft Edge…")
        driver = _abrir_edge()

        eventos.publicar("inicio", "Cargando el formulario de Refácil…")
        driver.get(URL_FORMULARIO)
        WebDriverWait(driver, 20).until(
            EC.visibility_of_element_located((By.ID, "rfc"))
        )
        eventos.publicar("inicio", "Formulario cargado. Empezando el llenado.")

        for id_campo in ORDEN:
            valor = str(campos.get(id_campo, "")).strip()
            etiqueta = datos.ETIQUETAS[id_campo]

            if not valor:
                eventos.publicar("aviso", f"{etiqueta}: sin dato, se dejó vacío", id_campo)
                continue

            try:
                if id_campo in SELECTS:
                    if id_campo in SELECTS_DINAMICOS:
                        _esperar_opciones(driver, id_campo)
                    escrito = _seleccionar_por_texto(driver, id_campo, valor)
                else:
                    _escribir_texto(driver, id_campo, valor)
                    escrito = valor

                eventos.publicar("campo", f"{etiqueta}: {escrito}", id_campo, escrito)

                if id_campo == "rfc":
                    # Dispara validarRFCDINAMO() y recoge lo que reclame.
                    driver.find_element(By.ID, "rfc").send_keys(Keys.TAB)
                    time.sleep(0.6)
                    alerta = _revisar_alerta(driver)
                    if alerta:
                        eventos.publicar(
                            "aviso",
                            f"Refácil objetó el RFC: «{alerta}». Corrígelo a mano en la ventana de Edge.",
                            "rfc",
                        )

            except TimeoutException:
                eventos.publicar(
                    "error",
                    f"{etiqueta}: el catálogo no cargó a tiempo. Selecciónalo a mano.",
                    id_campo,
                )
            except ValueError as exc:
                eventos.publicar("error", f"{etiqueta}: {exc}", id_campo)
            except Exception as exc:  # noqa: BLE001 - un campo no debe tumbar la corrida
                eventos.publicar("error", f"{etiqueta}: {type(exc).__name__} — {exc}", id_campo)

            time.sleep(pausa)

        eventos.publicar(
            "fin",
            "Formulario lleno. Revísalo en la ventana de Edge y, si todo está bien, "
            "presiona tú mismo el botón Registrar. La app no envía nada.",
        )
        return driver

    except Exception as exc:  # noqa: BLE001
        eventos.publicar("error", f"El llenado se interrumpió: {type(exc).__name__} — {exc}")
        eventos.publicar("fin", "La corrida terminó con errores.")
        raise
