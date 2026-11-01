import { ROLES } from './roles.v2';
import { ASISTENTE_IA_URL_RULES, checkUrlAccess, checkUrlRules } from './url-matrix';
import { asistentePorCorreo, tiposQueCrea } from '../../ai/asistente/tipos-actividad';

/** «Asignar con IA» es del CEO y, por persona, de David; crear sigue en `POST /api/activities`. */
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

  it('a David se le concede por correo, sin abrírselo a toda la coordinación ni darle otras rutas', () => {
    expect(asistentePorCorreo('operaciones@nexara.com.mx')).toBe(true);
    expect(asistentePorCorreo(' OPERACIONES@nexara.com.mx ')).toBe(true);
    expect(asistentePorCorreo('direccion.operaciones@nexara.com.mx')).toBe(false);
    expect(asistentePorCorreo(null)).toBe(false);
    expect(checkUrlRules(ASISTENTE_IA_URL_RULES, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(true);
    expect(checkUrlRules(ASISTENTE_IA_URL_RULES, '/api/ai/asistente/estado', 'GET').allowed).toBe(true);
    expect(checkUrlRules(ASISTENTE_IA_URL_RULES, '/api/users', 'GET').allowed).toBe(false);
  });

  it('David no reparte servicios: lo demás, sí; dirección, todo', () => {
    expect(tiposQueCrea('operaciones@nexara.com.mx')).toEqual(['tarea', 'proyecto', 'obra', 'comercial']);
    expect(tiposQueCrea('gerencia@nexara.com.mx')).toContain('servicio');
  });
});
