import { describe, expect, it } from 'vitest';
import {
  allowedOrigin,
  findByUsername,
  internalEmail,
  isLockedOut,
  nextFailureCount,
  sha256Hex,
  userIdFromEmail,
} from './authLogic.js';

describe('authLogic', () => {
  it('correo interno de ida y vuelta', () => {
    expect(internalEmail('Braulio-Acosta')).toBe('braulio-acosta@marga.local');
    expect(userIdFromEmail('braulio-acosta@marga.local')).toBe('braulio-acosta');
    expect(userIdFromEmail('alguien@gmail.com')).toBeNull();
  });

  it('el hash coincide con el de la versión anterior (hashPassword)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('solo los orígenes de Marga', () => {
    expect(allowedOrigin('https://marga-6bb72.web.app')).toBeTruthy();
    expect(allowedOrigin('https://marga-6bb72--prueba-abc123.web.app')).toBeTruthy();
    expect(allowedOrigin('http://localhost:5174')).toBeTruthy();
    expect(allowedOrigin('https://evil.web.app')).toBeNull();
    expect(allowedOrigin('https://marga-6bb72.web.app.evil.com')).toBeNull();
  });

  it('busca por nombre exacto sin distinguir mayúsculas', () => {
    const rows = [{ id: 'a', data: { username: 'Braulio Acosta' } }, { id: 'b', data: { username: 'Emmanuel Bernal' } }];
    expect(findByUsername(rows, '  braulio acosta ')?.id).toBe('a');
    expect(findByUsername(rows, 'braulio')).toBeNull();
  });

  it('freno: 5 fallos dentro de 15 min bloquean; luego se reinicia', () => {
    const ahora = Date.parse('2026-11-05T12:00:00Z');
    const fila = { failures: 5, last_failure: '2026-11-05T11:50:00Z' };
    expect(isLockedOut(fila, ahora)).toBe(true);
    expect(isLockedOut({ ...fila, last_failure: '2026-11-05T11:40:00Z' }, ahora)).toBe(false);
    expect(nextFailureCount({ failures: 2, last_failure: '2026-11-05T11:59:00Z' }, ahora)).toBe(3);
    expect(nextFailureCount({ failures: 4, last_failure: '2026-11-05T10:00:00Z' }, ahora)).toBe(1);
  });
});
