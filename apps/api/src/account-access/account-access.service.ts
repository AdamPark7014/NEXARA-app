import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { CredentialVaultService } from '../credential-vault/credential-vault.service.js';
import { isDeveloperSuperAdminEmail, isPlatformOwnerEmail } from '../common/platform-accounts.js';
import { emitirFicha, fichaValida, generarContrasenaSegura } from './account-access-token.js';

const MAX_FALLOS = 5;
const BLOQUEO_MIN = 15;

type Sesion = { id?: number | string | null; isClient?: boolean; isBranchUser?: boolean };

/**
 * «Acceso a cuentas»: solo el dueño de la plataforma (Christian). Vuelve a escribir su contraseña, recibe
 * una ficha de 5 minutos y con ella puede restablecer la contraseña de cualquier cuenta de la empresa
 * viendo la nueva UNA vez.
 *
 * La bóveda (`CredentialVaultService`) guarda CIFRADA la contraseña que pasa por el sistema (alta, cambio,
 * restablecimiento, carga inicial); aquí solo el dueño, con la ficha de 5 minutos, la ve —de una en una y
 * auditado—. La base solo tiene hashes de las contraseñas anteriores a la bóveda: esas no se pueden mostrar;
 * para esas cuentas lo que se puede es poner una nueva. Los fallos al escribir su contraseña cuentan en el
 * mismo contador que el inicio de sesión (5 fallos = 15 minutos bloqueado).
 */
