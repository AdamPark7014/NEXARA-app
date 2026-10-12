import { ROLES } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/** «Asignar con IA» es solo del CEO; crear sigue en `POST /api/activities`. */
describe('matriz: asistente de actividades con IA', () => {
  it('el CEO interpreta instrucciones y ve a quién asignar', () => {
    expect(checkUrlAccess(ROLES.CEO, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CEO, '/api/ai/asistente/estado', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CEO, '/api/users/assignable', 'GET').allowed).toBe(true);
  });

  it.each([ROLES.DIR_OPERACIONES, ROLES.COORD_OPERACIONES, ROLES.ENC_SOPORTE, ROLES.ARQUITECTO, ROLES.ING_CAMPO])(
    '%s no lo usa',
    (role) => {
      expect(checkUrlAccess(role, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(false);
    },
  );
});
