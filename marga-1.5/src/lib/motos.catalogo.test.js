// Snapshot del catálogo COMPLETO: los 37 modelos y los 92 factores de los 7
// esquemas. El catálogo se recopia a mano cada vez que Dinamo publica tablas;
// esta prueba fija cada número para que un typo al recopiar se detecte.
//
// Datos tomados del cotizador vigente (Cotizadores/cotizador-pt/index.html,
// vigencia 25/08/2026), no de motos.js. Cuando Dinamo publique tablas nuevas,
// hay que actualizar AMBOS lugares a propósito.
import { describe, it, expect } from 'vitest';
import { MODELS, SCHEMES, SCHEME_IDS } from './motos.js';

const MODELOS_ESPERADOS = [
  ["U2", 21945, 2287], ["KF-RACER", 21971, 2287], ["U5", 26145, 2287],
  ["U5 175", 27720, 2287], ["METRO", 31395, 2250], ["ADVENTURE ELITE", 31395, 2250],
  ["ADVENTURE ELITE 175", 34545, 2250], ["ALIEN R 175", 32445, 2250], ["ROCKY 125", 37370, 2250],
  ["SCORPION 200", 39575, 2512], ["CUSTOM 150", 38745, 2287], ["CUSTOM BLACK", 43985, 2287],
  ["RAYO 175", 42945, 2287], ["CHOPPER", 38556, 2962], ["RENEGADA 250", 51650, 2962],
  ["SCORPION XT", 41895, 2512], ["RAYO ELITE 250", 52805, 2512], ["R2 GT", 55010, 2512],
  ["SPEEDFIRE SPDF 250", 56060, 3983], ["DNM 2.5", 61520, 2636], ["R4", 55335, 2962],
  ["HEAVY-B CAB", 62895, 4725], ["XTREME RLX 200", 57645, 2250], ["CROSS COUNTRY ADV", 55246, 2512],
  ["DNM 4 400", 75905, 3814], ["GOLIAT", 78110, 2250], ["B52 250", 68145, 4133],
  ["SUPER SPORT 400", 80315, 3814], ["HEAVY CAB - R 200", 69195, 4725], ["SKELETON", 81470, 3983],
  ["DNM 3.0", 83675, 2438], ["COMANDO", 83895, 3983], ["MOTO TX", 85995, 5832],
  ["MOLOTOV C2", 81795, 2437], ["HEAVY MAX 250", 94395, 7114], ["BANDID", 83895, 4766],
  ["HEAVY CAB 300", 90195, 5832],
];

const ESQUEMAS_ESPERADOS = {
  motonomina: {
    min: 5, max: 75, termUnit: 'quincenas',
    terms: [12, 18, 24, 36, 48, 60, 72],
    levels: [
      { range: [0, 24.99], m: { 12: 0.101449, 18: 0.074421, 24: 0.060494, 36: 0.048471, 48: 0.043846, 60: 0.042256, 72: 0.040495 } },
      { range: [25, 29.99], m: { 12: 0.10144, 18: 0.074428, 24: 0.060498, 36: 0.048482, 48: 0.043838, 60: 0.042257, 72: 0.040493 } },
      { range: [30, 100], m: { 12: 0.097719, 18: 0.070579, 24: 0.056545, 36: 0.04417, 48: 0.039177, 60: 0.037233, 72: 0.035218 } },
    ],
  },
  credinamo: {
    min: 10, max: 75, termUnit: 'quincenas',
    terms: [12, 18, 24, 36, 48, 60, 72],
    levels: [
      { range: [10, 19.99], m: { 12: 0.103978, 18: 0.07703, 24: 0.063198, 36: 0.051441, 48: 0.047086, 60: 0.045741, 72: 0.044146 } },
      { range: [20, 29.99], m: { 12: 0.10145, 18: 0.074411, 24: 0.060493, 36: 0.048478, 48: 0.043844, 60: 0.042268, 72: 0.04049 } },
      { range: [30, 49.99], m: { 12: 0.097719, 18: 0.070579, 24: 0.056545, 36: 0.04417, 48: 0.039177, 60: 0.037233, 72: 0.035218 } },
      { range: [50, 75], m: { 12: 0.101446, 18: 0.074417, 24: 0.06049, 36: 0.048469, 48: 0.04384, 60: 0.04226, 72: 0.040489 } },
    ],
  },
  motoxpress: {
    min: 15, max: 75, termUnit: 'quincenas',
    terms: [12, 18, 24, 36, 48, 60, 72],
    levels: [
      { range: [0, 100], m: { 12: 0.106526, 18: 0.079696, 24: 0.06598, 36: 0.054497, 48: 0.050399, 60: 0.04932, 72: 0.047874 } },
    ],
  },
  enganche50: {
    min: 50, max: 75, termUnit: 'quincenas',
    terms: [12, 18, 24, 36, 48, 60, 72],
    levels: [
      { range: [0, 100], m: { 12: 0.101446, 18: 0.074417, 24: 0.06049, 36: 0.048469, 48: 0.04384, 60: 0.04226, 72: 0.040489 } },
    ],
  },
  motonomina_flex: {
    min: 5, max: 75, termUnit: 'semanas',
    terms: [52, 65, 96, 128, 142, 154, 170],
    levels: [
      { range: [0, 100], m: { 52: 0.028695, 65: 0.025093, 96: 0.0207137, 128: 0.018691, 142: 0.018162, 154: 0.017812, 170: 0.017455 } },
    ],
  },
  credinamo_flex: {
    min: 10, max: 75, termUnit: 'semanas',
    terms: [52, 65, 96, 128, 142, 154, 170],
    levels: [
      { range: [10, 49.99], m: { 52: 0.029317, 65: 0.025751, 96: 0.021436, 128: 0.019474, 142: 0.018972, 154: 0.018641, 170: 0.01829 } },
      { range: [50, 75], m: { 52: 0.028701, 65: 0.02509, 96: 0.020707, 128: 0.018693, 142: 0.018158, 154: 0.017806, 170: 0.017467 } },
    ],
  },
  motoxpress_flex: {
    min: 15, max: 75, termUnit: 'semanas',
    terms: [52, 65, 96, 128, 142, 144, 154, 170],
    levels: [
      { range: [0, 100], m: { 52: 0.029955, 65: 0.026416, 96: 0.022169, 128: 0.020269, 142: 0.019777, 144: 0.019714, 154: 0.01947, 170: 0.019148 } },
    ],
  },
};

describe('snapshot del catálogo completo', () => {
  it('fija los 37 modelos con su precio y servicio preventivo, en orden', () => {
    expect(MODELOS_ESPERADOS).toHaveLength(37);
    expect(MODELS.map((m) => [m.nombre, m.precio, m.servicio])).toEqual(MODELOS_ESPERADOS);
  });

  it('fija los 7 esquemas: rango, unidad, plazos y cada factor de cada nivel', () => {
    expect(SCHEME_IDS).toEqual(Object.keys(ESQUEMAS_ESPERADOS));
    for (const id of SCHEME_IDS) {
      const { min, max, termUnit, terms, levels } = SCHEMES[id];
      expect({ id, min, max, termUnit, terms, levels }).toEqual({
        id,
        ...ESQUEMAS_ESPERADOS[id],
      });
    }
  });

  it('cubre los 92 factores publicados', () => {
    const total = Object.values(ESQUEMAS_ESPERADOS)
      .flatMap((e) => e.levels)
      .reduce((n, l) => n + Object.keys(l.m).length, 0);
    expect(total).toBe(92);
  });
});
