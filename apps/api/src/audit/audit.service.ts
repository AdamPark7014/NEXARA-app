import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { celdaCsv } from '../common/security/celda-csv.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import {
  CLAVE_RETENCION_BITACORA,
  COMO_CORREGIR_RETENCION,
  LOTE_PURGA,
  MAX_LOTES_PURGA,
  PAUSA_ENTRE_LOTES_MS,
  describirOrigenRetencion,
  leerRetencionDias,
  normalizarDiasManuales,
  type OrigenRetencion,
} from './audit-retencion.js';

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
    const escape = (v: unknown) => celdaCsv(typeof v === 'number' ? v : String(v ?? ''));
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

  private readonly logger = new Logger(AuditService.name);

  /**
   * ÚNICA purga de la bitácora (antes había dos que se contradecían: `audit-cleanup` a 90 días y esta a 365; mandaba
   * la corta). Los domingos a las 04:15 de México borra lo que pasó la retención configurada
   * (`audit-retencion.ts`: 90 días mientras Adam no fije otro número, piso 30), por lotes.
   *
   * Es semanal, no mensual: es la cadencia que de hecho tenía el borrado que sí actuaba. Con un tope de 40 lotes por
   * corrida (200,000 filas) lo que sobre se borra el domingo siguiente.
   */
  @Cron('15 4 * * 0', { name: 'purga-bitacora', timeZone: WORKDAY_TIMEZONE })
  async purgaProgramada() {
    await runScheduledJob('purga-bitacora', this.logger, () => this.purgeOlderThan());
  }

  /**
   * Borra de la bitácora lo anterior a N días, en lotes de 5,000 (un solo `deleteMany` sobre millones de filas
   * bloquea la tabla y llena el WAL en un disco que va justo).
   *   - Sin `days` rige la retención configurada.
   *   - Con `days` explícito (llamada manual) manda ese número, nunca menor de 30 ni mayor de 3650.
   *   - Un `days` que no es un número entero responde 400: no se adivina qué borrar.
   *   - Si la retención configurada no se puede leer (fila ilegible) se usa el último número válido y, si no hay
   *     ninguno, NO se borra nada y la llamada falla con un mensaje claro (la tarea programada queda como fallida en
   *     su latido, a la vista): lo borrado no se recupera, así que no se adivina 90 sobre algo que Adam quiso distinto.
   * `AuditLog` está en AUDIT_EXCLUDED, así que borrar no genera más bitácora.
   */
  async purgeOlderThan(days?: number | string | null) {
    const pedidos = normalizarDiasManuales(days);
    if (pedidos === 'invalido') {
      throw new BadRequestException('«days» debe ser un número entero de días.');
    }

    let dias: number;
    let origen: OrigenRetencion | 'manual';
    if (pedidos !== null) {
      dias = pedidos;
      origen = 'manual';
    } else {
      const lectura = await leerRetencionDias(this.prisma);
      if (lectura.dias === null) {
        throw new BadRequestException(
          `No se borró nada de la bitácora: la retención configurada («${CLAVE_RETENCION_BITACORA}») no es un número ` +
            `entero de días y no hay un número válido anterior. ${COMO_CORREGIR_RETENCION} ` +
            `Para una purga puntual se puede mandar «days» en la llamada.`,
        );
      }
      dias = lectura.dias;
      origen = lectura.origen;
    }
    const cutoff = new Date(Date.now() - dias * 86_400_000);

    let deleted = 0;
    let quedanMas = false;
    for (let lote = 1; lote <= MAX_LOTES_PURGA; lote += 1) {
      // Se ordena por `createdAt` (índice existente) para que cada vuelta tome lo más viejo sin recorrer la tabla.
      const filas = await this.prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: LOTE_PURGA,
      });
      if (filas.length === 0) break;
      const r = await this.prisma.auditLog.deleteMany({ where: { id: { in: filas.map((f) => f.id) } } });
      deleted += r.count;
      if (filas.length < LOTE_PURGA) break;
      // Llegó al tope con el lote lleno: puede quedar más (se sabrá en la siguiente corrida).
      if (lote === MAX_LOTES_PURGA) {
        quedanMas = true;
        break;
      }
      await this.pausar(PAUSA_ENTRE_LOTES_MS);
    }

    const cutoffIso = cutoff.toISOString();
    this.logger.log(
      `Bitácora: ${deleted} registros anteriores a ${cutoffIso} borrados (retención ${dias} días, ${describirOrigenRetencion(origen)})` +
        (quedanMas ? `; puede que queden más, seguirán en la próxima corrida (tope ${MAX_LOTES_PURGA} lotes)` : ''),
    );
    return { deleted, cutoff: cutoffIso, dias, origen, quedanMas };
  }

  /** Pausa entre lotes. Es un método para poder sustituirlo en pruebas sin relojes falsos. */
  protected pausar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
