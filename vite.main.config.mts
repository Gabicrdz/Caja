import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Proceso main (Node.js). better-sqlite3 queda afuera del paquete de Vite:
// se carga desde node_modules porque tiene una parte compilada (.node).
export default defineConfig({
  resolve: {
    alias: { '@compartido': fileURLToPath(new URL('./src/compartido', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
});
