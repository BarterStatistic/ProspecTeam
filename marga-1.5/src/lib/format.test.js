import { describe, it, expect } from 'vitest';
import { formatPct } from './format.js';

describe('formatPct', () => {
  it('un entero se ve sin decimales', () => {
    expect(formatPct(20)).toBe('20%');
  });

  it('un decimal se ve con dos cifras', () => {
    expect(formatPct(15.5)).toBe('15.50%');
  });

  it('solo recorta el ".00" exacto, no cualquier cero de cola', () => {
    expect(formatPct(15.1)).toBe('15.10%');
  });

  it('redondea a dos decimales', () => {
    expect(formatPct(15.005)).toBe('15.01%');
  });

  it('cero se ve como "0%"', () => {
    expect(formatPct(0)).toBe('0%');
  });
});
