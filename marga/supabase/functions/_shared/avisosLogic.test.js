import { describe, expect, it } from 'vitest';
import { decidirAvisos } from './avisosLogic.js';

const AHORA = 1_800_000_000_000;
const usuarios = [
  { username: 'Braulio Acosta', role: 'admin' },
  { username: 'Alejandro Acosta', role: 'vendedor' },
  { username: 'Cintya Cardona', role: 'promotor' },
];
const cliente = (extra) => ({
  id: 'c1',
  firstName: 'Ana',
  lastName: 'Pérez',
  phone: '844 123 4567',
  createdBy: 'Alejandro Acosta',
  createdAt: AHORA - 1000,
  ...extra,
});

describe('decidirAvisos — clientes', () => {
  it('Envío de docs / Cita agendada avisa al vendedor por Telegram y push', () => {
    const r = decidirAvisos(
      {
        tabla: 'marga_clients',
        op: 'UPDATE',
        antes: { section: 'prospectos', stage: 'interesado_proceso' },
        data: cliente({ section: 'prospectos', stage: 'envio_docs_cita', origen: 'alex', resumenAlex: 'Quiere <Italika>' }),
      },
      usuarios,
      AHORA,
    );
    expect(r).toHaveLength(1);
    expect(r[0].destinatario).toBe('Alejandro Acosta');
    expect(r[0].telegram).toContain('Ana Pérez');
    expect(r[0].telegram).toContain('&lt;Italika&gt;');
  });

  it('una tarjeta nueva de Alex directo en Envío de docs también avisa', () => {
    const r = decidirAvisos(
      { tabla: 'marga_clients', op: 'INSERT', antes: null, data: cliente({ section: 'prospectos', stage: 'envio_docs_cita' }) },
      usuarios,
      AHORA,
    );
    expect(r.map((a) => a.destinatario)).toEqual(['Alejandro Acosta']);
  });

  it('un cambio de columna en Procesos avisa por push a vendedor y promotor, sin Telegram', () => {
    const r = decidirAvisos(
      {
        tabla: 'marga_clients',
        op: 'UPDATE',
        antes: { section: 'procesos', stage: 'credito_por_subir' },
        data: cliente({ section: 'procesos', stage: 'bnc', promotorEncargado: 'Cintya Cardona' }),
      },
      usuarios,
      AHORA,
    );
    expect(r.map((a) => a.destinatario)).toEqual(['Alejandro Acosta', 'Cintya Cardona']);
    expect(r.every((a) => a.telegram === null)).toBe(true);
    expect(r[0].cuerpo).toContain('BNC');
  });

  it('entrar a Procesos también avisa a los admins', () => {
    const r = decidirAvisos(
      {
        tabla: 'marga_clients',
        op: 'UPDATE',
        antes: { section: 'prospectos', stage: 'envio_docs_cita' },
        data: cliente({ section: 'procesos', stage: 'credito_por_subir' }),
      },
      usuarios,
      AHORA,
    );
    expect(r.map((a) => a.destinatario)).toEqual(['Braulio Acosta', 'Alejandro Acosta']);
  });

  it('sin cambio de columna no avisa', () => {
    const r = decidirAvisos(
      {
        tabla: 'marga_clients',
        op: 'UPDATE',
        antes: { section: 'procesos', stage: 'bnc' },
        data: cliente({ section: 'procesos', stage: 'bnc' }),
      },
      usuarios,
      AHORA,
    );
    expect(r).toEqual([]);
  });

  it('un alta vieja (restaurar respaldo) no avisa', () => {
    const r = decidirAvisos(
      {
        tabla: 'marga_clients',
        op: 'INSERT',
        antes: null,
        data: cliente({ section: 'prospectos', stage: 'envio_docs_cita', createdAt: AHORA - 2 * 3_600_000 }),
      },
      usuarios,
      AHORA,
    );
    expect(r).toEqual([]);
  });
});

describe('decidirAvisos — citas', () => {
  const cita = (extra) => ({
    id: 'k1',
    clientName: 'Luis',
    fechaCita: AHORA + 86_400_000,
    hasTime: true,
    createdBy: 'Alejandro Acosta',
    createdAt: AHORA - 1000,
    ...extra,
  });

  it('una cita nueva avisa a quien la agendó y a los admins, con Telegram', () => {
    const r = decidirAvisos({ tabla: 'marga_citas', op: 'INSERT', antes: null, data: cita() }, usuarios, AHORA);
    expect(r.map((a) => a.destinatario)).toEqual(['Alejandro Acosta', 'Braulio Acosta']);
    expect(r[0].telegram).toContain('Cita agendada');
  });

  it('reagendar avisa; editar otra cosa no', () => {
    const fecha = AHORA + 86_400_000;
    expect(
      decidirAvisos({ tabla: 'marga_citas', op: 'UPDATE', antes: { fechaCita: fecha - 3600_000 }, data: cita() }, usuarios, AHORA)[0]
        .titulo,
    ).toContain('reagendada');
    expect(
      decidirAvisos({ tabla: 'marga_citas', op: 'UPDATE', antes: { fechaCita: fecha }, data: cita() }, usuarios, AHORA),
    ).toEqual([]);
  });

  it('el admin que agenda no recibe el aviso dos veces', () => {
    const r = decidirAvisos(
      { tabla: 'marga_citas', op: 'INSERT', antes: null, data: cita({ createdBy: 'Braulio Acosta' }) },
      usuarios,
      AHORA,
    );
    expect(r.map((a) => a.destinatario)).toEqual(['Braulio Acosta']);
  });
});
