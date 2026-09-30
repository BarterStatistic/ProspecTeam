import { describe, it, expect } from 'vitest';
import { canSeeClient, canEditClient, canDeleteClient, visibleSections } from './permissions.js';

const cancelado = (extra = {}) => ({ section: 'cancelados', createdBy: '', ...extra });

describe('Clientes cancelados para el vendedor', () => {
  it('la sección aparece para vendedor y admin, no para promotor', () => {
    expect(visibleSections('vendedor')).toContain('cancelados');
    expect(visibleSections('admin')).toContain('cancelados');
    expect(visibleSections('promotor')).not.toContain('cancelados');
  });

  it('ve los que registró o los que tiene asignados, nada más', () => {
    expect(canSeeClient('vendedor', cancelado({ createdBy: 'Ana' }), 'Ana')).toBe(true);
    expect(canSeeClient('vendedor', cancelado({ prospectTeamSeller: ' ána ' }), 'Ana')).toBe(true);
    expect(canSeeClient('vendedor', cancelado({ createdBy: 'Beto' }), 'Ana')).toBe(false);
    expect(canSeeClient('vendedor', cancelado(), 'Ana')).toBe(false);
  });

  it('el admin los ve todos; el promotor ninguno', () => {
    expect(canSeeClient('admin', cancelado({ createdBy: 'Beto' }), 'Braulio')).toBe(true);
    expect(canSeeClient('promotor', cancelado({ createdBy: 'Pro' }), 'Pro')).toBe(false);
  });

  it('las demás secciones no cambian', () => {
    const prospecto = { section: 'prospectos', createdBy: 'Beto' };
    expect(canSeeClient('vendedor', prospecto, 'Ana')).toBe(true);
  });

  it('el vendedor solo consulta: no edita ni borra sus cancelados', () => {
    const suyo = cancelado({ createdBy: 'Ana' });
    expect(canEditClient('vendedor', suyo, 'Ana')).toBe(false);
    expect(canDeleteClient('vendedor', suyo, 'Ana')).toBe(false);
  });
});
