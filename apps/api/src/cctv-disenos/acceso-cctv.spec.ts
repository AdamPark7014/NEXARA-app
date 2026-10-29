import { ALL_ROLES, ROLES } from '../common/rbac/roles.v2';
import { checkUrlAccess } from '../common/rbac/url-matrix';
import { isPrivateUploadPath, isPublicUploadPath } from '../common/security/uploads-access';
import {
  ROLES_CCTV_CON_REPORTES,
  ROLES_SIEMPRE_CCTV,
  accesoCctvPorRol,
  puedeDisenarCctv,
  puedeDisenarCctvSegunGente,
} from './acceso-cctv';
import { CROQUIS_SUBDIR } from './croquis-imagen';

/**
 * Regla de Adam (29-10-2026): encargados de área y arquitecto sí; ingenieros de soporte e
 * instaladores no; el encargado de instalación (David) y el de soporte (José Antonio) sí.
 */
describe('puedeDisenarCctv: el equipo de hoy', () => {
  it('David (coordinador de operaciones) entra', () => {
    expect(puedeDisenarCctv({ roleKey: ROLES.COORD_OPERACIONES, tieneReportes: true })).toBe(true);
    expect(puedeDisenarCctv({ roleKey: ROLES.COORD_OPERACIONES, tieneReportes: false })).toBe(true);
  });

  it('José Antonio (ingeniero de soporte con gente a cargo) entra', () => {
    expect(puedeDisenarCctv({ roleKey: ROLES.ING_SOPORTE, tieneReportes: true })).toBe(true);
  });

  it('Carolina y Alejandro (ingenieros de soporte sin gente a cargo) no', () => {
    expect(puedeDisenarCctv({ roleKey: ROLES.ING_SOPORTE, tieneReportes: false })).toBe(false);
  });

  it('Josué (arquitecto) entra', () => {
    expect(puedeDisenarCctv({ roleKey: ROLES.ARQUITECTO, tieneReportes: false })).toBe(true);
  });

  it('Joan, Israel y Juan José (instaladores) no, ni aunque alguien les reporte', () => {
    expect(puedeDisenarCctv({ roleKey: ROLES.ING_CAMPO, tieneReportes: false })).toBe(false);
    expect(puedeDisenarCctv({ roleKey: ROLES.ING_CAMPO, tieneReportes: true })).toBe(false);
  });

  it('un vendedor sin gente a cargo no (y vendedor no tiene Core: tampoco con gente)', () => {
    expect(puedeDisenarCctv({ roleKey: ROLES.VENDEDOR, tieneReportes: false })).toBe(false);
    expect(puedeDisenarCctv({ roleKey: ROLES.VENDEDOR, tieneReportes: true })).toBe(false);
  });

  it('dirección, coordinación, administrativo y encargado de soporte entran siempre', () => {
    for (const rol of [
      ROLES.CEO,
      ROLES.DIR_OPERACIONES,
      ROLES.DIR_ADMIN,
      ROLES.COORD_ADMIN,
      ROLES.COORD_VENTAS,
      ROLES.ADMINISTRATIVO,
      ROLES.ENC_SOPORTE,
    ]) {
      expect(puedeDisenarCctv({ roleKey: rol, tieneReportes: false })).toBe(true);
    }
  });

  it('RH, contabilidad y líder de diseño solo si llevan gente', () => {
    for (const rol of [ROLES.RH, ROLES.CONTABILIDAD, ROLES.LIDER_DISENO]) {
      expect(puedeDisenarCctv({ roleKey: rol, tieneReportes: true })).toBe(true);
      expect(puedeDisenarCctv({ roleKey: rol, tieneReportes: false })).toBe(false);
    }
  });

  it('super admin y la cuenta de desarrollo entran; el cliente y las claves desconocidas no', () => {
    expect(puedeDisenarCctv({ roleKey: ROLES.SUPER_ADMIN, tieneReportes: false })).toBe(true);
    expect(puedeDisenarCctv({ roleKey: null, isSuperAdmin: true, tieneReportes: false })).toBe(true);
    expect(
      puedeDisenarCctv({ roleKey: ROLES.ING_CAMPO, email: 'Developer@nexara.com.mx', tieneReportes: false }),
    ).toBe(true);
    expect(puedeDisenarCctv({ roleKey: ROLES.CLIENTE, tieneReportes: true })).toBe(false);
    expect(puedeDisenarCctv({ roleKey: 'ingeniero', tieneReportes: true })).toBe(false);
    expect(puedeDisenarCctv({ roleKey: null, tieneReportes: true })).toBe(false);
  });
});

