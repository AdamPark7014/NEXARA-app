import { checkUrlAccess } from './url-matrix';
import { ROLES, type RoleKey } from './roles.v2';

/**
 * 18-11-2026: Luis (dir_operaciones) creaba la actividad y al guardar «qué hay que fotografiar» la matriz
 * respondía «Tu rol no puede acceder a PUT /api/activities/584/evidencia-campos». Igual Liz y dirección:
 * tienen ACTIVITIES_MANAGE pero la matriz les cerraba las escrituras de la actividad.
 */
describe('escrituras de actividades para quien gestiona', () => {
  const RUTAS: Array<['GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', string]> = [
    ['GET', '/api/activities/584/evidencia-campos'],
    ['PUT', '/api/activities/584/evidencia-campos'],
    ['GET', '/api/activities/584/herramientas'],
    ['PUT', '/api/activities/584/herramientas'],
    ['POST', '/api/activities/584/herramientas/3/check'],
    ['GET', '/api/activities/584/adjuntos'],
    ['POST', '/api/activities/584/adjuntos'],
    ['DELETE', '/api/activities/584/adjuntos/9'],
    ['PATCH', '/api/activities/584'],
    ['PATCH', '/api/activities/584/execute'],
  ];
  const GESTIONAN: RoleKey[] = [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN];

  it.each(GESTIONAN)('%s pasa la matriz en las escrituras de la actividad', (rol) => {
    for (const [metodo, ruta] of RUTAS) {
      expect([metodo, ruta, checkUrlAccess(rol, ruta, metodo).allowed]).toEqual([metodo, ruta, true]);
    }
  });

  it.each([ROLES.RH, ROLES.CONTABILIDAD, ROLES.VENDEDOR])('%s no gana las escrituras de gestión', (rol) => {
    for (const [metodo, ruta] of RUTAS.filter(([m]) => m === 'PUT' || m === 'DELETE')) {
      expect([metodo, ruta, checkUrlAccess(rol, ruta, metodo).allowed]).toEqual([metodo, ruta, false]);
    }
    expect(checkUrlAccess(rol, '/api/activities/584', 'PATCH').allowed).toBe(false);
  });
});
