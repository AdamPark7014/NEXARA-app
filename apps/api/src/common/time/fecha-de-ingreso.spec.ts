import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { workDateKey, workDateKeyOf } from './workday';

/**
 * La fecha de ingreso es un día de calendario. Recursos Humanos la captura en la web y se guarda a
 * medianoche UTC; el importador de Excel la guarda a mediodía UTC.
 *
 * Leída con `workDateKey` (el día de un instante en México), la de medianoche caía en la tarde del
 * día anterior: indicadores y nómina le exigían a la persona el día antes de entrar.
 */
describe('fecha de ingreso: día de calendario', () => {
  it('capturada en la web (medianoche UTC) es ese día, no el anterior', () => {
    const ingreso = new Date('2026-09-15T00:00:00.000Z');
    expect(workDateKey(ingreso)).toBe('2026-09-14'); // por eso no sirve para un día de calendario
    expect(workDateKeyOf(ingreso)).toBe('2026-09-15');
  });

  it('importada de Excel (mediodía UTC) es ese mismo día', () => {
    expect(workDateKeyOf(new Date('2026-09-15T12:00:00.000Z'))).toBe('2026-09-15');
  });

  it('ningún módulo la lee como si fuera un instante', () => {
    const raiz = join(__dirname, '..', '..');
    const hallazgos: string[] = [];
    const recorre = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorre(ruta);
        else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) {
          readFileSync(ruta, 'utf8')
            .split('\n')
            .forEach((linea, i) => {
              if (/workDateKey\([^)]*fechaIngreso/.test(linea)) hallazgos.push(`${relative(raiz, ruta)}:${i + 1}`);
            });
        }
      }
    };
    recorre(raiz);
    expect(hallazgos).toEqual([]);
  });
});
