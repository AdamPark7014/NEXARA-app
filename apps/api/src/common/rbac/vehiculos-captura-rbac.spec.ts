import { checkUrlAccess } from './url-matrix';
import { ROLES, type RoleKey } from './roles.v2';

/**
 * Captura guiada de vehículos (21-11-2026). Todo el personal usa una unidad: pide los pasos, firma y
 * ve el bloque «Vehículo» de su actividad. Liz (coord_admin) gestiona: aprueba, revisa daños e
 * incidencias; la matriz se lo negaba aunque su rol ya traía `vehicles.review`.
 */
describe('vehículos: captura guiada', () => {
  const PERSONAL: RoleKey[] = [ROLES.ING_CAMPO, ROLES.ING_SOPORTE, ROLES.ARQUITECTO, ROLES.COORD_OPERACIONES, ROLES.COORD_ADMIN, ROLES.RH];

  it.each(PERSONAL)('%s pide los pasos, ve el bloque de su actividad y firma', (rol) => {
    expect(checkUrlAccess(rol, '/api/vehicles/captura-guiada', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/vehicles/por-actividad/40', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/vehicles/7/firmas', 'POST').allowed).toBe(true);
  });

  it('Liz aprueba solicitudes y revisa daños e incidencias', () => {
    for (const [metodo, ruta] of [
      ['GET', '/api/vehicles'],
      ['PATCH', '/api/vehicles/7/approve'],
      ['GET', '/api/vehicles/danos'],
      ['PATCH', '/api/vehicles/danos/3'],
      ['POST', '/api/vehicles/7/analizar-danos'],
      ['GET', '/api/vehicles/incidencias'],
      ['POST', '/api/vehicles/incidencias'],
      ['PATCH', '/api/vehicles/incidencias/3'],
    ] as const) {
      expect(checkUrlAccess(ROLES.COORD_ADMIN, ruta, metodo).allowed).toBe(true);
    }
  });

  // Las lecturas (`GET /api/vehicles/**`) ya las abre la matriz a campo; ahí el filtro es el permiso
  // `vehicles.review` del controlador. Lo que la matriz sí cierra es escribir.
  it('un técnico no confirma daños ni abre o cambia incidencias', () => {
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/vehicles/danos/3', 'PATCH').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/vehicles/incidencias', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/vehicles/incidencias/3/cobro', 'PATCH').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/vehicles/7/analizar-danos', 'POST').allowed).toBe(false);
  });
});
