import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScheduleModule } from '@nestjs/schedule';
import { tareasProgramadas } from './relevo';

function modulosDe(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return modulosDe(ruta);
    return e.name.endsWith('.module.ts') ? [ruta] : [];
  });
}

describe('tareasProgramadas', () => {
  const antes = process.env.NEXARA_RELEVO;

  afterEach(() => {
    if (antes === undefined) delete process.env.NEXARA_RELEVO;
    else process.env.NEXARA_RELEVO = antes;
  });

  it('el contenedor principal corre las tareas programadas', () => {
    delete process.env.NEXARA_RELEVO;
    expect(tareasProgramadas().map((m) => m.module)).toEqual([ScheduleModule]);
  });

  it('el relevo de un despliegue no las corre, para no repetirlas', () => {
    process.env.NEXARA_RELEVO = '1';
    expect(tareasProgramadas()).toEqual([]);
  });

  it('ningún módulo de la API las enciende por su cuenta', () => {
    const directos = modulosDe(join(__dirname, '..')).filter((ruta) =>
      readFileSync(ruta, 'utf8').includes('ScheduleModule.forRoot('),
    );
    expect(directos).toEqual([]);
  });
});
