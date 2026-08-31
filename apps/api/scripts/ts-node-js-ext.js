/**
 * Preload para los CLI que corren TypeScript con ts-node en CommonJS.
 *
 * El código de `src/` importa con extensión explícita (`../prisma/prisma.service.js`)
 * porque el `tsconfig` usa `moduleResolution: node16`. Compilado a `dist/` esos
 * `.js` existen y todo resuelve; ejecutando el `.ts` directamente, no: Node
 * busca un `.js` que aún no se ha generado y falla con MODULE_NOT_FOUND.
 *
 * Jest resuelve lo mismo con `moduleNameMapper: {'^(\\.{1,2}/.*)\\.js$': '$1'}`.
 * Esto es ese mapeo, en un require hook.
 *
 * Se aplica **solo si la resolución normal ya falló**, así que un paquete real
 * que termine en `.js` sigue ganando.
 *
 *   node -r ./scripts/ts-node-js-ext.js -r ts-node/register/transpile-only ...
 */
const Module = require('module');

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  try {
    return resolveFilename.call(this, request, ...rest);
  } catch (err) {
    if (/^\.{1,2}\//.test(request) && request.endsWith('.js')) {
      return resolveFilename.call(this, request.slice(0, -3), ...rest);
    }
    throw err;
  }
};
