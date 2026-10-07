import { describe, it, expect } from 'vitest';
import { canDeleteClient } from './permissions.js';

const prospecto = (extra = {}) => ({
  section: 'prospectos',
  createdBy: 'Ana',
  comisionId: null,
  ...extra,
});

describe('canDeleteClient', () => {
  it('el vendedor elimina su propio prospecto sin comisión', () => {
    expect(canDeleteClient('vendedor', prospecto(), 'Ana')).toBe(true);
  });

  it('el vendedor no elimina un prospecto suyo que ya tiene comisión', () => {
    expect(canDeleteClient('vendedor', prospecto({ comisionId: 'c1' }), 'Ana')).toBe(false);
  });

  it('el admin elimina aunque tenga comisión; el promotor nunca', () => {
    const facturado = prospecto({ section: 'procesos', comisionId: 'c1' });
    expect(canDeleteClient('admin', facturado, 'Braulio')).toBe(true);
    expect(canDeleteClient('promotor', facturado, 'Pepe')).toBe(false);
  });
});
