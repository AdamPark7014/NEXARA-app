import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { workDayStart } from '../../common/time/workday.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { nombreCorto } from '../../notifications/notification-push-meta.js';
import { puedeAsignarA, type Alcanzador } from '../../me/equipo-alcance.js';
import {
  MOTIVO_PAUSA_MAX,
  MOTIVO_PAUSA_MIN,
  TOPE_SESION_MIN,
  estadoDeTrabajo,
  minutosDeSesiones,
  motivoDePausa,
  sesionVencida,
  topeDeSesion,
  type EstadoTrabajo,
  type MotivoFinSesion,
  type SesionTrabajo,
} from './sesiones-trabajo.js';

const logger = new Logger('ActivitySessions');

/** Lo mínimo de Prisma que usan las funciones sueltas (así las llama quien solo tiene `prisma`). */
type Db = { activityWorkSession?: any; [modelo: string]: any };

export type SesionFila = SesionTrabajo & { id: number; activityId: number; userId: number };

const cerradaPorEstatus = (estatus?: string | null) =>
  /finalizada|completada|cancelada|aprobada/i.test(estatus || '');

const claveSesion = (userId: number, activityId: number) => `${userId}:${activityId}`;

const tenant = (companyId?: number | null) => (companyId != null ? { companyId: Number(companyId) } : {});

/** ¿Este cliente Prisma conoce la tabla? (pruebas con mock y arranques sin migración). */
function hayTabla(db: Db): boolean {
  return typeof db?.activityWorkSession?.findMany === 'function';
}

/**
 * Cierre perezoso: las sesiones que siguen abiertas en la base pero ya no pueden contar
 * (pasaron sus 12 horas o terminó su día) se cierran con TOPE_12H / CORTE_DIA en cuanto
 * alguien las lee. No hace falta una tarea programada: las cuentas ya aplican el tope
 * aunque la fila siga abierta; esto solo deja el dato escrito.
 *
 * Nunca lanza: una lectura no se cae por no poder escribir el cierre.
 */
export async function cerrarSesionesVencidas(
  db: Db,
  filtro: { userIds?: number[]; activityId?: number; companyId?: number | null },
  ahora: Date = new Date(),
): Promise<number> {
  if (!hayTabla(db)) return 0;
  if (filtro.userIds && filtro.userIds.length === 0) return 0;
  try {
    // Vencida = empezó hace 12 h o más, o empezó un día anterior (hora de México).
    const limite = new Date(
      Math.max(workDayStart(ahora).getTime(), ahora.getTime() - TOPE_SESION_MIN * 60_000),
    );
    const abiertas: Array<{ id: number; startedAt: Date; endedAt: Date | null }> =
      await db.activityWorkSession.findMany({
        where: {
          endedAt: null,
          startedAt: { lte: limite },
          ...(filtro.userIds ? { userId: { in: filtro.userIds } } : {}),
          ...(filtro.activityId != null ? { activityId: filtro.activityId } : {}),
          ...tenant(filtro.companyId),
        },
        select: { id: true, startedAt: true, endedAt: true },
        take: 500,
      });
    let cerradas = 0;
    for (const s of abiertas ?? []) {
      const corte = sesionVencida(s, ahora);
      if (!corte) continue;
      // `endedAt: null` en el where: si alguien la cerró entre la lectura y aquí, gana su cierre.
      const r = await db.activityWorkSession.updateMany({
        where: { id: s.id, endedAt: null, ...tenant(filtro.companyId) },
        data: { endedAt: corte.at, endReason: corte.motivo },
      });
      cerradas += r?.count ?? 0;
    }
    return cerradas;
  } catch (error) {
    logger.warn(`cerrarSesionesVencidas: ${String(error)}`);
    return 0;
  }
}

/**
 * Sesiones de estas personas, agrupadas por `userId:activityId`.
 *
 * El mapa vuelve vacío si la tabla no existe todavía o la lectura falla, y eso significa
 * exactamente «se mide como antes»: un fallo aquí no le cambia el tiempo a nadie.
 */
