import { describe, it, expect } from 'vitest';
import { cargarCostos, normalizarCostos, rangoRapido, validarRango, aISO, usd, tokens } from './costosAgencia.js';

// Forma real que devuelve marga_costos_agencia (recortada).
const REAL = {
  desde: '2026-11-01',
  hasta: '2026-11-18',
  totalUsd: 0.308,
  tokensEntrada: 137500,
  tokensSalida: 28700,
  llamadas: 3,
  sinPrecio: 1,
  porAgente: [
    { nombre: 'Investigador', usd: 0.176, llamadas: 1, tokensEntrada: 85500, tokensSalida: 24900 },
    { nombre: 'Productor', usd: null, llamadas: 1, tokensEntrada: 0, tokensSalida: 0 },
  ],
  porPaso: [{ nombre: 'Aprendizaje - Analizar', agente: 'Aprendizaje', usd: 0.132, llamadas: 1, tokensEntrada: 52000, tokensSalida: 3800 }],
  porModelo: [{ nombre: 'speko', usd: null, llamadas: 1, tokensEntrada: 0, tokensSalida: 0, unidades: 420 }],
  porDia: [{ fecha: '2026-11-17', usd: 0 }, { fecha: '2026-11-18', usd: 0.308 }],
  detalle: [
    { cuando: '2026-11-18T13:11:26Z', flujo: 'Investigador', agente: 'Investigador', modelo: 'gpt-5.4-mini', tokensEntrada: 85500, tokensSalida: 24899, unidades: null, usd: 0.176 },
    { cuando: '2026-11-18T12:00:00Z', flujo: 'Productor - voz', agente: 'Productor', modelo: 'speko', tokensEntrada: 0, tokensSalida: 0, unidades: 420, usd: null },
  ],
};

describe('normalizarCostos', () => {
  it('da forma estable y conserva usd nulo como nulo (no como 0)', () => {
    const d = normalizarCostos(REAL);
    expect(d.totalUsd).toBeCloseTo(0.308);
    expect(d.sinPrecio).toBe(1);
    expect(d.porAgente[1].usd).toBeNull();
    expect(d.detalle[1].usd).toBeNull();
    expect(d.detalle[1].unidades).toBe(420);
    expect(Number.isFinite(d.detalle[0].cuando)).toBe(true);
    expect(d.desde).toBe(new Date(2026, 10, 1).getTime());
    expect(d.porModelo[0].unidades).toBe(420);
  });

  it('tolera respuestas vacías o incompletas', () => {
    expect(normalizarCostos(null)).toBeNull();
    const d = normalizarCostos({});
    expect(d.totalUsd).toBe(0);
    expect(d.porAgente).toEqual([]);
    expect(d.detalle).toEqual([]);
  });
});

describe('rangoRapido y validarRango', () => {
  const hoy = new Date(2026, 10, 18).getTime();
  it('calcula los rangos con ambos días incluidos', () => {
    expect(rangoRapido('hoy', hoy)).toEqual({ desde: '2026-11-18', hasta: '2026-11-18' });
    expect(rangoRapido('7', hoy)).toEqual({ desde: '2026-11-12', hasta: '2026-11-18' });
    expect(rangoRapido('30', hoy)).toEqual({ desde: '2026-10-20', hasta: '2026-11-18' });
    expect(rangoRapido('mes', hoy)).toEqual({ desde: '2026-11-01', hasta: '2026-11-18' });
    expect(rangoRapido('90', hoy)).toEqual({ desde: '2026-08-21', hasta: '2026-11-18' });
  });
  it('valida el rango', () => {
    expect(validarRango('2026-11-01', '2026-11-18')).toBeNull();
    expect(validarRango('2026-11-18', '2026-11-18')).toBeNull();
    expect(validarRango('2026-11-19', '2026-11-18')).toMatch(/posterior/);
    expect(validarRango('', '2026-11-18')).toMatch(/dos fechas/);
  });
  it('aISO usa hora local', () => {
    expect(aISO(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });
});

describe('cargarCostos', () => {
  it('modo demo devuelve datos coherentes con el rango', async () => {
    const { datos } = await cargarCostos('demo', null, '2026-11-01', '2026-11-07');
    expect(datos.esDemo).toBe(true);
    expect(datos.porDia.length).toBe(7);
    const suma = datos.porAgente.reduce((a, g) => a + (g.usd ?? 0), 0);
    expect(suma).toBeCloseTo(datos.totalUsd, 3);
    expect(datos.llamadas).toBe(datos.detalle.length);
  });
  it('sin función en el almacén → sinConectar', async () => {
    expect(await cargarCostos('supabase', {}, 'a', 'b')).toEqual({ sinConectar: true });
  });
  it('función no instalada → sinConectar; otro error se propaga', async () => {
    const noInstalada = { costosAgencia: async () => { throw Object.assign(new Error('x'), { sinInstalar: true }); } };
    expect(await cargarCostos('supabase', noInstalada, 'a', 'b')).toEqual({ sinConectar: true });
    const falla = { costosAgencia: async () => { throw new Error('boom'); } };
    await expect(cargarCostos('supabase', falla, 'a', 'b')).rejects.toThrow('boom');
  });
  it('pasa las fechas tal cual y normaliza', async () => {
    let args;
    const store = { costosAgencia: async (d, h) => { args = [d, h]; return REAL; } };
    const { datos } = await cargarCostos('supabase', store, '2026-11-01', '2026-11-18');
    expect(args).toEqual(['2026-11-01', '2026-11-18']);
    expect(datos.llamadas).toBe(3);
  });
});

describe('formato', () => {
  it('usd muestra 4 decimales solo bajo un centavo y — si es nulo', () => {
    expect(usd(0.176)).toBe('US$0.18');
    expect(usd(0.0042)).toBe('US$0.0042');
    expect(usd(0)).toBe('US$0.00');
    expect(usd(null)).toBe('—');
  });
  it('tokens abrevia los millones', () => {
    expect(tokens(24899)).toMatch(/24.899|24,899/);
    expect(tokens(1_250_000)).toBe('1.25 M');
  });
});
