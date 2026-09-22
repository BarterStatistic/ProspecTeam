import { describe, it, expect } from 'vitest';
import {
  startOfThisWeek,
  endOfThisWeek,
  rangoPagos,
  cotizacionStats,
  presentSellers,
} from './analytics.js';

const at = (y, m, d) => new Date(y, m - 1, d).getTime();

describe('startOfThisWeek', () => {
  it('devuelve el lunes de la semana en curso', () => {
    // Domingo 20 de septiembre de 2026 pertenece a la semana del lunes 14.
    expect(startOfThisWeek(at(2026, 9, 20))).toBe(at(2026, 9, 14));
    // Lunes 21 es su propio inicio de semana.
    expect(startOfThisWeek(at(2026, 9, 21))).toBe(at(2026, 9, 21));
    // Miércoles 23 sigue perteneciendo a la semana del 21.
    expect(startOfThisWeek(at(2026, 9, 23))).toBe(at(2026, 9, 21));
  });

  it('ignora la hora del día', () => {
    expect(startOfThisWeek(new Date(2026, 8, 23, 19, 45).getTime())).toBe(at(2026, 9, 21));
  });
});

describe('cotizacionStats', () => {
  const cotizaciones = [
    { id: 'a', createdBy: 'Alejandro Acosta', createdAt: at(2026, 9, 21) },
    { id: 'b', createdBy: 'Alejandro Acosta', createdAt: at(2026, 9, 22) },
    { id: 'c', createdBy: 'Emmanuel Bernal', createdAt: at(2026, 9, 22) },
    { id: 'd', createdBy: 'Emmanuel Bernal', createdAt: at(2026, 8, 10) },
  ];

  it('cuenta por vendedor dentro del rango', () => {
    const r = cotizacionStats(cotizaciones, at(2026, 9, 21), at(2026, 9, 27), []);
    expect(r.get('Alejandro Acosta')).toBe(2);
    expect(r.get('Emmanuel Bernal')).toBe(1);
  });

  it('respeta la lista de vendedores seleccionados', () => {
    const r = cotizacionStats(cotizaciones, at(2026, 9, 21), at(2026, 9, 27), [
      'Emmanuel Bernal',
    ]);
    expect(r.get('Alejandro Acosta')).toBeUndefined();
    expect(r.get('Emmanuel Bernal')).toBe(1);
  });
});

describe('presentSellers', () => {
  const clients = [
    { createdBy: 'Alejandro Acosta' },
    { createdBy: '' },
    { createdBy: 'Emmanuel Bernal' },
  ];

  it('incluye el bucket sin asignar por defecto', () => {
    expect(presentSellers(clients, [])).toContain('__unassigned__');
  });

  it('lo omite cuando se le pide', () => {
    expect(presentSellers(clients, [], { incluirSinAsignar: false })).not.toContain(
      '__unassigned__',
    );
  });
});

describe('endOfThisWeek', () => {
  it('devuelve el domingo (00:00) de la semana en curso', () => {
    expect(endOfThisWeek(at(2026, 9, 21))).toBe(at(2026, 9, 27)); // lunes → domingo 27
    expect(endOfThisWeek(at(2026, 9, 24))).toBe(at(2026, 9, 27)); // jueves
    expect(endOfThisWeek(at(2026, 9, 27))).toBe(at(2026, 9, 27)); // el propio domingo
  });

  it('cruza el fin de mes y de año', () => {
    expect(endOfThisWeek(at(2026, 9, 30))).toBe(at(2026, 10, 4));
    expect(endOfThisWeek(new Date(2026, 11, 30, 18, 0).getTime())).toBe(at(2027, 1, 3));
  });
});

describe('rangoPagos', () => {
  const DAY = 86_400_000;

  it('incluye completo el día final elegido', () => {
    expect(rangoPagos(at(2026, 9, 21), at(2026, 9, 27))).toEqual({
      from: at(2026, 9, 21),
      to: at(2026, 9, 27) + DAY - 1,
    });
  });

  it('sin fecha final no corta en hoy: los pagos futuros cuentan', () => {
    const { from, to } = rangoPagos(at(2026, 9, 21), null);
    expect(from).toBe(at(2026, 9, 21));
    expect(to).toBeNull();
  });

  it('sin fecha inicial no pone límite inferior', () => {
    expect(rangoPagos(null, null)).toEqual({ from: null, to: null });
  });
});
