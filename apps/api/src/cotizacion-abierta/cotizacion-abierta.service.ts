import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service.js';
import { mensajeAsignacionDenegada, puedeDejarActividadA, type ActorAsignacion } from '../activities/asignacion-departamento.js';
import { puedeGestionarActividades } from '../activities/puede-gestionar.js';
import type { CreateActivityDto } from '../activities/dto/create-activity.dto.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service.js';
import { esFinal, estaBloqueada } from '../cotizaciones/estado-cotizacion.js';
import { esDeTodaLaEmpresa } from '../me/equipo-alcance.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { CotizacionCambio, estadoDelAcceso, mezclarPartidas, PartidaInvalida, partidaVisible, type PartidaEnviada } from './cotizacion-abierta.js';

export type ActorAbierta = ActorAsignacion & { nombre?: string | null; permissions?: string[] | null };

/** Abrir una sola cotización, mientras dure una actividad. Las reglas puras están en `cotizacion-abierta.ts`. */
@Injectable()
export class CotizacionAbiertaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cotizaciones: CotizacionesService,
    private readonly activities: ActivitiesService,
    private readonly users: UsersService,
  ) {}

  /** Le crea la actividad a la persona y le abre la cotización. Es la misma regla de asignarle trabajo. */
  async pedirApoyo(cotizacionId: number, dto: { userId?: number; nota?: string | null }, actor: ActorAbierta, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    if (!puedeGestionarActividades(actor as never)) throw new ForbiddenException('No puedes asignar actividades');
    const destinoId = Number(dto.userId);
    if (!Number.isInteger(destinoId) || destinoId <= 0) throw new BadRequestException('Elige a quién pedirle apoyo');
    if (destinoId === actor.id) throw new BadRequestException('Elige a otra persona');
    const cotizacion = await this.prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId, deletedAt: null },
      select: { id: true, quoteNumber: true, projectName: true, status: true },
    });
    if (!cotizacion) throw new NotFoundException('Esa cotización no existe');
    if (esFinal(cotizacion.status) || estaBloqueada(cotizacion.status)) {
      throw new BadRequestException('Ya salió al cliente: regrésala a borrador antes de pedir apoyo');
    }
    const persona = await this.users.findOne(destinoId, companyId);
    if (!persona || !persona.isActive) throw new BadRequestException('Esa persona ya no está activa');
    const roster = await this.users.listAssignmentRoster(companyId);
    const destino = {
      id: persona.id,
      email: persona.email ?? '',
      managerId: persona.managerId ?? null,
      departmentId: persona.departmentId ?? null,
      roleKey: persona.roleKey ?? null,
    };
    if (!puedeDejarActividadA(actor, destino, roster as never)) throw new ForbiddenException(mensajeAsignacionDenegada(actor));

    const nota = String(dto.nota ?? '').trim().slice(0, 1000);
    const creada = await this.activities.create(
      {
        titulo: `Apoyar en cotización ${cotizacion.quoteNumber}`,
        indicaciones: nota || undefined,
        prioridad: 'MEDIA',
        estatus: 'Pendiente',
        activityType: 'INTERNAL',
        ticketType: 'OTRO',
        ticketTypeCustom: 'Otra tarea',
        workType: 'ISSUE',
        coreKind: 'tarea',
        assignmentCharge: 'ejecucion',
        creadoPorId: actor.id,
        responsableId: destinoId,
        fechaInicio: new Date().toISOString(),
      } as unknown as CreateActivityDto,
      companyId,
    );
    await this.prisma.cotizacionAcceso.create({
      data: { companyId, cotizacionId, activityId: creada.id, userId: destinoId, otorgadoPorId: actor.id },
    });
    return { activityId: creada.id };
  }

  private async acceso(activityId: number, companyId: number) {
    const fila = await this.prisma.cotizacionAcceso.findFirst({ where: { activityId, companyId } });
    if (!fila) return null;
    const actividad = await this.prisma.activity.findFirst({
      where: { id: activityId, companyId },
      select: { estatus: true, deletedAt: true },
    });
    if (!actividad) return null;
    return { fila, actividad, estado: estadoDelAcceso({ revocadoAt: fila.revocadoAt, actividad }) };
  }

  /** `null` si la actividad no tiene cotización abierta, o si a quien pregunta no le toca saberlo. */
  async leer(activityId: number, viewer: ActorAbierta, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const a = await this.acceso(activityId, companyId);
    if (!a) return null;
    const esElla = a.fila.userId === viewer.id;
    const loAbrio = a.fila.otorgadoPorId === viewer.id;
    if (!esElla && !loAbrio && !esDeTodaLaEmpresa(viewer)) return null;
    const c = await this.prisma.cotizacion.findFirst({
      where: { id: a.fila.cotizacionId, companyId },
      select: { id: true, quoteNumber: true, projectName: true, clientName: true, status: true, updatedAt: true },
    });
    if (!c) return null;
    const nombres = await this.prisma.user.findMany({ where: { id: { in: [a.fila.userId, a.fila.otorgadoPorId] } }, select: { id: true, nombre: true } });
    const nombre = (id: number) => nombres.find((u) => u.id === id)?.nombre ?? '';
    const puedeEditar = esElla && a.estado === 'abierto' && !esFinal(c.status) && !estaBloqueada(c.status);
    const base = {
      estado: a.estado,
      cotizacionId: c.id,
      folio: c.quoteNumber,
      titulo: c.projectName,
      cliente: c.clientName,
      para: nombre(a.fila.userId),
      otorgadoPor: nombre(a.fila.otorgadoPorId),
      otorgadoAt: a.fila.createdAt,
      cambios: a.fila.cambios,
      ultimoCambioAt: a.fila.ultimoCambioAt,
      revocadoAt: a.fila.revocadoAt,
      soyQuienLaTrabaja: esElla,
      puedeCerrar: a.estado === 'abierto' && (loAbrio || esDeTodaLaEmpresa(viewer)),
      puedeEditar,
    };
    if (!puedeEditar) return { ...base, version: null, partidas: null };
    const partidas = await this.prisma.cotizacionItem.findMany({
      where: { cotizacionId: c.id },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, unit: true, qty: true, unitPrice: true },
    });
    return { ...base, version: c.updatedAt.toISOString(), partidas: partidas.map(partidaVisible) };
  }

  /** Solo quien la trabaja, con su actividad abierta. `version` evita pisar lo que otra persona guardó. */
  async guardar(activityId: number, dto: { version?: string; partidas?: PartidaEnviada[] }, viewer: ActorAbierta, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const a = await this.acceso(activityId, companyId);
    if (!a || a.fila.userId !== viewer.id) throw new ForbiddenException('Esta cotización no está abierta para ti');
    if (a.estado !== 'abierto') throw new ForbiddenException('Tu actividad ya terminó: el acceso a la cotización se cerró');
    if (!Array.isArray(dto.partidas)) throw new BadRequestException('Faltan las partidas');
    const existente = await this.prisma.cotizacion.findFirst({
      where: { id: a.fila.cotizacionId, companyId, deletedAt: null },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!existente) throw new NotFoundException('Esa cotización no existe');
    if (esFinal(existente.status) || estaBloqueada(existente.status)) throw new BadRequestException('Ya salió al cliente: pídele a quien te la abrió que la regrese a borrador');
    if (dto.version !== existente.updatedAt.toISOString()) throw new ConflictException('Alguien más guardó esta cotización. Ya la volvimos a cargar: revisa y guarda otra vez.');
    let items: unknown[];
    try {
      items = mezclarPartidas(existente.items as never[], dto.partidas);
    } catch (e) {
      if (e instanceof CotizacionCambio) throw new ConflictException('Alguien más guardó esta cotización. Ya la volvimos a cargar: revisa y guarda otra vez.');
      if (e instanceof PartidaInvalida) throw new BadRequestException(e.message);
      throw e;
    }
    await this.cotizaciones.update(a.fila.cotizacionId, { items } as never, viewer.id, companyId, viewer as never);
    await this.prisma.cotizacionAcceso.update({
      where: { id: a.fila.id },
      data: { cambios: { increment: 1 }, ultimoCambioAt: new Date() },
    });
    return this.leer(activityId, viewer, companyId);
  }

  /** Quien la abrió, o dirección, se la quita antes de tiempo. */
  async cerrar(activityId: number, viewer: ActorAbierta, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const a = await this.acceso(activityId, companyId);
    if (!a) throw new NotFoundException('Esa actividad no tiene una cotización abierta');
    if (a.fila.otorgadoPorId !== viewer.id && !esDeTodaLaEmpresa(viewer)) throw new ForbiddenException('Solo quien la abrió puede cerrarla');
    if (!a.fila.revocadoAt) await this.prisma.cotizacionAcceso.update({ where: { id: a.fila.id }, data: { revocadoAt: new Date(), revocadoPorId: viewer.id } });
    return this.leer(activityId, viewer, companyId);
  }
}
