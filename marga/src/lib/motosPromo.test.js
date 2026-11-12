import { describe, it, expect } from 'vitest';
import { MODELS, aplicarCatalogo, motoPorNombre } from './motos.js';

const base = { esquemas: {}, modelos: [['COMANDO', 83895, 3983], ['U5', 26145, 2287], ['R4', 55335, 3000]] };

describe('promociones del catálogo', () => {
  it('aplica el descuento y conserva el precio de lista', () => {
    aplicarCatalogo({ ...base, promos: { COMANDO: { pct: 20, solo_contado: false, etiqueta: 'Promoción Buen Fin' }, U5: { pct: 20, solo_contado: true, etiqueta: 'Promoción Buen Fin' } } });
    expect(motoPorNombre('COMANDO')).toMatchObject({ precio: 67116, precioLista: 83895, promo: { pct: 20 } });
    expect(motoPorNombre('U5')).toMatchObject({ precio: 26145, promo: { soloContado: true } });
    expect(motoPorNombre('U5').precioLista).toBeUndefined();
    expect(motoPorNombre('R4').promo).toBeUndefined();
  });
  it('sin promos vuelve al precio de lista', () => {
    aplicarCatalogo(base);
    expect(MODELS.every((m) => !m.promo && !m.precioLista)).toBe(true);
    expect(motoPorNombre('COMANDO').precio).toBe(83895);
  });
});
