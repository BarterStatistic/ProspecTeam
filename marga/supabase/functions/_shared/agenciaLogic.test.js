import { describe, it, expect } from 'vitest';
import {
  armarLlamada, cuandoAMs, desdeTexto, estadoDe, normalizarCuando, resultado, sigueSinDecidir, validarPedido, yaDecidida,
} from './agenciaLogic.js';

const TK = '0d0f1f3b-ba6c-4f4e-a755-ad4d70dc7136';
const AHORA = Date.UTC(2026, 10, 15, 18, 0); // 15-nov 12:00 pm Monterrey

describe('validarPedido', () => {
  it('acepta lo de cada tipo y rechaza tipos, acciones e ids raros', () => {
    expect(validarPedido({ tipo: 'idea', id: '161', accion: 'autorizar' }).pedido).toEqual({ tipo: 'idea', accion: 'autorizar', id: '161' });
    expect(validarPedido({ tipo: 'cuenta', id: 'Motos_Del.Norte', accion: 'no' }).pedido.id).toBe('motos_del.norte');
    expect(validarPedido({ tipo: 'comentario', id: '1067_55', accion: 'ignorar' }).pedido).toBeTruthy();
    expect(validarPedido({ tipo: 'marga_users', id: '1', accion: 'autorizar' }).error).toBeTruthy();
    expect(validarPedido({ tipo: 'idea', id: '1', accion: 'publicar' }).error).toBeTruthy();
    expect(validarPedido({ tipo: 'idea', id: "1; DROP", accion: 'autorizar' }).error).toBeTruthy();
    expect(validarPedido({ tipo: 'comentario', id: "1_2'", accion: 'ignorar' }).error).toBeTruthy();
    expect(validarPedido(null).error).toBeTruthy();
  });

  it('motivo solo de la lista; cambios exige texto; rechazar no', () => {
    expect(validarPedido({ tipo: 'idea', id: '1', accion: 'descartar', motivo: 'gancho' }).pedido.motivo).toBe('gancho');
    expect(validarPedido({ tipo: 'idea', id: '1', accion: 'descartar', motivo: 'feo' }).pedido.motivo).toBeUndefined();
    expect(validarPedido({ tipo: 'pieza', id: '1', accion: 'cambios', texto: '   ' }).error).toMatch(/qué cambiar/);
    expect(validarPedido({ tipo: 'pieza', id: '1', accion: 'cambios', texto: 'letra   más grande' }).pedido.texto).toBe('letra más grande');
    expect(validarPedido({ tipo: 'pieza', id: '1', accion: 'rechazar' }).pedido).toEqual({ tipo: 'pieza', accion: 'rechazar', id: '1' });
  });

  it('programar: hora de Monterrey entre 15 minutos y 30 días', () => {
    expect(validarPedido({ tipo: 'pieza', id: '1', accion: 'programar', cuando: '2026-11-15T19:00' }, AHORA).pedido.cuando).toBe('2026-11-15 19:00');
    expect(validarPedido({ tipo: 'pieza', id: '1', accion: 'programar', cuando: '2026-11-15 12:05' }, AHORA).error).toMatch(/15 minutos/);
    expect(validarPedido({ tipo: 'pieza', id: '1', accion: 'programar', cuando: '2027-01-15 12:00' }, AHORA).error).toMatch(/30 días/);
    expect(validarPedido({ tipo: 'pieza', id: '1', accion: 'programar', cuando: "mañana'" }, AHORA).error).toBeTruthy();
    expect(cuandoAMs('2026-11-15 12:00')).toBe(AHORA);
    expect(normalizarCuando('x')).toBe('');
  });
});

describe('estado y pendientes', () => {
  it('las cuentas usan activa; las piezas programadas siguen pendientes', () => {
    expect(estadoDe('cuenta', { activa: null })).toBe('pendiente');
    expect(estadoDe('cuenta', { activa: false })).toBe('descartada');
    expect(sigueSinDecidir('cuenta', { activa: null })).toBe(true);
    expect(sigueSinDecidir('pieza', { estado: 'programada' })).toBe(true);
    expect(sigueSinDecidir('idea', { estado: 'autorizada' })).toBe(false);
  });
});

describe('armarLlamada: el mismo webhook que Telegram, con origen=marga', () => {
  const B = 'https://n8n/webhook';
  it('idea y pieza van por POST a creativo-idea con versión', () => {
    const l = armarLlamada({ tipo: 'idea', accion: 'descartar', id: '5', motivo: 'moto' }, { id: 5, token: TK }, B);
    expect(l.url).toBe(`${B}/creativo-idea`);
    expect(l.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(l.body))).toEqual({ id: '5', accion: 'descartar', t: TK, motivo: 'moto', origen: 'marga' });
    const p = armarLlamada({ tipo: 'pieza', accion: 'programar', id: '7', cuando: '2026-11-15 19:00' }, { id: 7, token: TK, version: 3 }, B);
    expect(Object.fromEntries(new URLSearchParams(p.body))).toMatchObject({ v: '3', cuando: '2026-11-15 19:00', origen: 'marga' });
  });
  it('cambios y rechazar van a creativo-revision; propuesta a meta-ads-propuesta', () => {
    expect(armarLlamada({ tipo: 'pieza', accion: 'cambios', id: '7', texto: 'x' }, { id: 7, token: TK, version: 1 }, B).url).toBe(`${B}/creativo-revision`);
    expect(armarLlamada({ tipo: 'propuesta', accion: 'aprobar', id: '9' }, { id: 9, token: TK }, B).url).toBe(`${B}/meta-ads-propuesta`);
  });
  it('campaña y cuenta por GET; comentario por POST con su texto', () => {
    const c = armarLlamada({ tipo: 'campana', accion: 'crear', id: '9' }, { id: 9, token: TK }, B);
    expect(c.method).toBe('GET');
    expect(c.url).toBe(`${B}/campana-decidir?c=9&a=crear&t=${TK}&origen=marga`);
    expect(armarLlamada({ tipo: 'cuenta', accion: 'no', id: 'a.b' }, { username: 'a.b', token: TK }, B).url).toContain('investigador-cuenta?u=a.b&a=no');
    const m = armarLlamada({ tipo: 'comentario', accion: 'responder', id: '1_2', texto: 'Hola & bienvenido' }, { comment_id: '1_2', token: TK }, B);
    expect(new URLSearchParams(m.body).get('texto')).toBe('Hola & bienvenido');
    expect(m.url).toBe(`${B}/comentario-decidir`);
  });
});

describe('resultado y ya decidida', () => {
  it('cambio, sin cambio y error de Meta', () => {
    expect(resultado('idea', { estado: 'propuesta' }, { estado: 'autorizada', decidido_desde: 'marga' })).toEqual({ ok: true, cambio: true, estado: 'autorizada', desde: 'marga' });
    expect(resultado('idea', { estado: 'propuesta' }, { estado: 'propuesta' }).ok).toBe(false);
    expect(resultado('comentario', { estado: 'avisado' }, { estado: 'avisado', error: 'sin permiso' }).error).toMatch(/sin permiso/);
    expect(resultado('cuenta', { activa: null }, { activa: true, decidido_desde: 'marga' }).estado).toBe('agregada');
  });
  it('ya decidida dice desde dónde', () => {
    expect(yaDecidida('propuesta', { estado: 'aprobada', decidido_desde: 'telegram' })).toMatchObject({ cambio: false, yaDecidida: true, mensaje: 'Ya se decidió desde Telegram.' });
    expect(desdeTexto('cierre_del_dia')).toBe('el cierre del día');
  });
});
