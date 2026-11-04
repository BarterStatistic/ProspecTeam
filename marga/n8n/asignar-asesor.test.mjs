import { describe, expect, test } from 'vitest';
import { asignarAsesor } from './asignar-asesor.mjs';

// Lunes = 2026-11-02, sábado = 2026-11-07, domingo = 2026-11-08 (hora de Saltillo, UTC-6).
const ts = (iso) => Date.parse(iso) / 1000;
const LUN = '2026-11-02';
const SAB = '2026-11-07';
const DOM = '2026-11-08';
const a = (dia, hora, conv = 2) => asignarAsesor(ts(`${dia}T${hora}-06:00`), conv);

describe('asignarAsesor', () => {
  test('lunes 10:00 es de Alejandro', () => {
    expect(a(LUN, '10:00:00')).toMatchObject({ asesor: 'alejandro', fueraDeHorario: false });
  });

  test('lunes 9:00 es de Alejandro y 15:59 también', () => {
    expect(a(LUN, '09:00:00')).toMatchObject({ asesor: 'alejandro', fueraDeHorario: false });
    expect(a(LUN, '15:59:00')).toMatchObject({ asesor: 'alejandro', fueraDeHorario: false });
  });

  test('lunes 16:00 es de Emmanuel y 21:59 también', () => {
    expect(a(LUN, '16:00:00')).toMatchObject({ asesor: 'emmanuel', fueraDeHorario: false });
    expect(a(LUN, '21:59:00')).toMatchObject({ asesor: 'emmanuel', fueraDeHorario: false });
  });

  test('sábado todo el día es de Emmanuel', () => {
    expect(a(SAB, '10:00:00')).toMatchObject({ asesor: 'emmanuel', fueraDeHorario: false });
    expect(a(SAB, '18:00:00')).toMatchObject({ asesor: 'emmanuel', fueraDeHorario: false });
  });

  test('domingo todo el día es de Alejandro', () => {
    expect(a(DOM, '10:00:00')).toMatchObject({ asesor: 'alejandro', fueraDeHorario: false });
    expect(a(DOM, '18:00:00')).toMatchObject({ asesor: 'alejandro', fueraDeHorario: false });
  });

  test('fuera de horario entre semana se reparte por paridad', () => {
    expect(a(LUN, '22:00:00', 2)).toMatchObject({ asesor: 'alejandro', fueraDeHorario: true });
    expect(a(LUN, '22:00:00', 3)).toMatchObject({ asesor: 'emmanuel', fueraDeHorario: true });
    expect(a(LUN, '08:59:00', 4)).toMatchObject({ asesor: 'alejandro', fueraDeHorario: true });
    expect(a(LUN, '08:59:00', 5)).toMatchObject({ asesor: 'emmanuel', fueraDeHorario: true });
  });

  test('fuera de horario no se asigna al que descansa', () => {
    expect(a(SAB, '23:00:00', 2).asesor).toBe('emmanuel');
    expect(a(DOM, '23:00:00', 3).asesor).toBe('alejandro');
  });

  test('usa la hora de Saltillo, no la del servidor', () => {
    expect(asignarAsesor(ts('2026-11-02T22:00:00Z'), 2)).toMatchObject({
      asesor: 'emmanuel',
      fueraDeHorario: false,
    });
  });

  test('devuelve el username de Marga', () => {
    expect(a(LUN, '10:00:00').username).toBe('Alejandro Acosta');
    expect(a(LUN, '16:00:00').username).toBe('Emmanuel Bernal');
  });
});
