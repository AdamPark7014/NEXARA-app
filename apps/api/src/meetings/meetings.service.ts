import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import {
  AGREEMENT_KINDS,
  AGREEMENT_STATUSES,
  MEETING_AGENDA,
  MEETING_DEFAULTS,
  MEETING_STATUSES,
  MEETING_TYPES,
  OPEN_AGREEMENT_STATUSES,
  agreementRequiresOwner,
  daysOverdue,
  isOverdue,
  type AgreementKind,
  type AgreementStatus,
  type MeetingStatus,
  type MeetingType,
} from './meeting-rhythm.js';

const USER_BRIEF = { select: { id: true, nombre: true, email: true } };

/**
 * Reuniones operativas, acuerdos y lecciones aprendidas.
 *
 * El pulso de la empresa —la diaria de las 10:00, la planeación del lunes, la
 * revisión del miércoles y la junta de cierre del viernes— vivía fuera del ERP.
 * Al no estar, los acuerdos no quedaban ligados a las actividades de las que se
 * hablaba y las lecciones aprendidas se perdían al terminar la junta.
 */
@Injectable()
export class MeetingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reuniones ─────────────────────────────────────────────────────────

  async list(
    companyId?: number | null,
    filters?: { tipo?: string; estado?: string; desde?: string; hasta?: string },
  ) {
    const tenantId = requireCompanyId(companyId);

    const where = {
      ...companyWhere(tenantId),
      ...(filters?.tipo ? { tipo: parseEnum(filters.tipo, MEETING_TYPES, 'tipo') } : {}),
      ...(filters?.estado ? { estado: parseEnum(filters.estado, MEETING_STATUSES, 'estado') } : {}),
      ...(filters?.desde || filters?.hasta
        ? {
            fecha: {
              ...(filters.desde ? { gte: new Date(filters.desde) } : {}),
              ...(filters.hasta ? { lte: new Date(filters.hasta) } : {}),
            },
          }
        : {}),
    };

    const reuniones = await this.prisma.operationalMeeting.findMany({
      where,
      include: {
        facilitador: USER_BRIEF,
        _count: { select: { asistentes: true, acuerdos: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    });

    return reuniones.map((r) => ({
      ...r,
      asistentes: r._count.asistentes,
      acuerdos: r._count.acuerdos,
      _count: undefined,
    }));
  }

  async get(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const reunion = await this.prisma.operationalMeeting.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        facilitador: USER_BRIEF,
        asistentes: { include: { user: USER_BRIEF }, orderBy: { id: 'asc' } },
        acuerdos: {
          include: {
            responsable: USER_BRIEF,
            activity: { select: { id: true, anNumber: true, titulo: true } },
          },
          orderBy: [{ tipo: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!reunion) throw new NotFoundException('Reunión no encontrada');

    return {
      ...reunion,
      acuerdos: reunion.acuerdos.map((a) => this.decorateAgreement(a)),
    };
  }

  /**
   * Convoca una reunión.
   *
   * El título, la hora y la agenda salen del tipo si no se envían: la diaria de
   * las 10:00 se convoca en un clic, y la junta del viernes arranca con
   * "lecciones aprendidas" ya escrito en la agenda, que es justo el punto que
   * se olvida.
   */
  async create(
    dto: {
      tipo: MeetingType;
      titulo?: string;
      fecha: string;
      horaInicio?: string;
      agenda?: string;
      facilitadorId?: number | null;
      asistentes?: number[];
    },
    actorId: number | null,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const tipo = parseEnum(dto.tipo, MEETING_TYPES, 'tipo de reunión');

    const fecha = parseDate(dto.fecha, 'fecha');
    const defaults = MEETING_DEFAULTS[tipo];
    const asistentes = await this.validateAttendees(dto.asistentes ?? [], tenantId);

    return this.prisma.operationalMeeting.create({
      data: {
        tipo,
        titulo: dto.titulo?.trim()?.slice(0, 200) || defaults.titulo,
        fecha,
        horaInicio: normalizeTime(dto.horaInicio) ?? defaults.horaInicio,
        agenda: dto.agenda?.trim() || MEETING_AGENDA[tipo].map((p) => `• ${p}`).join('\n'),
        facilitadorId: dto.facilitadorId ?? actorId ?? null,
        companyId: tenantId,
        ...(asistentes.length
          ? { asistentes: { create: asistentes.map((userId) => ({ userId })) } }
          : {}),
      },
      include: { facilitador: USER_BRIEF, asistentes: { include: { user: USER_BRIEF } } },
    });
  }

  async update(
    id: number,
    dto: {
      titulo?: string;
      fecha?: string;
      horaInicio?: string;
      agenda?: string;
      notas?: string;
      facilitadorId?: number | null;
      estado?: MeetingStatus;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const actual = await this.loadMeeting(id, tenantId);

    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim().slice(0, 200);
    if (dto.fecha !== undefined) data.fecha = parseDate(dto.fecha, 'fecha');
    if (dto.horaInicio !== undefined) data.horaInicio = normalizeTime(dto.horaInicio);
    if (dto.agenda !== undefined) data.agenda = dto.agenda?.trim() || null;
    if (dto.notas !== undefined) data.notas = dto.notas?.trim() || null;
    if (dto.facilitadorId !== undefined) data.facilitadorId = dto.facilitadorId ?? null;

    if (dto.estado !== undefined) {
      const estado = parseEnum(dto.estado, MEETING_STATUSES, 'estado');
      if (actual.estado === 'REALIZADA' && estado === 'PROGRAMADA') {
        throw new BadRequestException('Una reunión ya realizada no vuelve a estar programada');
      }
      data.estado = estado;
      data.realizadaAt = estado === 'REALIZADA' ? (actual.realizadaAt ?? new Date()) : null;
    }

    return this.prisma.operationalMeeting.update({
      where: { id },
      data,
      include: { facilitador: USER_BRIEF },
    });
  }

  /**
   * Cierra la reunión y guarda la minuta.
   *
   * Una reunión cancelada no se puede dar por realizada: sería un acta de algo
   * que no ocurrió.
   */
  async close(id: number, dto: { notas?: string }, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const actual = await this.loadMeeting(id, tenantId);

    if (actual.estado === 'CANCELADA') {
      throw new BadRequestException('La reunión estaba cancelada');
    }

    await this.prisma.operationalMeeting.update({
      where: { id },
      data: {
        estado: 'REALIZADA',
        realizadaAt: actual.realizadaAt ?? new Date(),
        notas: dto.notas?.trim() || actual.notas,
      },
    });
    return this.get(id, tenantId);
  }

  /** Pasa lista. Reemplaza la lista completa: es lo que hace quien convoca. */
  async setAttendance(
    id: number,
    entries: Array<{ userId: number; asistio?: boolean }>,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadMeeting(id, tenantId);

    if (!Array.isArray(entries)) throw new BadRequestException('Lista de asistencia inválida');
    const validos = await this.validateAttendees(
      entries.map((e) => Number(e.userId)),
      tenantId,
    );
    const asistio = new Map(entries.map((e) => [Number(e.userId), Boolean(e.asistio)]));

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingAttendee.deleteMany({
        where: { meetingId: id, userId: { notIn: validos.length ? validos : [0] } },
      });
      for (const userId of validos) {
        await tx.meetingAttendee.upsert({
          where: { meetingId_userId: { meetingId: id, userId } },
          update: { asistio: asistio.get(userId) ?? false },
          create: { meetingId: id, userId, asistio: asistio.get(userId) ?? false },
        });
      }
    });

    return this.prisma.meetingAttendee.findMany({
      where: { meetingId: id },
      include: { user: USER_BRIEF },
      orderBy: { id: 'asc' },
    });
  }

  // ── Acuerdos, lecciones y riesgos ─────────────────────────────────────

  /**
   * Registra lo que sale de la reunión.
   *
   * Un ACUERDO exige responsable; una LECCION y un RIESGO, no. Un acuerdo sin
   * dueño es un deseo, y es lo que vuelve inútil la junta de los viernes.
   */
  async addAgreement(
    meetingId: number,
    dto: {
      tipo?: AgreementKind;
      descripcion: string;
      responsableId?: number | null;
      fechaCompromiso?: string | null;
      activityId?: number | null;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadMeeting(meetingId, tenantId);

    const tipo = dto.tipo ? parseEnum(dto.tipo, AGREEMENT_KINDS, 'tipo') : 'ACUERDO';
    const descripcion = requireText(dto.descripcion, 'descripción');

    if (agreementRequiresOwner(tipo) && !dto.responsableId) {
      throw new BadRequestException('Un acuerdo necesita responsable; una lección o un riesgo, no');
    }
    if (dto.responsableId) await this.validateAttendees([dto.responsableId], tenantId);
    if (dto.activityId) await this.validateActivity(dto.activityId, tenantId);

    const creado = await this.prisma.meetingAgreement.create({
      data: {
        meetingId,
        tipo,
        descripcion,
        responsableId: dto.responsableId ?? null,
        fechaCompromiso: dto.fechaCompromiso ? parseDate(dto.fechaCompromiso, 'fecha compromiso') : null,
        activityId: dto.activityId ?? null,
        companyId: tenantId,
      },
      include: {
        responsable: USER_BRIEF,
        activity: { select: { id: true, anNumber: true, titulo: true } },
      },
    });
    return this.decorateAgreement(creado);
  }

  async updateAgreement(
    meetingId: number,
    agreementId: number,
    dto: {
      estado?: AgreementStatus;
      descripcion?: string;
      responsableId?: number | null;
      fechaCompromiso?: string | null;
      activityId?: number | null;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadMeeting(meetingId, tenantId);

    const actual = await this.prisma.meetingAgreement.findFirst({
      where: { id: agreementId, meetingId, ...companyWhere(tenantId) },
    });
    if (!actual) throw new NotFoundException('Acuerdo no encontrado');

    const data = await this.buildAgreementUpdate(actual, dto, tenantId);
    const actualizado = await this.prisma.meetingAgreement.update({
      where: { id: agreementId },
      data,
      include: {
        responsable: USER_BRIEF,
        activity: { select: { id: true, anNumber: true, titulo: true } },
      },
    });
    return this.decorateAgreement(actualizado);
  }

  /** Lo que le toca a quien pregunta. Todo el personal ve y mueve lo suyo. */
  async myAgreements(userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Usuario inválido');
    }

    const acuerdos = await this.prisma.meetingAgreement.findMany({
      where: {
        responsableId: userId,
        estado: { in: OPEN_AGREEMENT_STATUSES },
        ...companyWhere(tenantId),
      },
      include: {
        meeting: { select: { id: true, titulo: true, tipo: true, fecha: true } },
        activity: { select: { id: true, anNumber: true, titulo: true } },
      },
      orderBy: [{ fechaCompromiso: 'asc' }, { createdAt: 'asc' }],
    });

    const decorados = acuerdos.map((a) => this.decorateAgreement(a));
    return {
      total: decorados.length,
      vencidos: decorados.filter((a) => a.vencido).length,
      acuerdos: decorados,
    };
  }

  /**
   * Avanza un acuerdo propio.
   *
   * Separado de `updateAgreement` a propósito: quien no conduce la reunión no
   * debe poder cerrar el acuerdo de otro, sólo el suyo.
   */
  async updateMyAgreement(
    agreementId: number,
    userId: number,
    dto: { estado?: AgreementStatus },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const actual = await this.prisma.meetingAgreement.findFirst({
      where: { id: agreementId, ...companyWhere(tenantId) },
    });
    if (!actual) throw new NotFoundException('Acuerdo no encontrado');
    if (actual.responsableId !== userId) {
      throw new ForbiddenException('Ese acuerdo es responsabilidad de otra persona');
    }

    const data = await this.buildAgreementUpdate(actual, { estado: dto.estado }, tenantId);
    const actualizado = await this.prisma.meetingAgreement.update({
      where: { id: agreementId },
      data,
      include: {
        responsable: USER_BRIEF,
        activity: { select: { id: true, anNumber: true, titulo: true } },
      },
    });
    return this.decorateAgreement(actualizado);
  }

  /** Acuerdos abiertos cuya fecha ya pasó: el tablero de la junta de cierre. */
  async overdueAgreements(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const hoy = new Date();

    const acuerdos = await this.prisma.meetingAgreement.findMany({
      where: {
        tipo: 'ACUERDO',
        estado: { in: OPEN_AGREEMENT_STATUSES },
        fechaCompromiso: { not: null, lt: hoy },
        ...companyWhere(tenantId),
      },
      include: {
        responsable: USER_BRIEF,
        meeting: { select: { id: true, titulo: true, fecha: true } },
        activity: { select: { id: true, anNumber: true, titulo: true } },
      },
      orderBy: { fechaCompromiso: 'asc' },
      take: 200,
    });

    const decorados = acuerdos.map((a) => this.decorateAgreement(a, hoy)).filter((a) => a.vencido);
    return { total: decorados.length, acuerdos: decorados };
  }

  /**
   * Lecciones aprendidas, buscables.
   *
   * Antes se decían el viernes y se olvidaban el lunes. Aquí quedan escritas y
   * ligadas —cuando aplica— al servicio del que salieron.
   */
  async lessons(companyId?: number | null, q?: string) {
    const tenantId = requireCompanyId(companyId);
    const texto = q?.trim();

    return this.prisma.meetingAgreement.findMany({
      where: {
        tipo: 'LECCION',
        ...companyWhere(tenantId),
        ...(texto ? { descripcion: { contains: texto, mode: 'insensitive' as const } } : {}),
      },
      include: {
        meeting: { select: { id: true, titulo: true, tipo: true, fecha: true } },
        activity: { select: { id: true, anNumber: true, titulo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Interno ───────────────────────────────────────────────────────────

  private async loadMeeting(id: number, companyId: number) {
    const reunion = await this.prisma.operationalMeeting.findFirst({
      where: { id, ...companyWhere(companyId) },
      select: { id: true, estado: true, realizadaAt: true, notas: true },
    });
    if (!reunion) throw new NotFoundException('Reunión no encontrada');
    return reunion;
  }

  /**
   * Sólo entran al acta usuarios activos de la empresa.
   *
   * Sin esto se podía convocar a alguien de otra compañía por id, y la lista de
   * asistencia dejaría de ser prueba de nada.
   */
  private async validateAttendees(userIds: number[], companyId: number): Promise<number[]> {
    const ids = [...new Set(userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return [];

    // `User` no lleva `companyId`: la pertenencia vive en `UserCompany`, así que
    // el middleware de tenant no puede acotarla y hay que filtrar aquí.
    const encontrados = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true },
    });
    if (encontrados.length !== ids.length) {
      throw new BadRequestException('Alguna persona no existe, está inactiva o es de otra empresa');
    }
    return encontrados.map((u) => u.id);
  }

  private async validateActivity(activityId: number, companyId: number) {
    const actividad = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(companyId) },
      select: { id: true },
    });
    if (!actividad) throw new NotFoundException('La actividad no existe en esta empresa');
    return actividad;
  }

  private async buildAgreementUpdate(
    actual: { estado: string; tipo: string; cumplidoAt: Date | null; responsableId: number | null },
    dto: {
      estado?: AgreementStatus;
      descripcion?: string;
      responsableId?: number | null;
      fechaCompromiso?: string | null;
      activityId?: number | null;
    },
    companyId: number,
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    if (dto.descripcion !== undefined) data.descripcion = requireText(dto.descripcion, 'descripción');
    if (dto.fechaCompromiso !== undefined) {
      data.fechaCompromiso = dto.fechaCompromiso
        ? parseDate(dto.fechaCompromiso, 'fecha compromiso')
        : null;
    }
    if (dto.activityId !== undefined) {
      if (dto.activityId) await this.validateActivity(dto.activityId, companyId);
      data.activityId = dto.activityId ?? null;
    }
    if (dto.responsableId !== undefined) {
      if (dto.responsableId) await this.validateAttendees([dto.responsableId], companyId);
      if (!dto.responsableId && agreementRequiresOwner(actual.tipo as AgreementKind)) {
        throw new BadRequestException('Un acuerdo no puede quedarse sin responsable');
      }
      data.responsableId = dto.responsableId ?? null;
    }

    if (dto.estado !== undefined) {
      const estado = parseEnum(dto.estado, AGREEMENT_STATUSES, 'estado');
      data.estado = estado;
      // Reabrir limpia la fecha de cumplimiento; volver a cerrar conserva la
      // original, que es la que vale como evidencia.
      data.cumplidoAt = estado === 'CUMPLIDO' ? (actual.cumplidoAt ?? new Date()) : null;
    }

    return data;
  }

  private decorateAgreement<T extends { estado: string; fechaCompromiso: Date | null }>(
    agreement: T,
    at: Date = new Date(),
  ): T & { vencido: boolean; diasVencido: number } {
    return {
      ...agreement,
      vencido: isOverdue(agreement, at),
      diasVencido: daysOverdue(agreement, at),
    };
  }
}

function parseEnum<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!(allowed as readonly string[]).includes(v)) {
    throw new BadRequestException(`${label} inválido. Valores: ${allowed.join(', ')}`);
  }
  return v as T[number];
}

function parseDate(value: string, label: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label} inválida`);
  return d;
}

/** Guarda la hora como HH:MM; cualquier otra cosa se descarta en vez de mentir. */
function normalizeTime(value?: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function requireText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`La ${label} es obligatoria`);
  return text.slice(0, 4000);
}
