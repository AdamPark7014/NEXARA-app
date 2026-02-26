import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateLunchBreakDto, UpdateLunchBreakDto } from './dto/lunch-break.dto.js';

@Injectable()
export class LunchBreaksService {
  constructor(private prisma: PrismaService) {}

  async createCheckin(usuarioId: number, data: CreateLunchBreakDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Verificar si ya existe un registro de comida hoy
    const existingLunch = await this.prisma['lunchBreak'].findUnique({
      where: {
        usuarioId_date: { usuarioId, date: today },
      },
    });

    if (existingLunch && existingLunch.checkoutTime) {
      throw new BadRequestException('Ya completaste tu hora de comida hoy');
    }

    const checkinTime = new Date(data.checkinTime);
    const lunchStartHour = new Date();
    lunchStartHour.setHours(15, 0, 0, 0); // 3 PM
    const lunchEndHour = new Date();
    lunchEndHour.setHours(16, 0, 0, 0); // 4 PM

    const isLate = checkinTime < lunchStartHour || checkinTime > lunchEndHour;
    let notes = '';
    if (checkinTime < lunchStartHour) {
      notes = `Entraste a comida ${this.getMinutesDiff(checkinTime, lunchStartHour)} minutos antes`;
    } else if (checkinTime > lunchEndHour) {
      notes = `Entraste a comida ${this.getMinutesDiff(lunchStartHour, checkinTime)} minutos después del horario permitido (3 PM)`;
    }

    if (existingLunch) {
      // Actualizar registro existente
      return await this.prisma['lunchBreak'].update({
        where: { id: existingLunch.id },
        data: {
          checkinTime,
          checkinPhotoUrl: data.checkinPhotoUrl,
          isCheckinLate: isLate,
          notes,
          status: 'IN_PROGRESS',
          updatedAt: new Date(),
        },
        include: { user: { select: { nombre: true, email: true } } },
      });
    }

    // Crear nuevo registro
    return await this.prisma['lunchBreak'].create({
      data: {
        usuarioId,
        date: today,
        checkinTime,
        checkinPhotoUrl: data.checkinPhotoUrl,
        isCheckinLate: isLate,
        notes,
        status: 'IN_PROGRESS',
      },
      include: { user: { select: { nombre: true, email: true } } },
    });
  }

  async createCheckout(usuarioId: number, data: UpdateLunchBreakDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lunch = await this.prisma['lunchBreak'].findUnique({
      where: {
        usuarioId_date: { usuarioId, date: today },
      },
    });

    if (!lunch) {
      throw new BadRequestException('No existe un registro de comida para hoy');
    }

    if (lunch.checkoutTime) {
      throw new BadRequestException('Ya registraste tu salida de comida');
    }

    const checkoutTime = new Date(data.checkoutTime);
    const lunchEndHour = new Date();
    lunchEndHour.setHours(16, 5, 0, 0); // 4:05 PM (duración esperada ~1 hora 5 minutos)

    const isLate = checkoutTime > lunchEndHour;
    let notes = lunch.notes;

    if (isLate) {
      notes += `\nVolviste del almuerzo ${this.getMinutesDiff(lunchEndHour, checkoutTime)} minutos después de lo esperado`;
    } else {
      notes += `\nVolviste del almuerzo a horario`;
    }

    return await this.prisma['lunchBreak'].update({
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
  }

  async getUserLunchBreaks(usuarioId: number, startDate?: Date, endDate?: Date) {
    const where: any = { usuarioId };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    return await this.prisma['lunchBreak'].findMany({
      where,
      include: { user: { select: { id: true, nombre: true, email: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async getAllLunchBreaks(startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    return await this.prisma['lunchBreak'].findMany({
      where,
      include: { user: { select: { id: true, nombre: true, email: true, department: true, role: true } } },
      orderBy: [{ date: 'desc' }, { checkinTime: 'desc' }],
    });
  }

  async getTodayLunchBreaks() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await this.prisma['lunchBreak'].findMany({
      where: { date: today },
      include: { user: { select: { id: true, nombre: true, email: true, role: true } } },
      orderBy: { checkinTime: 'desc' },
    });
  }

  private getMinutesDiff(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60));
  }
}
