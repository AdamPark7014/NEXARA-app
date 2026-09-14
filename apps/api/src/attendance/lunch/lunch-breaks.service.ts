import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { LunchBreak } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../../notifications/notification-hierarchy.service.js';
import { CreateLunchBreakDto, RevisarComidaDto, UpdateLunchBreakDto } from './dto/lunch-break.dto.js';
import { companyWhere, requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { parseWorkDate, workDateColumn, workDayAtClock } from '../../common/time/workday.js';

/** Christian supervisa y developer es cuenta de plataforma: no registran comida. */
const SIN_COMIDA = new Set(['gerencia@nexara.com.mx', 'developer@nexara.com.mx']);
const JUSTIFICACION_MIN = 5;
/** Desfase aceptado entre la hora del teléfono y la del servidor. */
const DESFASE_MAX_MS = 10 * 60_000;

const norm = (email?: string | null) => (email || '').trim().toLowerCase();

/** Quien consulta o revisa comidas. */
export type LunchViewer = {
  id: number;
  email?: string | null;
  isSuperAdmin?: boolean;
  roleKey?: string | null;
  permissions?: string[] | null;
};

@Injectable()
export class LunchBreaksService {
  constructor(
    private prisma: PrismaService,
    private notificationHierarchy: NotificationHierarchyService,
  ) {}

  /**
   * Día de comida listo para la columna `date`, que es `@db.Date`.
   *
   * Nunca `setHours(0,0,0,0)`: el contenedor corre en UTC, así que eso cortaba
   * el día seis horas antes que en México y la comida de la tarde caía en el
   * día siguiente. En los datos de producción 10 de 15 registros de asistencia
   * caían en el día equivocado por esta misma causa, y de aquí sale la nómina.
   */
  private dayColumn(instante: Date = new Date()) {
    return workDateColumn(instante);
  }

  /**
   * Extremo de un rango de consulta, normalizado al día laboral de la empresa.
   *
   * `AAAA-MM-DD` se ancla con `parseWorkDate` (mediodía UTC) para que no se
   * corra de día; un instante completo se traduce al día de México que lo
   * contiene. Sin esto, pedir "hoy" desde la tarde mexicana devolvía mañana.
   */
  private rangeDayColumn(valor?: Date | string | null) {
    if (valor === undefined || valor === null || valor === '') return undefined;
    if (typeof valor === 'string') return workDateColumn(parseWorkDate(valor));
    return workDateColumn(valor);
  }

  async createCheckin(usuarioId: number, data: CreateLunchBreakDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const now = new Date();
    const today = this.dayColumn(now);

    // Verificar si ya existe un registro de comida hoy
    const existingLunch = await this.prisma.lunchBreak.findFirst({
      where: {
        userId: usuarioId,
        date: today,
        ...companyWhere(tenantId),
      },
    });

    if (existingLunch && existingLunch.checkoutTime) {
      throw new BadRequestException('Ya completaste tu hora de comida hoy');
    }

    const checkinTime = this.horaRegistro(data.checkinTime, now);
    const lunchStartHour = workDayAtClock(now, 15, 0);
    const lunchEndHour = workDayAtClock(now, 16, 0);

    const isLate = checkinTime < lunchStartHour || checkinTime > lunchEndHour;
    // Fuera de 3–4 p.m. hay que decir por qué; queda pendiente de que un superior lo apruebe.
    const justificacion = (data.justificacion ?? '').trim();
    if (isLate && justificacion.length < JUSTIFICACION_MIN) {
      throw new BadRequestException(
        'Estás fuera del horario de comida (3:00 a 4:00 p.m.): escribe por qué sales a comer a esta hora.',
      );
    }
    const revision = isLate
      ? { revisionEstado: 'PENDIENTE', revisionNotas: null, revisadoPorId: null, revisadoAt: null }
      : { revisionEstado: null, revisionNotas: null, revisadoPorId: null, revisadoAt: null };
    let notes = '';
    if (checkinTime < lunchStartHour) {
      notes = `Entraste a comida ${this.getMinutesDiff(checkinTime, lunchStartHour)} minutos antes`;
    } else if (checkinTime > lunchEndHour) {
      // Se mide contra el FIN de la ventana (16:00), que es lo que se rebasó.
      // Antes se medía contra las 15:00 y se guardaba en `notes` un retraso
      // inflado en 60 minutos: un dato falso en la base.
      notes = `Entraste a comida ${this.getMinutesDiff(lunchEndHour, checkinTime)} minutos después del horario permitido (4 PM)`;
    }

    let lunchBreak;

    if (existingLunch) {
      // Actualizar registro existente
      lunchBreak = await this.prisma.lunchBreak.update({
        where: { id: existingLunch.id },
        data: {
          checkinTime,
          checkinPhotoUrl: data.checkinPhotoUrl,
          isCheckinLate: isLate,
          checkinJustificacion: isLate ? justificacion : null,
          ...revision,
          notes,
          status: 'IN_PROGRESS',
          updatedAt: new Date(),
        },
        include: { user: { select: { nombre: true, email: true, id: true } } },
      });
    } else {
      // Crear nuevo registro
      lunchBreak = await this.prisma.lunchBreak.create({
        data: {
          userId: usuarioId,
          date: today,
          checkinTime,
          checkinPhotoUrl: data.checkinPhotoUrl,
          isCheckinLate: isLate,
          checkinJustificacion: isLate ? justificacion : null,
          ...revision,
          notes,
          status: 'IN_PROGRESS',
          companyId: tenantId,
        },
        include: { user: { select: { nombre: true, email: true, id: true } } },
      });
    }

    // Notify about lunch break checkin
    await this.notificationHierarchy.notifyLunchBreakChange(
      usuarioId,
      'LUNCH_CHECKIN',
      lunchBreak.user.nombre || 'Usuario',
    );
    if (isLate) {
      void this.notificationHierarchy.notifyLunchLate?.({
        userId: usuarioId,
        userName: lunchBreak.user.nombre || 'Usuario',
        momento: 'salida',
        hora: checkinTime,
        justificacion,
        lunchId: lunchBreak.id,
      });
    }

    return lunchBreak;
  }

  async createCheckout(usuarioId: number, data: UpdateLunchBreakDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const now = new Date();
    const today = this.dayColumn(now);

    const lunch = await this.prisma.lunchBreak.findFirst({
      where: {
        userId: usuarioId,
        date: today,
        ...companyWhere(tenantId),
      },
    });

    if (!lunch) {
      throw new BadRequestException('No existe un registro de comida para hoy');
    }

    if (lunch.checkoutTime) {
      throw new BadRequestException('Ya registraste tu salida de comida');
    }

    const checkoutTime = this.horaRegistro(data.checkoutTime, now);
    const lunchEndHour = workDayAtClock(now, 16, 5);

    const isLate = checkoutTime > lunchEndHour;
    const justificacion = (data.justificacion ?? '').trim();
    if (isLate && justificacion.length < JUSTIFICACION_MIN) {
      throw new BadRequestException(
        'Ya pasó la hora de regreso de comida (4:00 p.m.): escribe por qué regresas a esta hora.',
      );
    }
    // `lunch.notes` es nullable: sin el `?? ''`, concatenar dejaba en la base
    // notas que empezaban literalmente por "null".
    let notes = lunch.notes ?? '';

    if (isLate) {
      notes += `\nVolviste del almuerzo ${this.getMinutesDiff(lunchEndHour, checkoutTime)} minutos después de lo esperado`;
    } else {
      notes += `\nVolviste del almuerzo a horario`;
    }

    const lunchBreak = await this.prisma.lunchBreak.update({
      where: { id: lunch.id },
      data: {
        checkoutTime,
        checkoutPhotoUrl: data.checkoutPhotoUrl,
        isCheckoutLate: isLate,
        checkoutJustificacion: isLate ? justificacion : null,
        // Regreso tarde: vuelve a pendiente aunque la salida ya se hubiera aprobado.
        ...(isLate ? { revisionEstado: 'PENDIENTE', revisionNotas: null, revisadoPorId: null, revisadoAt: null } : {}),
        notes,
        status: 'COMPLETED',
        updatedAt: new Date(),
      },
      include: { user: { select: { nombre: true, email: true } } },
    });

    // Notify about lunch break checkout
    await this.notificationHierarchy.notifyLunchBreakChange(
      usuarioId,
      'LUNCH_CHECKOUT',
      lunchBreak.user.nombre || 'Usuario',
    );
    if (isLate) {
      void this.notificationHierarchy.notifyLunchLate?.({
        userId: usuarioId,
        userName: lunchBreak.user.nombre || 'Usuario',
        momento: 'regreso',
        hora: checkoutTime,
        justificacion,
        lunchId: lunchBreak.id,
      });
    }

    return lunchBreak;
  }

  /** Mi comida de hoy: qué sigue (salir o regresar), si ya es a destiempo y mi registro. */
  async miDia(viewer: LunchViewer, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const now = new Date();
    const debeRegistrar = this.debeRegistrar(viewer);
    const registro = debeRegistrar
      ? await this.prisma.lunchBreak.findFirst({
          where: { userId: viewer.id, date: this.dayColumn(now), ...companyWhere(tenantId) },
        })
      : null;
    const inicio = workDayAtClock(now, 15, 0);
    const fin = workDayAtClock(now, 16, 0);
    const regresoLimite = workDayAtClock(now, 16, 5);
    const siguiente = !debeRegistrar
      ? 'no_aplica'
      : !registro
        ? 'salida'
        : !registro.checkoutTime
          ? 'regreso'
          : 'listo';
    const [mapped] = registro ? await this.mapRegistros([registro]) : [null];
    return {
      debeRegistrar,
      ahora: now,
      ventana: { inicio, fin, regresoLimite, texto: '3:00 a 4:00 p.m.' },
      salidaADestiempo: now < inicio || now > fin,
      regresoADestiempo: now > regresoLimite,
      siguiente,
      registro: mapped,
    };
  }

  /**
   * Comidas del día de mi gente. Christian (y plataforma) ve a todos; cada jefe ve su organigrama
   * (managerId hacia abajo). Incluye a quien no ha registrado y quién puede aprobar cada una.
   */
  async equipo(viewer: LunchViewer, fecha: string | undefined, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const dia = fecha ? workDateColumn(parseWorkDate(fecha)) : this.dayColumn();
    const usuarios = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, nombre: true, email: true, avatarUrl: true, puesto: true, managerId: true },
      orderBy: { nombre: 'asc' },
    });
    const todo = this.esSupervisorGeneral(viewer);
    const jefes = this.cadenaJefes(usuarios);
    const visibles = usuarios.filter(
      (u) =>
        u.id !== viewer.id &&
        !SIN_COMIDA.has(norm(u.email)) &&
        (todo || Boolean(jefes.get(u.id)?.has(viewer.id))),
    );
    const registros = visibles.length
      ? await this.prisma.lunchBreak.findMany({
          where: { date: dia, userId: { in: visibles.map((u) => u.id) }, ...companyWhere(tenantId) },
        })
      : [];
    const mapped = await this.mapRegistros(registros);
    const porUsuario = new Map(mapped.map((r) => [r.userId, r]));
    const peso = (r: (typeof mapped)[number] | null) =>
      !r ? 2 : r.revisionEstado === 'PENDIENTE' ? 0 : !r.checkoutTime ? 1 : 3;
    const filas = visibles
      .map((u) => {
        const registro = porUsuario.get(u.id) ?? null;
        return {
          userId: u.id,
          nombre: u.nombre,
          puesto: u.puesto,
          avatarUrl: u.avatarUrl,
          registro,
          // Solo se listan subordinados (o todos para Christian): puede revisar lo que fue a destiempo.
          puedoRevisar: Boolean(registro?.revisionEstado),
        };
      })
      .sort((a, b) => peso(a.registro) - peso(b.registro) || a.nombre.localeCompare(b.nombre));
    return {
      fecha: dia,
      alcance: todo ? 'todo' : filas.length ? 'equipo' : 'propio',
      filas,
      resumen: {
        total: filas.length,
        registraron: filas.filter((f) => f.registro).length,
        enComida: filas.filter((f) => f.registro && !f.registro.checkoutTime).length,
        aDestiempo: filas.filter((f) => f.registro?.revisionEstado).length,
        pendientes: filas.filter((f) => f.registro?.revisionEstado === 'PENDIENTE').length,
      },
    };
  }

  /** Superior (jefe por organigrama o Christian) aprueba o rechaza una comida a destiempo. */
  async revisar(viewer: LunchViewer, lunchId: number, dto: RevisarComidaDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.lunchBreak.findFirst({ where: { id: lunchId, ...companyWhere(tenantId) } });
    if (!row) throw new NotFoundException('Registro de comida no encontrado');
    if (!row.revisionEstado) {
      throw new BadRequestException('Esta comida fue a tiempo: no requiere aprobación');
    }
    if (row.userId === viewer.id) {
      throw new ForbiddenException('No puedes aprobar tu propia comida');
    }
    if (!this.esSupervisorGeneral(viewer) && !(await this.esJefeDe(viewer.id, row.userId))) {
      throw new ForbiddenException('Solo sus superiores pueden aprobar o rechazar esta comida');
    }
    const aprobada = dto.decision === 'aprobar';
    const notas = (dto.notas ?? '').trim();
    if (!aprobada && notas.length < JUSTIFICACION_MIN) {
      throw new BadRequestException('Escribe por qué rechazas la justificación');
    }
    const updated = await this.prisma.lunchBreak.update({
      where: { id: row.id },
      data: {
        revisionEstado: aprobada ? 'APROBADA' : 'RECHAZADA',
        revisionNotas: notas || null,
        revisadoPorId: viewer.id,
        revisadoAt: new Date(),
      },
    });
    void this.notificationHierarchy.notifyLunchReviewed?.({
      userId: row.userId,
      reviewerId: viewer.id,
      aprobada,
      notas: notas || null,
      lunchId: row.id,
    });
    const [mapped] = await this.mapRegistros([updated]);
    return mapped;
  }

  private debeRegistrar(viewer: LunchViewer) {
    return !viewer.isSuperAdmin && viewer.roleKey !== 'ceo' && !SIN_COMIDA.has(norm(viewer.email));
  }

  /** Christian y cuentas de plataforma supervisan a toda la empresa. */
  private esSupervisorGeneral(viewer: LunchViewer) {
    return (
      Boolean(viewer.isSuperAdmin) ||
      viewer.roleKey === 'ceo' ||
      SIN_COMIDA.has(norm(viewer.email)) ||
      (viewer.permissions ?? []).includes('console.admin')
    );
  }

  private cadenaJefes(users: Array<{ id: number; managerId: number | null }>) {
    const jefeDe = new Map(users.map((u) => [u.id, u.managerId]));
    const out = new Map<number, Set<number>>();
    for (const u of users) {
      const jefes = new Set<number>();
      let cur = u.managerId;
      while (cur != null && cur !== u.id && !jefes.has(cur)) {
        jefes.add(cur);
        cur = jefeDe.get(cur) ?? null;
      }
      out.set(u.id, jefes);
    }
    return out;
  }

  private async esJefeDe(jefeId: number, userId: number) {
    const vistos = new Set<number>([userId]);
    let cur = (await this.prisma.user.findUnique({ where: { id: userId }, select: { managerId: true } }))?.managerId;
    while (cur != null && !vistos.has(cur)) {
      if (cur === jefeId) return true;
      vistos.add(cur);
      cur = (await this.prisma.user.findUnique({ where: { id: cur }, select: { managerId: true } }))?.managerId;
    }
    return false;
  }

  /** Hora del registro: la del teléfono si no se aleja más de 10 min de la del servidor. */
  private horaRegistro(valor: string, now: Date): Date {
    const t = new Date(valor);
    if (Number.isNaN(t.getTime())) return now;
    return Math.abs(t.getTime() - now.getTime()) <= DESFASE_MAX_MS ? t : now;
  }

  private async mapRegistros(rows: LunchBreak[]) {
    const ids = [...new Set(rows.map((r) => r.revisadoPorId).filter((v): v is number => v != null))];
    const revisores = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
      : [];
    const nombre = new Map(revisores.map((u) => [u.id, u.nombre]));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      date: r.date,
      status: r.status,
      checkinTime: r.checkinTime,
      checkoutTime: r.checkoutTime,
      checkinPhotoUrl: r.checkinPhotoUrl,
      checkoutPhotoUrl: r.checkoutPhotoUrl,
      isCheckinLate: r.isCheckinLate,
      isCheckoutLate: r.isCheckoutLate,
      checkinJustificacion: r.checkinJustificacion,
      checkoutJustificacion: r.checkoutJustificacion,
      revisionEstado: r.revisionEstado,
      revisionNotas: r.revisionNotas,
      revisadoPor: r.revisadoPorId != null ? (nombre.get(r.revisadoPorId) ?? null) : null,
      revisadoAt: r.revisadoAt,
      minutos: r.checkoutTime ? this.getMinutesDiff(r.checkinTime, r.checkoutTime) : null,
    }));
  }

  async getUserLunchBreaks(
    usuarioId: number,
    startDate?: Date | string,
    endDate?: Date | string,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { userId: usuarioId, ...companyWhere(tenantId) };

    const start = this.rangeDayColumn(startDate);
    const end = this.rangeDayColumn(endDate);
    if (start && end) {
      where.date = { gte: start, lte: end };
    }

    return await this.prisma.lunchBreak.findMany({
      where,
      include: { user: { select: { id: true, nombre: true, email: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async getAllLunchBreaks(
    startDate?: Date | string,
    endDate?: Date | string,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };

    const start = this.rangeDayColumn(startDate);
    const end = this.rangeDayColumn(endDate);
    if (start && end) {
      where.date = { gte: start, lte: end };
    }

    return await this.prisma.lunchBreak.findMany({
      where,
      include: { user: { select: { id: true, nombre: true, email: true, department: true, role: true } } },
      orderBy: [{ date: 'desc' }, { checkinTime: 'desc' }],
    });
  }

  async getTodayLunchBreaks(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    // "Hoy" es hoy en México. Con `setHours(0,0,0,0)` sobre la hora del
    // contenedor —UTC— el panel de comidas se vaciaba a las 18:00 de México y
    // mostraba ya las del día siguiente.
    const today = this.dayColumn();

    return await this.prisma.lunchBreak.findMany({
      where: { date: today, ...companyWhere(tenantId) },
      include: { user: { select: { id: true, nombre: true, email: true, role: true } } },
      orderBy: { checkinTime: 'desc' },
    });
  }

  private getMinutesDiff(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60));
  }
}
