import { describe, expect, it } from 'vitest';
import { ORG_TO_V2, orgRoleKeyFromV2, resolveV2RoleKey, v2RoleKeyFromOrg } from './role-mapping';
import { ROLES } from './roles';
import { ORG_ROLE_KEYS } from '@/lib/org-roles';
import { PLATFORM_OWNER_EMAIL } from '@/lib/platform-accounts';

describe('resolveV2RoleKey · rol efectivo del usuario', () => {
  it('sin usuario no hay rol', () => {
    expect(resolveV2RoleKey(null)).toBeNull();
    expect(resolveV2RoleKey(undefined)).toBeNull();
  });

  it('el dueño de la plataforma es CEO aunque venga marcado como superadmin', () => {
    // Regla de negocio explícita: gerencia@ ve el producto como lo ve un CEO,
    // no con el bypass total de super_admin.
    expect(resolveV2RoleKey({ email: PLATFORM_OWNER_EMAIL, isSuperAdmin: true })).toBe(ROLES.CEO);
    expect(resolveV2RoleKey({ isPlatformOwner: true, isSuperAdmin: true })).toBe(ROLES.CEO);
  });

  it('isSuperAdmin gana sobre el roleKey guardado', () => {
    expect(resolveV2RoleKey({ isSuperAdmin: true, roleKey: 'vendedor' })).toBe(ROLES.SUPER_ADMIN);
  });

  it('usa el roleKey v2 cuando es válido', () => {
    expect(resolveV2RoleKey({ roleKey: 'contabilidad' })).toBe(ROLES.CONTABILIDAD);
    expect(resolveV2RoleKey({ roleKey: 'ing_campo' })).toBe(ROLES.ING_CAMPO);
  });

  it('ignora un roleKey desconocido y cae al nombre del rol', () => {
    expect(resolveV2RoleKey({ roleKey: 'rol_inventado', role: 'Contador General' }))
      .toBe(ROLES.CONTABILIDAD);
  });

  it('traduce claves organizacionales al modelo v2', () => {
    expect(resolveV2RoleKey({ orgRoleKey: ORG_ROLE_KEYS.SALES_REP })).toBe(ROLES.VENDEDOR);
    expect(resolveV2RoleKey({ orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER })).toBe(ROLES.ING_CAMPO);
    expect(resolveV2RoleKey({ orgRoleKey: ORG_ROLE_KEYS.ACCOUNTANT })).toBe(ROLES.CONTABILIDAD);
  });

  it('distingue líder de diseño de diseñador por el nombre del rol', () => {
    expect(resolveV2RoleKey({ role: 'Líder de Diseño' })).toBe(ROLES.LIDER_DISENO);
    expect(resolveV2RoleKey({ role: 'Diseñador Gráfico' })).toBe(ROLES.DISENADOR);
  });

  it('devuelve null si no hay nada de donde deducir el rol', () => {
    expect(resolveV2RoleKey({ role: 'cargo-que-no-existe-en-ningun-mapa' })).toBeNull();
  });
});

describe('mapeo bidireccional v2 ↔ org', () => {
  it('cada clave org del mapa devuelve un rol v2 conocido', () => {
    for (const [orgKey, v2Key] of Object.entries(ORG_TO_V2)) {
      expect(v2RoleKeyFromOrg(orgKey)).toBe(v2Key);
    }
  });

  it('el ida y vuelta conserva el rol en los casos 1:1', () => {
    expect(orgRoleKeyFromV2(ROLES.VENDEDOR)).toBe(ORG_ROLE_KEYS.SALES_REP);
    expect(v2RoleKeyFromOrg(ORG_ROLE_KEYS.SALES_REP)).toBe(ROLES.VENDEDOR);
  });

  it('el cliente externo no tiene equivalente organizacional', () => {
    expect(orgRoleKeyFromV2(ROLES.CLIENTE)).toBeNull();
  });

  it('una clave desconocida no se inventa un rol', () => {
    expect(v2RoleKeyFromOrg('no_existe')).toBeNull();
    expect(orgRoleKeyFromV2('no_existe')).toBeNull();
  });
});
