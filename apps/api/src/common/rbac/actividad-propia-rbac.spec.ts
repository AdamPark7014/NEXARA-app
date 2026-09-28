import { AuthService } from '../../auth/auth.service';
import { PERMISSIONS } from '../permissions';
import { ROLES, roleKeyFromRoleNombre, type RoleKey } from './roles.v2';
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

  it.each(PERSONAL)('%s sube la foto de lo suyo y registra su GPS', (role) => {
    expect(checkUrlAccess(role, '/api/activity-evidence/9/entry-photo', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/activity-evidence/9/exit-photo', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/gps', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(role, '/api/gps/me', 'GET').allowed).toBe(true);
  });

  it('quien asigna lista personas asignables; quien solo se autoasigna, no', () => {
    for (const role of [
      ROLES.COORD_OPERACIONES,
      ROLES.COORD_ADMIN,
      ROLES.COORD_VENTAS,
      ROLES.ENC_SOPORTE,
      ROLES.ARQUITECTO,
      ROLES.DIR_OPERACIONES,
    ]) {
      expect(checkUrlAccess(role, '/api/users/assignable', 'GET').allowed).toBe(true);
    }
    expect(checkUrlAccess(ROLES.LIDER_DISENO, '/api/users/assignable', 'GET').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ADMINISTRATIVO, '/api/users/assignable', 'GET').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.VENDEDOR, '/api/users/assignable', 'GET').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ING_CAMPO, '/api/users/assignable', 'GET').allowed).toBe(false);
  });
});

describe('rol mínimo: nombre legacy y permisos de actividad propia', () => {
  const auth = Object.create(AuthService.prototype) as AuthService;

  it('Líder de Diseño y Administrativo resuelven su roleKey aunque no haya clave en el usuario', () => {
    expect(roleKeyFromRoleNombre('Líder de Diseño')).toBe(ROLES.LIDER_DISENO);
    expect(roleKeyFromRoleNombre('Administrativo')).toBe(ROLES.ADMINISTRATIVO);
    expect(roleKeyFromRoleNombre('Director Administrativo')).toBe(ROLES.DIR_ADMIN);
    expect(
      auth.resolveEffectiveRoleKey({
        email: 'redes@nexara.com.mx',
        roleKey: null,
        role: { nombre: 'Líder de Diseño', orgRoleKey: null },
      }),
    ).toBe(ROLES.LIDER_DISENO);
  });

  it('un rol sin flags de gestión ve, evidencia y ficha su actividad, y no la administra', () => {
    const perms = (auth as unknown as {
      addV2RolePermissions: (base: string[], role: string, email: string) => string[];
    }).addV2RolePermissions([], 'lider_diseno', 'redes@nexara.com.mx');
    expect(perms).toEqual(expect.arrayContaining([
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.EVIDENCES_CREATE,
      PERMISSIONS.GPS_VIEW,
    ]));
    expect(perms).not.toContain(PERMISSIONS.ACTIVITIES_MANAGE);
    const vendedor = (auth as unknown as {
      addV2RolePermissions: (base: string[], role: string, email: string) => string[];
    }).addV2RolePermissions([], 'vendedor', 'ventas@nexara.com.mx');
    expect(vendedor).toContain(PERMISSIONS.GPS_VIEW);
    expect(vendedor).not.toContain(PERMISSIONS.ACTIVITIES_MANAGE);
  });
});
