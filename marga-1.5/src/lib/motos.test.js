import { describe, it, expect } from 'vitest';
import { MODELS, SCHEMES, SCHEME_IDS, motoPorNombre, normalizarEsquema } from './motos.js';

describe('catálogo de motos', () => {
  it('trae los 37 modelos del cotizador', () => {
    expect(MODELS).toHaveLength(37);
  });

  it('guarda precio y servicio preventivo de cada modelo', () => {
    expect(motoPorNombre('U2')).toEqual({ nombre: 'U2', precio: 21945, servicio: 2287 });
    expect(motoPorNombre('RENEGADA 250')).toEqual({
      nombre: 'RENEGADA 250',
      precio: 51650,
      servicio: 2962,
    });
  });

  it('incluye los dos modelos 175 que se agregaron en septiembre', () => {
    expect(motoPorNombre('U5 175')).toEqual({ nombre: 'U5 175', precio: 27720, servicio: 2287 });
    expect(motoPorNombre('ADVENTURE ELITE 175')).toEqual({
      nombre: 'ADVENTURE ELITE 175',
      precio: 34545,
      servicio: 2250,
    });
  });

  it('devuelve null para un modelo que no existe', () => {
    expect(motoPorNombre('MOTO INVENTADA')).toBeNull();
  });
});

describe('esquemas de crédito', () => {
  it('expone los siete esquemas del cotizador', () => {
    expect(SCHEME_IDS).toEqual([
      'motonomina',
      'credinamo',
      'motoxpress',
      'enganche50',
      'motonomina_flex',
      'credinamo_flex',
      'motoxpress_flex',
    ]);
  });

  it('conserva los plazos máximos de cada esquema', () => {
    expect(SCHEMES.motonomina.terms.at(-1)).toBe(72);
    expect(SCHEMES.motoxpress.terms.at(-1)).toBe(72);
    expect(SCHEMES.enganche50.terms.at(-1)).toBe(72);
    expect(SCHEMES.motonomina_flex.terms.at(-1)).toBe(170);
    expect(SCHEMES.credinamo_flex.terms.at(-1)).toBe(170);
    expect(SCHEMES.motoxpress_flex.terms.at(-1)).toBe(170);
  });

  it('conserva los factores por nivel de enganche', () => {
    expect(SCHEMES.motonomina.levels[0].m[72]).toBe(0.040495);
    expect(SCHEMES.motonomina.levels[2].m[72]).toBe(0.035218);
    expect(SCHEMES.motoxpress.levels[0].m[72]).toBe(0.047874);
  });

  it('credinamo tiene cuatro niveles, con el tramo de 50% calibrado aparte', () => {
    expect(SCHEMES.credinamo.levels).toHaveLength(4);
    expect(SCHEMES.credinamo.levels[2].range).toEqual([30, 49.99]);
    expect(SCHEMES.credinamo.levels[3].range).toEqual([50, 75]);
    expect(SCHEMES.credinamo.levels[3].m[72]).toBe(0.040489);
  });

  it('motoxpress_flex conserva el plazo intermedio de 144 semanas', () => {
    expect(SCHEMES.motoxpress_flex.terms).toEqual([52, 65, 96, 128, 142, 144, 154, 170]);
    expect(SCHEMES.motoxpress_flex.levels[0].m[144]).toBe(0.019714);
  });

  it('marca los esquemas semanales frente a los quincenales', () => {
    expect(SCHEMES.motonomina.termUnit).toBe('quincenas');
    expect(SCHEMES.credinamo_flex.termUnit).toBe('semanas');
  });
});

describe('normalizarEsquema', () => {
  it('mapea las etiquetas viejas de Marga 1.5 a su id', () => {
    expect(normalizarEsquema('Motonómina')).toBe('motonomina');
    expect(normalizarEsquema('Credinamo')).toBe('credinamo');
    expect(normalizarEsquema('Motoxpress')).toBe('motoxpress');
  });

  it('acepta un id que ya viene normalizado', () => {
    expect(normalizarEsquema('credinamo_flex')).toBe('credinamo_flex');
  });

  it('devuelve el valor original cuando no lo reconoce', () => {
    expect(normalizarEsquema('Plan raro')).toBe('Plan raro');
    expect(normalizarEsquema('')).toBe('');
  });
});
