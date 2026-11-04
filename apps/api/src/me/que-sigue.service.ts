import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ACTIVITY_STATUS, isClosedStatus, normalizeActivityStatus } from '../activities/activity-status.js';
import type { CreateActivityDto } from '../activities/dto/create-activity.dto.js';
import { workDateColumn, workDateKey } from '../common/time/workday.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DireccionService } from './direccion.service.js';
import { esDeTodaLaEmpresa } from './equipo-alcance.js';
import { MyActivitiesService, type TeamEvidenceViewer } from './my-activities.service.js';
import {
  areaDeTrabajo,
  armarSugerencias,
  DIAS_PARA_SEGUIR,
  limpiarPendiente,
  MAX_PENDIENTES_ABIERTOS,
  normalizarTitulo,
  planDeSugerencia,
  sugerenciaParaAviso,
  type AreaDeTrabajo,
  type DatosQueSigue,
  type PlanDeActividad,
} from './que-sigue.js';

type Viewer = TeamEvidenceViewer;

/** «¿Qué sigue?» y la lista de pendientes de cada quien. Las reglas están en `que-sigue.ts`. */
@Injectable()
export class QueSigueService {
  private readonly logger = new Logger(QueSigueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actividades: MyActivitiesService,
    private readonly direccion: DireccionService,
  ) {}

