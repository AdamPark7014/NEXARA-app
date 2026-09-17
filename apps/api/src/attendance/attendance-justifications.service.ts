import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service';
import { PERMISSIONS } from '../common/permissions.js';
import { isCeoEquivalentEmail, isNonEmployeeEmail } from '../common/platform-accounts.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { parseWorkDate, workDateColumn, workDateKey, workDayBounds } from '../common/time/workday.js';

export const JUSTIFY_FORBIDDEN = 'Solo Christian (Dirección General) puede justificar faltas';
export const UNJUSTIFY_FORBIDDEN = 'Solo Christian (Dirección General) puede quitar una falta justificada';
export const JUSTIFICATION_MOTIVO_MINIMO = 10;

export type JustificationActor = {
  id: number;
  email?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
};

/** Lo que leen web y apps: «Falta justificada · motivo», quién y cuándo. */
export type AttendanceJustificationDto = {
  id: number;
  userId: number;
  /** Día justificado, `AAAA-MM-DD`. */
  fecha: string;
  motivo: string;
  estado: 'FALTA_JUSTIFICADA';
  etiqueta: string;
  justificadaPor: { id: number; nombre: string } | null;
  justificadaAt: string;
};

/** Solo Christian y su equivalente de pruebas justifican faltas. */
export function canJustifyAbsence(actor?: { email?: string | null } | null): boolean {
  return isCeoEquivalentEmail(actor?.email);
}

/** `AAAA-MM-DD` válido y no futuro (en la zona de la jornada); `null` si no. */
export function parseJustificationDate(raw: unknown, now = new Date()): string | null {
  const fecha = typeof raw === 'string' ? raw.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return null;
  if (fecha > workDateKey(now)) return null;
  return fecha;
}

/** «jue 17 sep» para los avisos (la columna es DATE: se lee en UTC). */
export function fechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const partes = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(d);
  const v = (t: string) => (partes.find((p) => p.type === t)?.value ?? '').replace(/\.$/, '');
  return `${v('weekday')} ${v('day')} ${v('month')}`;
}

type Row = {
  id: number;
  userId: number;
  date: Date;
  reason: string;
  createdAt: Date;
  justifiedBy?: { id: number; nombre: string } | null;
};

