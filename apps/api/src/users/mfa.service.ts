import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { isCeoEquivalentEmail, isPlatformOwnerEmail, isSuperAdminEmail } from '../common/platform-accounts.js';
import { UsersService } from './users.service.js';

/**
 * Verificación en dos pasos (TOTP): lo que se agregó encima de `UsersService` (activar, confirmar y
 * desactivar viven ahí).
 *
 * - El QR para escanear con Google / Microsoft Authenticator.
 * - Con el 2FA ya activo no se puede volver a configurar sin desactivarlo con un código: si no,
 *   cualquiera con una sesión abierta podía cambiar el secreto y apagarlo.
 * - Un administrador lo quita a quien perdió el teléfono; se cierran sus sesiones.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** `beginMfaSetup` + QR, solo si el 2FA no está activo. */
  async iniciarConfiguracion(userId: number) {
    const actual = await this.prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true } });
    if (!actual) throw new NotFoundException('Usuario no encontrado');
    if (actual.mfaEnabled) {
      throw new BadRequestException('La verificación en dos pasos ya está activa. Desactívala con un código antes de configurarla de nuevo.');
    }
    const setup = await this.users.beginMfaSetup(userId);
    return { ...setup, qrDataUrl: await qrDe(setup.otpauthUrl) };
  }

  async quitarPorAdministrador(
    targetId: number,
    companyId: number | null,
    actor: { id: number; email?: string | null; isSuperAdmin?: boolean },
  ) {
    await this.users.assertUserInCompany(targetId, companyId, { isSuperAdmin: actor.isSuperAdmin === true });
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, mfaEnabled: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const protegida = isSuperAdminEmail(target.email) || isCeoEquivalentEmail(target.email);
    if (protegida && target.id !== actor.id && !isPlatformOwnerEmail(actor.email)) {
      throw new ForbiddenException('El 2FA de un súper administrador solo lo quita él mismo o el dueño de la plataforma.');
    }
    const teniaMfa = target.mfaEnabled;
    await this.prisma.user.update({
      where: { id: targetId },
      data: { mfaEnabled: false, mfaSecret: null, mfaEnabledAt: null },
    });
    // Quien perdió el teléfono vuelve a entrar con contraseña; cualquier sesión abierta se cierra.
    await this.users.revokeAllUserSessions(targetId, companyId, 'mfa_quitado_por_admin');
    return { mfaEnabled: false, teniaMfa };
  }
}

/** PNG en data URL (la CSP del web permite `img-src data:`). */
export function qrDe(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
}
