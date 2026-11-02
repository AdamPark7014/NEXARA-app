import { ROLES } from './roles.v2';
import { ASISTENTE_IA_URL_RULES, checkUrlAccess, checkUrlRules } from './url-matrix';
import { tiposQueCrea } from '../../ai/asistente/tipos-actividad';

/**
 * «Asignar con IA» es del CEO en la matriz; para los demás mandos lo abre el guardia según su gente a
 * cargo (`quien-asigna.spec.ts`). Crear sigue en `POST /api/activities`.
 */
describe('matriz: asistente de actividades con IA', () => {
  it('el CEO interpreta instrucciones y ve a quién asignar', () => {
    expect(checkUrlAccess(ROLES.CEO, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CEO, '/api/ai/asistente/estado', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CEO, '/api/users/assignable', 'GET').allowed).toBe(true);
  });

  it.each([ROLES.DIR_OPERACIONES, ROLES.COORD_OPERACIONES, ROLES.ENC_SOPORTE, ROLES.ARQUITECTO, ROLES.ING_CAMPO])(
    '%s no lo trae por rol: lo abre su gente a cargo',
    (role) => {
      expect(checkUrlAccess(role, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(false);
    },
  );

  it('la excepción del guardia abre solo el asistente y el dictado, ninguna otra ruta', () => {
    expect(checkUrlRules(ASISTENTE_IA_URL_RULES, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(true);
    expect(checkUrlRules(ASISTENTE_IA_URL_RULES, '/api/ai/asistente/estado', 'GET').allowed).toBe(true);
    expect(checkUrlRules(ASISTENTE_IA_URL_RULES, '/api/ai/voz/transcribir', 'POST').allowed).toBe(true);
    expect(checkUrlRules(ASISTENTE_IA_URL_RULES, '/api/users', 'GET').allowed).toBe(false);
  });

  it.each([ROLES.ING_CAMPO, ROLES.ADMINISTRATIVO, ROLES.ENC_SOPORTE])(
    '%s puede preguntar si le toca, sin que eso le abra interpretar',
    (role) => {
      expect(checkUrlAccess(role, '/api/ai/asistente/estado', 'GET').allowed).toBe(true);
      expect(checkUrlAccess(role, '/api/ai/asistente/interpretar', 'POST').allowed).toBe(false);
    },
  );

  it('David no reparte servicios: lo demás, sí; dirección, todo', () => {
    expect(tiposQueCrea('operaciones@nexara.com.mx')).toEqual(['tarea', 'proyecto', 'obra', 'comercial']);
    expect(tiposQueCrea('gerencia@nexara.com.mx')).toContain('servicio');
  });

  it('José Antonio y Luis reparten servicios; el mando sin renglón, tareas', () => {
    expect(tiposQueCrea('jose.ramirez@nexara.com.mx')).toEqual(['tarea', 'proyecto', 'servicio', 'comercial']);
    expect(tiposQueCrea('direccion.operaciones@nexara.com.mx')).toContain('servicio');
    expect(tiposQueCrea('infraestructura@nexara.com.mx')).not.toContain('servicio');
    expect(tiposQueCrea('nuevo.mando@nexara.com.mx')).toEqual(['tarea']);
  });

  it('los mandos de hoy conservan a quién asignar y cómo crear', () => {
    for (const role of [ROLES.COORD_OPERACIONES, ROLES.ENC_SOPORTE]) {
      expect(checkUrlAccess(role, '/api/users/assignable', 'GET').allowed).toBe(true);
      expect(checkUrlAccess(role, '/api/activities', 'POST').allowed).toBe(true);
    }
  });
});
