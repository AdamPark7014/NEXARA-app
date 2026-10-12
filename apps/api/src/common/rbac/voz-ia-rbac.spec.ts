import { ROLES } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/** Voz propia: dictar va con el asistente y las actas; la grabación, solo con quien conduce. */
describe('matriz: voz a texto y grabación de juntas', () => {
  it.each([ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_OPERACIONES])('%s dicta y graba', (role) => {
    expect(checkUrlAccess(role, '/api/ai/voz/estado', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/ai/voz/transcribir', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7/partes', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7', 'DELETE').allowed).toBe(true);
  });

  it('un ingeniero de campo no lee audio ni transcripciones de juntas', () => {
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/grabaciones-reuniones/7', 'GET').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/grabaciones-reuniones/7/partes', 'POST').allowed).toBe(false);
  });
});
