import { describe, it, expect } from 'vitest';
import {
  cargarPublicidad,
  normalizarPublicidad,
  resumenPublicidad,
  fechaLocal,
  hace,
  AUDITORIA,
} from './publicidad.js';

// Forma real que devuelve marga_panel_publicidad (recortada).
const REAL = {
  desde: '2026-10-16',
  hasta: '2026-11-14',
  gastoAnuncios: 741.05,
  gastoPorDia: [{ fecha: '2026-11-13', monto: 20.5 }, { fecha: '2026-11-14', monto: 0 }],
  costosUsd: [{ label: 'Creativo', usd: 0.179165 }],
  leads: 325,
  ventasAtribuidas: 1,
  anuncios: [
    { nombre: 'Externo', externo: true, gasto: null, leads: 131, calientes: 17, ventas: 1 },
    { nombre: 'Propio', externo: false, gasto: 528.03, leads: 71, calientes: 16, ventas: 0 },
    { nombre: 'Propio 2', externo: false, gasto: 213.02, leads: 12, calientes: 5, ventas: 0 },
  ],
  hoy: { leads: 0, calientes: 0, sinAtender: 34, porDecidir: 3 },
  enVivo: [{ cuando: '2026-11-14T04:58:09.075+00:00', tipo: 'lead', titulo: 'Lead nuevo', detalle: 'x' }],
  agentes: [{ nombre: 'Creativo', ultima: '2026-11-12T13:07:36.416576+00:00' }],
};

describe('fechaLocal', () => {
  it('lee la fecha sin correrla un día por la zona horaria', () => {
    const d = new Date(fechaLocal('2026-11-14'));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 14]);
  });
});

describe('normalizarPublicidad', () => {
  it('conserva el gasto desconocido como null, no como 0', () => {
    const d = normalizarPublicidad(REAL);
    expect(d.anuncios[0].gasto).toBeNull();
    expect(d.anuncios[1].gasto).toBe(528.03);
    expect(Number.isFinite(d.enVivo[0].cuando)).toBe(true);
  });
});

describe('resumenPublicidad', () => {
  it('calcula el costo por lead solo con los anuncios de gasto conocido', () => {
    const r = resumenPublicidad(normalizarPublicidad(REAL));
    expect(r.leadsConGasto).toBe(83);
    expect(r.leadsExternos).toBe(131);
    expect(r.costoPorLead).toBeCloseTo(741.05 / 83, 5);
  });

  it('la venta de un anuncio externo no abarata el costo por venta', () => {
    const r = resumenPublicidad(normalizarPublicidad(REAL));
    expect(r.costoPorVenta).toBeNull();
  });
});

describe('cargarPublicidad', () => {
  it('sin Supabase o sin la función instalada avisa que no está conectado', async () => {
    expect(await cargarPublicidad('firestore', {})).toEqual({ sinConectar: true });
    const store = {
      publicidad: async () => {
        throw Object.assign(new Error('no existe'), { sinInstalar: true });
      },
    };
    expect(await cargarPublicidad('supabase', store)).toEqual({ sinConectar: true });
  });

  it('propaga los demás errores (p. ej. no ser administrador)', async () => {
    const store = {
      publicidad: async () => {
        throw new Error('Solo el administrador puede ver la publicidad.');
      },
    };
    await expect(cargarPublicidad('supabase', store)).rejects.toThrow(/administrador/);
  });

  it('con Supabase devuelve los datos normalizados', async () => {
    const r = await cargarPublicidad('supabase', { publicidad: async () => REAL });
    expect(r.datos.leads).toBe(325);
    expect(r.datos.esDemo).toBe(false);
  });

  it('en demo el gasto por día suma (casi) el total y viene marcado como demo', async () => {
    const { datos } = await cargarPublicidad('demo');
    expect(datos.esDemo).toBe(true);
    const suma = datos.gastoPorDia.reduce((a, x) => a + x.monto, 0);
    expect(Math.abs(suma - datos.gastoAnuncios)).toBeLessThan(30);
  });
});

describe('hace', () => {
  it('redacta minutos, horas y días', () => {
    const t = 1_000_000_000_000;
    expect(hace(t - 5 * 60_000, t)).toBe('hace 5 min');
    expect(hace(t - 3 * 3_600_000, t)).toBe('hace 3 h');
    expect(hace(t - 48 * 3_600_000, t)).toBe('hace 2 días');
  });
});

describe('AUDITORIA', () => {
  it('el plan va en el orden recomendado A, B, D, C, E', () => {
    expect(AUDITORIA.plan.map((p) => p.fase).join('')).toBe('ABDCE');
  });
});
