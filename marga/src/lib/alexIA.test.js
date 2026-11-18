import { beforeEach, describe, expect, it } from 'vitest';
import {
  normalizarAlex, trozosDeResumen, cambioSemanal, pendientes, demoAlex, reiniciarDemoAlex, cargarAlex, decidirAlex,
  efectoDeAprobar, fechaLocal,
} from './alexIA.js';

beforeEach(() => reiniciarDemoAlex());

describe('normalizarAlex', () => {
  it('da forma estable aunque falten campos', () => {
    const d = normalizarAlex({ semana: { aptos_con_documentos: '4', conversaciones: 30 }, dondeSeQuedaron: { Otro: 2, 'Pregunta de ingresos': 5 } });
    expect(d.semana.aptos).toBe(4);
    expect(d.semanaAnterior.aptos).toBe(0);
    expect(d.porDia).toEqual([]);
    expect(d.dondeSeQuedaron.map((x) => x.label)).toEqual(['Pregunta de ingresos', 'Otro']);
    expect(d.costos.medido).toBe(false);
  });

  it('no inventa datos: sin objeto regresa null', () => {
    expect(normalizarAlex(null)).toBeNull();
  });

  it('lee los costos medidos y marca los preliminares', () => {
    const d = normalizarAlex({ costos: { medido: true, preliminar: true, ia_usd_mes: '12.5', wa_usd_mes: 0, total_usd_mes: 12.5, dias_medidos: 1.2, config: [{ clave: 'x', valor: '2', nota: 'n', fuente: 'f' }] } });
    expect(d.costos).toMatchObject({ medido: true, preliminar: true, iaUsdMes: 12.5, totalUsdMes: 12.5 });
    expect(d.costos.config[0]).toEqual({ clave: 'x', valor: 2, nota: 'n', fuente: 'f' });
  });

  it('las fechas de día no se recorren por la zona horaria', () => {
    expect(new Date(fechaLocal('2026-11-16')).getDate()).toBe(16);
  });
});

describe('trozosDeResumen', () => {
  it('separa las negritas de Telegram sin dejar pasar otras etiquetas', () => {
    expect(trozosDeResumen('<b>La medida</b>: 4 <i>aptos</i><script>x</script>')).toEqual([
      { texto: 'La medida', negrita: true },
      { texto: ': 4 aptosx', negrita: false },
    ]);
  });

  it('aguanta un resumen vacío', () => {
    expect(trozosDeResumen(null)).toEqual([]);
  });
});

describe('medida y propuestas', () => {
  it('compara los aptos con documentos contra la semana anterior', () => {
    expect(cambioSemanal(normalizarAlex({ semana: { aptos_con_documentos: 7 }, semanaAnterior: { aptos_con_documentos: 4 } })).texto).toBe('+3 contra la semana anterior');
    expect(cambioSemanal(normalizarAlex({ semana: { aptos_con_documentos: 2 }, semanaAnterior: { aptos_con_documentos: 2 } })).diferencia).toBe(0);
  });

  it('pendientes son solo las que esperan decisión', () => {
    expect(pendientes(demoAlex()).map((p) => p.id)).toEqual(['7']);
    expect(pendientes(null)).toEqual([]);
  });

  it('dice qué pasa al aprobar cada tipo', () => {
    expect(efectoDeAprobar('agregar')).toMatch(/siguiente mensaje/);
    expect(efectoDeAprobar('infraestructura')).toMatch(/a mano/);
  });
});

describe('cargar y decidir', () => {
  it('en demo carga datos de ejemplo', async () => {
    const r = await cargarAlex('demo', null);
    expect(r.datos.esDemo).toBe(true);
    expect(r.datos.porDia.length).toBeGreaterThan(7);
  });

  it('sin la función en la base avisa que falta conectar', async () => {
    expect(await cargarAlex('supabase', {})).toEqual({ sinConectar: true });
    const store = { panelAlex: async () => { const e = new Error('x'); e.sinInstalar = true; throw e; } };
    expect(await cargarAlex('supabase', store)).toEqual({ sinConectar: true });
  });

  it('otro error de la base se propaga', async () => {
    await expect(cargarAlex('supabase', { panelAlex: async () => { throw new Error('Solo el administrador'); } })).rejects.toThrow('Solo el administrador');
  });

  it('una propuesta se decide una sola vez y aprobarla enciende la directiva', async () => {
    const antes = demoAlex().directivas.length;
    const r1 = await decidirAlex('demo', null, { id: '7', accion: 'aprobar' });
    expect(r1).toMatchObject({ ok: true, cambio: true, estado: 'aprobada' });
    expect(demoAlex().directivas.length).toBe(antes + 1);
    const r2 = await decidirAlex('demo', null, { id: '7', accion: 'rechazar' });
    expect(r2).toMatchObject({ ok: true, cambio: false, estado: 'aprobada' });
  });

  it('rechaza decisiones mal formadas sin tocar la base', async () => {
    let llamadas = 0;
    const store = { decidirAlex: async () => { llamadas += 1; return { ok: true }; } };
    expect((await decidirAlex('supabase', store, { id: '7', accion: 'borrar' })).ok).toBe(false);
    expect((await decidirAlex('supabase', store, { id: '7; drop', accion: 'aprobar' })).ok).toBe(false);
    expect(llamadas).toBe(0);
    expect(await decidirAlex('supabase', store, { id: '7', accion: 'aprobar' })).toEqual({ ok: true });
  });

  it('un fallo de red llega como error legible', async () => {
    const store = { decidirAlex: async () => { throw new Error('sin conexión'); } };
    expect(await decidirAlex('supabase', store, { id: 1, accion: 'aprobar' })).toEqual({ ok: false, error: 'sin conexión' });
  });
});