export async function leerSesiones(
  db: Db,
  filtro: {
    userIds: number[];
    activityIds?: number[];
    companyId?: number | null;
    /** Solo las que tocan esta ventana (para rangos de KPI). */
    desde?: Date;
    hasta?: Date;
  },
): Promise<Map<string, SesionFila[]>> {
  const out = new Map<string, SesionFila[]>();
  if (!hayTabla(db) || !filtro.userIds.length) return out;
  if (filtro.activityIds && filtro.activityIds.length === 0) return out;
  try {
    const filas: SesionFila[] = await db.activityWorkSession.findMany({
      where: {
        userId: { in: filtro.userIds },
        ...(filtro.activityIds ? { activityId: { in: filtro.activityIds } } : {}),
        ...tenant(filtro.companyId),
        ...(filtro.hasta ? { startedAt: { lte: filtro.hasta } } : {}),
        ...(filtro.desde ? { OR: [{ endedAt: null }, { endedAt: { gte: filtro.desde } }] } : {}),
      },
      select: {
        id: true,
        activityId: true,
        userId: true,
        startedAt: true,
        endedAt: true,
        endReason: true,
        endedById: true,
        nota: true,
        endedBy: { select: { id: true, nombre: true } },
      },
      orderBy: { startedAt: 'asc' },
    });
    for (const f of filas ?? []) {
      const k = claveSesion(f.userId, f.activityId);
      const lista = out.get(k) ?? [];
      lista.push(f);
      out.set(k, lista);
    }
  } catch (error) {
    logger.warn(`leerSesiones: ${String(error)}`);
  }
  return out;
}

/** Llave del mapa de `leerSesiones`. */
export function sesionesDe(
  mapa: Map<string, SesionFila[]>,
  userId: number,
  activityId: number,
): SesionFila[] {
  return mapa.get(claveSesion(userId, activityId)) ?? [];
}

/**
 * Cierra todo lo que la persona tenga corriendo. Es lo que pasa al checar su salida:
 * «una actividad no debe continuar después de que marcan salida».
 *
 * Cerrar el reloj no es terminar la actividad: sigue «En Proceso» y mañana se reanuda.
 * Nunca lanza: la checada ya quedó guardada y no se cae por esto.
 */
export async function cerrarSesionesDeUsuario(
  db: Db,
  p: { userId: number; at?: Date; motivo?: MotivoFinSesion; companyId?: number | null },
): Promise<number> {
  if (!hayTabla(db)) return 0;
  const at = p.at ?? new Date();
  const motivo = p.motivo ?? 'SALIDA';
  try {
    const abiertas: Array<{ id: number; startedAt: Date; endedAt: Date | null }> =
      await db.activityWorkSession.findMany({
        where: { userId: p.userId, endedAt: null, ...tenant(p.companyId) },
        select: { id: true, startedAt: true, endedAt: true },
      });
    let cerradas = 0;
    for (const s of abiertas ?? []) {
      // Si ya había pasado su tope, se cierra en el tope y con su motivo, no a la hora de salida.
      const corte = sesionVencida(s, at);
      const r = await db.activityWorkSession.updateMany({
        where: { id: s.id, endedAt: null, ...tenant(p.companyId) },
        data: corte
          ? { endedAt: corte.at, endReason: corte.motivo }
          : { endedAt: new Date(Math.max(at.getTime(), s.startedAt.getTime())), endReason: motivo },
      });
      cerradas += r?.count ?? 0;
    }
    return cerradas;
  } catch (error) {
    logger.warn(`cerrarSesionesDeUsuario ${p.userId}: ${String(error)}`);
    return 0;
  }
}

export type EstadoSesionDto = EstadoTrabajo & { ok: true; minutosReales: number | null };

type Actor = Alcanzador;

/**
 * Sesiones de trabajo de una actividad: abrir, cerrar, pausar y reanudar.
 *
 * El inicio y el fin de siempre (`inicioRealAt` / `finRealAt`) se siguen guardando: son la
 * primera vez que arrancó y cuándo entregó. Lo que cambia es de dónde sale el tiempo.
 */
