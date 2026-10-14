import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/DoReGo/' : '/',
  build: {
    rollupOptions: { input: { main: resolve('index.html'), render: resolve('render.html') } },
  },
}));
