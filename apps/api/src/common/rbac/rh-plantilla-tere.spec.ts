import 'reflect-metadata';
import { AuthService } from '../../auth/auth.service';
import { UsersController } from '../../users/users.controller';
import { AttendanceController } from '../../attendance/attendance.controller';
import { AnalyticsController } from '../../analytics/analytics.controller';
import { PERMISSIONS } from '../permissions';
import { checkUrlAccess } from './url-matrix';
import { ROLES } from './roles.v2';

/**
 * Tere (rol `rh`, 18-11-2026): RH externa que supervisa todo lo de personal, como Christian, pero NO
 * administra cuentas, contraseñas ni roles. Su usuario «no veía nada» y la Plantilla RRHH decía
 * «No se pudo actualizar»: la matriz y los @RBAC le cerraban las rutas que esas pantallas llaman.
 */
describe('rol rh (Tere): plantilla, ficha, KPIs y asistencias', () => {
  const auth: any = Object.create(AuthService.prototype);
  const permisosRh: string[] = auth.resolveUserPermissions(
    { email: 'tere@example.com', roleKey: ROLES.RH, role: { key: ROLES.RH } },
    false,
  );

  /** Igual que RbacGuard: `permissions` exige todas, `anyPermissions` basta una. */
  function pasaRbac(proto: any, metodo: string): boolean {
    const opts = Reflect.getMetadata('rbac', proto[metodo]) as
      | { permissions?: string[]; anyPermissions?: string[] }
      | undefined;
    if (!opts) return true;
    if (opts.permissions?.length && !opts.permissions.every((p) => permisosRh.includes(p))) return false;
    if (opts.anyPermissions?.length && !opts.anyPermissions.some((p) => permisosRh.includes(p))) return false;
    return true;
  }

  const SI: Array<['GET' | 'PATCH', string, any, string]> = [
    ['GET', '/api/users/hr-staff', UsersController.prototype, 'findHrStaff'],
    ['GET', '/api/users/roles', UsersController.prototype, 'listRoles'],
    ['GET', '/api/users/departments', UsersController.prototype, 'listDepartments'],
    ['GET', '/api/users/42', UsersController.prototype, 'findOne'],
    ['PATCH', '/api/users/42/hr', UsersController.prototype, 'updateHrFields'],
    ['GET', '/api/attendance/hierarchy/range', AttendanceController.prototype, 'hierarchyRange'],
    ['GET', '/api/analytics/bi/engineers', AnalyticsController.prototype, 'engineerRanking'],
  ];

  it.each(SI)('%s %s pasa la matriz y el @RBAC', (metodo, ruta, proto, handler) => {
    expect([ruta, checkUrlAccess(ROLES.RH, ruta, metodo).allowed]).toEqual([ruta, true]);
    expect([handler, pasaRbac(proto, handler)]).toEqual([handler, true]);
  });

  it('no administra cuentas: ni editar el usuario, ni sesiones, ni contraseñas, ni roles', () => {
    expect(checkUrlAccess(ROLES.RH, '/api/users/42', 'PATCH').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.RH, '/api/users/42', 'DELETE').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.RH, '/api/users', 'POST').allowed).toBe(false);
    expect(pasaRbac(UsersController.prototype, 'update')).toBe(false);
    expect(pasaRbac(UsersController.prototype, 'remove')).toBe(false);
    expect(pasaRbac(UsersController.prototype, 'create')).toBe(false);
    expect(pasaRbac(UsersController.prototype, 'revokeAllSessions')).toBe(false);
    expect(pasaRbac(UsersController.prototype, 'setManager')).toBe(false);
    expect(permisosRh).not.toContain(PERMISSIONS.USERS_MANAGE);
    expect(permisosRh).not.toContain(PERMISSIONS.ROLES_MANAGE);
  });

  it('ve las asistencias de toda la empresa, no solo su rama', () => {
    const svc: any = Object.create(
      require('../../attendance/attendance.service').AttendanceService.prototype,
    );
    expect(svc.isCompanyWideAttendanceViewer({ roleKey: ROLES.RH, email: 'tere@example.com', permissions: permisosRh })).toBe(true);
    expect(svc.isCompanyWideAttendanceViewer({ roleKey: ROLES.ING_CAMPO, email: 'x@example.com', permissions: [] })).toBe(false);
  });
});
