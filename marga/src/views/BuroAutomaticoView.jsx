import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ClipboardCopy, Download, Loader2, ServerOff } from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import PasoFoto from '../components/buro/PasoFoto.jsx';
import Bitacora from '../components/buro/Bitacora.jsx';
import FormularioCampos, {
  EsqueletoCampos,
  LEYENDA_ORIGEN,
  PuntoOrigen,
} from '../components/buro/FormularioCampos.jsx';

import { construir, ETIQUETAS, obligatoriosVacios } from '../lib/buro/datos.js';
import { leerIne } from '../lib/buro/ocr.js';
import {
  cargarImagen,
  descargarComprobante,
  dibujarComprobante,
  LIENZO,
} from '../lib/buro/comprobante.js';
import { extensionDisponible, llenarConExtension } from '../lib/buro/extension.js';
import {
  comprobarSalud,
  iniciarLlenado,
  seguirEventos,
  URL_SERVICIO,
} from '../lib/buro/servicio.js';

// Buró Automático — captura asistida de INE hacia Refácil.
//
// Port de `ine-refacil/static/index.html` + `app.js` a la interfaz de Marga.
// Los pasos 1, 2 y 4 corren enteros en el navegador; el 3 (llenado con Selenium
// sobre Edge) lo hace el servicio local, porque una pestaña no puede manipular
// el DOM de refacil.com.mx.
//
// La app NUNCA presiona «Registrar»: deja el formulario lleno y la persona
// revisa y envía. Una consulta de buró no se deshace.

const PASOS = [
  { numero: 1, texto: 'Credencial' },
  { numero: 2, texto: 'Revisión' },
  { numero: 3, texto: 'Llenado' },
];

