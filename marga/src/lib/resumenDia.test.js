import { describe, expect, it } from 'vitest';
import { normalizarResumen, totalDecisiones, primeraLinea, cargarResumen } from './resumenDia.js';

describe('normalizarResumen', () => {
  it('da forma estable aunque falten datos', () => {
    const r = normalizarResumen({ gasto: { mes: '740.25' }, decisiones: { alex: 3 } });
    expect(r.gasto.mes).toBe(740.25);
    expect(r.gasto.hoy).toBe(0);
    expect(r.alex.hoy.aptos).toBe(0);
    expect(r.decisiones).toEqual({ agencia: null, alex: 3 });
    expect(r.ia.alexUsdMes).toBeNull();
    expect(r.reportes).toEqual([]);
  });
  it('null si no hay objeto', () => {
    expect(normalizarResumen(undefined)).toBeNull();
  });
  it('los reportes de distintos orígenes no chocan por id', () => {
    const r = normalizarResumen({ reportes: [{ origen: 'analista', id: 2 }, { origen: 'supervisor', id: 2 }] });
    expect(new Set(r.reportes.map((x) => x.id)).size).toBe(2);
  });
});

describe('ayudas', () => {
  it('suma lo que espera decisión (la agencia puede no estar conectada)', () => {
    expect(totalDecisiones(normalizarResumen({ decisiones: { agencia: 2, alex: 3 } }))).toBe(5);
    expect(totalDecisiones(normalizarResumen({ decisiones: { alex: 1 } }))).toBe(1);
    expect(totalDecisiones(null)).toBe(0);
  });
  it('primera línea sin etiquetas y recortada', () => {
    expect(primeraLinea('\n<b>La medida</b>: 6 aptos\notra')).toBe('La medida: 6 aptos');
    expect(primeraLinea('x'.repeat(200), 20)).toHaveLength(20);
    expect(primeraLinea(null)).toBe('');
  });
});

describe('cargarResumen', () => {
  it('demo trae datos de ejemplo', async () => {
    const r = await cargarResumen('demo', null);
    expect(r.datos.esDemo).toBe(true);
    expect(r.datos.reportes.length).toBeGreaterThan(0);
  });
  it('sin la función en la base avisa que falta conectar', async () => {
    expect(await cargarResumen('supabase', {})).toEqual({ sinConectar: true });
    const store = { resumenDia: async () => { const e = new Error('x'); e.sinInstalar = true; throw e; } };
    expect(await cargarResumen('supabase', store)).toEqual({ sinConectar: true });
  });
});
