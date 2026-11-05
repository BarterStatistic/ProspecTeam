import { describe, expect, it } from 'vitest';
import { estadoEnVivo, maquinasVivas, proximaLectura, resumen } from './dinamo.js';

const AHORA = Date.parse('2026-11-05T18:00:00Z');
const hace = (min) => new Date(AHORA - min * 60000).toISOString();

describe('dinamo', () => {
  it('resumen: prioridad rechazado > autorizado > corrección > proceso', () => {
    const etapas = (o) => ({ etapas: { Captura: { icono: 'ok' }, DOC: { icono: 'ok' }, ...o } });
    expect(resumen(etapas({ BNC: { icono: 'p' } })).estado).toBe('proceso');
    expect(resumen(etapas({ BNC: { icono: 'na' } })).estado).toBe('correccion');
    expect(resumen(etapas({ BNC: { icono: 'cancelado' } })).estado).toBe('rechazado');
  });

  it('solo cuentan las máquinas activas con latido reciente', () => {
    const panel = {
      agentes: [
        { activo: true, ultimo_latido: hace(1) },
        { activo: true, ultimo_latido: hace(10) },
        { activo: false, ultimo_latido: hace(1) },
      ],
    };
    expect(maquinasVivas(panel, AHORA)).toHaveLength(1);
  });

  it('estado en vivo', () => {
    const agentes = [{ activo: true, ultimo_latido: hace(1) }, { activo: true, ultimo_latido: hace(0) }];
    expect(estadoEnVivo(null, AHORA).tono).toBe('apagado');
    expect(estadoEnVivo({ estado: { ultima_sync: hace(5) }, agentes }, AHORA).texto).toBe('En vivo · hace 5 min · 2 máquinas');
    expect(estadoEnVivo({ estado: { solicitud_desde: hace(0) }, agentes }, AHORA).tono).toBe('leyendo');
    expect(estadoEnVivo({ estado: { tipo_error: 'login', ultimo_error: 'x' }, agentes }, AHORA).texto).toMatch(/contraseña/);
    expect(estadoEnVivo({ estado: { ultima_sync: hace(5) }, agentes: [] }, AHORA).tono).toBe('apagado');
  });

  it('próxima lectura = última + intervalo', () => {
    expect(proximaLectura({ ultima_sync: hace(10), intervalo_min: 30 })).toBe(hace(-20));
    expect(proximaLectura({})).toBeNull();
  });
});
