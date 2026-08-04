// Store bootstrap. Picks the backend once at startup:
//   - VITE_DEMO=1              → localStorage demo store (single device)
//   - Firebase env vars set    → Firestore (shared, cross-device)
//   - neither                  → 'unconfigured' (App shows the setup screen)

import { createFirestoreStore } from './firestoreStore.js';
import { createMemoryStore } from './memoryStore.js';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const isDemo = env.VITE_DEMO === '1' || env.VITE_DEMO === 'true';
const hasFirebase = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const storeMode = isDemo ? 'demo' : hasFirebase ? 'firestore' : 'unconfigured';

export const store =
  storeMode === 'demo'
    ? createMemoryStore()
    : storeMode === 'firestore'
      ? createFirestoreStore(firebaseConfig)
      : null;

/** Resolves when the store is ready (seeded + live listeners attached). */
export function initStore() {
  if (!store) return Promise.resolve();
  return store.init();
}
