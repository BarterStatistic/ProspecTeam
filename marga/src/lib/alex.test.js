import { describe, expect, it } from 'vitest';
import {
  ALEX_AVATAR,
  atributosDe,
  caracteristicasDe,
  esDeAlex,
  fotoDeTarjeta,
  indicadoresDe,
  vendedorAsignado,
} from './alex.js';

const etiquetas = (client) => caracteristicasDe(client).map((c) => c.etiqueta);

describe('esDeAlex', () => {
  it('distingue las tarjetas del bot', () => {
    expect(esDeAlex({ origen: 'alex' })).toBe(true);
    expect(esDeAlex({})).toBe(false);
  });
});

describe('vendedorAsignado', () => {
  it('usa el primer nombre', () => {
    expect(vendedorAsignado({ createdBy: 'Alejandro Acosta' })).toBe('Le toca: Alejandro');
    expect(vendedorAsignado({ createdBy: 'Emmanuel Bernal' })).toBe('Le toca: Emmanuel');
    expect(vendedorAsignado({})).toBe('');
  });
});

describe('caracteristicasDe', () => {
  it('catálogo enviado solo se ve en Preguntas', () => {
    const base = { section: 'prospectos', caracteristicas: { catalogoEnviado: true } };
    expect(etiquetas({ ...base, stage: 'preguntas' })).toEqual(['Catálogo enviado']);
    expect(etiquetas({ ...base, stage: 'interesado_proceso' })).toEqual([]);
  });

  it('las características solo se ven en Prospectos', () => {
    const client = {
      section: 'procesos',
      stage: 'preguntas',
      caracteristicas: { compra: 'credito', catalogoEnviado: true },
    };
    expect(caracteristicasDe(client)).toEqual([]);
  });

  it('traduce los valores de Alex a etiquetas', () => {
    const client = {
      section: 'prospectos',
      stage: 'interesado_proceso',
      caracteristicas: {
        compra: 'credito',
        perfil: 'dueno_negocio',
        flex: true,
        temperatura: 'frio',
        alertas: ['requiere_accion'],
      },
    };
    expect(etiquetas(client)).toEqual(['Crédito', 'Dueño de negocio', 'Flex', 'Requiere acción']);
  });

  it('ignora vacíos y valores desconocidos', () => {
    const client = {
      section: 'prospectos',
      stage: 'primer_contacto',
      caracteristicas: { compra: 'sin_definir', perfil: '', temperatura: 'raro', flex: false, alertas: [] },
    };
    expect(caracteristicasDe(client)).toEqual([]);
  });

  it('tarjeta sin características no revienta', () => {
    expect(caracteristicasDe({ section: 'prospectos' })).toEqual([]);
  });
});

describe('indicadoresDe', () => {
  it('resume la temperatura y el chat en indicadores pequeños', () => {
    const client = { section: 'prospectos', caracteristicas: { temperatura: 'caliente', chatbot: 'activado' } };
    expect(indicadoresDe(client)).toEqual([
      { clave: 'temperatura', etiqueta: 'Lead caliente', tono: 'caliente' },
      { clave: 'chatbot', etiqueta: 'Chat activado', tono: 'activado' },
    ]);
  });

  it('distingue lead tibio, lead frío y chat desactivado', () => {
    const tibio = { section: 'prospectos', caracteristicas: { temperatura: 'tibio' } };
    const frio = { section: 'prospectos', caracteristicas: { temperatura: 'frio', chatbot: 'desactivado' } };
    expect(indicadoresDe(tibio)).toEqual([{ clave: 'temperatura', etiqueta: 'Lead tibio', tono: 'tibio' }]);
    expect(indicadoresDe(frio)).toEqual([
      { clave: 'temperatura', etiqueta: 'Lead frío', tono: 'frio' },
      { clave: 'chatbot', etiqueta: 'Chat desactivado', tono: 'desactivado' },
    ]);
  });

  it('sin datos, con valores desconocidos o fuera de Prospectos no hay indicadores', () => {
    expect(indicadoresDe({ section: 'prospectos' })).toEqual([]);
    expect(indicadoresDe({ section: 'prospectos', caracteristicas: { temperatura: 'raro', chatbot: '' } })).toEqual([]);
    expect(indicadoresDe({ section: 'procesos', caracteristicas: { temperatura: 'caliente' } })).toEqual([]);
  });
});

describe('atributosDe', () => {
  it('lista los datos del cliente en orden y salta los vacíos', () => {
    const client = {
      section: 'prospectos',
      atributos: {
        pago_cotizado: '$1,334 quincenal',
        enganche: '$10,000',
        ingresos: 'estados de cuenta',
        municipio: '',
        proximo_paso: 'Enviar INE',
      },
    };
    expect(atributosDe(client)).toEqual([
      { clave: 'enganche', etiqueta: 'Enganche', valor: '$10,000' },
      { clave: 'pago_cotizado', etiqueta: 'Pago cotizado', valor: '$1,334 quincenal' },
      { clave: 'ingresos', etiqueta: 'Ingresos', valor: 'estados de cuenta' },
      { clave: 'proximo_paso', etiqueta: 'Próximo paso', valor: 'Enviar INE' },
    ]);
  });

  it('fuera de Prospectos o sin atributos devuelve []', () => {
    expect(atributosDe({ section: 'prospectos' })).toEqual([]);
    expect(atributosDe({ section: 'procesos', atributos: { enganche: '$1' } })).toEqual([]);
  });
});

describe('fotoDeTarjeta', () => {
  const fotos = { 'Emmanuel Bernal': 'foto-emmanuel.jpg', 'Alejandro Acosta': 'foto-alejandro.jpg' };

  it('en Prospectos las tarjetas del bot llevan la foto de Alex', () => {
    const client = { origen: 'alex', section: 'prospectos', createdBy: 'Emmanuel Bernal' };
    expect(fotoDeTarjeta(client, fotos)).toBe(ALEX_AVATAR);
  });

  it('en Procesos las tarjetas del bot llevan la foto del vendedor encargado', () => {
    const client = { origen: 'alex', section: 'procesos', createdBy: 'Emmanuel Bernal' };
    expect(fotoDeTarjeta(client, fotos)).toBe('foto-emmanuel.jpg');
    expect(fotoDeTarjeta({ ...client, createdBy: 'Alejandro Acosta' }, fotos)).toBe('foto-alejandro.jpg');
  });

  it('las tarjetas de vendedores siempre llevan la foto de quien las registró', () => {
    const client = { section: 'prospectos', createdBy: 'Alejandro Acosta' };
    expect(fotoDeTarjeta(client, fotos)).toBe('foto-alejandro.jpg');
  });

  it('si el vendedor no tiene foto, no inventa una', () => {
    expect(fotoDeTarjeta({ origen: 'alex', section: 'procesos', createdBy: 'Sin Foto' }, fotos)).toBeUndefined();
    expect(fotoDeTarjeta({ section: 'prospectos', createdBy: 'X' }, undefined)).toBeUndefined();
  });
});
