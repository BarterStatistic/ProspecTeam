import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' produces relative asset URLs so the build works from any
// GitHub Pages subpath (e.g. user.github.io/<repo>/marga/) without extra config.
export default defineConfig({
  base: './',
  plugins: [react()],
});
