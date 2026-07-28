import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(dto: {
    entityType: string;
    entityId: number;
    action: string;
    changes?: any;
    previousData?: any;
    ipAddress?: string;
    userAgent?: string;
    companyId?: number | null;
    source?: string;
  }, userId?: number) {
    return this.prisma.auditLog.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        action: dto.action,
        changes: dto.changes ?? undefined,
        previousData: dto.previousData ?? undefined,
        userId: userId ?? null,
        companyId: dto.companyId ?? null,
        source: dto.source || 'http',
        ipAddress: dto.ipAddress?.trim() || null,
        userAgent: dto.userAgent?.trim() || null,
      },
    });
  }

  async query(filters: {
    entityType?: string;
    entityId?: number;
    action?: string;
    userId?: number;
    companyId?: number | null;
    source?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;
    if (filters.companyId != null) where.companyId = filters.companyId;
    if (filters.source) where.source = filters.source;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, nombre: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Export compliance: hasta 10k filas CSV. */
  async exportCsv(filters: {
    entityType?: string;
    action?: string;
    userId?: number;
    companyId?: number | null;
    from?: string;
    to?: string;
  }) {
    const where: any = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;
    if (filters.companyId != null) where.companyId = filters.companyId;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { email: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const header = ['id', 'createdAt', 'source', 'action', 'entityType', 'entityId', 'userEmail', 'companyId', 'ipAddress'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.createdAt.toISOString(),
          r.source,
          r.action,
          r.entityType,
          r.entityId,
          r.user?.email || '',
          r.companyId ?? '',
          r.ipAddress || '',
        ]
          .map(escape)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  /** Retención: borra logs más viejos que N días (default 365). */
  async purgeOlderThan(days = 365) {
    const cutoff = new Date(Date.now() - Math.max(30, days) * 86_400_000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: result.count, cutoff: cutoff.toISOString() };
  }

  /**
   * GDPR / LFPDPPP — derecho de cancelación / olvido (anonymize, no hard-delete histórico fiscal).
   */
  async eraseSubject(userId: number, actorId?: number, companyId?: number | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.roleKey === 'super_admin') {
      throw new BadRequestException('No se puede borrar un super_admin');
    }

    const stamp = Date.now();
    const anonymizedEmail = `erased+${userId}.${stamp}@privacy.nexara.local`;
    const anonymizedName = `Usuario eliminado #${userId}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          nombre: anonymizedName,
          email: anonymizedEmail,
          employeeNumber: null,
          passwordHash: `ERASED:${stamp}`,
          avatarUrl: null,
          isActive: false,
          estadoRRHH: 'Baja',
          mfaEnabled: false,
          mfaSecret: null,
          oidcProvider: null,
          oidcSubject: null,
          lastLoginIp: null,
          lastLoginDevice: null,
          lockedUntil: new Date(),
        } as any,
      });

      // Perfil RRHH si existe
      try {
        await tx.userProfile.updateMany({
          where: { userId },
          data: {
            telefono: null,
            direccion: null,
            colonia: null,
            ciudad: null,
            estado: null,
            codigoPostal: null,
            curp: null,
            rfc: null,
            ineNumero: null,
            nss: null,
            contactoEmergenciaNombre: null,
            contactoEmergenciaTelefono: null,
            fechaNacimiento: null,
            observaciones: 'PII erased (GDPR/LFPDPPP)',
          },
        });
      } catch {
        // schema drift
      }

      await tx.auditLog.create({
        data: {
          action: 'privacy.erase',
          entityType: 'User',
          entityId: userId,
          userId: actorId ?? null,
          companyId: companyId ?? null,
          source: 'api',
          changes: {
            reason: 'GDPR/LFPDPPP subject erase',
            anonymizedEmail,
          },
        } as any,
      });
    });

    return {
      ok: true,
      userId,
      anonymized: true,
      email: anonymizedEmail,
      at: new Date().toISOString(),
    };
  }

  async getEntityHistory(entityType: string, entityId: number) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { user: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
