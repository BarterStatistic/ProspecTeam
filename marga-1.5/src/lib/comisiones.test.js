import { describe, it, expect } from 'vitest';
import {
  CONFIG_DEFAULT,
  PROMOTOR_DEFAULT,
  tasaPara,
  nivelRacha,
  porcentajeRacha,
  calcularComision,
  mesVenta,
  fechaPago,
} from './comisiones.js';

const at = (y, m, d) => new Date(y, m - 1, d).getTime();

describe('tasaPara', () => {
  it('usa 3% en los esquemas motoxpress', () => {
    expect(tasaPara('motoxpress')).toBe(0.03);
    expect(tasaPara('motoxpress_flex')).toBe(0.03);
  });

  it('usa 4% en cualquier otro esquema', () => {
    expect(tasaPara('motonomina')).toBe(0.04);
    expect(tasaPara('credinamo')).toBe(0.04);
    expect(tasaPara('motonomina_flex')).toBe(0.04);
    expect(tasaPara('credinamo_flex')).toBe(0.04);
    expect(tasaPara('enganche50')).toBe(0.04);
  });
});

describe('racha', () => {
  it('sube un nivel por venta hasta el quinto', () => {
    expect(porcentajeRacha(1)).toBe(0.15);
    expect(porcentajeRacha(2)).toBe(0.2);
    expect(porcentajeRacha(3)).toBe(0.25);
    expect(porcentajeRacha(4)).toBe(0.3);
    expect(porcentajeRacha(5)).toBe(0.35);
  });

  it('se queda en el nivel 5 a partir de la sexta venta', () => {
    expect(nivelRacha(6)).toBe(5);
    expect(nivelRacha(12)).toBe(5);
    expect(porcentajeRacha(6)).toBe(0.35);
  });
});

describe('calcularComision', () => {
  it('descuenta el 4.25% del monto financiado antes de aplicar la tasa', () => {
    const r = calcularComision({
      montoFinanciado: 61865,
      esquemaId: 'motonomina',
      numeroVenta: 1,
      tienePromotor: false,
    });
    expect(r.tasa).toBe(0.04);
    expect(r.comisionTotal).toBeCloseTo(2369.4295, 4);
    expect(r.comisionVendedor).toBeCloseTo(355.4144, 4);
  });

  it('sin promotor asignado no descuenta comisión de promotor', () => {
    const r = calcularComision({
      montoFinanciado: 61865,
      esquemaId: 'motonomina',
      numeroVenta: 1,
      tienePromotor: false,
    });
    expect(r.comisionPromotor).toBe(0);
    expect(r.netoAdmin).toBeCloseTo(2014.0151, 4);
  });

  it('con promotor asignado descuenta el 10% de la comisión total', () => {
    const r = calcularComision({
      montoFinanciado: 61865,
      esquemaId: 'motonomina',
      numeroVenta: 1,
      tienePromotor: true,
    });
    expect(r.comisionPromotor).toBeCloseTo(236.943, 3);
    expect(r.netoAdmin).toBeCloseTo(1777.0721, 4);
  });

  it('aplica el 3% en motoxpress', () => {
    const r = calcularComision({
      montoFinanciado: 100000,
      esquemaId: 'motoxpress',
      numeroVenta: 1,
      tienePromotor: false,
    });
    expect(r.comisionTotal).toBeCloseTo(100000 * 0.9575 * 0.03, 6);
  });

  it('el total de las tres partes siempre cuadra con la comisión total', () => {
    const r = calcularComision({
      montoFinanciado: 173428,
      esquemaId: 'credinamo',
      numeroVenta: 4,
      tienePromotor: true,
    });
    expect(r.comisionVendedor + r.comisionPromotor + r.netoAdmin).toBeCloseTo(
      r.comisionTotal,
      6,
    );
  });

  it('expone el promotor por defecto que usa la interfaz', () => {
    expect(PROMOTOR_DEFAULT).toBe('Braulio Acosta');
  });
});

