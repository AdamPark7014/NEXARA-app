import { ROLES } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/** Grabar, dictar y proponer el acta con IA: todo el personal. Guardarla, quien conduce. */
describe('matriz: voz a texto y actas con IA en reuniones', () => {
  it.each([ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_OPERACIONES, ROLES.ING_CAMPO])('%s dicta, graba y propone el acta', (role) => {
    expect(checkUrlAccess(role, '/api/ai/voz/estado', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/ai/voz/transcribir', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7/partes', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/reuniones/7/acta-ia', 'POST').allowed).toBe(true);
  });

  it('el personal no edita la reunión ni registra acuerdos ajenos', () => {
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/reuniones/7', 'PATCH').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/reuniones/7/acuerdos', 'POST').allowed).toBe(false);
  });
});