@Injectable()
export class AccountAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly vault: CredentialVaultService,
  ) {}

  /** ¿La bóveda tiene llave? Sin ella no guarda ni revela (la pantalla lo avisa). */
  bovedaLista(): boolean {
    return this.vault.disponible();
  }

  private secreto(): string {
    return String(process.env['JWT_SECRET'] ?? '');
  }

  private async dueno(sesion: Sesion) {
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0 || sesion?.isClient || sesion?.isBranchUser) {
      throw new ForbiddenException('Solo el dueño puede entrar aquí.');
    }
    const usuario = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, passwordHash: true, isActive: true, failedLoginCount: true, lockedUntil: true },
    });
    if (!usuario || usuario.isActive === false || !isPlatformOwnerEmail(usuario.email)) {
      throw new ForbiddenException('Solo el dueño puede entrar aquí.');
    }
    return usuario;
  }

  /** ¿Esta persona puede entrar? (para que la pantalla ofrezca —o no— el enlace). */
  async puedeEntrar(sesion: Sesion): Promise<boolean> {
    try {
      await this.dueno(sesion);
      return true;
    } catch {
      return false;
    }
  }

  async desbloquear(sesion: Sesion, password: string, companyId: number | null) {
    const dueno = await this.dueno(sesion);
    if (dueno.lockedUntil && dueno.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((dueno.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(`Cuenta bloqueada temporalmente. Reintenta en ${mins} min.`);
    }
    const bien = typeof password === 'string' && password.length > 0 && (await bcrypt.compare(password, dueno.passwordHash));
    if (!bien) {
      const fallos = (dueno.failedLoginCount ?? 0) + 1;
      await this.prisma.user.update({
        where: { id: dueno.id },
        data: {
          failedLoginCount: fallos,
          ...(fallos >= MAX_FALLOS ? { lockedUntil: new Date(Date.now() + BLOQUEO_MIN * 60_000) } : {}),
        },
      });
      await this.audit
        .log({ entityType: 'User', entityId: dueno.id, action: 'ACCOUNT_ACCESS_DENIED', companyId }, dueno.id)
        .catch(() => undefined);
      throw new UnauthorizedException('La contraseña no es correcta.');
    }
    if ((dueno.failedLoginCount ?? 0) > 0) {
      await this.prisma.user.update({ where: { id: dueno.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }
    await this.audit
      .log({ entityType: 'User', entityId: dueno.id, action: 'ACCOUNT_ACCESS_UNLOCK', companyId }, dueno.id)
      .catch(() => undefined);
    const { ficha, venceEn } = emitirFicha(dueno.id, this.secreto());
    return { ficha, venceEn: new Date(venceEn).toISOString() };
  }

  private async exigirFicha(sesion: Sesion, ficha: unknown) {
    const dueno = await this.dueno(sesion);
    if (!fichaValida(ficha, dueno.id, this.secreto())) {
      throw new UnauthorizedException('Vuelve a escribir tu contraseña para continuar.');
    }
    return dueno;
  }

  /** Cuentas de la empresa (sin el dueño ni la cuenta de desarrollo) para elegir a cuál restablecer. */
  async listar(sesion: Sesion, ficha: unknown, companyId: number) {
    await this.exigirFicha(sesion, ficha);
    const filas = await this.prisma.user.findMany({
      where: { companyMemberships: { some: { companyId } } },
      select: { id: true, nombre: true, email: true, roleKey: true, isActive: true, passwordChangedAt: true },
      orderBy: { nombre: 'asc' },
      take: 1000,
    });
    const visibles = filas.filter((u) => !isPlatformOwnerEmail(u.email) && !isDeveloperSuperAdminEmail(u.email));
    const guardadas = await this.vault.guardadas(
      companyId,
      visibles.map((u) => u.id),
    );
    return visibles.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      roleKey: u.roleKey,
      isActive: u.isActive,
      passwordChangedAt: u.passwordChangedAt ? u.passwordChangedAt.toISOString() : null,
      /** ¿Hay una contraseña guardada que se pueda mostrar? (nunca se manda la contraseña en la lista) */
      guardada: guardadas.has(u.id),
      guardadaEl: guardadas.get(u.id)?.toISOString() ?? null,
    }));
  }

  /** Cuenta visible para el dueño en esa empresa (ni él ni la de desarrollo). */
  private async cuentaVisible(userId: number, companyId: number) {
    if (!Number.isFinite(userId) || userId <= 0) throw new BadRequestException('Cuenta inválida.');
    const objetivo = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: { id: true, nombre: true, email: true },
    });
    if (!objetivo) throw new NotFoundException('Esa cuenta no existe en esta empresa.');
    if (isPlatformOwnerEmail(objetivo.email) || isDeveloperSuperAdminEmail(objetivo.email)) {
      throw new ForbiddenException('Esa cuenta no se maneja desde aquí.');
    }
    return objetivo;
  }

  /** Muestra la contraseña guardada de UNA cuenta. Cada vista queda en la auditoría (sin la contraseña). */
  async revelar(sesion: Sesion, ficha: unknown, userId: number, companyId: number) {
    const dueno = await this.exigirFicha(sesion, ficha);
    const objetivo = await this.cuentaVisible(userId, companyId);
    const password = await this.vault.revelar(objetivo.id, companyId);
    if (!password) {
      throw new NotFoundException(
        'Esa cuenta no tiene una contraseña guardada (es anterior a la bóveda o cambió por otro camino). Puedes restablecerla.',
      );
    }
    await this.audit
      .log(
        {
          entityType: 'User',
          entityId: objetivo.id,
          action: 'ACCOUNT_PASSWORD_REVEAL',
          changes: { vistaPor: dueno.id, correo: objetivo.email },
          companyId,
        },
        dueno.id,
      )
      .catch(() => undefined);
    return { id: objetivo.id, nombre: objetivo.nombre, email: objetivo.email, password };
  }

  /** Pone una contraseña nueva a esa cuenta y cierra sus sesiones. La nueva se devuelve UNA vez. */
  async restablecer(sesion: Sesion, ficha: unknown, userId: number, companyId: number) {
    const dueno = await this.exigirFicha(sesion, ficha);
    const objetivo = await this.cuentaVisible(userId, companyId);

    const nueva = generarContrasenaSegura();
    await this.prisma.user.update({
      where: { id: objetivo.id },
      data: {
        passwordHash: await bcrypt.hash(nueva, 10),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    // La nueva queda en la bóveda (cifrada); si no se puede guardar, se olvida la vieja para no mostrar una que ya no sirve.
    const guardada = await this.vault.guardar({ userId: objetivo.id, email: objetivo.email, password: nueva, companyId, porUserId: dueno.id });
    if (!guardada) await this.vault.olvidar(objetivo.id);
    // Las sesiones abiertas con la contraseña anterior dejan de valer.
    await this.users.revokeAllUserSessions(objetivo.id, companyId, 'admin_password_reset').catch(() => undefined);
    await this.audit
      .log(
        {
          entityType: 'User',
          entityId: objetivo.id,
          action: 'ACCOUNT_PASSWORD_RESET',
          // Sin la contraseña, jamás.
          changes: { restablecidaPor: dueno.id, correo: objetivo.email },
          companyId,
        },
        dueno.id,
      )
      .catch(() => undefined);

    return { id: objetivo.id, nombre: objetivo.nombre, email: objetivo.email, password: nueva };
  }
}
