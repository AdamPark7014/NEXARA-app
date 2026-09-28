import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isDeveloperSuperAdminEmail, isPlatformOwnerEmail } from '../common/platform-accounts.js';
import { aadDe, cifrarContrasena, descifrarContrasena, leerLlaveBoveda } from './credential-vault-crypto.js';

/**
 * Bóveda de contraseñas: guarda CIFRADA la contraseña vigente de cada cuenta que pasa por el sistema (alta,
 * cambio, restablecimiento, carga inicial) para que solo el dueño la vea (módulo account-access, tras volver
 * a escribir su contraseña).
 *
 * Nunca guarda la del dueño ni la de la cuenta de desarrollo. Guardar NO debe romper el alta de un usuario:
 * `guardar` devuelve false en vez de lanzar (sin llave configurada, error de base…), y el que llama decide.
 * Lo que no se guarda queda visible en la lista como «sin contraseña guardada».
 */
@Injectable()
export class CredentialVaultService {
  private readonly logger = new Logger(CredentialVaultService.name);

  constructor(private readonly prisma: PrismaService) {}

  private llave(): Buffer | null {
    return leerLlaveBoveda(process.env['VAULT_ENCRYPTION_KEY']);
  }

  /** ¿Hay llave válida? Sin ella la bóveda no guarda ni revela. */
  disponible(): boolean {
    return this.llave() != null;
  }

  private async empresaDe(userId: number, companyId?: number | null): Promise<number | null> {
    if (companyId != null && Number.isFinite(Number(companyId)) && Number(companyId) > 0) return Number(companyId);
    const m = await this.prisma.userCompany.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { companyId: 'asc' }],
      select: { companyId: true },
    });
    return m?.companyId ?? null;
  }

  /** Guarda (o reemplaza) la contraseña de la cuenta. true = quedó guardada. */
  async guardar(opts: {
    userId: number;
    email: string;
    password: string;
    companyId?: number | null;
    porUserId?: number | null;
  }): Promise<boolean> {
    try {
      if (isPlatformOwnerEmail(opts.email) || isDeveloperSuperAdminEmail(opts.email)) return false;
      const llave = this.llave();
      if (!llave) {
        this.logger.warn(`Bóveda sin llave válida (VAULT_ENCRYPTION_KEY): no se guardó la contraseña de la cuenta ${opts.userId}.`);
        return false;
      }
      const companyId = await this.empresaDe(opts.userId, opts.companyId);
      if (companyId == null) return false;
      const ciphertext = cifrarContrasena(opts.password, llave, aadDe(companyId, opts.userId));
      await this.prisma.credentialVaultEntry.upsert({
        where: { userId: opts.userId },
        create: { userId: opts.userId, companyId, ciphertext, updatedById: opts.porUserId ?? null },
        update: { companyId, ciphertext, updatedById: opts.porUserId ?? null },
      });
      return true;
    } catch (e) {
      this.logger.error(`No se pudo guardar en la bóveda la cuenta ${opts.userId}: ${(e as Error)?.message ?? e}`);
      return false;
    }
  }

  /** Quita lo guardado (p. ej. si la contraseña cambió por un camino que no se puede guardar). */
  async olvidar(userId: number): Promise<void> {
    await this.prisma.credentialVaultEntry.deleteMany({ where: { userId } }).catch(() => undefined);
  }

  /** La contraseña guardada de esa cuenta en esa empresa, o null (no hay, otra empresa, otra llave, alterada). */
  async revelar(userId: number, companyId: number): Promise<string | null> {
    const llave = this.llave();
    if (!llave) return null;
    const fila = await this.prisma.credentialVaultEntry.findUnique({ where: { userId } });
    if (!fila || fila.companyId !== companyId) return null;
    return descifrarContrasena(fila.ciphertext, llave, aadDe(fila.companyId, fila.userId));
  }

  /** Qué cuentas de la empresa tienen contraseña guardada (y desde cuándo), sin descifrar nada. */
  async guardadas(companyId: number, userIds: number[]): Promise<Map<number, Date>> {
    if (!userIds.length) return new Map();
    const filas = await this.prisma.credentialVaultEntry.findMany({
      where: { companyId, userId: { in: userIds } },
      select: { userId: true, updatedAt: true },
    });
    return new Map(filas.map((f) => [f.userId, f.updatedAt]));
  }
}
