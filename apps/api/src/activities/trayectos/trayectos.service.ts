import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DomainEventBusService } from '../../domain-events/domain-event-bus.service.js';
import { DOMAIN_EVENTS, type SalidaDeJornada } from '../../domain-events/domain-event.types.js';
import { sitioOficina } from '../../attendance/asistencia-confiable.js';
import { calcularRuta } from '../../ai/estandar/rutas.js';
import { isClosedStatus } from '../activity-status.js';
import {
  esTipoTrayecto,
  modoDe,
  puntoDe,
  trayectoDto,
  validarInicio,
  type FinTrayecto,
  type TipoTrayecto,
  type TrayectoDto,
} from './trayectos.js';

export type TrayectoViewer = { id: number };
export type IniciarTrayectoBody = { tipo?: unknown; lat?: unknown; lng?: unknown; modo?: unknown };
export type TerminarTrayectoBody = { lat?: unknown; lng?: unknown };

/**
 * Trayecto de una actividad: ida y regreso medidos aparte del reloj, con lo que daba la ruta al
 * salir. Reglas en `trayectos.ts`. La ida se cierra sola al iniciar la actividad
 * (`cerrarAbiertos(..., 'INICIO')` desde `MyActivitiesService.iniciar`) y todo lo abierto, al
 * checar la salida (bus de dominio). Cada lectura y escritura filtra por empresa.
 */
@Injectable()
export class TrayectosService implements OnModuleInit {
  private readonly logger = new Logger(TrayectosService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly domainEvents?: DomainEventBusService,
  ) {}

  onModuleInit() {
    this.domainEvents?.subscribe<SalidaDeJornada>(DOMAIN_EVENTS.ATTENDANCE_CHECKOUT, async (salida) => {
      await this.cerrarAbiertos({ userId: salida.userId, companyId: salida.companyId, at: new Date(salida.at), motivo: 'SALIDA' });
    });
  }

  /** Los tramos de la actividad: los propios y, para quien la lleva (responsable o creador), los de todos. */
  async lista(viewer: TrayectoViewer, companyId: number | null, activityId: number): Promise<TrayectoDto[]> {
    const a = await this.actividad(companyId, activityId);
    const ve = this.participa(a, viewer.id) || a.responsableId === viewer.id || a.creadoPorId === viewer.id;
    if (!ve) throw new ForbiddenException('No participas en esta actividad');
    const todos = a.responsableId === viewer.id || a.creadoPorId === viewer.id;
    const filas = await this.prisma.activityTrayecto.findMany({
      where: { activityId, companyId: a.companyId, ...(todos ? {} : { userId: viewer.id }) },
      orderBy: { startedAt: 'asc' },
    });
    const ahora = new Date();
    return filas.map((f) => trayectoDto(f, ahora));
  }

  /** «Iniciar trayecto» (IDA) o «Regreso a la oficina» (REGRESO). */
  async iniciar(viewer: TrayectoViewer, companyId: number | null, activityId: number, body: IniciarTrayectoBody): Promise<TrayectoDto> {
    const tipo = body?.tipo;
    if (!esTipoTrayecto(tipo)) throw new BadRequestException('Indica si es la ida o el regreso.');
    const a = await this.actividad(companyId, activityId);
    if (!this.participa(a, viewer.id)) throw new ForbiddenException('Solo quien la hace registra su trayecto.');
    if (tipo === 'IDA' && isClosedStatus(a.estatus)) throw new BadRequestException('La actividad ya está cerrada.');

    const previos = await this.prisma.activityTrayecto.findMany({
      where: { activityId, userId: viewer.id, companyId: a.companyId },
      select: { tipo: true, endedAt: true },
    });
    const error = validarInicio(tipo, previos);
    if (error) throw new BadRequestException(error);

    const ahora = new Date();
    // Nadie va a dos lugares a la vez: lo que tuviera abierto (de esta u otra actividad) se cierra.
    await this.cerrarAbiertos({ userId: viewer.id, companyId: a.companyId, at: ahora, motivo: 'NUEVO' });

    const modo = modoDe(body?.modo, modoDe(a.trasladoModo));
    const estimado = await this.estimado(a.destino, tipo, modo, ahora);
    const punto = puntoDe(body?.lat, body?.lng);
    const fila = await this.prisma.activityTrayecto.create({
      data: {
        activityId,
        userId: viewer.id,
        companyId: a.companyId,
        tipo,
        modo,
        startedAt: ahora,
        startLat: punto?.lat ?? null,
        startLng: punto?.lng ?? null,
        estimadoMin: estimado?.minutos ?? null,
        estimadoFuente: estimado?.fuente ?? null,
      },
    });
    return trayectoDto(fila, ahora);
  }

