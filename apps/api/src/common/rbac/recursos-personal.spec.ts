import { AuthService } from '../../auth/auth.service';
import { PERMISSIONS } from '../permissions';
import { checkUrlAccess } from './url-matrix';
import { ROLES, type RoleKey } from './roles.v2';

/**
 * Pedir herramienta y usar un vehículo es de todo el personal (Adam, 04-11-2026). Antes las apps le
 * ofrecían salida, regreso y gasolina a todos, y aquí solo pasaba `coord_operaciones`.
 */
describe('recursos para todo el personal', () => {
  const PERSONAL: RoleKey[] = [
    ROLES.ARQUITECTO,
    ROLES.DIR_OPERACIONES,
    ROLES.DIR_ADMIN,
    ROLES.COORD_ADMIN,
    ROLES.ADMINISTRATIVO,
    ROLES.COORD_OPERACIONES,
    ROLES.ING_CAMPO,
    ROLES.ING_SOPORTE,
    ROLES.ENC_SOPORTE,
    ROLES.COORD_VENTAS,
    ROLES.VENDEDOR,
    ROLES.LIDER_DISENO,
    ROLES.DISENADOR,
    ROLES.RH,
    ROLES.CONTABILIDAD,
  ];

  const SI: Array<['GET' | 'POST' | 'PATCH' | 'PUT', string]> = [
    ['POST', '/api/tool-requests'],
    ['POST', '/api/tool-requests/7/renewal-request'],
    ['POST', '/api/tool-requests/kits/7/report'],
    ['GET', '/api/tool-requests/kits/my'],
    ['GET', '/api/tool-requests/my-requests'],
    ['GET', '/api/tool-requests/inventory/search'],
    ['GET', '/api/vehicles/mis-vehiculos'],
    ['POST', '/api/vehicles'],
    ['POST', '/api/vehicles/7/start-use'],
    ['POST', '/api/vehicles/7/end-use'],
    ['POST', '/api/vehicles/inventory/7/checkout'],
    ['POST', '/api/vehicles/inventory/7/return'],
    ['POST', '/api/vehicles/ficha/leer-foto'],
    ['POST', '/api/vehicles/ficha/7/cargas'],
    ['GET', '/api/viatics'],
    ['POST', '/api/viatics'],
    ['GET', '/api/viatics/7'],
    ['PATCH', '/api/viatics/7/comprobar'],
    ['PUT', '/api/viatics/7/reparto'],
  ];

  it.each(PERSONAL)('%s pide herramienta y usa vehículos', (rol) => {
    for (const [metodo, ruta] of SI) {
      expect([ruta, checkUrlAccess(rol, ruta, metodo).allowed]).toEqual([ruta, true]);
    }
  });

  it('todos traen los permisos de pedir: la ruta sola no basta', () => {
    const auth: any = Object.create(AuthService.prototype);
    for (const rol of PERSONAL) {
      const permisos = auth.resolveUserPermissions({ email: 'x@example.com', roleKey: rol, role: { key: rol } }, false);
      for (const p of [PERMISSIONS.TOOLS_REQUEST, PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VIATICS_VIEW, PERMISSIONS.VIATICS_CREATE]) {
        expect([rol, p, permisos.includes(p)]).toEqual([rol, p, true]);
      }
    }
  });

  it('un cliente no entra a nada de esto', () => {
    for (const [metodo, ruta] of SI) {
      expect([ruta, checkUrlAccess(ROLES.CLIENTE, ruta, metodo).allowed]).toEqual([ruta, false]);
    }
  });

  it('aprobar, entregar y dar de alta no se abren por aquí', () => {
    // `ing_campo` ya pasaba estas rutas de herramientas por su regla amplia: ahí manda el permiso del endpoint.
    for (const rol of [ROLES.ING_SOPORTE, ROLES.VENDEDOR, ROLES.CONTABILIDAD]) {
      expect(checkUrlAccess(rol, '/api/tool-requests/7/approve', 'POST').allowed).toBe(false);
      expect(checkUrlAccess(rol, '/api/tool-requests/7/deliver', 'POST').allowed).toBe(false);
      expect(checkUrlAccess(rol, '/api/tool-requests/inventory', 'POST').allowed).toBe(false);
      expect(checkUrlAccess(rol, '/api/vehicles/inventory', 'POST').allowed).toBe(false);
      expect(checkUrlAccess(rol, '/api/vehicles/7/approve', 'PATCH').allowed).toBe(false);
      expect(checkUrlAccess(rol, '/api/vehicles/inventory/7', 'DELETE').allowed).toBe(false);
      // Soporte y campo ya pasaban `PATCH /api/viatics/**`: ahí manda `viatics.manage` del endpoint.
      expect(checkUrlAccess(ROLES.VENDEDOR, '/api/viatics/7/approve', 'PATCH').allowed).toBe(false);
      expect(checkUrlAccess(ROLES.CONTABILIDAD, '/api/viatics/7/approve', 'PATCH').allowed).toBe(false);
      expect(checkUrlAccess(ROLES.VENDEDOR, '/api/viatics/assign', 'POST').allowed).toBe(false);
    }
  });
});
