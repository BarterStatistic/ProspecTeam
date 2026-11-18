import { describe, it, expect } from 'vitest';
import {
  contarCitasDeHoy,
  confirmacionDe,
  asistenciaDe,
  patchConfirmacion,
  patchAsistencia,
  esDeAlex,
  CONFIRMACION,
  ASISTENCIA,
} from './citas.js';

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

describe('confirmacionDe / asistenciaDe', () => {
  it('una cita vieja sin campos nuevos queda pendiente', () => {
    expect(confirmacionDe({})).toBe('pendiente');
    expect(asistenciaDe({})).toBe('pendiente');
    expect(confirmacionDe(undefined)).toBe('pendiente');
  });

  it('una cita vieja atendida cuenta como asistió', () => {
    expect(asistenciaDe({ atendida: true })).toBe('asistio');
  });

  it('la marca vieja noAsistio cuenta como no asistió, salvo que ya haya asistencia', () => {
    expect(asistenciaDe({ noAsistio: true })).toBe('no_asistio');
    expect(asistenciaDe({ noAsistio: true, asistencia: 'pendiente' })).toBe('pendiente');
  });

  it('respeta los valores guardados y ignora los desconocidos', () => {
    expect(confirmacionDe({ confirmacion: 'confirmada' })).toBe('confirmada');
    expect(confirmacionDe({ confirmacion: 'rara' })).toBe('pendiente');
    expect(asistenciaDe({ asistencia: 'no_asistio' })).toBe('no_asistio');
    expect(asistenciaDe({ asistencia: 'rara', atendida: false })).toBe('pendiente');
  });

  it('expone las etiquetas en español', () => {
    expect(CONFIRMACION.no_confirmada.label).toBe('No confirmada');
    expect(ASISTENCIA.asistio.label).toBe('Asistió');
  });
});

describe('patchConfirmacion', () => {
  it('guarda el valor válido', () => {
    expect(patchConfirmacion('confirmada')).toEqual({ confirmacion: 'confirmada' });
  });
  it('rechaza un valor desconocido', () => {
    expect(() => patchConfirmacion('x')).toThrow();
  });
});

describe('patchAsistencia', () => {
  it('asistió marca atendida con nota y fecha', () => {
    expect(patchAsistencia('asistio', 'ok', 100)).toEqual({
      asistencia: 'asistio',
      atendida: true,
      notaAtencion: 'ok',
      fechaAtencion: 100,
    });
  });
  it('no asistió deja atendida en falso pero guarda cuándo se registró', () => {
    expect(patchAsistencia('no_asistio', '', 100)).toEqual({
      asistencia: 'no_asistio',
      atendida: false,
      notaAtencion: '',
      fechaAtencion: 100,
    });
  });
  it('pendiente limpia nota y fecha', () => {
    expect(patchAsistencia('pendiente', 'x', 100)).toEqual({
      asistencia: 'pendiente',
      atendida: false,
      notaAtencion: '',
      fechaAtencion: null,
    });
  });
  it('rechaza un valor desconocido', () => {
    expect(() => patchAsistencia('x', '', 1)).toThrow();
  });
});

describe('esDeAlex', () => {
  it('solo las citas con origen alex', () => {
    expect(esDeAlex({ origen: 'alex' })).toBe(true);
    expect(esDeAlex({})).toBe(false);
    expect(esDeAlex(null)).toBe(false);
  });
});
