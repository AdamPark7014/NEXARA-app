import { ROLES, type RoleKey } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/**
 * El alta de una actividad y la autoasignación no pueden responder 403 por la
 * matriz de URLs. Asignar a otra persona lo sigue decidiendo el controlador.
 */
const PERSONAL = (Object.values(ROLES) as RoleKey[]).filter((role) => role !== ROLES.CLIENTE);

describe('matriz: alta y autoasignación de actividades', () => {
  it.each(PERSONAL)('%s puede crear, autoasignarse y pedir el folio', (role) => {
    expect(checkUrlAccess(role, '/api/activities', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/activities/next-an', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/me/activities', 'POST').allowed).toBe(true);
  });

  it('un cliente no da de alta actividades', () => {
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/activities', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/me/activities', 'POST').allowed).toBe(false);
  });
});
