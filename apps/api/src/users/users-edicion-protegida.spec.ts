import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller.js';

/**
 * Escalada que encontró la auditoría del 31-10-2026: quien administra usuarios podía volverse súper
 * admin (correo «GERENCIA@…» en su cuenta, contraseña nueva a una cuenta de dirección o un rol
 * administrativo para sí). `assertEdicionPermitida` corre antes de `usersService.update`.
 */
function controlador(roles: Record<number, Record<string, unknown>> = {}) {
  const usersService = { getRoleById: jest.fn(async (id: number) => roles[id] ?? null) };
  const c = new UsersController(usersService as never, {} as never, {} as never);
  const revisar = (actor: object, userId: number, dto: object, existente: object) =>
    (c as unknown as { assertEdicionPermitida: (...a: unknown[]) => Promise<void> }).assertEdicionPermitida(
      actor,
      userId,
      dto,
      existente,
    );
  return { revisar };
}

const ADMIN = { id: 20, isSuperAdmin: false };
const LUIS = { email: 'luis@nexara.com.mx', roleId: 3, moduleAccess: { ventas: true, rh: false } };

describe('Usuarios · edición de cuentas protegidas', () => {
  it('no deja tomar el correo de la cuenta dueña, ni con otras mayúsculas', async () => {
    const { revisar } = controlador();
    await expect(revisar(ADMIN, 30, { email: 'GERENCIA@nexara.com.mx' }, LUIS)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no deja cambiar la contraseña de una cuenta de dirección', async () => {
    const { revisar } = controlador();
    await expect(revisar(ADMIN, 1, { password: 'nueva-123456' }, { email: 'gerencia@nexara.com.mx' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('nadie se cambia su propio rol, correo o permisos', async () => {
    const { revisar } = controlador({ 4: { orgRoleKey: 'tecnico' } });
    const yo = { ...LUIS, email: 'rh@nexara.com.mx' };
    await expect(revisar(ADMIN, ADMIN.id, { roleId: 4 }, yo)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(revisar(ADMIN, ADMIN.id, { moduleAccess: { ventas: true, rh: true } }, yo)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(revisar(ADMIN, ADMIN.id, { email: 'otro@nexara.com.mx' }, yo)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el formulario completo sin cambios de acceso sí guarda (también la propia cuenta)', async () => {
    const { revisar } = controlador({ 3: { orgRoleKey: 'contador', accesoContabilidad: true } });
    // Mismo correo con otras mayúsculas, mismo rol (aunque sea administrativo) y permisos en otro orden.
    const form = { nombre: 'Luis P.', email: 'Luis@nexara.com.mx', roleId: 3, moduleAccess: { rh: false, ventas: true } };
    await expect(revisar(ADMIN, 30, form, LUIS)).resolves.toBeUndefined();
    await expect(revisar({ id: 30, isSuperAdmin: false }, 30, form, LUIS)).resolves.toBeUndefined();
  });

  it('no deja dar un rol administrativo, pero sí uno normal', async () => {
    const { revisar } = controlador({
      9: { orgRoleKey: 'dir_admin', accesoGestionUsuarios: true },
      8: { orgRoleKey: 'super_admin' },
      4: { orgRoleKey: 'tecnico' },
    });
    await expect(revisar(ADMIN, 30, { roleId: 9 }, LUIS)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(revisar(ADMIN, 30, { roleId: 8 }, LUIS)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(revisar(ADMIN, 30, { roleId: 4 }, LUIS)).resolves.toBeUndefined();
  });

  it('el súper admin sí puede', async () => {
    const { revisar } = controlador({ 9: { orgRoleKey: 'dir_admin', accesoGestionUsuarios: true } });
    await expect(
      revisar({ id: 1, isSuperAdmin: true }, 30, { roleId: 9, password: 'x' }, { email: 'gerencia@nexara.com.mx' }),
    ).resolves.toBeUndefined();
  });
});
