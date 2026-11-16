import { describe, it, expect, beforeEach } from 'vitest';
import {
  antesDespues, cargarBandeja, contarPendientes, decidir, demoBandeja, normalizarBandeja, quitarDecidida, reiniciarDemo,
} from './agencia.js';

// Forma real de agencia_por_decidir() (sql/043), recortada
const REAL = {
  generado: '2026-11-15T07:10:00Z',
  ideas: [{ id: 161, tipo: 'imagen', modelo: 'R4', titulo: 'T', texto: 'x', razon: 'r', angulo: 'a', creado_en: '2026-11-15T13:00:00Z' }],
  piezas: [{ id: 158, version: 2, estado: 'en_revision', tipo: 'imagen', modelo: 'FT', titulo: 'P', texto: 'y', archivo_drive_id: 'abc', en_revision_desde: '2026-11-15T10:00:00Z' }],
  propuestas: [{ id: 61, titulo: 'Subir', detalle: 'd', involucra_dinero: true, accion_meta: { campo: 'daily_budget', antes: 15000, valor: 25000 } }],
  campanas: [{ id: 9, nombre: 'Aguinaldo', desde: '2026-12-01', hasta: '2026-12-24', mensaje_clave: 'm', piezas_meta: 3 }],
  cuentas: [{ username: 'motos', tipo: 'competencia' }],
  comentarios: [{ comment_id: '1_2', texto: '¿Precio?', clase: 'compra', respuesta: 'Hola' }],
  decididas_hoy: [{ tipo: 'propuesta', id: '60', titulo: 'x', estado: 'aprobada', desde: 'telegram', cuando: '2026-11-15T12:00:00Z' }],
};

describe('normalizarBandeja', () => {
  it('da forma estable y cuenta lo pendiente', () => {
    const b = normalizarBandeja(REAL);
    expect(b.ideas[0].id).toBe('161');
    expect(b.piezas[0]).toMatchObject({ version: 2, archivo: 'abc' });
    expect(b.propuestas[0].cambio).toEqual({ que: 'Presupuesto diario', antes: '$150/día', despues: '$250/día' });
    expect(b.cuentas[0].id).toBe('motos');
    expect(b.decididasHoy[0].desde).toBe('telegram');
    expect(contarPendientes(b)).toBe(6);
    expect(normalizarBandeja(null)).toBeNull();
    expect(normalizarBandeja({}).ideas).toEqual([]);
  });
});

describe('antesDespues', () => {
  it('presupuesto, estado y acciones avanzadas', () => {
    expect(antesDespues({ campo: 'status', valor: 'PAUSED' })).toEqual({ que: 'Estado', antes: 'el actual', despues: 'En pausa' });
    expect(antesDespues({ tipo: 'agregar_anuncio', anuncio: { nombre: 'Reel' } })).toEqual({ que: 'Agregar un anuncio', antes: null, despues: 'Reel' });
    expect(antesDespues(null)).toBeNull();
  });
});

describe('quitarDecidida', () => {
  it('la tarjeta se va y aparece en decididas hoy; programar deja la pieza', () => {
    const b = normalizarBandeja(REAL);
    const b2 = quitarDecidida(b, { tipo: 'idea', id: '161', accion: 'autorizar', ahora: 1 });
    expect(b2.ideas).toEqual([]);
    expect(b2.decididasHoy[0]).toMatchObject({ tipo: 'idea', id: '161', estado: 'autorizada', desde: 'marga' });
    expect(quitarDecidida(b, { tipo: 'pieza', id: '158', accion: 'programar' }).piezas).toHaveLength(1);
    expect(quitarDecidida(b, { tipo: 'cuenta', id: 'motos', accion: 'no' }).decididasHoy[0].titulo).toBe('@motos');
  });
});

describe('modo demo', () => {
  beforeEach(() => reiniciarDemo());
  it('decide una sola vez y el segundo toque dice desde dónde', async () => {
    const { datos } = await cargarBandeja('demo');
    const n = contarPendientes(datos);
    const id = datos.ideas[0].id;
    expect(await decidir('demo', null, { tipo: 'idea', id, accion: 'autorizar' })).toMatchObject({ ok: true, cambio: true, estado: 'autorizada' });
    expect(contarPendientes(demoBandeja())).toBe(n - 1);
    expect(await decidir('demo', null, { tipo: 'idea', id, accion: 'descartar' })).toMatchObject({ yaDecidida: true, mensaje: 'Ya se decidió desde Marga.' });
  });
  it('sin la función en la base se muestra como no conectada', async () => {
    expect(await cargarBandeja('supabase', {})).toEqual({ sinConectar: true });
    const err = Object.assign(new Error('x'), { sinInstalar: true });
    expect(await cargarBandeja('supabase', { porDecidir: () => Promise.reject(err) })).toEqual({ sinConectar: true });
    expect(await decidir('supabase', { decidirAgencia: () => Promise.reject(new Error('Ya no existe.')) }, { tipo: 'idea', id: '1', accion: 'autorizar' })).toEqual({ ok: false, error: 'Ya no existe.' });
    expect((await decidir('demo', null, { tipo: 'pieza', id: '158', accion: 'cambios', texto: ' ' })).error).toMatch(/qué cambiar/);
  });
});
