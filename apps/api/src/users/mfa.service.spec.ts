import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MfaService, qrDe } from './mfa.service.js';

/** Prisma y UsersService falsos: solo lo que usa `MfaService`. */
function armar(usuarios: Record<number, { id: number; email: string; mfaEnabled: boolean }>) {
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) => usuarios[where.id] ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        Object.assign(usuarios[where.id], data);
        return usuarios[where.id];
      }),
    },
  };
  const users = {
    beginMfaSetup: jest.fn(async () => ({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/NEXARA:ana?secret=JBSWY3DPEHPK3PXP', message: 'ok' })),
    assertUserInCompany: jest.fn(async () => ({ id: 1 })),
    revokeAllUserSessions: jest.fn(async () => ({ count: 2 })),
  };
  return { servicio: new MfaService(prisma as never, users as never), prisma, users };
}

describe('MfaService · verificación en dos pasos', () => {
  it('genera el QR (PNG en data URL) del enlace otpauth', async () => {
    const qr = await qrDe('otpauth://totp/NEXARA:ana@nexara.com.mx?secret=JBSWY3DPEHPK3PXP&issuer=NEXARA');
    expect(qr.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('con el 2FA ya activo no deja volver a configurarlo (no se apaga sin código)', async () => {
    const { servicio, users } = armar({ 5: { id: 5, email: 'ana@nexara.com.mx', mfaEnabled: true } });
    await expect(servicio.iniciarConfiguracion(5)).rejects.toBeInstanceOf(BadRequestException);
    expect(users.beginMfaSetup).not.toHaveBeenCalled();
  });

  it('sin 2FA entrega secreto, enlace y QR', async () => {
    const { servicio } = armar({ 5: { id: 5, email: 'ana@nexara.com.mx', mfaEnabled: false } });
    const r = await servicio.iniciarConfiguracion(5);
    expect(r.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(r.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('un administrador lo quita a quien perdió el teléfono y le cierra las sesiones', async () => {
    const { servicio, users, prisma } = armar({ 7: { id: 7, email: 'luis@nexara.com.mx', mfaEnabled: true } });
    const r = await servicio.quitarPorAdministrador(7, 1, { id: 2, email: 'rh@nexara.com.mx' });
    expect(r).toEqual({ mfaEnabled: false, teniaMfa: true });
    expect(users.assertUserInCompany).toHaveBeenCalledWith(7, 1, { isSuperAdmin: false });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { mfaEnabled: false, mfaSecret: null, mfaEnabledAt: null },
    });
    expect(users.revokeAllUserSessions).toHaveBeenCalledWith(7, 1, 'mfa_quitado_por_admin');
  });

  it('el 2FA del dueño de la plataforma no lo quita otro administrador', async () => {
    const { servicio, prisma } = armar({ 1: { id: 1, email: 'gerencia@nexara.com.mx', mfaEnabled: true } });
    await expect(servicio.quitarPorAdministrador(1, 1, { id: 2, email: 'rh@nexara.com.mx' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
