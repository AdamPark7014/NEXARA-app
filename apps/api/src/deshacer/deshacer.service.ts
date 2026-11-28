import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { companyWhere } from '../common/tenant/tenant-scope.js';
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail } from '../common/platform-accounts.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import {
  MENSAJE_PLAZO_VENCIDO,
  MENSAJE_SIN_PERMISO,
  actividadSinAvance,
  decidirDeshacer,
  viaticoSinAvance,
  type ActorDeshacer,
  type PersonaOrganigrama,
  type TipoDeshacer,
} from './deshacer-reglas.js';

export type ActorSesion = { id: number; nombre?: string | null; email?: string | null; isSuperAdmin?: boolean | null };

export type ResultadoDeshacer = {
  ok: true;
  tipo: TipoDeshacer;
  ids: number[];
  /** `a_tiempo`: dentro del plazo, nadie se enteró. `superior`: lo retiró un jefe y se avisó a quien lo tenía. */
  como: 'a_tiempo' | 'superior';
};

/** Máximo de altas que se deshacen de un toque (una serie de días). */
const MAX_IDS = 31;

/**
 * Deshace altas recientes. Las reglas viven en `deshacer-reglas.ts`; aquí solo se lee la base, se
 * revisa todo antes de escribir y se escribe en una transacción: o se deshace todo lo pedido o nada.
 */
@Injectable()
export class DeshacerService {
  private readonly logger = new Logger(DeshacerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeGateway,
    @Optional() private readonly avisos?: NotificationHierarchyService,
  ) {}

  async deshacer(
    tipo: TipoDeshacer,
    idsCrudos: unknown,
    actorSesion: ActorSesion | null | undefined,
    companyId: number | null | undefined,
    ahora: Date = new Date(),
  ): Promise<ResultadoDeshacer> {
    if (!actorSesion?.id) throw new ForbiddenException(MENSAJE_SIN_PERMISO);
    const ids = limpiarIds(idsCrudos);
    if (ids.length === 0) throw new BadRequestException('Falta qué deshacer.');
    if (ids.length > MAX_IDS) throw new BadRequestException(`Se deshacen hasta ${MAX_IDS} a la vez.`);

    const actor: ActorDeshacer = {
      id: Number(actorSesion.id),
      autoridadMaxima:
        Boolean(actorSesion.isSuperAdmin) ||
        isCeoEquivalentEmail(actorSesion.email) ||
        isDeveloperSuperAdminEmail(actorSesion.email),
    };
    const personas: PersonaOrganigrama[] = await this.prisma.user.findMany({
      select: { id: true, managerId: true },
    });

    return tipo === 'actividad'
      ? this.deshacerActividades(ids, actor, personas, companyId, ahora)
      : this.deshacerViaticos(ids, actor, personas, companyId, ahora);
  }

