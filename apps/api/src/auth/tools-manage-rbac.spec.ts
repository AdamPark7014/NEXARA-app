import { AuthService } from './auth.service';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Cubre el contrato Ola B: TOOLS_MANAGE solo Christian/Iván;
 * coord_operaciones (David) ya no aprueba herramientas.
 * applyToolsManageByEmail: strip primero, luego add solo por email.
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

  it('David con rol consola sigue sin TOOLS_MANAGE', () => {
    const out = perms('operaciones@nexara.com.mx', 'coord_operaciones');
    expect(out).not.toContain(PERMISSIONS.TOOLS_MANAGE);
  });

  it('strip: email no-manage pierde TOOLS_MANAGE aunque llegue en la lista base', () => {
    const stripped = (service as any).applyToolsManageByEmail(
      [PERMISSIONS.TOOLS_MANAGE, PERMISSIONS.TOOLS_VIEW, PERMISSIONS.CONSOLE_ADMIN],
      'operaciones@nexara.com.mx',
    );
    expect(stripped).not.toContain(PERMISSIONS.TOOLS_MANAGE);
    expect(stripped).toContain(PERMISSIONS.CONSOLE_ADMIN);
  });

  it('add: Iván recibe TOOLS_MANAGE aunque la lista base no lo traiga', () => {
    const added = (service as any).applyToolsManageByEmail(
      [PERMISSIONS.CONSOLE_ADMIN],
      'administracion.ventas@nexara.com.mx',
    );
    expect(added).toContain(PERMISSIONS.TOOLS_MANAGE);
  });
});
