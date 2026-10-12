import { ROLES } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/** Grabar, dictar y el acta con IA: solo encargados de área (Adam, 12-10). */
describe('matriz: voz a texto y actas con IA en reuniones', () => {
  it.each([ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_OPERACIONES, ROLES.ENC_SOPORTE, ROLES.RH, ROLES.LIDER_DISENO])(
    '%s dicta, graba y propone el acta',
    (role) => {
      expect(checkUrlAccess(role, '/api/ai/voz/estado', 'GET').allowed).toBe(true);
      expect(checkUrlAccess(role, '/api/ai/voz/transcribir', 'POST').allowed).toBe(true);
      expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7/partes', 'POST').allowed).toBe(true);
      expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7', 'GET').allowed).toBe(true);
      expect(checkUrlAccess(role, '/api/reuniones/7/acta-ia', 'POST').allowed).toBe(true);
    },
  );

  it.each([ROLES.ING_CAMPO, ROLES.ING_SOPORTE, ROLES.CONTABILIDAD, ROLES.VENDEDOR, ROLES.DISENADOR, ROLES.ADMINISTRATIVO])(
    '%s no graba, no transcribe ni genera el acta',
    (role) => {
      expect(checkUrlAccess(role, '/api/ai/voz/transcribir', 'POST').allowed).toBe(false);
      expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7/partes', 'POST').allowed).toBe(false);
      expect(checkUrlAccess(role, '/api/grabaciones-reuniones/7', 'GET').allowed).toBe(false);
      expect(checkUrlAccess(role, '/api/reuniones/7/acta-ia', 'POST').allowed).toBe(false);
    },
  );

  it('el personal sigue viendo reuniones y moviendo sus acuerdos', () => {
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/reuniones', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/reuniones/mis-acuerdos/3', 'PATCH').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/reuniones/7', 'PATCH').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/reuniones/7/acuerdos', 'POST').allowed).toBe(false);
  });

  it('encargado de soporte conduce: convoca y registra acuerdos', () => {
    expect(checkUrlAccess(ROLES.ENC_SOPORTE, '/api/reuniones', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.ENC_SOPORTE, '/api/reuniones/7/acuerdos', 'POST').allowed).toBe(true);
  });
});
