/**
 * `emit()` llega al personal de todas las empresas. Contactos, prospectos, asistencia y proyectos salieron por ahí con
 * sus datos sin que nadie lo notara. Con datos de una empresa va `emitToCompany` o `emitToUser`; esta prueba detiene lo
 * demás.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `entity:updated` sale sin datos: `emit()` lo recorta con `soloMetadatos`. */
const SIN_DATOS = new Set(['entity:updated']);

describe('la difusión general', () => {
  it('solo la usan avisos sin datos', () => {
    const raiz = join(__dirname, '..');
    const conDatos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
          const fuente = readFileSync(ruta, 'utf8');
          for (const m of fuente.matchAll(/\b(?:realtimeGateway|realtime|gateway)\.emit\(\s*['"`]([^'"`]+)/g)) {
            if (!SIN_DATOS.has(m[1])) conDatos.push(`${ruta.slice(raiz.length + 1).replace(/\\/g, '/')}: ${m[1]}`);
          }
        }
      }
    };
    recorrer(raiz);
    expect(conDatos).toEqual([]);
  });
});
