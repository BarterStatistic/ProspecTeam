import { describe, it, expect } from 'vitest';
import { hashPassword, firmaSesion, verificarSesion } from './auth.js';

async function usuario(extra = {}) {
  return {
    id: 'ana',
    username: 'Ana',
    role: 'vendedor',
    passwordHash: await hashPassword('secreta1'),
    ...extra,
  };
}

async function sesionDe(record) {
  return { id: record.id, firma: await firmaSesion(record) };
}

describe('verificarSesion', () => {
  it('devuelve el usuario con nombre y rol tomados de la base', async () => {
    const ana = await usuario();
    const sesion = await sesionDe(ana);
    expect(await verificarSesion(sesion, [ana])).toEqual({
      id: 'ana',
      username: 'Ana',
      role: 'vendedor',
    });
  });

  it('ignora un rol escrito a mano en la sesión: manda el de la base', async () => {
    const ana = await usuario();
    const alterada = { ...(await sesionDe(ana)), role: 'admin', username: 'Braulio Acosta' };
    expect((await verificarSesion(alterada, [ana])).role).toBe('vendedor');
  });

  it('refleja al instante un cambio de rol hecho por el admin', async () => {
    const ana = await usuario();
    const sesion = await sesionDe(ana);
    const promovida = { ...ana, role: 'promotor' };
    expect((await verificarSesion(sesion, [promovida])).role).toBe('promotor');
  });

  it('rechaza una sesión sin firma (alterada o de una versión anterior)', async () => {
    const ana = await usuario();
    expect(await verificarSesion({ id: 'ana', role: 'admin' }, [ana])).toBeNull();
    expect(await verificarSesion({ id: 'ana', firma: 'inventada' }, [ana])).toBeNull();
    expect(await verificarSesion(null, [ana])).toBeNull();
  });

  it('rechaza la sesión de un usuario eliminado', async () => {
    const ana = await usuario();
    const otro = await usuario({ id: 'otro', username: 'Otro' });
    expect(await verificarSesion(await sesionDe(ana), [otro])).toBeNull();
  });

  it('rechaza la sesión cuando la contraseña cambió', async () => {
    const ana = await usuario();
    const sesion = await sesionDe(ana);
    const nueva = { ...ana, passwordHash: await hashPassword('otraClave2') };
    expect(await verificarSesion(sesion, [nueva])).toBeNull();
  });

  it('espera (undefined) mientras la lista de usuarios no ha llegado', async () => {
    const ana = await usuario();
    expect(await verificarSesion(await sesionDe(ana), [])).toBeUndefined();
  });

  it('la firma no es el hash de la contraseña en crudo', async () => {
    const ana = await usuario();
    expect(await firmaSesion(ana)).not.toBe(ana.passwordHash);
  });
});
