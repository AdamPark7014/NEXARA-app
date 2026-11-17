import { ForbiddenException, Injectable } from '@nestjs/common';
import { SolicitudAprobacionService } from '../common/aprobaciones/solicitud-aprobacion.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';
import { esDireccion } from '../users/user-creation-policy.js';
import { ROLES } from '../common/rbac/roles.v2.js';
import type { EstadoSolicitudRh } from '@prisma/client';

type Sesion = { id?: number | string | null; email?: string | null; roleKey?: string | null; isSuperAdmin?: boolean };

@Injectable()
export class RhSolicitudesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aprobaciones: SolicitudAprobacionService,
  ) {}

  private async actor(sesion: Sesion, companyId: number) {
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      throw new ForbiddenException('Selecciona una empresa válida.');
    }
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0) throw new ForbiddenException('Sesión inválida.');
    const actor = await this.prisma.user.findUnique({
      where: { id, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, roleKey: true, isActive: true },
    });
    if (!actor || actor.isActive === false) throw new ForbiddenException('Tu usuario no está activo.');
    return actor;
  }

  async listar(sesion: Sesion, companyId: number, estado?: string) {
    const actor = await this.actor(sesion, companyId);
    const staff = esDireccion(actor, PLATFORM_OWNER_EMAIL) || actor.roleKey === ROLES.RH;
    if (staff) {
      const est =
        estado && ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA'].includes(estado)
          ? (estado as EstadoSolicitudRh)
          : undefined;
      return this.aprobaciones.listar(companyId, est);
    }
    return this.aprobaciones.listarPendientesPara(actor.id, companyId);
  }

  async misPendientes(sesion: Sesion, companyId: number) {
    const actor = await this.actor(sesion, companyId);
    return this.aprobaciones.listarPendientesPara(actor.id, companyId);
  }
}
