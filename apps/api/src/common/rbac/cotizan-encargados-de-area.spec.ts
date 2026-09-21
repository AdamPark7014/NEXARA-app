/**
 * Quién puede cotizar (Adam, 20-09): **los encargados de área**, además de dirección y del equipo
 * comercial que ya lo hacía.
 *
 * Se prueban las DOS capas que corren en producción, porque hacen falta las dos y una sola no
 * basta (es justo lo que fallaba: los encargados abrían el módulo y el servidor les devolvía 403):
 *
 *   1. `AuthService` reparte `cotizaciones.access` → lo compara `RbacGuard` contra cada `@RBAC`.
 *   2. `checkUrlAccess` (url-matrix) decide si además pueden **escribir**.
 *
 * Se prueba por clave de rol, que es lo estable. Ni el puesto (texto libre de RH) ni el correo
 * entran aquí: quien cotiza es un papel en la empresa, no una persona.
 */
import { checkUrlAccess } from './url-matrix';
import { ROLES, ROLES_ENCARGADOS_DE_AREA, ROLES_QUE_COTIZAN, puedeCotizar } from './roles.v2';
import { PERMISSIONS } from '../permissions.js';
import { AuthService } from '../../auth/auth.service.js';

function permisosDelRol(roleKey: string, email?: string | null): string[] {
  const proto = AuthService.prototype as unknown as Record<string, unknown>;
  const fn = proto['addV2RolePermissions'] as (
    permissions: string[],
    roleKey: string | null | undefined,
    email?: string | null,
  ) => string[];
  return fn.call(proto, [], roleKey, email ?? null);
}

function puedeUrl(
  role: string,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
): boolean {
  return checkUrlAccess(role as never, url, method).allowed;
}

/**
 * El personal que cotiza, con la clave de rol que le da `prisma/seed-core-roster.ts`.
 * El correo va como comentario para poder reconocer a quién se refiere cada fila; el contrato que
 * se prueba es el rol.
 */
const ENCARGADOS: Array<[string, string]> = [
  [ROLES.ADMINISTRATIVO, 'Daniela Hernández · daniela.hernandez@'],
  [ROLES.ADMINISTRATIVO, 'Mónica García · soluciones@'],
  [ROLES.COORD_OPERACIONES, 'Luis Joel Aguilar · direccion.operaciones@'],
  [ROLES.COORD_OPERACIONES, 'David Morales · operaciones@'],
  [ROLES.ING_SOPORTE, 'José Antonio Ramírez · jose.ramirez@'],
  [ROLES.ARQUITECTO, 'Josué Cervantes · infraestructura@'],
];

describe('los encargados de área cotizan', () => {
  it.each(ENCARGADOS)('%s (%s) tiene cotizaciones.access', (roleKey) => {
    expect(permisosDelRol(roleKey)).toContain(PERMISSIONS.COTIZACIONES_ACCESS);
  });

  it.each(ENCARGADOS)('%s (%s) puede crear y editar, no solo mirar', (roleKey) => {
    expect(puedeUrl(roleKey, '/api/cotizaciones', 'POST')).toBe(true);
    expect(puedeUrl(roleKey, '/api/cotizaciones/88', 'PUT')).toBe(true);
    expect(puedeUrl(roleKey, '/erp/cotizaciones/88')).toBe(true);
  });

  it.each(ENCARGADOS)('%s (%s) puede adjuntar planos y pasarla a un compañero', (roleKey) => {
    expect(puedeUrl(roleKey, '/api/cotizaciones/88/planos', 'POST')).toBe(true);
    expect(puedeUrl(roleKey, '/api/cotizaciones/88/planos/quitar', 'POST')).toBe(true);
    expect(puedeUrl(roleKey, '/api/cotizaciones/88/asignar', 'POST')).toBe(true);
    expect(puedeUrl(roleKey, '/api/cotizaciones/companeros')).toBe(true);
  });

  it('dirección y comercial siguen igual que antes', () => {
    for (const roleKey of [
      ROLES.CEO,
      ROLES.DIR_ADMIN,
      ROLES.DIR_OPERACIONES,
      ROLES.COORD_ADMIN,
      ROLES.COORD_VENTAS,
      ROLES.VENDEDOR,
      ROLES.CONTABILIDAD,
    ]) {
      expect(permisosDelRol(roleKey)).toContain(PERMISSIONS.COTIZACIONES_ACCESS);
    }
  });

  it('contabilidad entra al módulo pero sigue sin escribir', () => {
    expect(permisosDelRol(ROLES.CONTABILIDAD)).toContain(PERMISSIONS.COTIZACIONES_ACCESS);
    expect(puedeUrl(ROLES.CONTABILIDAD, '/api/cotizaciones/88')).toBe(true);
    expect(puedeUrl(ROLES.CONTABILIDAD, '/api/cotizaciones/88/asignar', 'POST')).toBe(false);
  });
});

describe('quien no cotiza, sigue sin cotizar', () => {
  const ajenos = [ROLES.ING_CAMPO, ROLES.DISENADOR, ROLES.LIDER_DISENO, ROLES.RH, ROLES.CLIENTE];

  it.each(ajenos)('%s no tiene cotizaciones.access', (roleKey) => {
    expect(permisosDelRol(roleKey)).not.toContain(PERMISSIONS.COTIZACIONES_ACCESS);
  });

  it.each(ajenos)('%s no puede crear ni pasar cotizaciones', (roleKey) => {
    expect(puedeUrl(roleKey, '/api/cotizaciones', 'POST')).toBe(false);
    expect(puedeUrl(roleKey, '/api/cotizaciones/88/asignar', 'POST')).toBe(false);
  });
});

describe('la lista vive en un solo sitio', () => {
  it('`puedeCotizar` y `ROLES_QUE_COTIZAN` dicen lo mismo que `AuthService`', () => {
    for (const roleKey of ROLES_QUE_COTIZAN) {
      expect(puedeCotizar(roleKey)).toBe(true);
      expect(permisosDelRol(roleKey)).toContain(PERMISSIONS.COTIZACIONES_ACCESS);
    }
  });

  it('los encargados de área están dentro de quienes cotizan', () => {
    for (const roleKey of ROLES_ENCARGADOS_DE_AREA) {
      expect(ROLES_QUE_COTIZAN).toContain(roleKey);
    }
  });

  it('`cliente` no cotiza ni por accidente', () => {
    expect(puedeCotizar(ROLES.CLIENTE)).toBe(false);
    expect(puedeCotizar(null)).toBe(false);
    expect(puedeCotizar('rol_que_no_existe')).toBe(false);
  });
});
