// Store bootstrap. Picks the backend once at startup:
//   - VITE_DEMO=1              → localStorage demo store (single device)
//   - Supabase env vars set    → Supabase (shared, cross-device) — producción
//   - Firebase env vars set    → Firestore (base anterior; queda como respaldo
//                                para volver atrás si hiciera falta)
//   - neither                  → 'unconfigured' (App shows the setup screen)

import { createFirestoreStore } from './firestoreStore.js';
import { createMemoryStore } from './memoryStore.js';
import { createSupabaseStore } from './supabaseStore.js';

const env = import.meta.env;

const supabaseConfig = {
  url: env.VITE_SUPABASE_URL,
  key: env.VITE_SUPABASE_KEY,
};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const isDemo = env.VITE_DEMO === '1' || env.VITE_DEMO === 'true';
const hasSupabase = !!(supabaseConfig.url && supabaseConfig.key);
const hasFirebase = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const storeMode = isDemo
  ? 'demo'
  : hasSupabase
    ? 'supabase'
    : hasFirebase
      ? 'firestore'
      : 'unconfigured';

export const store =
  storeMode === 'demo'
    ? createMemoryStore()
    : storeMode === 'supabase'
      ? createSupabaseStore(supabaseConfig)
      : storeMode === 'firestore'
        ? createFirestoreStore(firebaseConfig)
        : null;

/** Resolves when the store is ready (seeded + live listeners attached). */
export function initStore() {
  if (!store) return Promise.resolve();
  return store.init();
}
