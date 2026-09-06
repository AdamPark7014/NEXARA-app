import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../../notifications/notification-hierarchy.service.js';
import { CreateLunchBreakDto, UpdateLunchBreakDto } from './dto/lunch-break.dto.js';
import { companyWhere, requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { parseWorkDate, workDateColumn, workDayAtClock } from '../../common/time/workday.js';

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

    const checkinTime = new Date(data.checkinTime);
    const lunchStartHour = workDayAtClock(now, 15, 0);
    const lunchEndHour = workDayAtClock(now, 16, 0);

    const isLate = checkinTime < lunchStartHour || checkinTime > lunchEndHour;
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

    const checkoutTime = new Date(data.checkoutTime);
    const lunchEndHour = workDayAtClock(now, 16, 5);

    const isLate = checkoutTime > lunchEndHour;
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

    return lunchBreak;
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
