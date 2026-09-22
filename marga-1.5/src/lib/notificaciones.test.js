import { describe, it, expect } from 'vitest';
import {
  TIPOS,
  formatMXN,
  mensajeColumna,
  mensajeEntrega,
  mensajeFacturacion,
  mensajeEdicion,
} from './notificaciones.js';

describe('formatMXN', () => {
  it('formatea pesos mexicanos con dos decimales', () => {
    expect(formatMXN(1386.55)).toBe('$1,386.55');
    expect(formatMXN(0)).toBe('$0.00');
  });
});

describe('mensajes', () => {
  it('nombra la columna destino usando su etiqueta', () => {
    expect(mensajeColumna('Jose Rivera', 'ec')).toBe('Jose Rivera ya pasó a EC');
    expect(mensajeColumna('Jose Rivera', 'vfs_call_center')).toBe(
      'Jose Rivera ya pasó a VFS / Call center',
    );
  });

  it('cae al id de la columna cuando no la reconoce', () => {
    expect(mensajeColumna('Jose Rivera', 'etapa_rara')).toBe(
      'Jose Rivera ya pasó a etapa_rara',
    );
  });

  it('anuncia la entrega', () => {
    expect(mensajeEntrega('Mario Aguirre')).toBe(
      'La moto de Mario Aguirre ya ha sido entregada',
    );
  });

  it('incluye monto y fecha de pago al facturar', () => {
    const viernes = new Date(2026, 8, 25).getTime();
    expect(mensajeFacturacion('Ana López', 1386.55, viernes)).toBe(
      'Se facturó la moto de Ana López — tu comisión es $1,386.55, se paga el 25 de septiembre de 2026',
    );
  });

  it('nombra a quien editó la tarjeta', () => {
    expect(mensajeEdicion('Ana López', 'Braulio Acosta')).toBe(
      'Braulio Acosta actualizó los datos de Ana López',
    );
  });

  it('expone los cuatro tipos de evento', () => {
    expect(Object.values(TIPOS)).toEqual(['columna', 'entrega', 'facturacion', 'edicion']);
  });
});
