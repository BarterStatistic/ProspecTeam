import { describe, it, expect } from 'vitest';
import { posicionMenu } from './floating.js';

const ventana = { width: 1440, height: 900 };
const boton = (left, top, size = 24) => ({ left, top, right: left + size, bottom: top + size });

describe('posicionMenu', () => {
  it('abre hacia abajo, alineado al borde derecho del botón', () => {
    expect(posicionMenu(boton(400, 200), ventana)).toEqual({ left: 200, top: 228, maxHeight: 664 });
  });

  it('abre hacia arriba cuando abajo no cabe y arriba hay más espacio', () => {
    const pos = posicionMenu(boton(400, 800), ventana);
    expect(pos.top).toBeUndefined();
    expect(pos.bottom).toBe(104);
    expect(pos.maxHeight).toBe(788);
  });

  it('no se sale por la izquierda (primera columna junto al menú lateral)', () => {
    expect(posicionMenu(boton(10, 200), ventana).left).toBe(8);
  });

  it('no se sale por la derecha', () => {
    expect(posicionMenu(boton(1430, 200, 20), { width: 1440, height: 900 }).left).toBe(1208);
  });

  it('prefiere abajo si hay espacio suficiente aunque arriba haya más', () => {
    expect(posicionMenu(boton(400, 500), ventana).top).toBe(528);
  });
});