describe('puedeDisenarCctvSegunGente: solo cuenta cuando hace falta', () => {
  const contador = (n: number) => ({ user: { count: jest.fn().mockResolvedValue(n) } });

  it('a dirección y coordinación no les cuenta la gente', async () => {
    const prisma = contador(0);
    await expect(puedeDisenarCctvSegunGente(prisma, { id: 20, roleKey: ROLES.COORD_OPERACIONES })).resolves.toBe(true);
    await expect(puedeDisenarCctvSegunGente(prisma, { id: 5, roleKey: ROLES.ARQUITECTO })).resolves.toBe(true);
    await expect(puedeDisenarCctvSegunGente(prisma, { id: 30, roleKey: ROLES.ING_CAMPO })).resolves.toBe(false);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('a soporte le cuenta reportes activos que no sean él mismo', async () => {
    const conGente = contador(3);
    await expect(puedeDisenarCctvSegunGente(conGente, { id: 15, roleKey: ROLES.ING_SOPORTE })).resolves.toBe(true);
    expect(conGente.user.count).toHaveBeenCalledWith({
      where: { managerId: 15, isActive: true, id: { not: 15 } },
    });

    const sinGente = contador(0);
    await expect(puedeDisenarCctvSegunGente(sinGente, { id: 40, roleKey: ROLES.ING_SOPORTE })).resolves.toBe(false);
  });

  it('sin identidad de personal, no', async () => {
    const prisma = contador(5);
    await expect(puedeDisenarCctvSegunGente(prisma, { id: NaN, roleKey: ROLES.CEO })).resolves.toBe(false);
  });
});

describe('la matriz de URLs y la regla dicen lo mismo', () => {
  const RUTAS: Array<[string, 'GET' | 'POST' | 'PATCH']> = [
    ['/api/cctv-disenos', 'GET'],
    ['/api/cctv-disenos', 'POST'],
    ['/api/cctv-disenos/7', 'GET'],
    ['/api/cctv-disenos/7', 'PATCH'],
    ['/api/cctv-disenos/7/archivar', 'POST'],
    ['/api/cctv-disenos/7/croquis', 'POST'],
    ['/erp/videovigilancia', 'GET'],
  ];

  it.each(ALL_ROLES.filter((r) => r !== ROLES.SUPER_ADMIN))('%s: abre el camino solo si la regla podría dejarlo pasar', (rol) => {
    const podria = accesoCctvPorRol({ roleKey: rol }) !== 'no';
    for (const [ruta, metodo] of RUTAS) {
      expect({ rol, ruta, metodo, permitido: checkUrlAccess(rol, ruta, metodo).allowed }).toEqual({
        rol,
        ruta,
        metodo,
        permitido: podria,
      });
    }
    // El camino nunca se abre para borrar: archivar es un POST.
    expect(checkUrlAccess(rol, '/api/cctv-disenos/7', 'DELETE').allowed).toBe(false);
  });

  it('todo el personal pregunta `acceso` (nunca 403 por la matriz)', () => {
    for (const rol of ALL_ROLES) {
      expect(checkUrlAccess(rol, '/api/cctv-disenos/acceso', 'GET').allowed).toBe(true);
    }
  });

  it('los grupos no se enciman', () => {
    for (const rol of ROLES_CCTV_CON_REPORTES) expect(ROLES_SIEMPRE_CCTV.has(rol)).toBe(false);
  });
});

describe('los croquis no son públicos', () => {
  it('`/uploads/cctv-croquis/` pide sesión y no está vetado al personal', () => {
    const ruta = `/${CROQUIS_SUBDIR}/7-1730000000000-ab12cd34ef56ab12.png`;
    expect(isPublicUploadPath(ruta)).toBe(false);
    expect(isPrivateUploadPath(ruta)).toBe(false);
  });
});
