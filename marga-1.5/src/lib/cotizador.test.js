import { describe, it, expect } from 'vitest';
import {
  precioEfectivo,
  nivelPara,
  plazoMaximo,
  parcialidad,
  calcularFinanciamiento,
} from './cotizador.js';
import { motoPorNombre } from './motos.js';

describe('precioEfectivo', () => {
  it('usa el precio de lista cuando no se incluye servicio', () => {
    expect(precioEfectivo(motoPorNombre('U2'), false)).toBe(21945);
  });

  it('suma el servicio preventivo cuando se incluye', () => {
    expect(precioEfectivo(motoPorNombre('U2'), true)).toBe(24232);
  });
});

describe('nivelPara', () => {
  it('separa las bandas de enganche de motonómina en 24.99 / 25', () => {
    expect(nivelPara('motonomina', 24.99).m[72]).toBe(0.040495);
    expect(nivelPara('motonomina', 25).m[72]).toBe(0.040493);
    expect(nivelPara('motonomina', 30).m[72]).toBe(0.035218);
  });

  it('rechaza un enganche por debajo del mínimo del esquema', () => {
    // Motonómina exige 5% aunque su primer nivel arranque en 0.
    expect(() => nivelPara('motonomina', 3)).toThrow(RangeError);
  });

  it('rechaza un enganche por encima del máximo del esquema', () => {
    expect(() => nivelPara('motonomina', 80)).toThrow(RangeError);
  });
});

describe('plazoMaximo', () => {
  it('devuelve el último plazo de cada esquema', () => {
    expect(plazoMaximo('motonomina')).toBe(72);
    expect(plazoMaximo('motoxpress')).toBe(72);
    expect(plazoMaximo('credinamo_flex')).toBe(170);
  });
});

describe('parcialidad', () => {
  it('calcula el pago a un plazo intermedio', () => {
    // U2 con 5% enganche en motonomina: 21945 - 1097.25 = 20847.75 a crédito
    // plazo 24: factor 0.060494
    // pago = 20847.75 * 0.060494
    const pago = parcialidad({
      esquemaId: 'motonomina',
      montoACredito: 20847.75,
      enganchePct: 5,
      plazo: 24,
    });
    expect(pago).toBeCloseTo(20847.75 * 0.060494, 4);
  });

  it('lanza RangeError si el plazo no existe en el esquema', () => {
    expect(() =>
      parcialidad({
        esquemaId: 'motonomina',
        montoACredito: 20000,
        enganchePct: 5,
        plazo: 99,
      }),
    ).toThrow(RangeError);
  });
});

describe('calcularFinanciamiento', () => {
  it('calcula la parcialidad más baja y el monto financiado de una U2 sin servicio', () => {
    const r = calcularFinanciamiento({
      motoNombre: 'U2',
      incluyeServicio: false,
      esquemaId: 'motonomina',
      enganche: 1097.25, // 5% de 21945
    });
    expect(r.precioEfectivo).toBe(21945);
    expect(r.enganchePct).toBeCloseTo(5, 6);
    expect(r.plazoMax).toBe(72);
    expect(r.factor).toBe(0.040495);
    expect(r.parcialidad).toBeCloseTo(844.2296, 3);
    expect(r.montoFinanciado).toBeCloseTo(60784.53, 2);
  });

  it('sube el monto financiado cuando se incluye el servicio preventivo', () => {
    const r = calcularFinanciamiento({
      motoNombre: 'U2',
      incluyeServicio: true,
      esquemaId: 'motonomina',
      enganche: 1211.6, // 5% de 24232
    });
    expect(r.precioEfectivo).toBe(24232);
    expect(r.montoFinanciado).toBeCloseTo(67119.2, 1);
  });

  it('usa el plazo de 72 quincenas en motoxpress', () => {
    const r = calcularFinanciamiento({
      motoNombre: 'U2',
      incluyeServicio: false,
      esquemaId: 'motoxpress',
      enganche: 3291.75, // 15% de 21945
    });
    expect(r.plazoMax).toBe(72);
    expect(r.factor).toBe(0.047874);
    expect(r.montoFinanciado).toBeCloseTo(18653.25 * 0.047874 * 72, 4);
  });

  it('usa el plazo de 170 semanas en los esquemas flex', () => {
    const r = calcularFinanciamiento({
      motoNombre: 'RENEGADA 250',
      incluyeServicio: false,
      esquemaId: 'credinamo_flex',
      enganche: 5165, // 10% de 51650
    });
    expect(r.plazoMax).toBe(170);
    expect(r.factor).toBe(0.018290);
  });

  it('rechaza un enganche fuera del rango del esquema', () => {
    expect(() =>
      calcularFinanciamiento({
        motoNombre: 'U2',
        incluyeServicio: false,
        esquemaId: 'motonomina',
        enganche: 400, // ~1.8%, por debajo del 5% mínimo
      }),
    ).toThrow(RangeError);
  });

  it('rechaza un modelo que no está en el catálogo', () => {
    expect(() =>
      calcularFinanciamiento({
        motoNombre: 'MOTO INVENTADA',
        incluyeServicio: false,
        esquemaId: 'motonomina',
        enganche: 5000,
      }),
    ).toThrow(/no está en el catálogo/);
  });

  it('rechaza un esquema desconocido', () => {
    expect(() =>
      calcularFinanciamiento({
        motoNombre: 'U2',
        incluyeServicio: false,
        esquemaId: 'plan_raro',
        enganche: 5000,
      }),
    ).toThrow(/esquema/i);
  });
});
