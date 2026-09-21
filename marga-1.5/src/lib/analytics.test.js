import { describe, it, expect } from 'vitest';
import { startOfThisWeek, cotizacionStats, presentSellers } from './analytics.js';

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
