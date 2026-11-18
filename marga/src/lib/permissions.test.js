import { describe, it, expect } from 'vitest';
import {
  canSeeClient,
  canEditClient,
  canDeleteClient,
  visibleSections,
  canConfirmCita,
  canMarkAsistencia,
} from './permissions.js';

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

  it('Ventas la ve todo el equipo', () => {
    expect(canSeeClient('vendedor', { section: 'ventas', createdBy: 'Beto' }, 'Ana')).toBe(true);
  });

  it('el vendedor solo consulta: no edita ni borra sus cancelados', () => {
    const suyo = cancelado({ createdBy: 'Ana' });
    expect(canEditClient('vendedor', suyo, 'Ana')).toBe(false);
    expect(canDeleteClient('vendedor', suyo, 'Ana')).toBe(false);
  });
});

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

describe('Bartersito y Publicidad', () => {
  it('solo el administrador puede hablar con Bartersito', async () => {
    const { canUsarBartersito } = await import('./permissions.js');
    expect(canUsarBartersito('admin')).toBe(true);
    expect(canUsarBartersito('vendedor')).toBe(false);
    expect(canUsarBartersito('promotor')).toBe(false);
    expect(canUsarBartersito(undefined)).toBe(false);
  });

  it('solo el administrador ve Publicidad y agencia', async () => {
    const { canViewPublicidad } = await import('./permissions.js');
    expect(canViewPublicidad('admin')).toBe(true);
    expect(canViewPublicidad('vendedor')).toBe(false);
    expect(canViewPublicidad('promotor')).toBe(false);
  });
});

describe('citas: confirmación y asistencia', () => {
  const cita = { vendedor: 'Emmanuel Bernal', createdBy: 'Emmanuel Bernal' };

  it('solo admin y promotor marcan la asistencia', () => {
    expect(canMarkAsistencia('admin')).toBe(true);
    expect(canMarkAsistencia('promotor')).toBe(true);
    expect(canMarkAsistencia('vendedor')).toBe(false);
  });

  it('el vendedor confirma sus citas, no las ajenas', () => {
    expect(canConfirmCita('vendedor', cita, 'Emmanuel Bernal')).toBe(true);
    expect(canConfirmCita('vendedor', cita, 'Alejandro Acosta')).toBe(false);
    expect(canConfirmCita('vendedor', { createdBy: 'Emmanuel Bernal' }, 'Emmanuel Bernal')).toBe(true);
  });

  it('compara el nombre sin acentos ni mayúsculas', () => {
    expect(canConfirmCita('vendedor', { vendedor: 'emmánuel bernal' }, 'Emmanuel Bernal')).toBe(true);
  });

  it('el admin confirma cualquiera; el promotor no confirma', () => {
    expect(canConfirmCita('admin', cita, 'Braulio Acosta')).toBe(true);
    expect(canConfirmCita('promotor', cita, 'Cintya Cardona')).toBe(false);
  });

  it('sin usuario nadie confirma como vendedor', () => {
    expect(canConfirmCita('vendedor', cita, '')).toBe(false);
  });
});

describe('Cada vendedor ve solo sus prospectos y procesos (2026-11-17)', () => {
  it('Alejandro no ve los prospectos ni los procesos de Emmanuel', () => {
    for (const section of ['prospectos', 'procesos']) {
      expect(canSeeClient('vendedor', { section, createdBy: 'Emmanuel Bernal' }, 'Alejandro Acosta')).toBe(false);
      expect(canSeeClient('vendedor', { section, createdBy: 'Alejandro Acosta' }, 'Alejandro Acosta')).toBe(true);
    }
  });
  it('un proceso asignado como Vendedor Prospect Team también es suyo', () => {
    expect(canSeeClient('vendedor', { section: 'procesos', createdBy: 'Braulio Acosta', prospectTeamSeller: 'alejandro acosta' }, 'Alejandro Acosta')).toBe(true);
  });
  it('sin vendedor no lo ve ningún vendedor; el admin y el promotor sí', () => {
    expect(canSeeClient('vendedor', { section: 'prospectos', createdBy: '' }, 'Alejandro Acosta')).toBe(false);
    expect(canSeeClient('admin', { section: 'prospectos', createdBy: 'Emmanuel Bernal' }, 'Braulio Acosta')).toBe(true);
    expect(canSeeClient('promotor', { section: 'procesos', createdBy: 'Emmanuel Bernal' }, 'Cintya Cardona')).toBe(true);
  });
});
