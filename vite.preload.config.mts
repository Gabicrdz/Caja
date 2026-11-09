import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@compartido': fileURLToPath(new URL('./src/compartido', import.meta.url)) },
  },
});
