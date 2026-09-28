import { ROLES, type RoleKey } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/**
 * El alta de una actividad y la autoasignación no pueden responder 403 por la
 * matriz de URLs. Asignar a otra persona lo sigue decidiendo el controlador.
 */
const PERSONAL = (Object.values(ROLES) as RoleKey[]).filter((role) => role !== ROLES.CLIENTE);

describe('matriz: alta y autoasignación de actividades', () => {
  it.each(PERSONAL)('%s puede crear, autoasignarse, pedir el folio y leer proyectos del formulario', (role) => {
    expect(checkUrlAccess(role, '/api/activities', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/activities/next-an', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/me/activities', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/operational-projects', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/operational-projects/12', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/proyectos/12/programacion', 'GET').allowed).toBe(true);
  });

  it('un cliente no da de alta actividades ni lee el folio', () => {
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/activities', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/activities/next-an', 'GET').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/me/activities', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/operational-projects', 'GET').allowed).toBe(false);
  });

  it('administrativo lee el folio y no administra el catálogo de proyectos', () => {
    expect(checkUrlAccess(ROLES.ADMINISTRATIVO, '/api/activities/next-an', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.ADMINISTRATIVO, '/api/operational-projects', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.VENDEDOR, '/api/operational-projects', 'POST').allowed).toBe(false);
  });
});