  /** Una cuenta que falla se queda sin esa sugerencia; las demás siguen saliendo. */
  private async seguro<T>(respaldo: T, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`sin dato: ${(error as Error).message}`);
      return respaldo;
    }
  }

  private async datos(viewer: Viewer, companyId: number, area: AreaDeTrabajo, ahora: Date): Promise<DatosQueSigue> {
    const hace7 = new Date(ahora.getTime() - 7 * 86_400_000);
    const hoy = workDateKey(ahora);
    const comercial = area === 'comercial';
    const [filas, pendientes, cotizaciones, contactos, recientes, porRevisar, obraSinLigar, bancoSinConciliar] = await Promise.all([
      this.prisma.activityAssignee.findMany({
        where: { userId: viewer.id, retiradoAt: null, companyId, activity: { deletedAt: null } },
        orderBy: { asignadoAt: 'desc' },
        take: 100,
        select: {
          rol: true,
          activity: {
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              estatus: true,
              assignmentCharge: true,
              activityEvidences: { where: { userId: viewer.id }, select: { status: true } },
            },
          },
        },
      }),
      this.prisma.pendientePersonal.findMany({
        where: { companyId, userId: viewer.id, hechoAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, texto: true },
      }),
      comercial
        ? this.seguro([] as DatosQueSigue['cotizaciones'], async () => {
            const filas = await this.prisma.cotizacion.findMany({
              where: {
                companyId,
                deletedAt: null,
                status: 'DRAFT',
                validUntil: { gte: workDateColumn(ahora) },
                OR: [{ asignadoAId: viewer.id }, { asignadoAId: null, createdById: viewer.id }],
              },
              orderBy: { validUntil: 'asc' },
              take: 100,
              select: { id: true, quoteNumber: true, clientName: true, projectName: true, validUntil: true, total: true },
            });
            return filas.map((c) => ({
              id: c.id,
              folio: c.quoteNumber,
              cliente: c.clientName,
              proyecto: c.projectName,
              validUntil: c.validUntil as Date,
              total: Number(c.total ?? 0),
            }));
          })
        : ([] as DatosQueSigue['cotizaciones']),
      comercial
        ? this.seguro([] as DatosQueSigue['contactos'], async () => {
            const filas = await this.prisma.salesLead.findMany({
              where: { companyId, ownerId: null, status: 'NEW', source: 'contacto-page' },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: { id: true, name: true, company: true, email: true, phone: true, notes: true, createdAt: true },
            });
            return filas.map((l) => ({
              id: l.id,
              nombre: l.name?.trim() || l.company?.trim() || 'el contacto de la página',
              email: l.email,
              phone: l.phone,
              notas: l.notes,
              createdAt: l.createdAt,
            }));
          })
        : ([] as DatosQueSigue['contactos']),
      this.prisma.activity.findMany({
        where: { companyId, responsableId: viewer.id, deletedAt: null, fechaAsignacion: { gte: hace7 } },
        orderBy: { fechaAsignacion: 'desc' },
        take: 100,
        select: { id: true, titulo: true, coreKind: true, ticketTypeCustom: true, tiempoEstandarMin: true, fechaAsignacion: true },
      }),
      area === 'encargado'
        ? this.seguro(0, async () => (await this.actividades.pendingReviews(viewer, companyId)).pendientes.filter((p) => p.paraTi !== false).length)
        : 0,
      viewer.roleKey === 'arquitecto'
        ? this.seguro(0, async () => {
            const obra = await this.direccion.obra(viewer, companyId);
            return Math.max(0, obra.actividades - obra.ligadas);
          })
        : 0,
      area === 'contabilidad' ? this.seguro(0, () => this.prisma.bankTransaction.count({ where: { companyId, reconciliation: null } })) : 0,
    ]);

    const abiertas = filas
      .map((f) => ({ rol: String(f.rol), a: f.activity }))
      .filter(({ rol, a }) => {
        if (a.assignmentCharge === 'despacho' && rol === 'LEAD') return false;
        if (isClosedStatus(a.estatus) || normalizeActivityStatus(a.estatus) === ACTIVITY_STATUS.POR_VALIDAR) return false;
        return !a.activityEvidences.some((e) => e.status === 'COMPLETED');
      })
      .map(({ a }) => ({ id: a.id, anNumber: a.anNumber, titulo: a.titulo }));

    const limiteSeguir = ahora.getTime() - DIAS_PARA_SEGUIR * 86_400_000;
    const [ultima] = recientes;
    return {
      area,
      abiertas,
      pendientes,
      cotizaciones,
      contactos,
      porRevisar,
      obraSinLigar,
      bancoSinConciliar,
      ultima: ultima && ultima.fechaAsignacion.getTime() >= limiteSeguir ? ultima : null,
      hechasHoy: new Set(recientes.filter((a) => workDateKey(a.fechaAsignacion) === hoy).map((a) => normalizarTitulo(a.titulo))),
      hechasSemana: new Set(recientes.map((a) => normalizarTitulo(a.titulo))),
      ahora,
    };
  }

  /** El área de quien mira. `null`: dirección, a quien no le aplica. */
  private async areaDe(viewer: Viewer): Promise<AreaDeTrabajo | null> {
    if (esDeTodaLaEmpresa(viewer as never)) return null;
    const persona = await this.prisma.user.findUnique({ where: { id: viewer.id }, select: { roleKey: true, puesto: true } });
    return areaDeTrabajo({ roleKey: persona?.roleKey ?? viewer.roleKey, puesto: persona?.puesto });
  }

  async queSigue(viewer: Viewer, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const area = await this.areaDe(viewer);
    if (!area) return { aplica: false as const, area: null, sugerencias: [], resumen: null };
    const { sugerencias, resumen } = armarSugerencias(await this.datos(viewer, companyId, area, new Date()));
    return { aplica: true as const, area, sugerencias, resumen };
  }

  /** Lo que dice el aviso de «sin actividad». `null`: que diga lo de siempre. */
  async paraAviso(userId: number, companyId: number, enviadosHoy: number) {
    const persona = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, roleKey: true } });
    if (!persona) return null;
    const viewer: Viewer = { id: persona.id, email: persona.email, roleKey: persona.roleKey, isSuperAdmin: false, permissions: [] };
    const area = await this.areaDe(viewer);
    if (!area) return null;
    const { sugerencias } = armarSugerencias(await this.datos(viewer, companyId, area, new Date()));
    const s = sugerenciaParaAviso(sugerencias, enviadosHoy);
    if (!s) return null;
    return { ...s.aviso, relatedUrl: s.accion === 'abrir' && s.href ? s.href : '/erp/pizarra?vista=mias' };
  }

  /** «Empezar»: crea la actividad a su nombre y arranca el reloj. La clave se vuelve a buscar aquí. */
  async empezar(viewer: Viewer, companyIdRaw: number | null, clave: string) {
    const companyId = requireCompanyId(companyIdRaw);
    const area = await this.areaDe(viewer);
    if (!area) throw new ForbiddenException('Esto no aplica a dirección general');
    const plan = planDeSugerencia(String(clave ?? ''), await this.datos(viewer, companyId, area, new Date()));
    if (!plan) throw new ConflictException('Esa sugerencia ya no está. Te enseñamos las de ahora.');
    return this.crear(viewer, companyId, plan);
  }

  private async crear(viewer: Viewer, companyId: number, plan: PlanDeActividad) {
    // Un contacto es de quien lo toma primero; si dos le dan a la vez, solo uno se lo queda.
    if (plan.contactoId != null) {
      const { count } = await this.prisma.salesLead.updateMany({
        where: { id: plan.contactoId, companyId, ownerId: null },
        data: { ownerId: viewer.id },
      });
      if (!count) throw new ConflictException('Ese contacto ya lo tomó otra persona.');
    }
    const copia =
      plan.copiaDe != null
        ? await this.prisma.activity.findFirst({
            where: { id: plan.copiaDe, companyId, responsableId: viewer.id },
            select: { coreKind: true, activityType: true, ticketType: true, ticketTypeCustom: true, workType: true, clientId: true, projectId: true },
          })
        : null;
    const creada = await this.actividades.selfCreate(
      viewer,
      companyId,
      {
        titulo: plan.titulo,
        indicaciones: plan.indicaciones,
        prioridad: 'MEDIA',
        estatus: 'Pendiente',
        activityType: copia?.activityType ?? 'INTERNAL',
        ticketType: copia?.ticketType ?? 'OTRO',
        ticketTypeCustom: copia?.ticketTypeCustom ?? 'Otra tarea',
        workType: copia?.workType ?? 'ISSUE',
        coreKind: copia?.coreKind ?? 'tarea',
        clientId: copia?.clientId ?? undefined,
        projectId: copia?.projectId ?? undefined,
        evidencePhotoRequired: 2,
        fechaInicio: new Date().toISOString(),
      } as unknown as CreateActivityDto,
      { tiempoFijoMin: plan.minutos },
    );
    if (plan.pendienteId != null) {
      await this.prisma.pendientePersonal.updateMany({
        where: { id: plan.pendienteId, companyId, userId: viewer.id, hechoAt: null },
        data: { hechoAt: new Date(), activityId: creada.id },
      });
    }
    // Ya existe aunque no arranque: la abre y la inicia a mano.
    const iniciada = await this.actividades.iniciar(viewer, companyId, creada.id).then(
      () => true,
      (error: Error) => {
        this.logger.warn(`no arrancó la actividad ${creada.id}: ${error.message}`);
        return false;
      },
    );
    return { activityId: creada.id, iniciada };
  }

  async listarPendientes(viewer: Viewer, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const pendientes = await this.prisma.pendientePersonal.findMany({
      where: { companyId, userId: viewer.id, hechoAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, texto: true, createdAt: true },
    });
    return { pendientes };
  }

  async agregarPendiente(viewer: Viewer, companyIdRaw: number | null, texto: unknown) {
    const companyId = requireCompanyId(companyIdRaw);
    const limpio = limpiarPendiente(texto);
    if (!limpio) throw new BadRequestException('Escribe tu pendiente, en menos de 200 letras');
    const abiertos = await this.prisma.pendientePersonal.count({ where: { companyId, userId: viewer.id, hechoAt: null } });
    if (abiertos >= MAX_PENDIENTES_ABIERTOS) throw new BadRequestException('Tienes demasiados pendientes: palomea los que ya hiciste');
    return this.prisma.pendientePersonal.create({
      data: { companyId, userId: viewer.id, texto: limpio },
      select: { id: true, texto: true, createdAt: true },
    });
  }

  private async pendienteDe(viewer: Viewer, companyId: number, id: number) {
    const fila = await this.prisma.pendientePersonal.findFirst({ where: { id, companyId, userId: viewer.id } });
    if (!fila) throw new NotFoundException('Ese pendiente no existe');
    return fila;
  }

  async palomearPendiente(viewer: Viewer, companyIdRaw: number | null, id: number) {
    const companyId = requireCompanyId(companyIdRaw);
    const fila = await this.pendienteDe(viewer, companyId, id);
    if (!fila.hechoAt) await this.prisma.pendientePersonal.updateMany({ where: { id, companyId, userId: viewer.id }, data: { hechoAt: new Date() } });
    return { ok: true };
  }

  async borrarPendiente(viewer: Viewer, companyIdRaw: number | null, id: number) {
    const companyId = requireCompanyId(companyIdRaw);
    await this.pendienteDe(viewer, companyId, id);
    await this.prisma.pendientePersonal.deleteMany({ where: { id, companyId, userId: viewer.id } });
    return { ok: true };
  }

  async empezarPendiente(viewer: Viewer, companyIdRaw: number | null, id: number) {
    const companyId = requireCompanyId(companyIdRaw);
    const area = await this.areaDe(viewer);
    if (!area) throw new ForbiddenException('Esto no aplica a dirección general');
    const fila = await this.pendienteDe(viewer, companyId, id);
    if (fila.hechoAt) throw new ConflictException('Ese pendiente ya está hecho');
    return this.crear(viewer, companyId, { titulo: fila.texto, pendienteId: fila.id });
  }
}