function Pasos({ actual }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {PASOS.map(({ numero, texto }) => {
        const activo = numero === actual;
        const hecho = numero < actual;
        return (
          <li key={numero} className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold
                ${activo ? 'bg-gold text-navy-900' : ''}
                ${hecho ? 'bg-state-success/20 text-state-success' : ''}
                ${!activo && !hecho ? 'bg-white/5 text-ink-faint' : ''}`}
            >
              {numero}
            </span>
            <span className={activo ? 'text-ink' : 'text-ink-faint'}>{texto}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function BuroAutomaticoView() {
  const { user } = useAuth();
  const { registrarAutorizacionBuro } = useData();

  const [archivo, setArchivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [estadoOcr, setEstadoOcr] = useState(null);

  const [campos, setCampos] = useState(null);
  const [avisos, setAvisos] = useState([]);

  const [llenando, setLlenando] = useState(false);
  const [entradas, setEntradas] = useState([]);
  const [escritos, setEscritos] = useState(new Set());
  const [progreso, setProgreso] = useState(0);
  const [completo, setCompleto] = useState(false);
  const [servicioCaido, setServicioCaido] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const [comprobanteListo, setComprobanteListo] = useState(false);
  const datosComprobante = useRef(null);
  const lienzo = useRef(null);
  const aborto = useRef(null);

  // El comprobante se dibuja desde el callback de `seguirEventos`, que quedó
  // atrapado en el render donde arrancó la corrida. Sin este ref usaría los
  // valores de entonces y no las correcciones hechas durante el llenado.
  const camposVivos = useRef(campos);
  camposVivos.current = campos;

  const paso = campos ? (entradas.length ? 3 : 2) : 1;

  // Corta el sondeo si el usuario se va de la vista a media corrida.
  useEffect(() => () => aborto.current?.abort(), []);

  // La previa es un object URL: hay que soltarlo o la foto se queda en memoria.
  useEffect(() => {
    if (!archivo) return undefined;
    const url = URL.createObjectURL(archivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  function elegirArchivo(nuevo) {
    if (!nuevo) return;
    if (!nuevo.type.startsWith('image/')) {
      setEstadoOcr({ texto: 'Ese archivo no es una imagen. Usa JPG, PNG o WEBP.', malo: true });
      return;
    }
    setArchivo(nuevo);
    setEstadoOcr(null);
  }

  async function leerCredencial() {
    if (!archivo) return;

    setLeyendo(true);
    setEstadoOcr({ texto: 'Leyendo la credencial…', malo: false });
    setEntradas([]);
    setEscritos(new Set());
    setProgreso(0);
    setCompleto(false);
    setComprobanteListo(false);

    try {
      const lectura = await leerIne(archivo);
      const { campos: nuevos, avisos: nuevosAvisos } = construir(lectura);
      setCampos(nuevos);
      setAvisos(nuevosAvisos);
      setEstadoOcr({ texto: 'Credencial leída.', malo: false });
    } catch (error) {
      setCampos(null);
      setAvisos([]);
      setEstadoOcr({
        texto: error.message || 'No se pudo leer la credencial.',
        malo: true,
      });
    } finally {
      setLeyendo(false);
    }
  }

  const cambiarCampo = useCallback((clave, valor) => {
    setCampos((previos) => ({ ...previos, [clave]: valor }));
    // Editar un campo invalida la marca de "ya escrito en Refácil".
    setEscritos((previos) => {
      if (!previos.has(clave)) return previos;
      const copia = new Set(previos);
      copia.delete(clave);
      return copia;
    });
  }, []);

  function apuntar(entrada) {
    setEntradas((previas) => [...previas, entrada]);
  }

  async function generarComprobante() {
    const actuales = camposVivos.current;
    const nombreCompleto = [actuales.nombre, actuales.paterno, actuales.materno]
      .filter(Boolean)
      .join(' ');

    datosComprobante.current = {
      nombreCompleto,
      rfc: actuales.rfc,
      fecha: new Date(),
      vendedor: user?.username ?? '',
    };

    const imagen = await cargarImagen(archivo);
    dibujarComprobante(lienzo.current, datosComprobante.current, imagen);
    setComprobanteListo(true);
    await descargarComprobante(lienzo.current, datosComprobante.current);
  }

  async function llenarEnRefacil() {
    setEntradas([]);
    setEscritos(new Set());
    setProgreso(0);
    setCompleto(false);
    setComprobanteListo(false);
    setServicioCaido(false);
    setCopiado(false);

    // Misma validación que hace `datos.obligatorios_vacios` en el servicio; se
    // adelanta aquí para no depender de que el servicio esté corriendo.
    const faltantes = obligatoriosVacios(campos);
    if (faltantes.length) {
      apuntar({
        tipo: 'error',
        mensaje: `Refácil exige estos campos y están vacíos: ${faltantes.join(', ')}`,
      });
      return;
    }

    setLlenando(true);

    // Dos motores posibles, mismos eventos. Se prefiere la extensión: no pide
    // instalar Python y el llenado ocurre en una pestaña que el usuario ve.
    const conExtension = extensionDisponible();

    if (!conExtension && !(await comprobarSalud())) {
      setServicioCaido(true);
      setLlenando(false);
      return;
    }

    aborto.current?.abort();
    aborto.current = new AbortController();

    function alRecibir(evento) {
      apuntar(evento);

      if (evento.tipo === 'campo') {
        setProgreso((n) => n + 1);
        if (evento.campo) setEscritos((previos) => new Set(previos).add(evento.campo));
      }

      if (evento.tipo === 'fin') {
        setCompleto(true);
        // Se registra antes de generar el comprobante: lo que define "autorización
        // generada" es que el llenado terminó, no que el PNG se haya descargado. Si
        // la descarga falla (p. ej. el navegador la bloquea), el conteo no se pierde.
        const actuales = camposVivos.current;
        registrarAutorizacionBuro({
          nombreCompleto: [actuales.nombre, actuales.paterno, actuales.materno]
            .filter(Boolean)
            .join(' '),
          rfc: actuales.rfc,
          curp: actuales.curp,
          via: conExtension ? 'extension' : 'servicio',
        }).catch((err) =>
          console.error('[marga] no se pudo registrar la autorización de Buró', err),
        );
        generarComprobante();
      }
    }

    if (conExtension) {
      await llenarConExtension(campos, alRecibir, aborto.current.signal);
    } else {
      try {
        await iniciarLlenado(campos);
      } catch (error) {
        apuntar({ tipo: 'error', mensaje: error.message });
        setLlenando(false);
        return;
      }
      await seguirEventos(alRecibir, aborto.current.signal);
    }

    setLlenando(false);
  }

  async function copiarCampos() {
    const texto = Object.entries(campos)
      .map(([clave, valor]) => `${ETIQUETAS[clave]}: ${valor}`)
      .join('\n');
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Captura asistida de INE</h2>
            <p className="text-xs text-ink-faint">
              Lee la credencial, calcula el RFC y llena el formulario de Refácil.
            </p>
          </div>
          <Pasos actual={paso} />
        </Card>

        {/* ---------------- Paso 1: la foto ---------------- */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Foto de la INE</h3>
          <PasoFoto
            archivo={archivo}
            previa={previa}
            leyendo={leyendo}
            estado={estadoOcr}
            onElegir={elegirArchivo}
            onLeer={leerCredencial}
          />
        </Card>

        {/* ---------------- Paso 2: revisión ---------------- */}
        {(leyendo || campos) && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-ink">Revisa los datos</h3>
            <p className="mt-1 text-xs text-ink-faint">
              El OCR se equivoca con fotos borrosas. Corrige aquí antes de continuar: es más
              rápido que corregir dentro de Refácil.
            </p>

            {leyendo && !campos ? (
              <div className="mt-4">
                <EsqueletoCampos />
              </div>
            ) : (
              campos && (
                <>
                  {avisos.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {avisos.map((texto) => (
                        <p
                          key={texto}
                          className="flex gap-2 rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-ink-muted"
                        >
                          <AlertTriangle
                            size={14}
                            className="mt-0.5 shrink-0 text-state-warning"
                          />
                          {texto}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                    {LEYENDA_ORIGEN.map(({ origen, texto }) => (
                      <span key={origen} className="flex items-center gap-1.5">
                        <PuntoOrigen origen={origen} /> {texto}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4">
                    <FormularioCampos
                      campos={campos}
                      escritos={escritos}
                      onCambiar={cambiarCampo}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button variant="gold" size="md" disabled={llenando} onClick={llenarEnRefacil}>
                      {llenando && <Loader2 size={16} className="animate-spin" />}
                      Llenar en Refácil
                    </Button>
                    <Button variant="outline" size="md" onClick={copiarCampos}>
                      <ClipboardCopy size={16} />
                      {copiado ? 'Copiado' : 'Copiar los 18 campos'}
                    </Button>
                  </div>

                  <p className="mt-3 text-xs text-ink-faint">
                    La app <strong className="text-ink-muted">no envía</strong> la solicitud. Deja
                    el formulario lleno y el botón «Registrar» lo presionas tú, después de revisar.
                  </p>
                </>
              )
            )}
          </Card>
        )}

        {/* ---------------- Paso 3: bitácora ---------------- */}
        {servicioCaido && (
          <Card className="p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ServerOff size={16} className="text-state-warning" />
              Falta el motor de llenado en esta computadora
            </h3>
            <p className="mt-2 text-xs text-ink-muted">
              El llenado escribe en el formulario real de Refácil, así que necesita algo instalado{' '}
              <strong className="text-ink">en esta misma computadora</strong>. Hay dos formas, y
              basta con una:
            </p>

            <p className="mt-3 text-xs font-semibold text-ink">
              Recomendada · Extensión del navegador
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Se instala una vez, no necesita Python y llena Refácil en una pestaña que puedes ver.
              Pídesela a Braulio o instálala desde la carpeta{' '}
              <span className="font-mono text-sky2">buro-extension</span> del proyecto.
            </p>

            <p className="mt-3 text-xs font-semibold text-ink">Alternativa · Servicio local</p>
            <p className="mt-1 text-xs text-ink-muted">
              Doble clic en{' '}
              <span className="font-mono text-sky2">ine-refacil\iniciar-servicio.bat</span> y deja
              la ventana negra abierta. Requiere Python instalado.
            </p>

            <p className="mt-3 text-xs text-ink-faint">
              Cuando cualquiera de las dos esté lista, vuelve a presionar «Llenar en Refácil».
              Desde un celular no hay forma de instalarlas: ahí usa «Copiar los 18 campos» y
              pégalos en Refácil a mano.
            </p>
          </Card>
        )}

        {entradas.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Llenado en vivo</h3>
            <Bitacora entradas={entradas} progreso={progreso} completo={completo} />
          </Card>
        )}

        {/* ---------------- Paso 4: comprobante ---------------- */}
        <Card className={`p-4 ${comprobanteListo ? '' : 'hidden'}`}>
          <h3 className="text-sm font-semibold text-ink">Comprobante de captura</h3>
          <p className="mt-1 text-xs text-ink-faint">
            Se descarga solo al terminar el llenado; si tu navegador lo bloqueó, usa el botón.
            Documenta qué se capturó y cuándo: no acredita la autorización del titular.
          </p>

          {/* El canvas se monta siempre (oculto con la tarjeta) porque
              `dibujarComprobante` necesita el nodo real para pintar. */}
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-white">
            <canvas
              ref={lienzo}
              width={LIENZO.ancho}
              height={LIENZO.alto}
              aria-label="Comprobante de captura"
              className="block h-auto w-full"
            />
          </div>

          <div className="mt-3">
            <Button
              variant="outline"
              size="md"
              onClick={() =>
                datosComprobante.current &&
                descargarComprobante(lienzo.current, datosComprobante.current)
              }
            >
              <Download size={16} /> Descargar de nuevo
            </Button>
          </div>
        </Card>

        <p className="pb-2 text-center text-[11px] text-ink-faint">
          Consultar buró de crédito requiere autorización expresa del titular (LRSIC art. 28).
          Esta herramienta no la recaba.
        </p>
      </div>
    </div>
  );
}
