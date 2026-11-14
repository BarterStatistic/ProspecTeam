import { describe, it, expect } from 'vitest';
import { preguntarBartersito, SIN_CONEXION } from './bartersito.js';

describe('preguntarBartersito', () => {
  it('rechaza a vendedores y promotores sin llamar al servidor', async () => {
    let llamadas = 0;
    const store = { bartersito: async () => (llamadas++, { texto: 'x' }) };
    await expect(preguntarBartersito('hola', { role: 'vendedor', modo: 'supabase', store })).rejects.toThrow(
      /administrador/,
    );
    await expect(preguntarBartersito('hola', { role: 'promotor', modo: 'demo', store })).rejects.toThrow(
      /administrador/,
    );
    expect(llamadas).toBe(0);
  });

  it('sin conexión lo dice, sin inventar datos', async () => {
    const sinFuncion = await preguntarBartersito('Resumen de hoy', { role: 'admin', modo: 'firestore', store: {} });
    expect(sinFuncion).toEqual({ texto: SIN_CONEXION });

    const store = {
      bartersito: async () => {
        throw Object.assign(new Error('404'), { sinInstalar: true });
      },
    };
    expect(await preguntarBartersito('hola', { role: 'admin', modo: 'supabase', store })).toEqual({
      texto: SIN_CONEXION,
    });
  });

  it('con conexión devuelve la respuesta del servidor', async () => {
    const store = { bartersito: async (t) => ({ texto: `eco: ${t}`, grafica: [{ label: 'A', value: 1 }] }) };
    const r = await preguntarBartersito('hola', { role: 'admin', modo: 'supabase', store });
    expect(r.texto).toBe('eco: hola');
    expect(r.grafica).toHaveLength(1);
  });

  it('propaga los errores reales del servidor', async () => {
    const store = {
      bartersito: async () => {
        throw new Error('Bartersito tardó demasiado.');
      },
    };
    await expect(preguntarBartersito('hola', { role: 'admin', modo: 'supabase', store })).rejects.toThrow(/tardó/);
  });

  it('en demo contesta con una respuesta de muestra', async () => {
    const r = await preguntarBartersito('¿Qué anuncio trae más calientes?', { role: 'admin', modo: 'demo' });
    expect(r.grafica.length).toBeGreaterThan(0);
  });
});
