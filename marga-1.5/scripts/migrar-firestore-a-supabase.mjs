// Copia todos los datos de Marga de Firestore (marga-6bb72) a las tablas
// `marga_*` de Supabase. Lee la configuración de los dos lados en `.env.local`.
//
//   node scripts/migrar-firestore-a-supabase.mjs             → solo cuenta (no escribe)
//   node scripts/migrar-firestore-a-supabase.mjs --escribir  → copia y verifica
//
// Deja Supabase como copia exacta de Firestore: escribe cada documento por id
// y borra de Supabase lo que ya no existe en Firestore. Se puede correr las
// veces que haga falta ANTES del corte (la última, con la captura detenida).
// DESPUÉS del corte no: Supabase ya es la base viva y esto la regresaría al
// estado de Firestore. Firestore nunca se modifica; queda como respaldo.

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, getDoc, Timestamp } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v]),
);

for (const k of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY']) {
  if (!env[k]) {
    console.error(`Falta ${k} en .env.local`);
    process.exit(1);
  }
}

const escribir = process.argv.includes('--escribir');

const fs = getFirestore(
  initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, {
  auth: { persistSession: false },
});

const COLECCIONES = {
  clients: 'marga_clients',
  users: 'marga_users',
  citas: 'marga_citas',
  buroAutorizaciones: 'marga_buro_autorizaciones',
  comisiones: 'marga_comisiones',
  cotizaciones: 'marga_cotizaciones',
  notificaciones: 'marga_notificaciones',
};
const DOCS_CONFIG = ['comisiones', 'disponibilidad'];

// La app solo escribe JSON plano, pero si algún documento trae un tipo propio
// de Firestore (Timestamp, referencia…) se avisa en vez de copiarlo mal.
const raros = [];
function revisarTipos(valor, ruta) {
  if (valor instanceof Timestamp) raros.push(`${ruta} (Timestamp)`);
  else if (Array.isArray(valor)) valor.forEach((v, i) => revisarTipos(v, `${ruta}[${i}]`));
  else if (valor && typeof valor === 'object') {
    if (Object.getPrototypeOf(valor) !== Object.prototype) raros.push(`${ruta} (${valor.constructor?.name})`);
    else for (const [k, v] of Object.entries(valor)) revisarTipos(v, `${ruta}.${k}`);
  }
}

async function contarSupabase(tabla) {
  const { count, error } = await sb.from(tabla).select('id', { count: 'exact', head: true });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count;
}

async function idsSupabase(tabla) {
  const ids = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select('id').order('id').range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    ids.push(...data.map((r) => r.id));
    if (data.length < 1000) return ids;
  }
}

async function setMany(tabla, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.rpc('marga_set_many', { t: tabla, rows: rows.slice(i, i + 500) });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

const resumen = [];

for (const [col, tabla] of Object.entries(COLECCIONES)) {
  const snap = await getDocs(collection(fs, col));
  // Como en firestoreStore: { id: doc.id, ...data } — el id del documento manda.
  const rows = snap.docs.map((d) => {
    const data = d.data();
    revisarTipos(data, `${col}/${d.id}`);
    return { ...data, id: d.id };
  });
  const enFirestore = new Set(rows.map((r) => r.id));
  const sobrantes = (await idsSupabase(tabla)).filter((id) => !enFirestore.has(id));
  if (escribir) {
    await setMany(tabla, rows);
    if (sobrantes.length) {
      const { error } = await sb.rpc('marga_delete_many', { t: tabla, ids: sobrantes });
      if (error) throw new Error(`${tabla}: ${error.message}`);
    }
  }
  resumen.push({
    coleccion: col,
    firestore: rows.length,
    supabase: await contarSupabase(tabla),
    borrados: sobrantes.length + (escribir ? '' : ' (por borrar)'),
  });
}

for (const id of DOCS_CONFIG) {
  const snap = await getDoc(doc(fs, 'config', id));
  if (!snap.exists()) {
    resumen.push({ coleccion: `config/${id}`, firestore: 'no existe', supabase: '—' });
    continue;
  }
  const data = snap.data();
  revisarTipos(data, `config/${id}`);
  if (escribir) {
    // Reemplazo completo (no merge): Supabase queda idéntico a Firestore.
    const { error } = await sb.from('marga_config').upsert({ id, data });
    if (error) throw new Error(`config/${id}: ${error.message}`);
  }
  resumen.push({ coleccion: `config/${id}`, firestore: Object.keys(data).length + ' campos', supabase: escribir ? 'copiado' : '—' });
}

console.table(resumen);
if (raros.length) {
  console.warn('Valores con tipos de Firestore (revisar antes del corte):');
  for (const r of raros.slice(0, 50)) console.warn('  ' + r);
}
if (!escribir) console.log('Solo conteo. Para copiar: node scripts/migrar-firestore-a-supabase.mjs --escribir');
process.exit(0);
