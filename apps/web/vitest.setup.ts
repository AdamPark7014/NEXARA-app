import '@testing-library/jest-dom/vitest';
// `configure` de `@testing-library/dom` y no el de `react`: el de react acepta
// su propia Config, sin `asyncUtilTimeout`, y el build de Docker —instalación
// limpia— lo rechazaba aunque el `tsc` de esta máquina lo diera por bueno.
import { configure } from '@testing-library/dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Margen de espera de `findBy*` y `waitFor`.
 *
 * El segundo que trae Testing Library por defecto alcanza cuando un archivo
 * corre solo, no cuando corren ochenta y seis en paralelo: la prueba de
 * sintonización de INTEGRA fallaba a 1541 ms buscando un texto que la pantalla
 * aún no había pintado porque seguía en «Comprobando…». Fallaba a veces, que es
 * la peor forma de fallar — un suite que se cae al azar deja de creerse.
 *
 * Cuatro segundos no esconden un elemento que de verdad falta: solo tarda más
 * en decirlo.
 */
configure({ asyncUtilTimeout: 4000 });

// Cada test arranca con el localStorage limpio: la empresa activa multi-tenant
// se persiste ahí y se filtraría de un test al siguiente.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

// jsdom no implementa matchMedia y varios componentes lo consultan al montar.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (!('IntersectionObserver' in window)) {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });
}

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
}