export function toJustificationDto(row: Row): AttendanceJustificationDto {
  return {
    id: row.id,
    userId: row.userId,
    fecha: row.date.toISOString().slice(0, 10),
    motivo: row.reason,
    estado: 'FALTA_JUSTIFICADA',
    etiqueta: `Falta justificada · ${row.reason}`,
    justificadaPor: row.justifiedBy ? { id: row.justifiedBy.id, nombre: row.justifiedBy.nombre } : null,
    justificadaAt: row.createdAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  userId: true,
  date: true,
  reason: true,
  createdAt: true,
  justifiedBy: { select: { id: true, nombre: true } },
} as const;

/**
 * Faltas justificadas. Justificar no inventa checadas: el día queda registrado como
 * «Falta justificada» con motivo, quién y cuándo, y así lo muestran web y apps en vez de
 * «Sin checada».
 */
@Injectable()
export class AttendanceJustificationsService {
  private readonly logger = new Logger(AttendanceJustificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationHierarchy?: NotificationHierarchyService,
  ) {}

  async justify(
    actor: JustificationActor,
    body: { userId?: unknown; fecha?: unknown; motivo?: unknown },
    companyId: number | null | undefined,
  ): Promise<AttendanceJustificationDto> {
    if (!canJustifyAbsence(actor)) throw new ForbiddenException(JUSTIFY_FORBIDDEN);
    const tenantId = requireCompanyId(companyId);

    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('Indica a la persona');
    const fecha = parseJustificationDate(body?.fecha);
    if (!fecha) throw new BadRequestException('Indica un día válido (AAAA-MM-DD) que no sea futuro');
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().replace(/\s+/g, ' ') : '';
    if (motivo.length < JUSTIFICATION_MOTIVO_MINIMO) {
      throw new BadRequestException(
        `Escribe el motivo de la falta justificada (mínimo ${JUSTIFICATION_MOTIVO_MINIMO} caracteres)`,
      );
    }

    const persona = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, email: true },
    });
    if (!persona || isNonEmployeeEmail(persona.email)) {
      throw new NotFoundException('Esa persona no está en el equipo');
    }

    const base = parseWorkDate(fecha);
    const { start, end } = workDayBounds(base);
    const entrada = await this.prisma.attendance.findFirst({
      where: { userId, type: 'entrada', timestamp: { gte: start, lte: end }, ...companyWhere(tenantId) },
      select: { id: true },
    });
    if (entrada) {
      throw new BadRequestException('Ese día tiene checada de entrada: no es una falta');
    }

    const date = workDateColumn(base);
    const existente = await this.prisma.attendanceJustification.findFirst({
      where: { userId, date },
      select: { id: true },
    });
    if (existente) throw new ConflictException('Ese día ya está justificado');

    const row = await this.prisma.attendanceJustification.create({
      data: { userId, companyId: tenantId, date, reason: motivo.slice(0, 1000), justifiedById: actor.id },
      select: SELECT,
    });

    void Promise.resolve(
      this.notificationHierarchy?.notifyAbsenceJustified({
        userId,
        actorId: actor.id,
        fecha: fechaCorta(fecha),
        motivo: row.reason,
        justificationId: row.id,
      }),
    ).catch(() => undefined);

    return toJustificationDto(row);
  }

  async remove(actor: JustificationActor, id: number, companyId: number | null | undefined) {
    if (!canJustifyAbsence(actor)) throw new ForbiddenException(UNJUSTIFY_FORBIDDEN);
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.attendanceJustification.findFirst({
      where: { id, ...companyWhere(tenantId) },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Falta justificada no encontrada');
    await this.prisma.attendanceJustification.delete({ where: { id } });
    return { removed: true, id };
  }

  /**
   * Faltas justificadas de una persona en un rango. La persona ve las suyas; Christian, dirección y
   * encargados con gestión de asistencia ven las de su equipo.
   */
  async listForUser(
    viewer: JustificationActor,
    query: { userId?: unknown; from?: unknown; to?: unknown },
    companyId: number | null | undefined,
  ): Promise<AttendanceJustificationDto[]> {
    const tenantId = requireCompanyId(companyId);
    const userId = query?.userId != null && query.userId !== '' ? Number(query.userId) : viewer.id;
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('userId inválido');
    const perms = new Set(viewer.permissions ?? []);
    const puede =
      userId === viewer.id ||
      Boolean(viewer.isSuperAdmin) ||
      canJustifyAbsence(viewer) ||
      perms.has(PERMISSIONS.ATTENDANCE_MANAGE) ||
      perms.has(PERMISSIONS.CONSOLE_ADMIN);
    if (!puede) throw new ForbiddenException('No puedes ver las faltas de otra persona');
    return this.listForUsers([userId], String(query?.from ?? ''), String(query?.to ?? ''), tenantId).then(
      (map) => map.get(userId) ?? [],
    );
  }

  /** Por persona, para las respuestas de rango y jerarquía. Rango vacío = últimos 90 días. */
  async listForUsers(
    userIds: number[],
    from: string,
    to: string,
    companyId: number,
  ): Promise<Map<number, AttendanceJustificationDto[]>> {
    const out = new Map<number, AttendanceJustificationDto[]>();
    if (!userIds.length) return out;
    const hoy = workDateKey(new Date());
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(from)
      ? from
      : workDateKey(new Date(Date.now() - 90 * 24 * 3_600_000));
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : hoy;
    const rows = await this.prisma.attendanceJustification.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) },
        ...companyWhere(companyId),
      },
      select: SELECT,
      orderBy: { date: 'desc' },
    });
    for (const r of rows) {
      const list = out.get(r.userId) ?? [];
      list.push(toJustificationDto(r));
      out.set(r.userId, list);
    }
    return out;
  }
}
