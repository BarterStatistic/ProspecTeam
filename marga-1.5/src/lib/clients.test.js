import { describe, it, expect } from 'vitest';
import { regresoAColumna, mensajeEliminarCliente } from './clients.js';

describe('regresoAColumna', () => {
  it('devuelve la tarjeta al final de su columna de origen', () => {
    const columna = [{ id: 'a' }, { id: 'b' }];
    expect(regresoAColumna(columna, 'x', 'credito_aprobado')).toEqual({
      movedId: 'x',
      toStage: 'credito_aprobado',
      stageChanged: true,
      orderedIds: ['a', 'b', 'x'],
    });
  });

  it('no duplica la tarjeta si la columna todavía la incluye', () => {
    const columna = [{ id: 'a' }, { id: 'x' }, { id: 'b' }];
    expect(regresoAColumna(columna, 'x', 'credito_aprobado').orderedIds).toEqual(['a', 'b', 'x']);
  });

  it('funciona con la columna vacía', () => {
    expect(regresoAColumna([], 'x', 'credito_por_subir').orderedIds).toEqual(['x']);
  });
});

describe('mensajeEliminarCliente', () => {
  const cliente = { firstName: 'Juan', lastName: 'Pérez' };

  it('sin comisión, solo pide confirmar', () => {
    expect(mensajeEliminarCliente(cliente, [])).toBe(
      '¿Eliminar a Juan Pérez? Esta acción no se puede deshacer.',
    );
  });

  it('con comisión, avisa que también se borra y de cuánto es', () => {
    const msg = mensajeEliminarCliente(cliente, [
      { vendedor: 'Ana', comisionVendedor: 1386.55, comisionTotal: 9243.67 },
    ]);
    expect(msg).toContain('también se eliminará su comisión');
    expect(msg).toContain('Ana: $1,386.55');
    expect(msg).toContain('$9,243.67');
  });
});
