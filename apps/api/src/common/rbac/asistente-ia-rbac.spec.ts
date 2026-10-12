import { ROLES } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/** «Asignar con IA» abre solo para quien asigna; crear sigue en `POST /api/activities`. */
describe('matriz: asistente de actividades con IA', () => {
  it.each([ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_OPERACIONES, ROLES.ENC_SOPORTE, ROLES.ARQUITECTO])(
    '%s puede interpretar instrucciones',
    (role) => {
      expect(checkUrlAccess(role, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(true);
      expect(checkUrlAccess(role, '/api/ai/asistente/estado', 'GET').allowed).toBe(true);
    },
  );

  it('un ingeniero de campo no la usa', () => {
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(false);
  });
});