  /** «Llegué»: cierra el tramo abierto de esta actividad. */
  async terminar(viewer: TrayectoViewer, companyId: number | null, activityId: number, body: TerminarTrayectoBody): Promise<TrayectoDto> {
    const a = await this.actividad(companyId, activityId);
    const abierto = await this.prisma.activityTrayecto.findFirst({
      where: { activityId, userId: viewer.id, companyId: a.companyId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!abierto) throw new BadRequestException('No tienes un trayecto en curso en esta actividad.');
    const ahora = new Date();
    const punto = puntoDe(body?.lat, body?.lng);
    const fila = await this.prisma.activityTrayecto.update({
      where: { id: abierto.id },
      data: { endedAt: ahora, finMotivo: 'LLEGADA', endLat: punto?.lat ?? null, endLng: punto?.lng ?? null },
    });
    return trayectoDto(fila, ahora);
  }

  /** Cierra lo abierto de una persona (toda, o solo una actividad o un tipo). Devuelve cuántos. */
  async cerrarAbiertos(p: {
    userId: number;
    /** null: sin empresa en el request (el middleware de aislamiento la pone igual). */
    companyId: number | null;
    at: Date;
    motivo: FinTrayecto;
    activityId?: number;
    tipo?: TipoTrayecto;
  }): Promise<number> {
    try {
      const r = await this.prisma.activityTrayecto.updateMany({
        where: {
          userId: p.userId,
          ...(p.companyId != null ? { companyId: p.companyId } : {}),
          endedAt: null,
          ...(p.activityId != null ? { activityId: p.activityId } : {}),
          ...(p.tipo ? { tipo: p.tipo } : {}),
        },
        data: { endedAt: p.at, finMotivo: p.motivo },
      });
      return r.count;
    } catch (error) {
      this.logger.warn(`Cerrar trayectos de ${p.userId}: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  private async actividad(companyId: number | null, activityId: number) {
    const a = await this.prisma.activity.findFirst({
      where: { id: activityId, deletedAt: null, ...(companyId != null ? { companyId } : {}) },
      select: {
        id: true,
        companyId: true,
        estatus: true,
        responsableId: true,
        creadoPorId: true,
        destino: true,
        trasladoModo: true,
        assignees: { where: { retiradoAt: null }, select: { userId: true } },
      },
    });
    if (!a) throw new NotFoundException('Actividad no encontrada');
    return a;
  }

  private participa(a: { responsableId: number; assignees: Array<{ userId: number }> }, userId: number): boolean {
    return a.responsableId === userId || a.assignees.some((m) => m.userId === userId);
  }

  /** Lo que da la ruta (ida desde la oficina, o vuelta a ella) al salir. null sin destino o si falla. */
  private async estimado(
    destino: unknown,
    tipo: TipoTrayecto,
    modo: 'AUTO' | 'TRANSPORTE',
    salida: Date,
  ): Promise<{ minutos: number; fuente: string } | null> {
    const d = destino && typeof destino === 'object' ? (destino as { lat?: unknown; lng?: unknown }) : null;
    const punto = d ? puntoDe(d.lat, d.lng) : null;
    if (!punto) return null;
    try {
      const oficina = sitioOficina();
      const ruta = await calcularRuta({ lat: oficina.latitude, lng: oficina.longitude }, punto, modo, {
        googleKey: process.env.GOOGLE_MAPS_API_KEY,
        osrmUrl: process.env.OSRM_URL,
        salida,
      });
      return { minutos: Math.round(tipo === 'IDA' ? ruta.idaMin : ruta.vueltaMin), fuente: ruta.fuente };
    } catch (error) {
      this.logger.warn(`Ruta del trayecto: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
