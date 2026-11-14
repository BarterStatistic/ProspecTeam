import { describe, it, expect } from 'vitest';
import {
  telefonoWhatsApp,
  saludoWhatsApp,
  enlaceWhatsApp,
  parcheContacto,
  duracionCorta,
  esperaDe,
  colaDelDia,
  pendientesDelDia,
} from './seguimiento.js';

const H = 3_600_000;
const D = 24 * H;
const AHORA = new Date(2026, 10, 13, 12, 0).getTime();

const alex = (extra = {}) => ({
  id: 'alex-1',
  origen: 'alex',
  section: 'prospectos',
  stage: 'interesado_proceso',
  createdBy: 'Alejandro Acosta',
  createdAt: AHORA - 5 * H,
  updatedAt: AHORA - 5 * H,
  caracteristicas: { temperatura: 'caliente', alertas: [] },
  ...extra,
});

describe('telefonoWhatsApp', () => {
  it('agrega el 52 a un número de 10 dígitos', () => {
    expect(telefonoWhatsApp('(844) 123-4567')).toBe('528441234567');
  });
  it('deja pasar un número que ya trae lada de país', () => {
    expect(telefonoWhatsApp('+52 844 123 4567')).toBe('528441234567');
  });
  it('quita el 1 del formato viejo 521', () => {
    expect(telefonoWhatsApp('5218441234567')).toBe('528441234567');
  });
  it('devuelve vacío si el número no alcanza', () => {
    expect(telefonoWhatsApp('12345')).toBe('');
    expect(telefonoWhatsApp('')).toBe('');
    expect(telefonoWhatsApp(undefined)).toBe('');
  });
});

describe('saludoWhatsApp y enlaceWhatsApp', () => {
  it('usa el nombre del cliente, el del vendedor y la moto', () => {
    const texto = saludoWhatsApp({ firstName: 'Juan Carlos', motorcycles: 'R4' }, 'Alejandro Acosta');
    expect(texto).toBe('Hola Juan, soy Alejandro de Dinamo. Vi que te interesa la R4. ¿Te ayudo con tu trámite?');
  });
  it('no inventa datos que faltan', () => {
    expect(saludoWhatsApp({}, '')).toBe(
      'Hola, te escribo de Dinamo. Vi que nos escribiste por una moto. ¿Te ayudo con tu trámite?',
    );
  });
  it('arma el enlace de wa.me con el saludo codificado', () => {
    const url = enlaceWhatsApp({ phone: '8441234567', firstName: 'Ana' }, 'Emmanuel Bernal');
    expect(url.startsWith('https://wa.me/528441234567?text=Hola%20Ana')).toBe(true);
  });
  it('sin teléfono no hay enlace', () => {
    expect(enlaceWhatsApp({ firstName: 'Ana' }, 'Emmanuel')).toBe('');
  });
});

describe('parcheContacto', () => {
  it('el primer contacto sella primeroEn y cuenta 1', () => {
    expect(parcheContacto({}, 'whatsapp', 'Alejandro Acosta', 100)).toEqual({
      contacto: { primeroEn: 100, ultimoEn: 100, ultimoTipo: 'whatsapp', ultimoPor: 'Alejandro Acosta', veces: 1 },
    });
  });
  it('los siguientes conservan primeroEn y suman', () => {
    const previo = { contacto: { primeroEn: 100, ultimoEn: 100, ultimoTipo: 'whatsapp', veces: 1 } };
    expect(parcheContacto(previo, 'llamada', 'Alejandro Acosta', 500).contacto).toMatchObject({
      primeroEn: 100,
      ultimoEn: 500,
      ultimoTipo: 'llamada',
      veces: 2,
    });
  });
  it('rechaza un tipo desconocido', () => {
    expect(() => parcheContacto({}, 'paloma', 'x')).toThrow();
  });
});

describe('duracionCorta', () => {
  it('redondea hacia abajo en minutos, horas y días', () => {
    expect(duracionCorta(20_000)).toBe('ahora');
    expect(duracionCorta(35 * 60_000)).toBe('35 min');
    expect(duracionCorta(5 * H + 59 * 60_000)).toBe('5 h');
    expect(duracionCorta(3 * D + H)).toBe('3 d');
  });
});

