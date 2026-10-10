import { describe, it, expect } from 'vitest';
import {
  ESTADOS_DISPONIBILIDAD,
  ESTADO_DEFAULT,
  conteoPorEstado,
  estadoDe,
  infoEstado,
  registroDe,
} from './disponibilidad.js';

describe('disponibilidad de motos', () => {
  it('tiene exactamente los tres estados, en orden verde, amarillo, rojo', () => {
    expect(ESTADOS_DISPONIBILIDAD.map((e) => e.label)).toEqual([
      'Disponible',
      'Bajo pedido',
      'No disponible',
    ]);
  });

  it('una moto sin registro se considera disponible', () => {
    expect(ESTADO_DEFAULT).toBe('disponible');
    expect(estadoDe({}, 'U2')).toBe('disponible');
    expect(estadoDe(undefined, 'U2')).toBe('disponible');
  });

  it('usa el estado guardado e ignora uno inválido', () => {
    const disp = { U2: { estado: 'bajo_pedido' }, U5: { estado: 'agotada' } };
    expect(estadoDe(disp, 'U2')).toBe('bajo_pedido');
    expect(estadoDe(disp, 'U5')).toBe('disponible');
    expect(registroDe(disp, 'U5')).toBeNull();
    expect(infoEstado('agotada').id).toBe('disponible');
  });

  it('cuenta las motos por estado', () => {
    const modelos = [{ nombre: 'A' }, { nombre: 'B' }, { nombre: 'C' }, { nombre: 'D' }];
    const disp = { B: { estado: 'bajo_pedido' }, C: { estado: 'no_disponible' }, D: { estado: 'no_disponible' } };
    expect(conteoPorEstado(modelos, disp)).toEqual({
      disponible: 1,
      bajo_pedido: 1,
      no_disponible: 2,
    });
  });
});
