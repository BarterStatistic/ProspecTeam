import { SUPABASE_URL, SUPABASE_KEY } from '../config.mjs';

export async function rpc(nombre, args = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const cuerpo = await r.json();
  if (!r.ok) {
    const e = new Error(cuerpo?.message ?? `HTTP ${r.status}`);
    e.status = r.status;
    e.cuerpo = cuerpo;
    throw e;
  }
  return cuerpo;
}
