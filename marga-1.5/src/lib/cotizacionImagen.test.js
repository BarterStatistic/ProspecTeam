import { describe, it, expect } from 'vitest';
import { tarjetaCotizacionHTML, nombreArchivo } from './cotizacionImagen.js';
import { SCHEMES, motoPorNombre } from './motos.js';
import { parcialidad } from './cotizador.js';

const moto = motoPorNombre('SUPER SPORT 400');
const esquema = SCHEMES.motoxpress;

function pagosPara(enganchePct, incluyeServicio) {
  const precio = moto.precio + (incluyeServicio ? moto.servicio : 0);
  const montoACredito = precio - precio * (enganchePct / 100);
  return Object.fromEntries(
    esquema.terms.map((plazo) => [
      plazo,
      Math.round(parcialidad({ esquemaId: 'motoxpress', montoACredito, enganchePct, plazo })),
    ]),
  );
}

const base = {
  moto,
  esquema,
  enganchePct: 15,
  incluyeServicio: true,
  pagos: pagosPara(15, true),
  vendedor: 'Braulio Acosta',
  fecha: new Date(2026, 8, 17).getTime(),
};

describe('tarjetaCotizacionHTML', () => {
  it('un plazo: reproduce las cifras de la imagen del cotizador original', () => {
    const html = tarjetaCotizacionHTML({ ...base, modo: 'single', plazos: [72] });
    expect(html).toContain('Cotización · Braulio Acosta · Dinamo Saltillo');
    expect(html).toContain('SUPER SPORT 400');
    expect(html).toContain('>Motoxpress<');
    expect(html).toContain('>72<');
    expect(html).toContain('Parcialidad quincena');
    expect(html).toContain('$3,423');
    expect(html).toContain('+$3,814.00');
    expect(html).toContain('$80,315.00');
    expect(html).toContain('$84,129.00');
    expect(html).toContain('>15%<');
    expect(html).toContain('$12,619.35');
    expect(html).toContain('$71,509.65');
    expect(html).toContain('Cotizado por Braulio Acosta · 17/09/2026');
    expect(html).toContain('Cotización con vigencia de 5 días');
    expect(html).toContain('Parcialidad quincena · redondeada al entero más cercano');
    // Seis datos → dos filas de tres columnas.
    expect(html.match(/repeat\(3,1fr\)/g)).toHaveLength(2);
  });

  it('un plazo sin servicio: dos filas de dos columnas', () => {
    const html = tarjetaCotizacionHTML({
      ...base,
      incluyeServicio: false,
      pagos: pagosPara(15, false),
      modo: 'single',
      plazos: [72],
    });
    expect(html).not.toContain('Servicio preventivo');
    expect(html).not.toContain('Precio Paquete');
    expect(html.match(/repeat\(2,1fr\)/g)).toHaveLength(2);
  });

  it('varios plazos: tabla solo con los plazos elegidos', () => {
    const html = tarjetaCotizacionHTML({ ...base, modo: 'multi', plazos: [12, 72] });
    expect(html).toContain('<table');
    expect(html.match(/<tr style="background:rgba\((18|10),/g)).toHaveLength(2);
    expect(html).toContain('Parcialidades quincenas · redondeadas al entero más cercano');
    expect(html).not.toContain('Servicio preventivo');
    expect(html).toContain('Precio Paquete');
  });

  it('escapa el nombre del vendedor', () => {
    const html = tarjetaCotizacionHTML({ ...base, vendedor: '<b>x</b>', modo: 'all', plazos: esquema.terms });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('nombreArchivo', () => {
  it('igual que el original', () => {
    expect(nombreArchivo('SUPER SPORT 400')).toBe('cotizacion-super-sport-400.jpg');
  });
});
