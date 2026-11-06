// Notificaciones push de Marga (Web Push). El teléfono recibe los avisos
// aunque Marga esté cerrada: los manda la Edge Function marga-avisos.
//
// iPhone: solo funciona con Marga instalada en la pantalla de inicio
// (Compartir → Agregar a inicio) y iOS 16.4 o más nuevo.

// Llave pública VAPID (no es secreta). La privada vive en Supabase
// (`marga_avisos_config`), junto con la Edge Function.
export const VAPID_PUBLIC_KEY =
  'BFloGMNj7MkMBedSHkJ9YZrcDxlnNVUuxtteDYzZurQG6tI4WtI9lAC15X_r4-ITyEVZL8DWN0xbrJrcsk8HcSo';

/** Llave base64url → Uint8Array, como la pide pushManager.subscribe. */
export function llaveABytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function hayPush() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone/iPad fuera de la app instalada: el navegador no ofrece push. */
export function necesitaInstalar() {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada =
    window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return ios && !instalada;
}

let registro = null;
/** Registra el service worker (una vez). Devuelve el registro o null. */
export async function registrarServiceWorker() {
  if (!hayPush()) return null;
  registro ??= navigator.serviceWorker.register('./sw.js').catch(() => null);
  return registro;
}

/** 'activo' | 'inactivo' | 'bloqueado' | 'no-soportado' | 'instalar' */
export async function estadoPush(store) {
  if (necesitaInstalar()) return 'instalar';
  if (!hayPush() || !store?.push) return 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await registrarServiceWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'inactivo';
  try {
    return (await store.push.activo(sub.endpoint)) ? 'activo' : 'inactivo';
  } catch {
    return 'inactivo';
  }
}

/** Pide permiso, suscribe este dispositivo y lo registra en Supabase. */
export async function activarPush(store) {
  if (!hayPush() || !store?.push) throw new Error('Este navegador no admite notificaciones.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No se dio permiso para mostrar notificaciones.');
  const reg = await registrarServiceWorker();
  if (!reg) throw new Error('No se pudo preparar el servicio de notificaciones.');
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: llaveABytes(VAPID_PUBLIC_KEY),
    }));
  await store.push.suscribir(sub.toJSON(), navigator.userAgent);
}

/** Da de baja este dispositivo. */
export async function desactivarPush(store) {
  const reg = await registrarServiceWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await store?.push?.baja(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
