# Cotizador · Prospect Team

Herramienta web interna para generar cotizaciones de financiamiento de motocicletas.

## 📁 Estructura

```
cotizador-pt/
├── index.html        # App principal (cotizador)
├── 404.html          # Página de error personalizada
├── favicon.svg       # Ícono del sitio
├── robots.txt        # Bloquea indexación (herramienta interna)
├── netlify.toml      # Configuración de Netlify
└── README.md         # Este archivo
```

No requiere build, dependencias ni servidor backend. Es 100% estático.

---

## 🚀 Despliegue en Netlify

### Opción 1 — Drag & Drop (la más rápida, ~30 segundos)

1. Comprime esta carpeta como `.zip` (o usa el `.zip` que ya viene listo).
2. Entra a **https://app.netlify.com/drop**.
3. Arrastra el `.zip` (o la carpeta descomprimida) a la zona indicada.
4. Listo: Netlify te dará un link tipo `https://random-name-12345.netlify.app`.
5. Para personalizar el dominio: **Site settings → Change site name** → escribe `cotizador-prospectteam` (o el que prefieras).

### Opción 2 — Desde Git (recomendado para actualizaciones futuras)

1. Sube esta carpeta a un repositorio en **GitHub**, **GitLab** o **Bitbucket**.
2. En Netlify: **Add new site → Import an existing project**.
3. Conecta el repo. No necesitas configurar build command (es estático).
4. **Publish directory:** dejar `.` (raíz) — ya está definido en `netlify.toml`.
5. Click en **Deploy site**.

Cada `git push` desplegará automáticamente la nueva versión.

### Opción 3 — Netlify CLI

```bash
# Instalar CLI (una sola vez)
npm install -g netlify-cli

# Desde dentro de esta carpeta
netlify deploy --prod
```

---

## 🌐 Dominio personalizado

En **Site settings → Domain management → Add custom domain** puedes apuntar tu dominio (ej. `cotizador.prospectteam.com`). Netlify te genera un certificado SSL gratis automáticamente.

---

## 🔧 Personalización rápida

### Colores de marca
Abre `index.html` y edita las variables CSS al inicio del bloque `<style>`:

```css
:root {
  --pt-gold:  #D4A24C;   /* Dorado del logo */
  --pt-cyan:  #4FC3F7;   /* Azul del logo */
  --pt-bg:    #050608;   /* Fondo principal */
  ...
}
```

### Modelos y precios
Busca el array `MODELS` dentro del `<script>` y edita la lista:

```js
const MODELS = [
  ["U2", 21945],
  ["KF-RACER", 21971],
  ...
];
```

### Multiplicadores de financiamiento
Busca el objeto `SCHEMES` para ajustar tasas, rangos de enganche o niveles.

---

## ⚙️ Configuración técnica incluida

El `netlify.toml` ya configura:
- **Headers de seguridad** (X-Frame-Options, Content-Type, Referrer-Policy, Permissions-Policy)
- **Caché óptima** (HTML siempre fresco; favicon cacheado por 1 año)
- **Página 404** personalizada con la estética de marca

---

## 🆘 Soporte

- Documentación de Netlify: https://docs.netlify.com
- Para cambios funcionales del cotizador, contacta al equipo técnico.

---

**Prospect Team** · Persevera para Triunfar
