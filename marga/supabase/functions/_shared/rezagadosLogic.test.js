import { describe, it, expect } from 'vitest';
import { esRezagado, resumenRezagados, avisosDeGuardia, estaDeTurno, TURNOS, SIN_TOCAR_MS } from './rezagadosLogic.js';

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

// Fechas de noviembre de 2026 en Monterrey (UTC-6): lun 16, sáb 21, dom 22.
const en = (dia, hora) => Date.UTC(2026, 10, dia, hora + 6, 0);
const LUN_9 = en(16, 9);
const LUN_16 = en(16, 16);
const SAB_9 = en(21, 9);
const DOM_16 = en(22, 16);

describe('avisosDeGuardia', () => {
  const usuarios = [
    { username: 'Alejandro Acosta', role: 'vendedor' },
    { username: 'Emmanuel Bernal', role: 'vendedor' },
    { username: 'Braulio Acosta', role: 'admin' },
  ];
  // Leads de los dos vendedores, todos con más de 24 h sin tocar.
  const leads = (t) => [
    lead({ id: 'a1', createdAt: t - 3 * D }),
    lead({ id: 'a2', createdAt: t - 5 * D }),
    lead({ id: 'e1', createdBy: 'Emmanuel Bernal', createdAt: t - 2 * D }),
  ];
  const quienes = (t, guardia) => avisosDeGuardia(leads(t), usuarios, guardia, t).map((a) => a.destinatario);

  it('lunes por la mañana solo avisa a Alejandro, con sus leads y el más viejo', () => {
    const avisos = avisosDeGuardia(leads(LUN_9), usuarios, 'manana', LUN_9);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].destinatario).toBe('Alejandro Acosta');
    expect(avisos[0].titulo).toContain('2 leads calientes sin tocar');
    expect(avisos[0].cuerpo).toContain('5 días');
    expect(avisos[0].cuerpo).toContain('mañana');
    expect(avisos[0].tag).toBe('guardia-manana');
  });
  it('lunes por la tarde solo avisa a Emmanuel, con sus propios leads', () => {
    const avisos = avisosDeGuardia(leads(LUN_16), usuarios, 'tarde', LUN_16);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].destinatario).toBe('Emmanuel Bernal');
    expect(avisos[0].titulo).toContain('1 lead caliente sin tocar');
    expect(avisos[0].cuerpo).toContain('tarde');
  });
  it('sábado las dos guardias son de Emmanuel', () => {
    expect(quienes(SAB_9, 'manana')).toEqual(['Emmanuel Bernal']);
    expect(quienes(SAB_9, 'tarde')).toEqual(['Emmanuel Bernal']);
  });
  it('domingo las dos guardias son de Alejandro', () => {
    expect(quienes(DOM_16, 'manana')).toEqual(['Alejandro Acosta']);
    expect(quienes(DOM_16, 'tarde')).toEqual(['Alejandro Acosta']);
  });
  it('un vendedor fuera de turno no recibe nada aunque tenga pendientes', () => {
    expect(quienes(LUN_9, 'manana')).not.toContain('Emmanuel Bernal');
    expect(quienes(LUN_16, 'tarde')).not.toContain('Alejandro Acosta');
    const soloEmmanuel = [lead({ createdBy: 'Emmanuel Bernal' })];
    expect(avisosDeGuardia(soloEmmanuel, usuarios, 'manana', LUN_9)).toEqual([]);
  });
  it('un vendedor sin turno registrado, el admin y la lista vacía no reciben nada', () => {
    const otros = [...usuarios, { username: 'Nuevo Vendedor', role: 'vendedor' }];
    const l = [lead({ createdBy: 'Nuevo Vendedor' }), lead({ createdBy: 'Braulio Acosta' })];
    expect(avisosDeGuardia(l, otros, 'manana', LUN_9)).toEqual([]);
    expect(avisosDeGuardia([], usuarios, 'manana', LUN_9)).toEqual([]);
  });
});

describe('TURNOS y estaDeTurno', () => {
  it('usa el día de Monterrey, no el de UTC', () => {
    // Domingo 22 de nov 22:30 Monterrey ya es lunes 23 en UTC.
    const domingoNoche = Date.UTC(2026, 10, 23, 4, 30);
    expect(estaDeTurno('Alejandro Acosta', 'tarde', domingoNoche)).toBe(true);
    expect(estaDeTurno('Emmanuel Bernal', 'tarde', domingoNoche)).toBe(false);
  });
  it('la tabla cubre cada guardia de cada día con exactamente un vendedor', () => {
    for (let dia = 0; dia <= 6; dia++) {
      for (const g of ['manana', 'tarde']) {
        const duenos = Object.keys(TURNOS).filter((v) => TURNOS[v][dia]?.includes(g));
        expect(duenos).toHaveLength(1);
      }
    }
  });
});