describe('mesVenta', () => {
  it('con diaInicioMes 1 coincide con el mes natural', () => {
    expect(mesVenta(at(2026, 9, 20), CONFIG_DEFAULT)).toBe('2026-09');
    expect(mesVenta(at(2026, 9, 1), CONFIG_DEFAULT)).toBe('2026-09');
    expect(mesVenta(at(2026, 8, 31), CONFIG_DEFAULT)).toBe('2026-08');
  });

  it('con diaInicioMes 26 corre la frontera del periodo', () => {
    const config = { ...CONFIG_DEFAULT, diaInicioMes: 26 };
    expect(mesVenta(at(2026, 9, 20), config)).toBe('2026-08');
    expect(mesVenta(at(2026, 9, 26), config)).toBe('2026-09');
    expect(mesVenta(at(2026, 9, 25), config)).toBe('2026-08');
  });

  it('cruza el fin de año correctamente', () => {
    const config = { ...CONFIG_DEFAULT, diaInicioMes: 26 };
    expect(mesVenta(at(2027, 1, 10), config)).toBe('2026-12');
  });
});

describe('fechaPago', () => {
  // Septiembre 2026: el 21 es lunes, el 25 viernes; el 2 de octubre es viernes.
  it('paga el mismo viernes cuando se factura el lunes (día de corte)', () => {
    expect(fechaPago(at(2026, 9, 21), CONFIG_DEFAULT)).toBe(at(2026, 9, 25));
  });

  it('recorre a la semana siguiente cuando se factura después del corte', () => {
    expect(fechaPago(at(2026, 9, 22), CONFIG_DEFAULT)).toBe(at(2026, 10, 2));
    expect(fechaPago(at(2026, 9, 27), CONFIG_DEFAULT)).toBe(at(2026, 10, 2));
  });

  it('ignora la hora del día de facturación', () => {
    const tarde = new Date(2026, 8, 21, 23, 45).getTime();
    expect(fechaPago(tarde, CONFIG_DEFAULT)).toBe(at(2026, 9, 25));
  });

  it('corre el pago una semana cuando el día de pago no va después del corte', () => {
    const config = { ...CONFIG_DEFAULT, diaCorte: 4, diaPago: 2 }; // corte jueves, pago martes
    // Miércoles 23 (antes del corte del jueves) → martes de la semana siguiente.
    expect(fechaPago(at(2026, 9, 23), config)).toBe(at(2026, 9, 29));
  });

  it('una excepción que cubra la fecha gana sobre la regla base', () => {
    const config = {
      ...CONFIG_DEFAULT,
      excepciones: [
        {
          id: 'e1',
          desde: at(2026, 9, 21),
          hasta: at(2026, 9, 27),
          fechaPago: at(2026, 9, 30),
          nota: 'Corte especial de cierre de mes',
        },
      ],
    };
    expect(fechaPago(at(2026, 9, 22), config)).toBe(at(2026, 9, 30));
    // Fuera del rango de la excepción, vuelve la regla base: el 28 es lunes
    // (día de corte), así que se paga el viernes de esa misma semana.
    expect(fechaPago(at(2026, 9, 28), config)).toBe(at(2026, 10, 2));
  });

  it('la excepción cubre todo el día de `hasta`, sin importar la hora', () => {
    const config = {
      ...CONFIG_DEFAULT,
      excepciones: [
        { id: 'e1', desde: at(2026, 9, 21), hasta: at(2026, 9, 27), fechaPago: at(2026, 9, 30) },
      ],
    };
    const domingoTarde = new Date(2026, 8, 27, 22, 0).getTime();
    expect(fechaPago(domingoTarde, config)).toBe(at(2026, 9, 30));
  });

  it('aplica los dos corrimientos cuando ambos se cumplen a la vez', () => {
    const config = { ...CONFIG_DEFAULT, diaCorte: 3, diaPago: 1 }; // corte miércoles, pago lunes
    // Jueves 24: cae después del corte (+1 semana) y el pago no va después del
    // corte (+1 semana más) → lunes 5 de octubre, dos semanas adelante.
    expect(fechaPago(at(2026, 9, 24), config)).toBe(at(2026, 10, 5));
  });
});