  private async deshacerActividades(
    ids: number[],
    actor: ActorDeshacer,
    personas: PersonaOrganigrama[],
    companyId: number | null | undefined,
    ahora: Date,
  ): Promise<ResultadoDeshacer> {
    const filas = await this.prisma.activity.findMany({
      where: { id: { in: ids }, ...companyWhere(companyId ?? null) },
      select: {
        id: true,
        companyId: true,
        anNumber: true,
        estatus: true,
        cancelledAt: true,
        deletedAt: true,
        creadoPorId: true,
        fechaAsignacion: true,
        assignees: { select: { asignadoAt: true }, orderBy: { asignadoAt: 'asc' }, take: 1 },
        _count: {
          select: {
            workSessions: true,
            activityEvidences: { where: { entryPhotoUrl: { not: null } } },
          },
        },
      },
    });
    const porId = new Map(filas.map((f) => [f.id, f]));
    const yaRetiradas = new Set<number>();
    let como: 'a_tiempo' | 'superior' = 'a_tiempo';

    for (const id of ids) {
      const a = porId.get(id);
      if (!a) throw new NotFoundException('Actividad no encontrada');
      // Doble toque o reintento sin señal: lo ya deshecho cuenta como hecho.
      if (a.deletedAt) {
        yaRetiradas.add(id);
        continue;
      }
      // Hora del alta: la del equipo (la pone el servidor); `fechaAsignacion` la puede mandar el cliente.
      const hechoEn = a.assignees[0]?.asignadoAt ?? a.fechaAsignacion;
      const decision = decidirDeshacer({ actor, autorId: a.creadoPorId, hechoEn, ahora, personas });
      if (!decision.ok) {
        if (decision.motivo === 'plazo_vencido') throw new GoneException(MENSAJE_PLAZO_VENCIDO);
        throw new ForbiddenException(MENSAJE_SIN_PERMISO);
      }
      if (decision.como === 'superior') como = 'superior';
      const avance = actividadSinAvance({
        estatus: a.estatus,
        cancelledAt: a.cancelledAt,
        sesiones: a._count.workSessions,
        conFotoDeEntrada: a._count.activityEvidences,
      });
      if (!avance.ok) throw new ConflictException(avance.mensaje);
    }

    const porRetirar = ids.filter((id) => !yaRetiradas.has(id));
    if (porRetirar.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        // `deletedAt: null` en el where: dos «Deshacer» a la vez no se pisan.
        await tx.activity.updateMany({
          where: { id: { in: porRetirar }, deletedAt: null },
          data: { deletedAt: ahora, deletedById: actor.id },
        });
        // Los viáticos ligados a una actividad que no fue tampoco deben quedar pidiendo dinero.
        await tx.viatico.updateMany({
          where: { actividadId: { in: porRetirar }, deletedAt: null, estatus: 'Pendiente', approvalStep: 0 },
          data: { deletedAt: ahora },
        });
      });
    }

    for (const id of porRetirar) {
      const a = porId.get(id)!;
      this.realtime?.emitToCompany(a.companyId, 'activity:updated', { id, anNumber: a.anNumber, deleted: true });
      // Fuera de plazo ya le había llegado el aviso: se le dice que ya no va.
      if (como === 'superior') {
        void this.avisos?.notifyActivityCancelled?.({ activityId: id, actorId: actor.id, motivo: 'Se deshizo la asignación' });
      }
    }
    this.logger.log(`Deshacer actividad ${ids.join(',')} por ${actor.id} (${como})`);
    return { ok: true, tipo: 'actividad', ids, como };
  }

  private async deshacerViaticos(
    ids: number[],
    actor: ActorDeshacer,
    personas: PersonaOrganigrama[],
    companyId: number | null | undefined,
    ahora: Date,
  ): Promise<ResultadoDeshacer> {
    const filas = await this.prisma.viatico.findMany({
      where: { id: { in: ids }, ...companyWhere(companyId ?? null) },
      select: {
        id: true,
        usuarioId: true,
        asignadoPorId: true,
        origen: true,
        estatus: true,
        approvalStep: true,
        journalEntryId: true,
        fechaSolicitud: true,
        deletedAt: true,
      },
    });
    const porId = new Map(filas.map((f) => [f.id, f]));
    const yaRetirados = new Set<number>();
    let como: 'a_tiempo' | 'superior' = 'a_tiempo';

    for (const id of ids) {
      const v = porId.get(id);
      if (!v) throw new NotFoundException('Viático no encontrado');
      if (v.deletedAt) {
        yaRetirados.add(id);
        continue;
      }
      const autorId = v.origen === 'ASIGNACION' && v.asignadoPorId ? v.asignadoPorId : v.usuarioId;
      const decision = decidirDeshacer({ actor, autorId, hechoEn: v.fechaSolicitud, ahora, personas });
      if (!decision.ok) {
        if (decision.motivo === 'plazo_vencido') throw new GoneException(MENSAJE_PLAZO_VENCIDO);
        throw new ForbiddenException(MENSAJE_SIN_PERMISO);
      }
      if (decision.como === 'superior') como = 'superior';
      const avance = viaticoSinAvance(v);
      if (!avance.ok) throw new ConflictException(avance.mensaje);
    }

    const porRetirar = ids.filter((id) => !yaRetirados.has(id));
    if (porRetirar.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        const hecho = await tx.viatico.updateMany({
          where: { id: { in: porRetirar }, deletedAt: null, estatus: 'Pendiente', approvalStep: 0 },
          data: { deletedAt: ahora },
        });
        // Alguien lo aprobó (o lo deshizo) en este mismo instante: no se deja a medias.
        if (hecho.count !== porRetirar.length) {
          throw new ConflictException('El viático cambió en este momento. Vuelve a intentarlo.');
        }
        // El reparto entre actividades se deriva del viático: sin él no debe sumar costo.
        await tx.viaticoReparto.deleteMany({ where: { viaticoId: { in: porRetirar } } });
      });
    }
    this.logger.log(`Deshacer viático ${ids.join(',')} por ${actor.id} (${como})`);
    return { ok: true, tipo: 'viatico', ids, como };
  }
}

function limpiarIds(crudo: unknown): number[] {
  const lista = Array.isArray(crudo) ? crudo : [crudo];
  return [...new Set(lista.map((v) => Number(v)))].filter((n) => Number.isInteger(n) && n > 0);
}
