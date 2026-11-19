import { listAllowedUrls } from '../common/rbac/url-matrix.js';
import { ROLES } from '../common/rbac/roles.v2.js';
import { deriveModuleKeysFromPaths } from './navigation-module-map.js';
import { sinActividades } from '../common/platform-accounts.js';

/** Lo que `me/navigation` derivaría de la matriz de cada perfil nuevo. */
function navDe(role: (typeof ROLES)[keyof typeof ROLES]) {
  const paths = listAllowedUrls(role).map((r) => r.path);
  return deriveModuleKeysFromPaths(paths);
}

describe('navegación de los 5 perfiles (cola-10)', () => {
  it('Luis (dir_operaciones): actividades, supervisión, asistencias, aprobaciones', () => {
    const { moduleKeys, webModuleIds } = navDe(ROLES.DIR_OPERACIONES);
    expect(moduleKeys).toEqual(expect.arrayContaining(['mis-actividades', 'pizarra', 'asistencias']));
    expect(webModuleIds).toContain('supervision');
    expect(moduleKeys).toContain('supervision');
    expect(moduleKeys).toContain('erp-aprobaciones');
    expect(moduleKeys).toContain('kpis-equipo');
    expect(sinActividades({ email: 'direccion.operaciones@nexara.com.mx', roleKey: 'dir_operaciones' })).toBe(
      false,
    );
  });

  it('Liz (coord_admin): actividades, gestión de viáticos, vehículos, aprobaciones', () => {
    const { moduleKeys, webModuleIds } = navDe(ROLES.COORD_ADMIN);
    expect(moduleKeys).toEqual(expect.arrayContaining(['mis-actividades', 'pizarra', 'erp-vehiculos']));
    expect(webModuleIds).toContain('gestion-viaticos');
    expect(moduleKeys).toContain('gestion-viaticos');
    expect(moduleKeys).toContain('erp-aprobaciones');
    expect(sinActividades({ email: 'lizeth.antonio@nexara.com.mx', roleKey: 'coord_admin' })).toBe(false);
  });

  it('Tere (rh): pizarra + hr + prenómina; sin mis-actividades de página; sinActividades', () => {
    const { moduleKeys, webModuleIds } = navDe(ROLES.RH);
    // La página /erp/mis-actividades ya no está en RH; el hint no debe abrirla por tool-requests.
    expect(moduleKeys).not.toContain('mis-actividades');
    expect(moduleKeys).toContain('pizarra');
    expect(moduleKeys).toContain('hr');
    expect(webModuleIds).toContain('hr');
    expect(moduleKeys).toContain('erp-pagos-empleados');
    expect(moduleKeys).toContain('erp-aprobaciones');
    expect(sinActividades({ email: 'tere.garcia@nexara.com.mx', roleKey: 'rh' })).toBe(true);
    // me.service además oculta my-activities a quien sinActividades (ACTIVITY_SUPERIOR sigue en matriz).
  });

  it('Christian y Getzemani (ceo): comodín /erp; sinActividades por correo', () => {
    const { moduleKeys } = navDe(ROLES.CEO);
    expect(moduleKeys).toEqual(
      expect.arrayContaining(['erp-aprobaciones', 'erp-pagos-empleados', 'erp-vehiculos']),
    );
    expect(sinActividades({ email: 'gerencia@nexara.com.mx', roleKey: 'ceo' })).toBe(true);
    expect(sinActividades({ email: 'getzemani.delvalle@nexara.com.mx', roleKey: 'ceo' })).toBe(true);
  });
});
