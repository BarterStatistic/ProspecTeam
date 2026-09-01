"""Bus de eventos en memoria que alimenta el llenado en vivo de la página.

Selenium corre en un hilo aparte del que atiende la petición HTTP, así que
publica aquí y la página va recogiendo lo publicado.

Es un buffer indexado y no una cola: `queue.Queue.get()` es destructivo, así que
con una cola dos pestañas abiertas se roban los eventos entre sí y ninguna ve la
corrida completa. Con un índice, cada cliente pide "lo que haya después del N" y
todos ven lo mismo. Eso es lo que permite que Marga siga la corrida por sondeo
(`/api/eventos/desde/<n>`) sin dejar de servir el SSE de la app original.
"""

import json
import threading
import time

_eventos = []
_candado = threading.Lock()

# Cada cuánto revisa el generador SSE si hay algo nuevo, y cada cuánto manda un
# comentario para que la conexión no se caiga por inactividad.
_ESPERA_SONDEO = 0.2
_LATIDO = 20


def publicar(tipo, mensaje, campo=None, valor=None):
    """Registra un evento para la página.

    tipo: 'inicio' | 'campo' | 'aviso' | 'error' | 'fin'
    """
    with _candado:
        _eventos.append({
            "tipo": tipo,
            "mensaje": mensaje,
            "campo": campo,
            "valor": valor,
        })


def limpiar():
    """Vacía el buffer antes de una corrida nueva."""
    with _candado:
        _eventos.clear()


def desde(indice):
    """Eventos posteriores a `indice`, y el índice con el que pedir los próximos.

    Si `limpiar()` corrió entre dos consultas, el índice del cliente queda por
    delante del buffer; se acota para que la corrida nueva se lea desde el
    principio en vez de devolver nada para siempre.
    """
    with _candado:
        inicio = max(0, min(indice, len(_eventos)))
        return _eventos[inicio:], len(_eventos)


def stream():
    """Generador de texto en formato Server-Sent Events (app standalone)."""
    enviados = 0
    ultimo_latido = time.monotonic()

    while True:
        nuevos, enviados = desde(enviados)

        for evento in nuevos:
            yield f"data: {json.dumps(evento, ensure_ascii=False)}\n\n"

        if nuevos:
            ultimo_latido = time.monotonic()
            continue

        if time.monotonic() - ultimo_latido >= _LATIDO:
            # Comentario SSE: mantiene viva la conexión sin ensuciar la UI.
            yield ": keep-alive\n\n"
            ultimo_latido = time.monotonic()

        time.sleep(_ESPERA_SONDEO)