describe('esperaDe', () => {
  it('solo aplica a tarjetas de Alex en Prospectos', () => {
    expect(esperaDe({ section: 'prospectos', createdAt: 1 }, AHORA)).toBeNull();
    expect(esperaDe(alex({ section: 'procesos' }), AHORA)).toBeNull();
  });
  it('sin contacto: sube de nivel a las 2 h y a las 24 h', () => {
    expect(esperaDe(alex({ createdAt: AHORA - H }), AHORA)).toMatchObject({
      contactado: false,
      nivel: 'ok',
      texto: 'Esperando 1 h',
    });
    expect(esperaDe(alex({ createdAt: AHORA - 5 * H }), AHORA).nivel).toBe('aviso');
    expect(esperaDe(alex({ createdAt: AHORA - 2 * D }), AHORA)).toMatchObject({
      nivel: 'urgente',
      texto: 'Esperando 2 d',
    });
  });
  it('contactado: dice qué se hizo y hace cuánto', () => {
    const c = alex({ contacto: { ultimoEn: AHORA - 3 * H, ultimoTipo: 'whatsapp' } });
    expect(esperaDe(c, AHORA)).toMatchObject({ contactado: true, nivel: 'ok', texto: 'Le escribiste hace 3 h' });
  });
  it('contactado hace 2 días o sin respuesta vuelve a avisar', () => {
    expect(esperaDe(alex({ contacto: { ultimoEn: AHORA - 2 * D, ultimoTipo: 'llamada' } }), AHORA).nivel).toBe('aviso');
    expect(
      esperaDe(alex({ contacto: { ultimoEn: AHORA - H, ultimoTipo: 'sin_respuesta' } }), AHORA),
    ).toMatchObject({ nivel: 'aviso', texto: 'No contestó hace 1 h' });
  });
});

describe('colaDelDia', () => {
  const opciones = { username: 'Alejandro Acosta', now: AHORA };

  it('reparte cada tarjeta en una sola lista por prioridad', () => {
    const clientes = [
      alex({ id: 'urgente', caracteristicas: { temperatura: 'caliente', alertas: ['requiere_accion'] } }),
      alex({ id: 'caliente' }),
      alex({ id: 'tibio-nuevo', caracteristicas: { temperatura: 'tibio' } }),
      alex({ id: 'seguir', contacto: { ultimoEn: AHORA - 3 * D, ultimoTipo: 'whatsapp' } }),
      alex({ id: 'al-dia', contacto: { ultimoEn: AHORA - H, ultimoTipo: 'whatsapp' } }),
    ];
    const cola = colaDelDia(clientes, [], opciones);
    expect(cola.urgentes.map((c) => c.id)).toEqual(['urgente']);
    expect(cola.calientes.map((c) => c.id)).toEqual(['caliente']);
    expect(cola.seguimiento.map((c) => c.id)).toEqual(['seguir']);
  });

  it('un urgente contactado hoy sale de la lista; uno contactado hace más de un día regresa', () => {
    const car = { temperatura: 'caliente', alertas: ['requiere_accion'] };
    const cola = colaDelDia(
      [
        alex({ id: 'hoy', caracteristicas: car, contacto: { ultimoEn: AHORA - H, ultimoTipo: 'llamada' } }),
        alex({ id: 'viejo', caracteristicas: car, contacto: { ultimoEn: AHORA - 2 * D, ultimoTipo: 'llamada' } }),
      ],
      [],
      opciones,
    );
    expect(cola.urgentes.map((c) => c.id)).toEqual(['viejo']);
  });

  it('el vendedor solo ve lo suyo; el admin ve todo', () => {
    const clientes = [alex({ id: 'mio' }), alex({ id: 'ajeno', createdBy: 'Emmanuel Bernal' })];
    expect(colaDelDia(clientes, [], opciones).calientes.map((c) => c.id)).toEqual(['mio']);
    expect(colaDelDia(clientes, [], { ...opciones, esAdmin: true }).calientes).toHaveLength(2);
  });

  it('ignora lo que no es de Alex, lo que ya salió de Prospectos y lo que no califica', () => {
    const clientes = [
      { id: 'vendedor', section: 'prospectos', createdBy: 'Alejandro Acosta', caracteristicas: { temperatura: 'caliente' } },
      alex({ id: 'proceso', section: 'procesos' }),
      alex({ id: 'fuera', caracteristicas: { temperatura: 'caliente', alertas: ['fuera_cobertura'] } }),
    ];
    const cola = colaDelDia(clientes, [], opciones);
    expect(pendientesDelDia(cola)).toBe(0);
  });

  it('separa las citas de hoy de las pasadas sin cerrar', () => {
    const citas = [
      { id: 'hoy', fechaCita: new Date(2026, 10, 13, 17).getTime() },
      { id: 'hoy-cerrada', fechaCita: new Date(2026, 10, 13, 9).getTime(), atendida: true },
      { id: 'ayer', fechaCita: new Date(2026, 10, 12, 10).getTime() },
      { id: 'vieja', fechaCita: new Date(2026, 9, 1, 10).getTime() },
      { id: 'no-llego', fechaCita: new Date(2026, 10, 11, 10).getTime(), noAsistio: true },
      { id: 'manana', fechaCita: new Date(2026, 10, 14, 10).getTime() },
    ];
    const cola = colaDelDia([], citas, opciones);
    expect(cola.citasHoy.map((c) => c.id)).toEqual(['hoy']);
    expect(cola.citasSinCerrar.map((c) => c.id)).toEqual(['ayer']);
    expect(pendientesDelDia(cola)).toBe(1);
  });
});
