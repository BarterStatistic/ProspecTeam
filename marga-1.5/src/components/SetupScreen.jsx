import { DatabaseZap } from 'lucide-react';

// Shown when neither Firebase env vars nor demo mode are configured. Points
// whoever is setting the app up to the README instructions.
export default function SetupScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="m-glass w-full max-w-lg animate-fadeIn rounded-2xl p-8">
        <div className="mb-5 flex items-center gap-3">
          <DatabaseZap size={28} className="text-gold" />
          <h1 className="text-2xl font-extrabold tracking-tight">
            <span className="text-gold">Marga 2.0</span>
          </h1>
        </div>

        <p className="mb-4 text-sm text-ink-muted">
          Falta configurar la base de datos compartida. Para que el equipo vea los mismos datos
          desde cualquier dispositivo:
        </p>

        <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm text-ink">
          <li>
            Crea un proyecto gratuito en{' '}
            <span className="text-sky2">console.firebase.google.com</span> y habilita{' '}
            <span className="text-gold">Cloud Firestore</span>.
          </li>
          <li>
            Copia el archivo <code className="text-sky2">.env.example</code> como{' '}
            <code className="text-sky2">.env.local</code> y pega la configuración web de tu
            proyecto.
          </li>
          <li>Reinicia la aplicación.</li>
        </ol>

        <p className="text-xs text-ink-faint">
          ¿Solo quieres probar la app en este navegador? Pon{' '}
          <code className="text-sky2">VITE_DEMO=1</code> en <code>.env.local</code> (los datos no
          se compartirán entre dispositivos). Instrucciones completas en el README del proyecto.
        </p>
      </div>
    </div>
  );
}
