import { describe, it, expect } from 'vitest';
import { contarCitasDeHoy } from './citas.js';

const t = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('contarCitasDeHoy', () => {
  const ahora = t(2026, 9, 30, 12);

  it('cuenta solo las citas cuya fecha es hoy, atendidas o no', () => {
    const citas = [
      { fechaCita: t(2026, 9, 30, 0, 0) },
      { fechaCita: t(2026, 9, 30, 10), atendida: true },
      { fechaCita: t(2026, 9, 30, 23, 59) },
      { fechaCita: t(2026, 9, 29, 23, 59) },
      { fechaCita: t(2026, 10, 1, 0, 0) },
      { fechaCita: null },
    ];
    expect(contarCitasDeHoy(citas, ahora)).toBe(3);
  });

  it('sin citas es 0', () => {
    expect(contarCitasDeHoy([], ahora)).toBe(0);
    expect(contarCitasDeHoy(undefined, ahora)).toBe(0);
  });
});