@Injectable()
export class ActivitySessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private get db(): Db {
    return this.prisma as unknown as Db;
  }

  /** Fila de equipo de la persona (o la actividad, si es el responsable sin fila). */
  private async contexto(activityId: number, userId: number, companyId?: number | null) {
    const fila = await this.prisma.activityAssignee.findFirst({
      where: { activityId, userId, ...tenant(companyId) },
      select: {
        id: true,
        companyId: true,
        rol: true,
        retiradoAt: true,
        inicioRealAt: true,
        finRealAt: true,
        activity: {
          select: { titulo: true, estatus: true, assignmentCharge: true, deletedAt: true },
        },
      },
    });
    if (fila) {
      return {
        companyId: fila.companyId,
        inicioRealAt: fila.inicioRealAt,
        finRealAt: fila.finRealAt,
        retirado: fila.retiradoAt != null,
        reparte: fila.activity?.assignmentCharge === 'despacho' && String(fila.rol) === 'LEAD',
        titulo: fila.activity?.titulo ?? '',
        cerrada: cerradaPorEstatus(fila.activity?.estatus) || fila.activity?.deletedAt != null,
        conFila: true,
      };
    }
    // Responsable sin fila de equipo (alta de un contrato o un import): trabaja igual.
    const act = await this.prisma.activity.findFirst({
      where: { id: activityId, responsableId: userId, deletedAt: null, ...tenant(companyId) },
      select: { companyId: true, titulo: true, estatus: true, assignmentCharge: true },
    });
    if (!act) return null;
    return {
      companyId: act.companyId,
      inicioRealAt: null as Date | null,
      finRealAt: null as Date | null,
      retirado: false,
      reparte: act.assignmentCharge === 'despacho',
      titulo: act.titulo ?? '',
      cerrada: cerradaPorEstatus(act.estatus),
      conFila: false,
    };
  }

  private sesionesDePar(activityId: number, userId: number, companyId: number): Promise<SesionFila[]> {
    // findMany con companyWhere: el aislamiento de tenant mete companyId en cada consulta.
    return this.db.activityWorkSession.findMany({
      where: { activityId, userId, ...companyWhere(companyId) },
      select: {
        id: true,
        activityId: true,
        userId: true,
        startedAt: true,
        endedAt: true,
        endReason: true,
        endedById: true,
        nota: true,
        endedBy: { select: { id: true, nombre: true } },
      },
      orderBy: { startedAt: 'asc' },
    });
  }

  /**
   * Una actividad iniciada antes de esta regla no tiene sesiones: su tiempo era un solo
   * intervalo. La primera vez que se toca se escribe ese intervalo como sesión —con su
   * tope— para que no se pierda. Devuelve true si dejó una sesión corriendo.
   */
  private async sembrarLegado(
    activityId: number,
    userId: number,
    companyId: number,
    inicioRealAt: Date | null,
    ahora: Date,
  ): Promise<boolean> {
    if (!inicioRealAt || inicioRealAt.getTime() >= ahora.getTime() - 1_000) return false;
    const tope = topeDeSesion(inicioRealAt);
    const sigue = tope.at.getTime() > ahora.getTime();
    await this.db.activityWorkSession.create({
      data: {
        activityId,
        userId,
        companyId,
        startedAt: inicioRealAt,
        ...(sigue ? {} : { endedAt: tope.at, endReason: tope.motivo }),
      },
    });
    return sigue;
  }

  /**
   * Abre la sesión de trabajo. Idempotente: si ya hay una corriendo, no hace nada.
   *
   * No abre para quien solo reparte un despacho, ni si ya entregó su parte o la
   * actividad está cerrada. Nunca lanza: el inicio (o la foto) ya quedó guardado.
   */
  async abrir(p: {
    activityId: number;
    userId: number;
    at?: Date;
    companyId?: number | null;
  }): Promise<{ abierta: boolean }> {
    if (!hayTabla(this.db)) return { abierta: false };
    const at = p.at ?? new Date();
    try {
      const ctx = await this.contexto(p.activityId, p.userId, p.companyId);
      if (!ctx || ctx.cerrada || ctx.retirado || ctx.reparte || ctx.finRealAt) return { abierta: false };

      await cerrarSesionesVencidas(this.db, { userIds: [p.userId], activityId: p.activityId, companyId: ctx.companyId }, at);
      const sesiones = await this.sesionesDePar(p.activityId, p.userId, ctx.companyId);
      if (sesiones.some((s) => !s.endedAt)) return { abierta: true };
      if (!sesiones.length && (await this.sembrarLegado(p.activityId, p.userId, ctx.companyId, ctx.inicioRealAt, at))) {
        return { abierta: true };
      }
      await this.db.activityWorkSession.create({
        data: { activityId: p.activityId, userId: p.userId, companyId: ctx.companyId, startedAt: at },
      });
      return { abierta: true };
    } catch (error) {
      logger.warn(`abrir ${p.activityId}/${p.userId}: ${String(error)}`);
      return { abierta: false };
    }
  }

  /**
   * Las apps publicadas no tienen botón «Reanudar»: si la persona hace algo en su
   * evidencia de una actividad ya iniciada y sin terminar, y su reloj está detenido,
   * se reanuda solo.
   *
   * No reanuda después de su salida del día: lo que suba ya checado de salida se guarda,
   * pero no vuelve a correr el reloj («no debe continuar después de que marcan salida»).
   */
  async asegurarAbierta(p: {
    activityId: number;
    userId: number;
    at?: Date;
    companyId?: number | null;
  }): Promise<{ abierta: boolean }> {
    if (!hayTabla(this.db)) return { abierta: false };
    const at = p.at ?? new Date();
    try {
      const ctx = await this.contexto(p.activityId, p.userId, p.companyId);
      if (!ctx || ctx.cerrada || ctx.retirado || ctx.reparte || ctx.finRealAt) return { abierta: false };
      // Sin inicio real ni sesiones todavía no hay nada que reanudar: la foto de entrada lo abre.
      if (!ctx.inicioRealAt) {
        const previas = await this.db.activityWorkSession.count({
          where: { activityId: p.activityId, userId: p.userId, ...companyWhere(ctx.companyId) },
        });
        if (!previas) return { abierta: false };
      }
      if (await this.yaChecoSalida(p.userId, ctx.companyId, at)) return { abierta: false };
    } catch (error) {
      logger.warn(`asegurarAbierta ${p.activityId}/${p.userId}: ${String(error)}`);
      return { abierta: false };
    }
    return this.abrir({ ...p, at });
  }

  /** ¿Su última checada de hoy fue una salida? */
  private async yaChecoSalida(userId: number, companyId: number, ahora: Date): Promise<boolean> {
    const ultima = await this.prisma.attendance.findFirst({
      where: { userId, timestamp: { gte: workDayStart(ahora), lte: ahora }, ...companyWhere(companyId) },
      orderBy: { timestamp: 'desc' },
      select: { type: true },
    });
    return ultima?.type === 'salida';
  }

  /** Cierra lo que tenga corriendo esa persona en esa actividad. Devuelve cuántas cerró. */
  async cerrar(p: {
    activityId: number;
    userId: number;
    motivo: MotivoFinSesion;
    at?: Date;
    endedById?: number | null;
    nota?: string | null;
    companyId?: number | null;
  }): Promise<number> {
    if (!hayTabla(this.db)) return 0;
    const at = p.at ?? new Date();
    const abiertas: Array<{ id: number; startedAt: Date; endedAt: Date | null }> =
      await this.db.activityWorkSession.findMany({
        where: { activityId: p.activityId, userId: p.userId, endedAt: null, ...tenant(p.companyId) },
        select: { id: true, startedAt: true, endedAt: true },
      });
    let cerradas = 0;
    for (const s of abiertas ?? []) {
      const corte = sesionVencida(s, at);
      const r = await this.db.activityWorkSession.updateMany({
        where: { id: s.id, endedAt: null, ...tenant(p.companyId) },
        data: corte
          ? { endedAt: corte.at, endReason: corte.motivo }
          : {
              endedAt: new Date(Math.max(at.getTime(), s.startedAt.getTime())),
              endReason: p.motivo,
              endedById: p.endedById ?? null,
              nota: p.nota ? p.nota.slice(0, MOTIVO_PAUSA_MAX) : null,
            },
      });
      // Solo cuenta como cerrada «por este motivo» la que no estaba ya vencida.
      if (!corte) cerradas += r?.count ?? 0;
    }
    return cerradas;
  }

  /**
   * Fin de su parte (foto de salida): cierra la sesión con FIN y deja las horas reales
   * como la suma de sus sesiones, no como «fin menos inicio». Nunca lanza.
   */
  async terminar(p: { activityId: number; userId: number; at?: Date; companyId?: number | null }): Promise<void> {
    if (!hayTabla(this.db)) return;
    const at = p.at ?? new Date();
    try {
      await this.cerrar({ ...p, at, motivo: 'FIN' });
      const sesiones: SesionFila[] = await this.db.activityWorkSession.findMany({
        where: { activityId: p.activityId, userId: p.userId, ...tenant(p.companyId) },
        select: { id: true, activityId: true, userId: true, startedAt: true, endedAt: true },
      });
      if (!sesiones?.length) return;
      const minutos = minutosDeSesiones(sesiones, at);
      await this.prisma.activityAssignee.updateMany({
        where: { activityId: p.activityId, userId: p.userId, ...tenant(p.companyId) },
        data: { horasReales: Math.round((minutos / 60) * 100) / 100 },
      });
    } catch (error) {
      logger.warn(`terminar ${p.activityId}/${p.userId}: ${String(error)}`);
    }
  }

  /** Checada de salida: cierra todo lo que tenga corriendo. */
  cerrarTodasDeUsuario(userId: number, at: Date = new Date(), companyId?: number | null): Promise<number> {
    return cerrarSesionesDeUsuario(this.db, { userId, at, motivo: 'SALIDA', companyId });
  }

  /** Cierre perezoso (ver `cerrarSesionesVencidas`). */
  cerrarVencidas(
    filtro: { userIds?: number[]; activityId?: number; companyId?: number | null },
    ahora: Date = new Date(),
  ): Promise<number> {
    return cerrarSesionesVencidas(this.db, filtro, ahora);
  }

  /** Cómo quedó: corre, en pausa (quién y por qué) y cuántos minutos lleva. */
  async estado(activityId: number, userId: number, companyId?: number | null, ahora: Date = new Date()): Promise<EstadoSesionDto> {
    const ctx = await this.contexto(activityId, userId, companyId);
    const sesiones = ctx ? await this.sesionesDePar(activityId, userId, ctx.companyId) : [];
    const fuente = {
      inicio: ctx?.inicioRealAt ?? null,
      fin: ctx?.finRealAt ?? null,
      sesiones,
      ahora,
    };
    return {
      ok: true,
      ...estadoDeTrabajo({ ...fuente, terminada: ctx?.cerrada }),
      minutosReales: sesiones.length ? minutosDeSesiones(sesiones, ahora) : null,
    };
  }

  /**
   * Pausar: la propia persona, o un jefe sobre la actividad de su gente para que atienda
   * otra que salió urgente. El jefe siempre deja motivo; queda quién pausó y por qué.
   *
   * El alcance es el mismo que para asignarle trabajo (`puedeAsignarA`): su organigrama
   * hacia abajo, el flujo de despacho, y dirección con cualquiera.
   */
  async pausar(p: {
    actor: Actor;
    userId: number;
    activityId: number;
    motivo?: string | null;
    companyId?: number | null;
  }): Promise<EstadoSesionDto> {
    const tenantId = requireCompanyId(p.companyId);
    const propia = Number(p.actor.id) === Number(p.userId);
    const motivo = motivoDePausa(p.motivo);
    if (!propia) {
      if (!motivo) {
        throw new BadRequestException(
          `Escribe por qué la pausas (mínimo ${MOTIVO_PAUSA_MIN} caracteres)`,
        );
      }
      await this.assertPuedePausarA(p.actor, p.userId);
    }

    const ctx = await this.contexto(p.activityId, p.userId, tenantId);
    if (!ctx || ctx.retirado) {
      throw new NotFoundException(
        propia ? 'Esta actividad no está asignada a ti' : 'Esa persona no tiene asignada esta actividad',
      );
    }
    if (ctx.cerrada) throw new BadRequestException('La actividad ya está cerrada');
    if (ctx.finRealAt) throw new BadRequestException('Ya entregó su parte: no hay nada que pausar');

    const ahora = new Date();
    await cerrarSesionesVencidas(this.db, { userIds: [p.userId], activityId: p.activityId, companyId: tenantId }, ahora);
    let sesiones = await this.sesionesDePar(p.activityId, p.userId, tenantId);
    if (!sesiones.length) {
      if (!ctx.inicioRealAt) throw new BadRequestException('Todavía no la inicia: no hay nada que pausar');
      await this.sembrarLegado(p.activityId, p.userId, tenantId, ctx.inicioRealAt, ahora);
      sesiones = await this.sesionesDePar(p.activityId, p.userId, tenantId);
    }
    if (!sesiones.some((s) => !s.endedAt)) {
      throw new BadRequestException('Su reloj ya está detenido: no hay nada que pausar');
    }

    // El motivo corto de la propia persona también se guarda (aunque no llegue al mínimo del jefe).
    const nota =
      motivo ?? (typeof p.motivo === 'string' && p.motivo.trim() ? p.motivo.trim().slice(0, MOTIVO_PAUSA_MAX) : null);
    await this.cerrar({
      activityId: p.activityId,
      userId: p.userId,
      motivo: 'PAUSA',
      at: ahora,
      endedById: p.actor.id,
      nota,
      companyId: tenantId,
    });

    if (!propia) void this.avisarPausa(p.activityId, p.userId, p.actor.id, ctx.titulo, nota, tenantId);
    return this.estado(p.activityId, p.userId, tenantId);
  }

  /** Reanudar: solo la propia persona vuelve a poner su reloj a correr. */
  async reanudar(p: { userId: number; activityId: number; companyId?: number | null }): Promise<EstadoSesionDto> {
    const tenantId = requireCompanyId(p.companyId);
    const ctx = await this.contexto(p.activityId, p.userId, tenantId);
    if (!ctx || ctx.retirado) throw new NotFoundException('Esta actividad no está asignada a ti');
    if (ctx.cerrada) throw new BadRequestException('La actividad ya está cerrada');
    if (ctx.finRealAt) throw new BadRequestException('Ya entregaste tu parte de esta actividad');
    if (ctx.reparte) throw new BadRequestException('En despacho solo repartes la actividad');
    const yaTuvo = (await this.sesionesDePar(p.activityId, p.userId, tenantId)).length > 0;
    if (!ctx.inicioRealAt && !yaTuvo) {
      throw new BadRequestException('Primero inicia la actividad');
    }
    const r = await this.abrir({ activityId: p.activityId, userId: p.userId, companyId: tenantId });
    if (!r.abierta) throw new BadRequestException('No se pudo reanudar la actividad. Intenta de nuevo.');
    return this.estado(p.activityId, p.userId, tenantId);
  }

  private async assertPuedePausarA(actor: Actor, userId: number): Promise<void> {
    // Mismo padrón que `assertPuedeAsignar`: personas activas con correo y jefe.
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, managerId: true },
    });
    if (!puedeAsignarA(actor, users, userId)) {
      throw new ForbiddenException('Solo puedes pausar actividades de la gente de tu equipo');
    }
  }

  /** Aviso a quien le pausaron la actividad. Un fallo del aviso nunca rompe la pausa. */
  private async avisarPausa(
    activityId: number,
    userId: number,
    actorId: number,
    titulo: string,
    motivo: string | null,
    companyId: number,
  ): Promise<void> {
    if (!this.notifications) return;
    try {
      const actor = await this.prisma.user.findFirst({ where: { id: actorId }, select: { nombre: true } });
      const quien = nombreCorto(actor?.nombre) || 'Tu jefe';
      await this.notifications.createNotification({
        userId,
        // Sin tipo propio en el enum: es un cambio de agenda que decide un superior.
        type: 'ACTIVITY_RESCHEDULED',
        category: 'activities',
        title: `${titulo.trim() ? `«${titulo.trim()}»` : 'Tu actividad'} en pausa`,
        message: [`${quien} la pausó`, motivo ? `Motivo: ${motivo}` : null].filter(Boolean).join(' · '),
        triggerUserId: actorId,
        relatedEntityId: activityId,
        entityType: 'Activity',
        relatedUrl: '/erp/mis-actividades',
        priority: 'high',
        companyId,
        dedupeSeconds: 0,
      });
    } catch (error) {
      logger.warn(`avisarPausa ${activityId}/${userId}: ${String(error)}`);
    }
  }
}
