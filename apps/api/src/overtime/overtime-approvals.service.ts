/**
 * Aprobación de horas extra para pre-nómina (Ola D).
 * Los candidatos salen de las mismas reglas que `me/kpis-equipo.ts`
 * (`minutosExtra` por día). Solo el estado APROBADO entra al preview de pago.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveAccessScheduleKey } from '../integra/access-schedule-defaults.js';
import {
  companyWhere,
  requireCompanyId,
  resolveRequiredCompanyId,
} from '../common/tenant/tenant-scope.js';
import {
  calculaKpisPersona,
  horarioDePlantilla,
} from '../me/kpis-equipo.js';
import {
  parseWorkDate,
  workDateColumn,
  workDayEnd,
  workDayStart,
} from '../common/time/workday.js';

const DIA_MS = 24 * 3_600_000;

@Injectable()
export class OvertimeApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private ot() {
    return (this.prisma as any).overtimeApproval as {
      findMany: (args: any) => Promise<any[]>;
      findFirst: (args: any) => Promise<any | null>;
      upsert: (args: any) => Promise<any>;
      update: (args: any) => Promise<any>;
      count: (args: any) => Promise<number>;
    };
  }

  private rejections() {
    return (this.prisma as any).attendanceRejection as {
      findMany: (args: any) => Promise<any[]>;
      count: (args: any) => Promise<number>;
    };
  }

  async list(
    filters: { from?: string; to?: string; estado?: string; userId?: number },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const fromDate = this.toDate(filters.from);
    const toDate = this.toDate(filters.to);
    if ((filters.from && !fromDate) || (filters.to && !toDate)) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    const where: Record<string, unknown> = { ...companyWhere(tenantId) };
    if (fromDate || toDate) {
      where.fecha = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }
    if (filters.userId) where.userId = filters.userId;
    if (filters.estado) {
      const estado = String(filters.estado).toUpperCase();
      if (!['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(estado)) {
        throw new BadRequestException('estado inválido');
      }
      where.estado = estado;
    }

    return this.ot().findMany({
      where,
      include: {
        user: { select: { id: true, nombre: true, email: true, puesto: true } },
        aprobadoPor: { select: { id: true, nombre: true } },
      },
      orderBy: [{ fecha: 'desc' }, { userId: 'asc' }],
    });
  }

  /**
   * Recalcula candidatos de extra con las reglas de KPI y hace upsert.
   * No pisa filas ya APROBADO/RECHAZADO (solo actualiza minutos si siguen PENDIENTE;
   * si el día ya no tiene extra, deja la fila PENDIENTE en 0 minutos).
   */
  async upsertCandidates(from: string, to: string, companyId?: number | null) {
    const tenantId = await resolveRequiredCompanyId(this.prisma, companyId);
    const fromDate = this.toDate(from);
    const toDate = this.toDate(to);
    if (!fromDate || !toDate || fromDate > toDate) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    const desde = from.slice(0, 10);
    const hasta = to.slice(0, 10);
    const now = new Date();

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: {
        id: true,
        isActive: true,
        roleKey: true,
        tipoContrato: true,
        fechaIngreso: true,
        role: { select: { orgRoleKey: true } },
      },
    });
    if (!users.length) {
      return { from: desde, to: hasta, upserted: 0, candidates: [] as any[] };
    }

    const userIds = users.map((u) => u.id);
    const ini = new Date(workDayStart(parseWorkDate(desde)).getTime() - DIA_MS);
    const fin = new Date(workDayEnd(parseWorkDate(hasta)).getTime() + DIA_MS);
    const ventana = { gte: ini, lte: fin };

    const [checadas, comidas] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { userId: { in: userIds }, timestamp: ventana, companyId: tenantId },
        select: {
          id: true,
          userId: true,
          type: true,
          timestamp: true,
          cierreAutomatico: true,
          uniformeOk: true,
        },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.lunchBreak.findMany({
        where: {
          userId: { in: userIds },
          date: { gte: workDateColumn(ini), lte: workDateColumn(fin) },
          companyId: tenantId,
        },
        select: { userId: true, checkinTime: true, checkoutTime: true },
      }),
    ]);

    const checadasPor = new Map<number, typeof checadas>();
    for (const c of checadas) {
      const list = checadasPor.get(c.userId) ?? [];
      list.push(c);
      checadasPor.set(c.userId, list);
    }
    const comidasPor = new Map<number, typeof comidas>();
    for (const c of comidas) {
      const list = comidasPor.get(c.userId) ?? [];
      list.push(c);
      comidasPor.set(c.userId, list);
    }

    const candidates: Array<{ userId: number; fecha: string; minutos: number }> = [];
    for (const u of users) {
      const plantilla = resolveAccessScheduleKey({
        isActive: u.isActive,
        roleKey: u.roleKey,
        orgRoleKey: u.role?.orgRoleKey ?? null,
        tipoContrato: u.tipoContrato,
      });
      const horario = horarioDePlantilla(plantilla);
      if (horario.jornadaOrdinariaMin == null) continue;

      const { dias } = calculaKpisPersona({
        desde,
        hasta,
        ahora: now,
        horario,
        checadas: (checadasPor.get(u.id) ?? []).map((c) => ({
          id: c.id,
          tipo: c.type,
          at: c.timestamp,
          cierreAutomatico: c.cierreAutomatico,
          uniformeOk: c.uniformeOk,
        })),
        comidas: (comidasPor.get(u.id) ?? []).map((c) => ({
          inicio: c.checkinTime,
          fin: c.checkoutTime ?? null,
        })),
        actividades: [],
        fechaIngreso: u.fechaIngreso ?? null,
      });

      for (const d of dias) {
        const minutos = d.minutosExtra ?? 0;
        if (minutos <= 0) continue;
        candidates.push({ userId: u.id, fecha: d.fecha, minutos });
      }
    }

    let upserted = 0;
    for (const c of candidates) {
      const fecha = parseWorkDate(c.fecha);
      const existing = await this.ot().findFirst({
        where: { userId: c.userId, fecha, companyId: tenantId },
      });
      if (existing && existing.estado !== 'PENDIENTE') {
        // Decidido: no reabrir ni cambiar minutos (el jefe ya firmó).
        continue;
      }
      await this.ot().upsert({
        where: { userId_fecha: { userId: c.userId, fecha } },
        create: {
          userId: c.userId,
          fecha,
          minutos: c.minutos,
          estado: 'PENDIENTE',
          companyId: tenantId,
        },
        update: {
          minutos: c.minutos,
        },
      });
      upserted += 1;
    }

    return { from: desde, to: hasta, upserted, candidates };
  }

  async decide(
    id: number,
    estado: 'APROBADO' | 'RECHAZADO',
    actorId: number,
    nota?: string | null,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.ot().findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    if (!existing) throw new NotFoundException('Hora extra no encontrada');
    if (existing.estado !== 'PENDIENTE') {
      throw new BadRequestException('Solo se pueden decidir filas PENDIENTE');
    }
    return this.ot().update({
      where: { id },
      data: {
        estado,
        aprobadoPorId: actorId,
        nota: nota?.trim() || null,
      },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        aprobadoPor: { select: { id: true, nombre: true } },
      },
    });
  }

  async listRejections(
    filters: { from?: string; to?: string; userId?: number },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const fromDate = this.toDate(filters.from);
    const toDate = this.toDate(filters.to);
    if ((filters.from && !fromDate) || (filters.to && !toDate)) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    const where: Record<string, unknown> = { ...companyWhere(tenantId) };
    if (fromDate || toDate) {
      where.at = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: new Date(toDate.getTime() + DIA_MS - 1) } : {}),
      };
    }
    if (filters.userId) where.userId = filters.userId;

    return this.rejections().findMany({
      where,
      include: {
        user: { select: { id: true, nombre: true, email: true } },
      },
      orderBy: { at: 'desc' },
      take: 500,
    });
  }
}
