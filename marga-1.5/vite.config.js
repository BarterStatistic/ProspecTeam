import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' produces relative asset URLs so the build works from any static
// host subpath without extra config. Port 5174 avoids clashing with marga v1.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5174 },
});
