import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { offlineBuild } from './scripts/offline-build';

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/DoReGo/' : '/',
  plugins: [offlineBuild()],
  build: {
    rollupOptions: { input: { main: resolve('index.html'), render: resolve('render.html') } },
  },
}));
