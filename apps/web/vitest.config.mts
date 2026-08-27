import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const r = (p: string) => resolve(here, p);

/**
 * Runner de tests de `apps/web`.
 *
 * Hasta ahora los 69 `*.spec.ts` del repo vivían todos en `apps/api/src/**` y a
 * la web el CI solo le pasaba `tsc --noEmit`: cero cobertura de comportamiento
 * en el frontend. Vitest + Testing Library es lo que encaja con Next 14 sin
 * arrastrar el toolchain de Jest/Babel que la API ya usa por su lado.
 *
 * Los alias replican los `paths` de `tsconfig.json` a mano: `vite-tsconfig-paths`
 * añadiría una dependencia más para resolver cuatro entradas.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@nexara/offline-shared', replacement: r('../../shared/offline-fetch-rules.ts') },
      { find: /^@\/components\/(.*)$/, replacement: r('./components') + '/$1' },
      { find: /^@\/app\/(.*)$/, replacement: r('./app') + '/$1' },
      { find: /^@\/(.*)$/, replacement: r('.') + '/$1' },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['{app,components,lib}/**/*.spec.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'build/**'],
    restoreMocks: true,
    clearMocks: true,
  },
});
