import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Las pruebas corren en Node.js (sin abrir Electron). better-sqlite3 13 trae
// su binario "N-API", que funciona igual en Node y en Electron, así que las
// pruebas usan la base de datos real.
export default defineConfig({
  resolve: {
    alias: {
      '@compartido': fileURLToPath(new URL('./src/compartido', import.meta.url)),
    },
  },
  test: {
    include: ['pruebas/**/*.test.ts'],
    environment: 'node',
  },
});
