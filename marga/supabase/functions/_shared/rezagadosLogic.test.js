import { describe, it, expect } from 'vitest';
import { esRezagado, resumenRezagados, avisosDeGuardia, SIN_TOCAR_MS } from './rezagadosLogic.js';

const H = 3_600_000;
const D = 24 * H;
const AHORA = Date.UTC(2026, 10, 16, 16, 0);

const lead = (extra = {}) => ({
  id: 'l1',
  origen: 'alex',
  section: 'prospectos',
  stage: 'interesado_proceso',
  createdBy: 'Alejandro Acosta',
  createdAt: AHORA - 3 * D,
  caracteristicas: { temperatura: 'caliente', alertas: [] },
  ...extra,
});

describe('esRezagado', () => {
  it('caliente sin contacto desde hace 3 días: sí', () => {
    expect(esRezagado(lead(), AHORA)).toBe(true);
  });
  it('justo a las 24 h cuenta; un minuto antes no', () => {
    expect(esRezagado(lead({ createdAt: AHORA - SIN_TOCAR_MS }), AHORA)).toBe(true);
    expect(esRezagado(lead({ createdAt: AHORA - SIN_TOCAR_MS + 60_000 }), AHORA)).toBe(false);
  });
  it('un contacto reciente lo saca; uno viejo lo deja', () => {
    expect(esRezagado(lead({ contacto: { ultimoEn: AHORA - 2 * H } }), AHORA)).toBe(false);
    expect(esRezagado(lead({ contacto: { ultimoEn: AHORA - 2 * D } }), AHORA)).toBe(true);
  });
  it('solo calientes de Alex en Prospectos', () => {
    expect(esRezagado(lead({ caracteristicas: { temperatura: 'tibio' } }), AHORA)).toBe(false);
    expect(esRezagado(lead({ origen: undefined }), AHORA)).toBe(false);
    expect(esRezagado(lead({ section: 'procesos' }), AHORA)).toBe(false);
  });
  it('las alertas que no se siguen lo excluyen', () => {
    const car = { temperatura: 'caliente', alertas: ['fuera_cobertura'] };
    expect(esRezagado(lead({ caracteristicas: car }), AHORA)).toBe(false);
  });
  it('sin fecha de llegada ni contacto no se puede saber: no cuenta', () => {
    expect(esRezagado(lead({ createdAt: undefined }), AHORA)).toBe(false);
  });
});

describe('resumenRezagados', () => {
  it('agrupa por createdBy y ordena por el que más acumula', () => {
    const r = resumenRezagados(
      [
        lead({ id: 'a' }),
        lead({ id: 'b', createdAt: AHORA - 5 * D }),
        lead({ id: 'c', createdBy: 'Emmanuel Bernal' }),
        lead({ id: 'd', createdBy: 'Emmanuel Bernal', createdAt: AHORA - 2 * H }),
      ],
      AHORA,
    );
    expect(r).toEqual([
      { vendedor: 'Alejandro Acosta', total: 2, masViejoMs: 5 * D },
      { vendedor: 'Emmanuel Bernal', total: 1, masViejoMs: 3 * D },
    ]);
  });
  it('sin createdBy cae en "Sin asignar"', () => {
    expect(resumenRezagados([lead({ createdBy: '' })], AHORA)[0].vendedor).toBe('Sin asignar');
  });
});

describe('avisosDeGuardia', () => {
  const usuarios = [
    { username: 'Alejandro Acosta', role: 'vendedor' },
    { username: 'Emmanuel Bernal', role: 'vendedor' },
    { username: 'Braulio Acosta', role: 'admin' },
  ];
  it('un push por vendedor con leads rezagados, con el conteo y el más viejo', () => {
    const avisos = avisosDeGuardia([lead({ id: 'a' }), lead({ id: 'b', createdAt: AHORA - 5 * D })], usuarios, 'manana', AHORA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].destinatario).toBe('Alejandro Acosta');
    expect(avisos[0].titulo).toContain('2 leads calientes sin tocar');
    expect(avisos[0].cuerpo).toContain('5 días');
    expect(avisos[0].cuerpo).toContain('mañana');
    expect(avisos[0].tag).toBe('guardia-manana');
  });
  it('singular cuando es uno', () => {
    const [a] = avisosDeGuardia([lead()], usuarios, 'tarde', AHORA);
    expect(a.titulo).toContain('1 lead caliente sin tocar');
    expect(a.cuerpo).toContain('tarde');
  });
  it('no avisa al admin ni a quien no tiene pendientes', () => {
    const avisos = avisosDeGuardia([lead({ createdBy: 'Braulio Acosta' })], usuarios, 'manana', AHORA);
    expect(avisos).toEqual([]);
    expect(avisosDeGuardia([], usuarios, 'manana', AHORA)).toEqual([]);
  });
});
