import { describe, it, expect } from 'vitest';
import { validarMensaje, esAdmin, normalizarRespuesta, MAX_TEXTO } from './bartersitoLogic.js';

describe('validarMensaje', () => {
  it('rechaza vacío y demasiado largo', () => {
    expect(validarMensaje('   ').error).toBeTruthy();
    expect(validarMensaje(null).error).toBeTruthy();
    expect(validarMensaje('a'.repeat(MAX_TEXTO + 1)).error).toMatch(/largo/);
  });
  it('recorta espacios', () => {
    expect(validarMensaje('  hola  ')).toEqual({ texto: 'hola' });
  });
});

describe('esAdmin', () => {
  it('solo acepta el rol admin', () => {
    expect(esAdmin({ data: { role: 'admin' } })).toBe(true);
    expect(esAdmin({ data: { role: 'vendedor' } })).toBe(false);
    expect(esAdmin({ data: { role: 'promotor' } })).toBe(false);
    expect(esAdmin(null)).toBe(false);
  });
});

describe('normalizarRespuesta', () => {
  it('toma la salida del agente de n8n', () => {
    expect(normalizarRespuesta({ output: ' Hola ' })).toEqual({ texto: 'Hola' });
    expect(normalizarRespuesta([{ output: 'Hola' }])).toEqual({ texto: 'Hola' });
    expect(normalizarRespuesta('Hola')).toEqual({ texto: 'Hola' });
  });
  it('sin texto devuelve null', () => {
    expect(normalizarRespuesta({})).toBeNull();
    expect(normalizarRespuesta(null)).toBeNull();
  });
  it('conserva solo las filas válidas de la gráfica', () => {
    const r = normalizarRespuesta({
      texto: 'Mira',
      grafica: [{ label: 'A', value: 3 }, { label: '', value: 1 }, { label: 'B', value: 'x' }],
    });
    expect(r.grafica).toEqual([{ label: 'A', value: 3 }]);
  });
});
