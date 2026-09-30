import { describe, it, expect } from 'vitest';
import {
  fechaVale,
  horaVale,
  indicacionVale,
  datosVale,
  nombreArchivoVale,
} from './valeCita.js';
import { folioCita } from './citas.js';
import { ATIENDE_CITAS } from './constants.js';

const cita = {
  id: '3f2a9c1e-77aa-4b1c-9d0e-123456789abc',
  clientName: 'José Pérez',
  phone: '844 111 2233',
  motorcycle: 'DNM 2.5',
  fechaCita: new Date(2026, 9, 2, 11, 30).getTime(),
  hasTime: true,
  createdBy: 'Alejandro Acosta',
};

describe('vale de cita', () => {
  it('lo atiende Braulio Acosta y la indicación lo nombra', () => {
    expect(ATIENDE_CITAS).toBe('Braulio Acosta');
    expect(indicacionVale()).toBe(
      'Al llegar a la agencia muestra este vale y pregunta por Braulio Acosta para ser atendido.',
    );
  });

  it('fecha larga con mayúscula y hora solo si la cita la tiene', () => {
    expect(fechaVale(cita.fechaCita)).toBe('Viernes, 2 de octubre de 2026');
    expect(horaVale(cita)).toMatch(/11:30/);
    expect(horaVale({ ...cita, hasTime: false })).toBe('Hora por confirmar');
  });

  it('lleva los datos del cliente y omite la moto si no hay', () => {
    expect(datosVale(cita)).toEqual([
      ['Cliente', 'José Pérez'],
      ['Teléfono', '844 111 2233'],
      ['Moto de interés', 'DNM 2.5'],
    ]);
    expect(datosVale({ ...cita, motorcycle: '' }).map(([l]) => l)).toEqual(['Cliente', 'Teléfono']);
  });

  it('folio corto y nombre de archivo sin acentos', () => {
    expect(folioCita(cita)).toBe('3F2A9C1E');
    expect(folioCita({})).toBe('SIN-FOLIO');
    expect(nombreArchivoVale(cita)).toBe('vale-cita-jose-perez-3f2a9c1e.jpg');
  });
});
