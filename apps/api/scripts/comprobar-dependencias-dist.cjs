/**
 * Falla el build de la imagen si dist/ usa un paquete que no quedó en ella.
 *
 * La imagen solo lleva lo de `dependencies`. Un paquete declarado en `devDependencies` o solo en la web compila
 * bien, y si su `require` está dentro de una función la API arranca bien: tronaría hasta que alguien use esa
 * pantalla, como `sharp` en los croquis. Se corre en deploy/docker/Dockerfile.api.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const raiz = process.argv[2] || '/app/apps/api/dist';
const faltan = new Map();

function revisar(archivo) {
  const codigo = fs.readFileSync(archivo, 'utf8');
  for (const m of codigo.matchAll(/(?:require\(|import\()\s*['"]([^'"./][^'"]*)['"]/g)) {
    if (Module.isBuiltin(m[1]) || faltan.has(m[1])) continue;
    try {
      require.resolve(m[1], { paths: [path.dirname(archivo)] });
    } catch {
      faltan.set(m[1], path.relative(raiz, archivo));
    }
  }
}

(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(ruta);
    else if (/\.c?js$/.test(e.name)) revisar(ruta);
  }
})(raiz);

if (faltan.size) {
  console.error('dist/ usa paquetes que no están en la imagen. Agrégalos a `dependencies` de apps/api/package.json:');
  for (const [paquete, archivo] of faltan) console.error(`  ${paquete}  (${archivo})`);
  process.exit(1);
}
console.log('dist/: todos los paquetes que usa están en la imagen.');
