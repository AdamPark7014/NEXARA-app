import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { WORKDAY_TIMEZONE, workDateKey, workDayStart } from '../common/time/workday.js';
import { STORE_REVIEWER_EMAIL, normalizePlatformEmail } from '../common/platform-accounts.js';
import { fechaNacimientoDeCurp } from '../rrhh/nomenclatura.js';
import {
  aniosDesde,
  avisoParaElEquipo,
  avisoParaQuienCelebra,
  diaDeClave,
  tocaHoy,
  type Dia,
  type TipoCelebracion,
} from './celebraciones.js';

type Persona = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  companyIds: number[];
  nacimiento: Date | null;
  ingreso: Date | null;
};

export type CelebracionDeHoy = {
  userId: number;
  nombre: string;
  avatarUrl: string | null;
  tipo: TipoCelebracion;
  /** Solo en aniversarios: años en la empresa. La edad nunca se expone. */
  anios: number | null;
  companyIds: number[];
};

const TIPO_AVISO: Record<TipoCelebracion, 'BIRTHDAY' | 'WORK_ANNIVERSARY'> = {
  cumpleanos: 'BIRTHDAY',
  aniversario: 'WORK_ANNIVERSARY',
};

/**
 * Cumpleaños y aniversarios de ingreso del equipo.
 *
 * A las 8:00 (hora de la empresa) felicita a quien celebra y avisa al resto de su empresa.
 * Se repite a las 11:00 y 14:00 solo para cubrir un reinicio del servidor a las 8: cada aviso
 * se manda una vez por día, así que las pasadas extra no duplican nada.
 */
@Injectable()
export class CelebrationsService {
  private readonly logger = new Logger(CelebrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 8,11,14 * * *', { name: 'celebraciones', timeZone: WORKDAY_TIMEZONE })
  async enviarDeHoy(): Promise<void> {
    await runScheduledJob('celebraciones', this.logger, () => this.enviar(new Date()));
  }

  /** Personas activas con sus fechas; el nacimiento sale del CURP si el perfil no lo trae. */
  private async personasActivas(): Promise<Persona[]> {
    const filas = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        nombre: true,
        email: true,
        avatarUrl: true,
        fechaIngreso: true,
        perfil: { select: { fechaNacimiento: true, curp: true } },
        companyMemberships: { select: { companyId: true, isDefault: true } },
      },
    });
    return filas
      .filter((u) => normalizePlatformEmail(u.email) !== STORE_REVIEWER_EMAIL)
      .map((u) => ({
        id: u.id,
        nombre: (u.nombre || '').trim(),
        email: u.email,
        avatarUrl: u.avatarUrl ?? null,
        companyIds: [...u.companyMemberships]
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
          .map((m) => m.companyId),
        nacimiento: u.perfil?.fechaNacimiento ?? fechaNacimientoDeCurp(u.perfil?.curp),
        ingreso: u.fechaIngreso ?? null,
      }));
  }

  private celebracionesEntre(personas: Persona[], hoy: Dia): CelebracionDeHoy[] {
    const lista: CelebracionDeHoy[] = [];
    for (const p of personas) {
      const base = { userId: p.id, nombre: p.nombre, avatarUrl: p.avatarUrl, companyIds: p.companyIds };
      if (tocaHoy(p.nacimiento, hoy)) lista.push({ ...base, tipo: 'cumpleanos', anios: null });
      // El día que entró no es aniversario: hace falta al menos un año.
      if (p.ingreso && tocaHoy(p.ingreso, hoy) && aniosDesde(p.ingreso, hoy) >= 1) {
        lista.push({ ...base, tipo: 'aniversario', anios: aniosDesde(p.ingreso, hoy) });
      }
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  /** Lo que se celebra hoy en la empresa de quien pregunta (para el aviso dentro de la app). */
  async deHoy(companyId: number | null | undefined, viewerId: number) {
    const ahora = new Date();
    const hoy = diaDeClave(workDateKey(ahora));
    const personas = await this.personasActivas();
    const celebraciones = this.celebracionesEntre(personas, hoy).filter(
      (c) => !companyId || c.companyIds.length === 0 || c.companyIds.includes(companyId),
    );
    return {
      fecha: workDateKey(ahora),
      celebraciones: celebraciones.map((c) => ({
        userId: c.userId,
        nombre: c.nombre,
        avatarUrl: c.avatarUrl,
        tipo: c.tipo,
        anios: c.anios,
        soyYo: c.userId === viewerId,
      })),
    };
  }

  /** Manda los avisos del día. Devuelve cuántos creó (útil para probar a mano). */
  async enviar(ahora: Date): Promise<number> {
    const hoy = diaDeClave(workDateKey(ahora));
    const desde = workDayStart(ahora);
    const personas = await this.personasActivas();
    const celebraciones = this.celebracionesEntre(personas, hoy);
    if (celebraciones.length === 0) return 0;

    let creados = 0;
    for (const c of celebraciones) {
      const type = TIPO_AVISO[c.tipo];
      const yaAvisados = new Set(
        (
          await this.prisma.notification.findMany({
            where: { type, entityType: 'User', relatedEntityId: c.userId, createdAt: { gte: desde } },
            select: { userId: true },
          })
        ).map((n) => n.userId),
      );
      const anios = c.anios ?? 0;

      if (!yaAvisados.has(c.userId)) {
        const aviso = avisoParaQuienCelebra(c.tipo, c.nombre, anios);
        const hecho = await this.notifications.createNotification({
          userId: c.userId,
          type,
          category: 'celebraciones',
          title: aviso.titulo,
          message: aviso.mensaje,
          icon: c.tipo,
          relatedEntityId: c.userId,
          entityType: 'User',
          relatedUrl: '/erp/chat',
          companyId: c.companyIds[0] ?? null,
          dedupeSeconds: 0,
        });
        if (hecho) creados += 1;
      }

      // Al resto de cada empresa a la que pertenece (sin empresas: a todo el equipo activo).
      const empresas = c.companyIds.length > 0 ? c.companyIds : [null];
      const avisadosAhora = new Set<number>();
      for (const companyId of empresas) {
        const equipo = personas.filter(
          (p) =>
            p.id !== c.userId &&
            !yaAvisados.has(p.id) &&
            !avisadosAhora.has(p.id) &&
            (companyId == null || p.companyIds.includes(companyId)),
        );
        const aviso = avisoParaElEquipo(c.tipo, c.nombre, anios);
        for (const p of equipo) {
          const hecho = await this.notifications.createNotification({
            userId: p.id,
            type,
            category: 'celebraciones',
            title: aviso.titulo,
            message: aviso.mensaje,
            icon: c.tipo,
            triggerUserId: c.userId,
            relatedEntityId: c.userId,
            entityType: 'User',
            relatedUrl: '/erp/chat',
            companyId,
            dedupeSeconds: 0,
          });
          avisadosAhora.add(p.id);
          if (hecho) creados += 1;
        }
      }
    }
    if (creados > 0) this.logger.log(`Celebraciones ${workDateKey(ahora)}: ${creados} avisos`);
    return creados;
  }
}
