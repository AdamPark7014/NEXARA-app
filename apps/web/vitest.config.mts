import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const r = (p: string) => resolve(here, p);

// Zona fija para todo el runner: las fechas del formulario se arman en hora local y
// sin esto la misma prueba daba otra hora en CI (UTC) que en la oficina. Ciudad de
// México no tiene horario de verano desde 2022, así que el desfase es siempre UTC-6.
// Se fija aquí, antes de levantar los workers, para que lo hereden.
process.env.TZ = 'America/Mexico_City';

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
    // Los cinco segundos por omisión los agota el editor de cotizaciones, cuya
    // prueba más lenta ya gasta 2,6 s en solitario tecleando con `userEvent`.
    // Con la máquina cargada se pasaba de largo y el suite fallaba a ratos.
    testTimeout: 15_000,
  },
});
