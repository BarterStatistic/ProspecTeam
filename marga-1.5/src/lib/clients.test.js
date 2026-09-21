import { describe, it, expect } from 'vitest';
import { regresoAColumna } from './clients.js';

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
