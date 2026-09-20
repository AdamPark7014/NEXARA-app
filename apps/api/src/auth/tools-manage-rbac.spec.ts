import { AuthService } from './auth.service';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Cubre el contrato Ola B: TOOLS_MANAGE solo Christian/Iván;
 * coord_operaciones (David) ya no aprueba herramientas.
 */
describe('AuthService TOOLS_MANAGE por email', () => {
  const service = new AuthService({} as any, {} as any);

  function perms(email: string, roleKey: string) {
    return service.resolveUserPermissions({ email, roleKey } as any, false);
  }

  it('Christian (ceo / gerencia@) tiene TOOLS_MANAGE', () => {
    expect(perms('gerencia@nexara.com.mx', 'ceo')).toContain(PERMISSIONS.TOOLS_MANAGE);
  });

  it('Iván (administracion.ventas@) tiene TOOLS_MANAGE aunque sea ing_campo', () => {
    expect(perms('administracion.ventas@nexara.com.mx', 'ing_campo')).toContain(
      PERMISSIONS.TOOLS_MANAGE,
    );
  });

  it('David (operaciones@ / coord_operaciones) NO tiene TOOLS_MANAGE', () => {
    expect(perms('operaciones@nexara.com.mx', 'coord_operaciones')).not.toContain(
      PERMISSIONS.TOOLS_MANAGE,
    );
  });

  it('Luis (dir_operaciones) NO tiene TOOLS_MANAGE', () => {
    expect(perms('direccion.operaciones@nexara.com.mx', 'dir_operaciones')).not.toContain(
      PERMISSIONS.TOOLS_MANAGE,
    );
  });
});
