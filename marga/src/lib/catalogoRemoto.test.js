// Carga del catálogo compartido (Supabase catalogo()) sobre motos.js.
// Cada prueba importa los módulos de nuevo para empezar con los datos de respaldo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import catalogoReal from './__fixtures__/catalogo.json';

let motos;
let remoto;
let respaldo;

beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  motos = await import('./motos.js');
  remoto = await import('./catalogoRemoto.js');
  respaldo = JSON.stringify([motos.MODELS, motos.SCHEMES]);
});
afterEach(() => vi.restoreAllMocks());

const respuesta = (cuerpo, status = 200) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }));
const sinCambios = () => expect(JSON.stringify([motos.MODELS, motos.SCHEMES])).toBe(respaldo);
const copia = () => structuredClone(catalogoReal);

describe('cargarCatalogoRemoto', () => {
  it('pide catalogo() por POST con la clave publicable', async () => {
    const fetchFn = respuesta(copia());
    await remoto.cargarCatalogoRemoto({ fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchFn.mock.calls[0];
    expect(url).toBe('https://ehyqexzaauvjoioafqdz.supabase.co/rest/v1/rpc/catalogo');
    expect(opciones.method).toBe('POST');
    expect(opciones.headers.apikey).toMatch(/^sb_publishable_/);
  });

  it('con el catálogo real vigente no cambia nada y conserva las etiquetas con acento', async () => {
    expect(await remoto.cargarCatalogoRemoto({ fetchFn: respuesta(copia()) })).toBe('sin-cambios');
    sinCambios();
    expect(motos.SCHEMES.motonomina.label).toBe('Motonómina');
    expect(motos.etiquetaEsquema('motonomina_flex')).toBe('Motonómina Flex');
  });

  it('aplica precios, modelos y factores nuevos sobre los mismos objetos', async () => {
    const lista = motos.MODELS;
    const motonomina = motos.SCHEMES.motonomina;
    const cat = copia();
    cat.modelos = cat.modelos.filter(([n]) => n !== 'U2');
    cat.modelos.find(([n]) => n === 'R4')[1] = 60000;
    cat.modelos.push(['NUEVA 300', 99000, 3000]);
    cat.esquemas.motonomina.min = 7;
    cat.esquemas.motoxpress.levels[0].m['72'] = 0.05;

    expect(await remoto.cargarCatalogoRemoto({ fetchFn: respuesta(cat) })).toBe('aplicado');

    expect(motos.MODELS).toBe(lista);
    expect(motos.SCHEMES.motonomina).toBe(motonomina);
    expect(motos.MODELS).toHaveLength(37);
    expect(motos.motoPorNombre('U2')).toBeNull();
    expect(motos.motoPorNombre('R4')).toEqual({ nombre: 'R4', precio: 60000, servicio: 2962 });
    expect(motos.motoPorNombre('NUEVA 300')).toEqual({ nombre: 'NUEVA 300', precio: 99000, servicio: 3000 });
    expect(motonomina.min).toBe(7);
    expect(motonomina.label).toBe('Motonómina');
    expect(motonomina.id).toBe('motonomina');
    expect(motos.SCHEMES.motoxpress.levels[0].m[72]).toBe(0.05);
  });

  it('el cotizador usa los factores nuevos', async () => {
    const { nivelPara } = await import('./cotizador.js');
    const cat = copia();
    cat.esquemas.motoxpress.levels[0].m['72'] = 0.05;
    await remoto.cargarCatalogoRemoto({ fetchFn: respuesta(cat) });
    expect(nivelPara('motoxpress', 30).m[72]).toBe(0.05);
  });

  it('un esquema que no viene se queda con los datos de respaldo', async () => {
    const cat = copia();
    delete cat.esquemas.credinamo_flex;
    cat.esquemas.motonomina.max = 70;
    const antes = JSON.stringify(motos.SCHEMES.credinamo_flex);
    expect(await remoto.cargarCatalogoRemoto({ fetchFn: respuesta(cat) })).toBe('aplicado');
    expect(JSON.stringify(motos.SCHEMES.credinamo_flex)).toBe(antes);
    expect(motos.SCHEMES.motonomina.max).toBe(70);
  });

  it('con HTTP 500 usa el respaldo', async () => {
    expect(await remoto.cargarCatalogoRemoto({ fetchFn: respuesta({}, 500) })).toBe('respaldo');
    sinCambios();
    expect(console.warn).toHaveBeenCalled();
  });

  it('sin red usa el respaldo', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await remoto.cargarCatalogoRemoto({ fetchFn })).toBe('respaldo');
    sinCambios();
  });

  it('si tarda más del límite, aborta y usa el respaldo', async () => {
    const fetchFn = vi.fn(
      (_url, { signal }) =>
        new Promise((_ok, falla) => signal.addEventListener('abort', () => falla(new DOMException('abort', 'AbortError')))),
    );
    expect(await remoto.cargarCatalogoRemoto({ fetchFn, timeoutMs: 20 })).toBe('respaldo');
    sinCambios();
  });

  it.each([
    ['nulo', null],
    ['sin modelos', { ...catalogoReal, modelos: [] }],
    ['precio como texto', { ...catalogoReal, modelos: [['U2', '21945', 2287]] }],
    ['servicio negativo', { ...catalogoReal, modelos: [['U2', 21945, -1]] }],
    ['sin esquemas', { modelos: catalogoReal.modelos }],
    ['plazo sin factor', (() => { const c = copia(); delete c.esquemas.motonomina.levels[0].m['72']; return c; })()],
    ['factor en cero', (() => { const c = copia(); c.esquemas.credinamo.levels[1].m['12'] = 0; return c; })()],
    ['rango invertido', (() => { const c = copia(); c.esquemas.credinamo.min = 80; return c; })()],
    ['unidad desconocida', (() => { const c = copia(); c.esquemas.motoxpress.termUnit = 'meses'; return c; })()],
  ])('con forma inválida (%s) usa el respaldo', async (_caso, cuerpo) => {
    expect(await remoto.cargarCatalogoRemoto({ fetchFn: respuesta(cuerpo) })).toBe('respaldo');
    sinCambios();
  });
});
