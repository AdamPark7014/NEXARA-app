import { esDestinatarioFinanzas } from '../common/finance-notification-recipient.js';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import {
  appendTrail,
  buildApprovalChain,
  canActOnStep,
  isTerminalApproved,
  stepRoleAt,
  type TrailEntry,
} from '../common/rbac/hierarchical-approval.js';
import { ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { assertCompanyAccess, companyWhere, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import {
  mensajeErrores,
  revisarChecklist,
  type ChecklistNormalizado,
  type EntradaChecklist,
  type ErrorChecklist,
  type FotoChecklist,
} from './checklist-entrega.js';
import {
  CAMPO_VIDEO_VUELTA,
  DURACION_VUELTA_SEG,
  FOTOS_GUIADAS,
  PASOS_CAPTURA,
  VISTAS_VUELTA,
  revisarCapturaGuiada,
  type EntradaGuiada,
  type GuiadaNormalizada,
} from './captura-guiada.js';
import {
  alertaLecturaCorregida,
  kmEsperadosIdaVuelta,
  revisarKmContraUltimo,
  revisarKmRecorridos,
  ultimoRegistroKm,
  type AlertaKm,
  type RegistroKm,
} from './kilometraje.js';
import { capturaGuiadaPrendida } from './interruptor-vehiculos.js';
import { DanosVehiculoService } from './danos-vehiculo.service.js';
import { sitioOficina } from '../attendance/asistencia-confiable.js';
import { ESTATUS_CERRADOS } from '../activities/rellenar-tiempos.js';
import { veTodoCostos, type ActorCostos } from '../costos/costos-acceso.js';

/** Lo que llega del controlador: el checklist de 7 fotos (v1) o la captura guiada de 5 pasos (v2). */
export type EntradaCaptura =
  | (EntradaChecklist & { version?: 1; forzarKm?: boolean })
  | (EntradaGuiada & { version: 2; forzarKm?: boolean });

/** Quién registra. Un número es solo el id (así llaman las rutas viejas y las pruebas). */
export type ActorVehiculo = {
  id: number;
  nombre?: string | null;
  isSuperAdmin?: boolean;
  /** Liz y los mandos con `vehicles.review`: pueden registrar la entrega en persona y firmar. */
  puedeRevisar?: boolean;
  puedeInventario?: boolean;
};

type Captura = (ChecklistNormalizado & { version: 1 }) | GuiadaNormalizada;

const MENSAJE_ACTUALIZA_APP =
  'Actualiza la app: la salida de una unidad ahora se registra con los 5 pasos (vuelta en video, asientos, tablero y kilometraje).';

const MENSAJE_ACTIVIDAD_CERRADA = 'La actividad ya está cerrada: la unidad se pide para una actividad abierta.';

const objeto = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, any>) } : {};

const arreglo = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const registradoEn = (payload: unknown): string | null => {
  const v = objeto(payload)['registradoEn'];
  return typeof v === 'string' && v ? v : null;
};

const dinero = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

@Injectable()
export class VehiclesService {
  // Exportar a CSV
  toCSV(vehicles: any[]): string {
    if (!vehicles.length) return '';
    const fields = Object.keys(vehicles[0]);
    const csvRows = [fields.join(',')];
    for (const row of vehicles) {
      csvRows.push(
        fields
          .map((f) => {
            let val = row[f];
            if (typeof val === 'object' && val !== null) {
              val = JSON.stringify(val);
            }
            if (typeof val === 'string' && val.includes(',')) {
              val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val ?? '';
          })
          .join(','),
      );
    }
    return csvRows.join('\n');
  }

  // Importar muchos vehículos desde JSON
  importMany(_json: any[]): never {
    throw new Error('Modelo vehiculo no existe en Prisma.');
  }

  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    @Optional() private readonly danos?: DanosVehiculoService,
  ) {}

  private aActor(quien: number | ActorVehiculo): ActorVehiculo {
    return typeof quien === 'number' ? { id: quien } : quien;
  }

  /** Registra salida o devolución: quien pidió, el encargado de la unidad, o Liz en persona. */
  private puedeRegistrar(record: { solicitanteId?: number | null; encargadoId?: number | null }, actor: ActorVehiculo) {
    return Boolean(
      actor.isSuperAdmin ||
        actor.puedeRevisar ||
        (record.solicitanteId != null && record.solicitanteId === actor.id) ||
        (record.encargadoId != null && record.encargadoId === actor.id),
    );
  }

  /** De la oficina a donde va la actividad: el origen para estimar los km de ida y vuelta. */
  private origenOficina() {
    const s = sitioOficina();
    return { lat: s.latitude, lng: s.longitude };
  }

  /** El encargado: una persona activa de la empresa. Sin dato, quien pide. */
  private async encargadoValido(crudo: unknown, porOmision: number, companyId?: number | null): Promise<number> {
    const n = Number(crudo);
    if (crudo == null || crudo === '' || !Number.isInteger(n) || n <= 0 || n === porOmision) return porOmision;
    const persona = await this.prisma.user.findFirst({
      where: { id: n, isActive: true, ...(companyId ? { companyMemberships: { some: { companyId } } } : {}) },
      select: { id: true },
    });
    if (!persona) throw new BadRequestException('El encargado debe ser una persona activa de la empresa');
    return persona.id;
  }

  /** La actividad a la que va una salida de inventario: abierta, con su fin y los km que pide. */
  private async actividadParaUso(actividadId: number, companyId?: number | null) {
    const act = await this.prisma.activity.findFirst({
      where: { id: actividadId, ...companyWhere(companyId ?? null) },
      select: { id: true, estatus: true, destino: true, fechaEntregaEsperada: true, fechaMaxima: true },
    });
    if (!act) throw new BadRequestException('Actividad no encontrada');
    if (ESTATUS_CERRADOS.includes(act.estatus)) throw new BadRequestException(MENSAJE_ACTIVIDAD_CERRADA);
    return {
      id: act.id,
      fin: (act.fechaEntregaEsperada ?? act.fechaMaxima ?? null) as Date | null,
      kmEsperados: kmEsperadosIdaVuelta(this.origenOficina(), act.destino),
    };
  }

  private resolveActorRole(actor: any): RoleKey | null {
    if (actor?.isSuperAdmin) return ROLES.SUPER_ADMIN;
    return actor?.roleKey ?? actor?.role?.orgRoleKey ?? null;
  }

  private controlInclude() {
    return { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true };
  }

  async create(createVehicleDto: any, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const { companyId: _ignored, encargadoId: encargadoCrudo, ...rest } = createVehicleDto ?? {};

    const activity = await this.prisma.activity.findFirst({
      where: { id: rest.actividadId, ...companyWhere(cid) },
      select: { id: true, estatus: true, destino: true },
    });
    if (!activity) throw new BadRequestException('Actividad no encontrada');
    if (ESTATUS_CERRADOS.includes(activity.estatus) && (await capturaGuiadaPrendida(this.prisma))) {
      throw new BadRequestException(MENSAJE_ACTIVIDAD_CERRADA);
    }
    // Usar una unidad pide actividad y encargado: sin dato, el encargado es quien la pide.
    const encargadoId = rest.solicitanteId
      ? await this.encargadoValido(encargadoCrudo, Number(rest.solicitanteId), cid)
      : null;
    const kmEsperados = kmEsperadosIdaVuelta(this.origenOficina(), activity.destino);

    if (rest.vehicleId != null) {
      const asset = await this.prisma['vehicleAsset'].findFirst({
        where: { id: Number(rest.vehicleId), ...companyWhere(cid) },
        select: { id: true, companyId: true },
      });
      assertCompanyAccess(asset, cid, 'Vehículo');
    }

    const vehicleControl = await this.prisma['vehicleControl'].create({
      data: {
        ...rest,
        encargadoId,
        kmEsperados,
        companyId: cid,
        approvalStep: 0,
        approvalTrail: [],
        estatusAprobacion: rest.estatusAprobacion ?? 'Pendiente',
      },
      include: { solicitante: { select: { id: true, nombre: true } } },
    });

    // Notify supervisors about vehicle request
    if (vehicleControl.solicitanteId && vehicleControl.solicitante) {
      await this.notificationHierarchy.notifyVehicleRequested(
        vehicleControl.solicitanteId,
        vehicleControl.id,
        vehicleControl.solicitante.nombre || 'Usuario',
        createVehicleDto.nombreVehiculo || 'Vehículo',
      );
    }

    return vehicleControl;
  }

  async getAsset(id: number, companyId?: number | null) {
    const asset = await this.prisma['vehicleAsset'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(asset, companyId, 'Vehículo');
    return asset;
  }

  async createAsset(data: any, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const { companyId: _ignored, ...rest } = data ?? {};
    return this.prisma['vehicleAsset'].create({
      data: { ...rest, companyId: cid },
    });
  }

  async updateAsset(id: number, data: any, companyId?: number | null) {
    await this.getAsset(id, companyId);
    const { companyId: _ignored, ...rest } = data ?? {};
    return this.prisma['vehicleAsset'].update({ where: { id }, data: rest });
  }

  async removeAsset(id: number, companyId?: number | null) {
    await this.getAsset(id, companyId);
    return this.prisma['vehicleAsset'].delete({ where: { id } });
  }

  async listAssets(query?: PaginationQueryDto, companyId?: number | null) {
    const where = companyWhere(companyId ?? null);
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['vehicleAsset'].findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma['vehicleAsset'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['vehicleAsset'].findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findAll(query?: PaginationQueryDto, companyId?: number | null) {
    const include = this.controlInclude();
    const where = companyWhere(companyId ?? null);
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['vehicleControl'].findMany({
          where,
          include,
          orderBy: { fechaSolicitud: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma['vehicleControl'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['vehicleControl'].findMany({
      where,
      include,
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByDepartment(departmentId: number, companyId?: number | null) {
    return this.prisma['vehicleControl'].findMany({
      where: { solicitante: { departmentId }, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByResponsible(userId: number, companyId?: number | null) {
    return this.prisma['vehicleControl'].findMany({
      where: { solicitanteId: userId, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByAllowedUsers(userIds: number[], companyId?: number | null) {
    if (!userIds || userIds.length === 0) return [];
    return this.prisma['vehicleControl'].findMany({
      where: { solicitanteId: { in: userIds }, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const record = await this.prisma['vehicleControl'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
    });
    assertCompanyAccess(record, companyId, 'Solicitud de vehículo');
    return record!;
  }

  async update(id: number, updateVehicleDto: any, companyId?: number | null) {
    const currentVehicle = await this.findOne(id, companyId);
    const { companyId: _ignored, ...rest } = updateVehicleDto ?? {};

    const updated = await this.prisma['vehicleControl'].update({
      where: { id },
      data: rest,
      include: { solicitante: { select: { id: true, nombre: true } } },
    });

    // Notify about vehicle approval/rejection
    if (rest.estatusAprobacion && currentVehicle.estatusAprobacion !== rest.estatusAprobacion) {
      if (rest.estatusAprobacion === 'Aprobado' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleApproved(
          updated.solicitanteId,
          id,
          rest.nombreVehiculo || currentVehicle.nombreVehiculo || 'Vehículo',
        );
      } else if (rest.estatusAprobacion === 'Rechazado' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleRejected(
          updated.solicitanteId,
          id,
          rest.nombreVehiculo || currentVehicle.nombreVehiculo || 'Vehículo',
        );
      }
    }

    return updated;
  }

  async approveOrReject(
    id: number,
    actor: any,
    action: 'approve' | 'reject',
    body?: { note?: string; fechaInicioAprobada?: string; fechaFinAprobada?: string },
    companyId?: number | null,
  ) {
    const record = await this.findOne(id, companyId);
    if (['Rechazado', 'Aprobado'].includes(record.estatusAprobacion)) {
      throw new BadRequestException('Esta solicitud ya fue cerrada');
    }

    const chain = buildApprovalChain('vehicles', 0);
    const step = record.approvalStep ?? 0;
    const actorRole = this.resolveActorRole(actor);
    if (!actor?.isSuperAdmin && !canActOnStep(actorRole, step, chain)) {
      throw new ForbiddenException('No tienes permisos para autorizar en este paso del flujo');
    }

    const trailEntry: TrailEntry = {
      role: stepRoleAt(chain, step) ?? actorRole ?? 'unknown',
      userId: actor.id,
      userName: actor.nombre,
      action,
      at: new Date().toISOString(),
      note: body?.note?.trim() || undefined,
    };
    const trail = appendTrail(record.approvalTrail as TrailEntry[] | null, trailEntry);

    if (action === 'reject') {
      const updated = await this.prisma['vehicleControl'].update({
        where: { id },
        data: { estatusAprobacion: 'Rechazado', approvalTrail: trail },
        include: { solicitante: { select: { id: true, nombre: true } } },
      });
      if (updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleRejected(updated.solicitanteId, id, record.nombreVehiculo || 'Vehículo');
      }
      return updated;
    }

    const nextStep = step + 1;
    if (isTerminalApproved(nextStep, chain)) {
      const fechaInicioAprobada = body?.fechaInicioAprobada ? new Date(body.fechaInicioAprobada) : record.fechaInicioSolicitada;
      const fechaFinAprobada = body?.fechaFinAprobada ? new Date(body.fechaFinAprobada) : record.fechaFinSolicitada;
      const updated = await this.prisma['vehicleControl'].update({
        where: { id },
        data: {
          approvalStep: nextStep,
          approvalTrail: trail,
          estatusAprobacion: 'Aprobado',
          fechaInicioAprobada,
          fechaFinAprobada,
          fechaInicio: fechaInicioAprobada,
          fechaFin: fechaFinAprobada,
        },
        include: { solicitante: { select: { id: true, nombre: true } } },
      });
      if (updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleApproved(updated.solicitanteId, id, record.nombreVehiculo || 'Vehículo');
      }
      return updated;
    }

    const pendiente = await this.prisma['vehicleControl'].update({
      where: { id },
      data: { approvalStep: nextStep, approvalTrail: trail, estatusAprobacion: 'Pendiente' },
      include: { solicitante: { select: { id: true, nombre: true } } },
    });
    // Paso intermedio (Liz → CEO): el siguiente aprobador se entera, con la nota de quien aprobó.
    const siguienteRol = stepRoleAt(chain, nextStep);
    if (siguienteRol) {
      await this.notificationHierarchy.notifyVehicleNextStep(
        id,
        siguienteRol,
        actor?.nombre || 'Quien autorizó',
        record.nombreVehiculo || 'Vehículo',
        body?.note,
      );
    }
    return pendiente;
  }

  /**
   * La evidencia de salida o devolución, idéntica en las cuatro rutas que abren o cierran una
   * asignación: el checklist de 7 fotos (v1) o la captura guiada de 5 pasos (v2). Si falta algo, el
   * 400 dice todo de una vez. Con el interruptor prendido, una salida solo entra con la captura
   * guiada; la devolución acepta las dos para que nadie se quede con la unidad por traer la app vieja.
   */
  private async revisarCaptura(
    entrada: EntradaCaptura,
    momento: 'salida' | 'devolucion',
    ctx?: { companyId?: number | null; relatedId: number; etiqueta: string },
  ): Promise<Captura> {
    let revision: { ok: true; datos: Captura } | { ok: false; errores: ErrorChecklist[] };
    if (entrada.version === 2) {
      revision = revisarCapturaGuiada(entrada);
    } else {
      if (momento === 'salida' && (await capturaGuiadaPrendida(this.prisma))) {
        throw new BadRequestException(MENSAJE_ACTUALIZA_APP);
      }
      const r = revisarChecklist(entrada);
      revision = r.ok ? { ok: true, datos: { ...r.datos, version: 1 } } : r;
    }
    if (!revision.ok) {
      const msg = mensajeErrores(revision.errores);
      if (momento === 'devolucion' && ctx) {
        await this.avisarLizChecklist(ctx.companyId, `Checklist de vehículo: ${ctx.etiqueta}`, msg, ctx.relatedId);
      }
      throw new BadRequestException(msg);
    }
    return revision.datos;
  }

  /** Avisa a Liz (coord_admin) si el checklist de devolución viene incompleto o con km raro. */
  private async avisarLizChecklist(
    companyId: number | null | undefined,
    titulo: string,
    mensaje: string,
    relatedId: number,
  ) {
    try {
      if (!companyId) return;
      const liz = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roleKey: ROLES.COORD_ADMIN,
          companyMemberships: { some: { companyId } },
        },
        select: { id: true, email: true, puesto: true },
      });
      for (const u of liz.filter(esDestinatarioFinanzas)) {
        await this.prisma.notification.create({
          data: {
            userId: u.id,
            type: 'VEHICLE_USAGE_EXPIRING',
            category: 'vehicles',
            title: titulo,
            message: mensaje.slice(0, 2000),
            relatedEntityId: relatedId,
            entityType: 'VehicleControl',
            relatedUrl: `/erp/vehiculos/${relatedId}`,
            priority: 'high',
            companyId,
          },
        });
      }
    } catch {
      /* el rechazo del checklist no depende del aviso */
    }
  }

  /** Lo que se guarda en `fotosSalida` / `fotosDevolucion`. */
  private payloadFotos(datos: Captura) {
    return {
      fotos: datos.fotos,
      fotoTableroUrl: datos.fotoTableroUrl,
      odometroKm: datos.odometroKm,
      combustiblePct: datos.combustiblePct,
      registradoEn: new Date().toISOString(),
      ...(datos.version === 2
        ? { version: 2, videoUrl: datos.videoUrl, duracionVideoSeg: datos.duracionVideoSeg }
        : {}),
    };
  }

  /** `fotosMeta` guarda el cuándo y el dónde de cada foto, de los dos momentos. */
  private mezclarMeta(previo: unknown, momento: 'salida' | 'devolucion', fotos: Captura['fotos']): any {
    return { ...objeto(previo), [momento]: fotos };
  }

  /** Video, lectura de la IA, versión de la captura y alertas: lo nuevo de la captura guiada. */
  private extrasCaptura(
    record: { capturaVersion?: number | null; lecturasKm?: unknown; alertasKm?: unknown },
    datos: Captura,
    momento: 'salida' | 'devolucion',
    alertas: AlertaKm[],
  ): Record<string, unknown> {
    const extras: Record<string, unknown> = {};
    const actual = record.capturaVersion ?? 1;
    // Al devolver con la app vieja una unidad que salió con la guiada, solo se comparan vistas que sí coinciden.
    const version = momento === 'salida' ? datos.version : Math.min(actual, datos.version);
    if (version !== actual) extras.capturaVersion = version;
    if (datos.version === 2) {
      extras[momento === 'salida' ? 'videoSalidaUrl' : 'videoDevolucionUrl'] = datos.videoUrl;
      extras.lecturasKm = {
        ...objeto(record.lecturasKm),
        [momento]: { ...datos.lectura, en: new Date().toISOString() },
      };
    }
    if (alertas.length) extras.alertasKm = [...arreglo(record.alertasKm), ...alertas];
    return extras;
  }

  /**
   * El kilometraje más reciente que se conoce de la unidad: solicitudes, salidas de inventario y
   * cargas de gasolina. Si la base falla, no se bloquea a nadie: se sigue sin comparar.
   */
  private async ultimoKmDeUnidad(
    vehicleId: number | null | undefined,
    companyId?: number | null,
    excluirControlId?: number,
  ): Promise<RegistroKm | null> {
    if (!vehicleId) return null;
    try {
      const where = companyWhere(companyId ?? null);
      const [controles, asset, carga] = await Promise.all([
        this.prisma.vehicleControl.findMany({
          where: {
            vehicleId,
            ...where,
            ...(excluirControlId ? { id: { not: excluirControlId } } : {}),
            OR: [{ odometroFin: { not: null } }, { odometroInicio: { not: null } }],
          },
          orderBy: { id: 'desc' },
          take: 5,
          select: {
            odometroInicio: true,
            odometroFin: true,
            fechaInicio: true,
            fechaFin: true,
            fotosSalida: true,
            fotosDevolucion: true,
          },
        }),
        this.prisma.vehicleAsset.findFirst({
          where: { id: vehicleId, ...where },
          select: { salidaFotos: true, devolucionFotos: true },
        }),
        this.prisma.vehiculoCarga.findFirst({
          where: { vehicleId, ...where },
          orderBy: { fecha: 'desc' },
          select: { odometro: true, fecha: true },
        }),
      ]);
      const registros: RegistroKm[] = [];
      for (const c of controles) {
        if (c.odometroFin != null) {
          registros.push({ km: c.odometroFin, at: registradoEn(c.fotosDevolucion) ?? c.fechaFin, origen: 'devolucion' });
        }
        if (c.odometroInicio != null) {
          registros.push({ km: c.odometroInicio, at: registradoEn(c.fotosSalida) ?? c.fechaInicio, origen: 'salida' });
        }
      }
      for (const [payload, origen] of [
        [asset?.salidaFotos, 'inventario-salida'],
        [asset?.devolucionFotos, 'inventario-devolucion'],
      ] as const) {
        const km = this.numeroDe(payload, 'odometroKm');
        if (km != null) registros.push({ km, at: registradoEn(payload), origen });
      }
      if (carga?.odometro != null) registros.push({ km: carga.odometro, at: carga.fecha, origen: 'carga' });
      return ultimoRegistroKm(registros);
    } catch (e) {
      this.logger.warn(`No se pudo leer el último km de la unidad ${vehicleId}: ${String((e as Error)?.message ?? e)}`);
      return null;
    }
  }

  /**
   * Una salida contra el último kilometraje de la unidad. Con el interruptor prendido, retroceder es
   * error, salvo que Liz lo autorice (`forzarKm`) porque el registro anterior estaba mal: queda la
   * alerta con su nombre. Apagado, no se bloquea a nadie: solo queda la alerta.
   */
  private async revisarKmSalida(
    datos: Captura,
    vehicleId: number | null | undefined,
    companyId: number | null | undefined,
    actor: ActorVehiculo,
    forzar: boolean | undefined,
    excluirControlId?: number,
  ): Promise<AlertaKm[]> {
    const alertas: AlertaKm[] = [];
    if (datos.version === 2) {
      const corregida = alertaLecturaCorregida(datos.lectura.ia, datos.lectura.confirmado);
      if (corregida) alertas.push(corregida);
    }
    const ultimo = await this.ultimoKmDeUnidad(vehicleId, companyId, excluirControlId);
    const revision = revisarKmContraUltimo(datos.odometroKm, ultimo);
    if (revision.error) {
      const autorizado = Boolean(forzar && (actor.isSuperAdmin || actor.puedeRevisar));
      const exigida = await capturaGuiadaPrendida(this.prisma);
      if (exigida && !autorizado) throw new BadRequestException(revision.error);
      const anterior = `${ultimo!.km.toLocaleString('es-MX')} km`;
      alertas.push({
        tipo: 'KM_MENOR',
        km: datos.odometroKm,
        mensaje: autorizado
          ? `Kilometraje menor al último registro (${anterior}), registrado con autorización de ${actor.nombre ?? 'quien revisa vehículos'}.`
          : `Kilometraje menor al último registro (${anterior}). Revisa cuál de los dos está mal.`,
        en: new Date().toISOString(),
      });
    }
    alertas.push(...revision.alertas);
    return alertas;
  }

  /** Al devolver: lectura corregida a mano y km de más contra lo que pide la actividad. */
  private alertasDevolucion(
    record: { odometroInicio?: number | null; kmEsperados?: number | null },
    datos: Captura,
  ): AlertaKm[] {
    const alertas: AlertaKm[] = [];
    if (datos.version === 2) {
      const corregida = alertaLecturaCorregida(datos.lectura.ia, datos.lectura.confirmado);
      if (corregida) alertas.push(corregida);
    }
    if (record.odometroInicio != null) {
      const deMas = revisarKmRecorridos(datos.odometroKm - record.odometroInicio, record.kmEsperados);
      if (deMas) alertas.push(deMas);
    }
    return alertas;
  }

  /** Las alertas siempre se guardan; a Liz se le avisa solo con el interruptor prendido. */
  private async avisarAlertasKm(companyId: number | null | undefined, etiqueta: string, alertas: AlertaKm[], relatedId: number) {
    if (!alertas.length || !(await capturaGuiadaPrendida(this.prisma))) return;
    await this.avisarLizChecklist(companyId, `Kilometraje: ${etiqueta}`, alertas.map((a) => a.mensaje).join('\n'), relatedId);
  }

  /** Lo que se guarda al cerrar un uso, venga de la solicitud o del inventario. */
  private datosDevolucion(record: any, datos: Captura, alertas: AlertaKm[]) {
    return {
      fotosDevolucion: this.payloadFotos(datos),
      fotosMeta: this.mezclarMeta(record.fotosMeta, 'devolucion', datos.fotos),
      fotoTableroDevolucionUrl: datos.fotoTableroUrl,
      odometroFin: datos.odometroKm,
      combustibleFinPct: datos.combustiblePct,
      entregaEstatus: 'Devuelto',
      fechaFin: new Date(),
      ...this.extrasCaptura(record, datos, 'devolucion', alertas),
    };
  }

  /**
   * Después de devolver: Liz se entera de las alertas y la IA compara antes y después, sin detener a
   * nadie. La comparación cuesta (Sonnet, unos centavos por devolución): solo con el interruptor prendido.
   */
  private async despuesDeDevolver(controlId: number, companyId: number | null | undefined, etiqueta: string, alertas: AlertaKm[]) {
    await this.avisarAlertasKm(companyId, etiqueta, alertas, controlId);
    if (await capturaGuiadaPrendida(this.prisma)) this.danos?.analizarEnSegundoPlano(controlId);
  }

  /** Si la unidad quedó marcada como asignada a esta persona en el inventario, vuelve a estar disponible. */
  private async liberarUnidad(record: any, datos: Captura) {
    if (!record.vehicleId) return;
    const personas = [record.solicitanteId, record.encargadoId].filter((v): v is number => typeof v === 'number');
    try {
      await this.prisma.vehicleAsset.updateMany({
        where: { id: record.vehicleId, estatus: 'Asignado', assignedToId: { in: personas } },
        data: { estatus: 'Disponible', assignedToId: null, assignedAt: null, devolucionFotos: this.payloadFotos(datos) },
      });
    } catch (e) {
      this.logger.warn(`No se pudo liberar la unidad ${record.vehicleId}: ${String((e as Error)?.message ?? e)}`);
    }
  }

  async startUse(id: number, quien: number | ActorVehiculo, entrada: EntradaCaptura, companyId?: number | null) {
    const actor = this.aActor(quien);
    const record = await this.findOne(id, companyId);
    if (record.estatusAprobacion !== 'Aprobado') throw new BadRequestException('La solicitud debe estar aprobada');
    if (!this.puedeRegistrar(record, actor)) {
      throw new ForbiddenException('Solo quien pidió la unidad o su encargado puede registrar la salida');
    }
    if (record.fotosSalida) throw new BadRequestException('Ya registraste la salida del vehículo');

    const datos = await this.revisarCaptura(entrada, 'salida');
    const alertas = await this.revisarKmSalida(datos, record.vehicleId, companyId, actor, entrada.forzarKm, id);

    const actualizado = await this.prisma['vehicleControl'].update({
      where: { id },
      data: {
        fotosSalida: this.payloadFotos(datos),
        fotosMeta: this.mezclarMeta(record.fotosMeta, 'salida', datos.fotos),
        fotoTableroSalidaUrl: datos.fotoTableroUrl,
        odometroInicio: datos.odometroKm,
        combustibleInicioPct: datos.combustiblePct,
        entregaEstatus: 'En uso',
        fechaInicio: record.fechaInicioAprobada ?? new Date(),
        ...this.extrasCaptura(record, datos, 'salida', alertas),
      },
    });
    await this.avisarAlertasKm(companyId ?? record.companyId, record.nombreVehiculo || `solicitud #${id}`, alertas, id);
    return actualizado;
  }

  async endUse(id: number, quien: number | ActorVehiculo, entrada: EntradaCaptura, companyId?: number | null) {
    const actor = this.aActor(quien);
    const record = await this.findOne(id, companyId);
    if (!this.puedeRegistrar(record, actor)) {
      throw new ForbiddenException('Solo quien pidió la unidad o su encargado puede registrar la devolución');
    }
    if (!record.fotosSalida) throw new BadRequestException('Primero registra la salida del vehículo');
    if (record.fotosDevolucion || record.entregaEstatus === 'Devuelto') throw new BadRequestException('Ya registraste la devolución del vehículo');

    const etiqueta = record.nombreVehiculo || `solicitud #${id}`;
    const datos = await this.revisarCaptura(
      { ...entrada, odometroInicio: record.odometroInicio } as EntradaCaptura,
      'devolucion',
      { companyId, relatedId: id, etiqueta },
    );
    const alertas = this.alertasDevolucion(record, datos);

    const actualizado = await this.prisma['vehicleControl'].update({
      where: { id },
      data: this.datosDevolucion(record, datos, alertas),
    });
    await this.liberarUnidad(record, datos);
    await this.despuesDeDevolver(id, companyId ?? record.companyId, etiqueta, alertas);
    return actualizado;
  }

  /**
   * Salida directa desde el inventario, sin solicitud previa. Pide la misma evidencia que una
   * solicitud. Con actividad, además deja un uso (`VehicleControl`) ligado a ella: así la actividad
   * enseña su bloque «Vehículo», corren los avisos de retraso y la IA compara al devolver. Con el
   * interruptor prendido, la actividad es obligatoria.
   */
  async checkoutAsset(
    id: number,
    quien: number | ActorVehiculo,
    entrada: EntradaCaptura,
    companyId?: number | null,
    opciones: { actividadId?: unknown; encargadoId?: unknown } = {},
  ) {
    const actor = this.aActor(quien);
    const asset = await this.getAsset(id, companyId);
    if (!asset) throw new BadRequestException('Vehículo no encontrado');
    if (asset.estatus === 'Asignado') throw new BadRequestException('El vehículo ya está asignado');
    if (asset.activo === false) throw new BadRequestException('El vehículo está dado de baja');

    const actividadId = Number(opciones.actividadId);
    const conActividad = Number.isInteger(actividadId) && actividadId > 0;
    if (!conActividad && (await capturaGuiadaPrendida(this.prisma))) {
      throw new BadRequestException('Para sacar una unidad elige la actividad a la que va.');
    }
    const actividad = conActividad ? await this.actividadParaUso(actividadId, companyId) : null;
    const encargadoId = await this.encargadoValido(opciones.encargadoId, actor.id, companyId);

    const datos = await this.revisarCaptura(entrada, 'salida');
    const alertas = await this.revisarKmSalida(datos, id, companyId, actor, entrada.forzarKm);
    const payload = this.payloadFotos(datos);

    const actualizado = await this.prisma['vehicleAsset'].update({
      where: { id },
      data: {
        estatus: 'Asignado',
        assignedToId: encargadoId,
        assignedAt: new Date(),
        salidaFotos: payload,
        devolucionFotos: undefined,
        tiempoUsoMinutos: null,
      },
    });

    let controlId: number | null = null;
    if (actividad) {
      const ahora = new Date();
      const control = await this.prisma['vehicleControl'].create({
        data: {
          actividadId: actividad.id,
          vehicleId: id,
          solicitanteId: actor.id,
          encargadoId,
          nombreVehiculo: asset.nombre ?? null,
          placasVehiculo: asset.placas ?? null,
          motivoUso: 'Salida directa de inventario',
          estatusAprobacion: 'Aprobado',
          approvalStep: 0,
          approvalTrail: [
            { role: 'inventario', userId: actor.id, userName: actor.nombre ?? null, action: 'approve', at: ahora.toISOString(), note: 'Salida directa de inventario' },
          ],
          fechaSolicitud: ahora,
          fechaInicioSolicitada: ahora,
          fechaInicioAprobada: ahora,
          fechaInicio: ahora,
          fechaFinSolicitada: actividad.fin,
          fechaFinAprobada: actividad.fin,
          fotosSalida: payload,
          fotosMeta: { salida: datos.fotos },
          fotoTableroSalidaUrl: datos.fotoTableroUrl,
          odometroInicio: datos.odometroKm,
          combustibleInicioPct: datos.combustiblePct,
          entregaEstatus: 'En uso',
          kmEsperados: actividad.kmEsperados,
          ...this.extrasCaptura({}, datos, 'salida', alertas),
          companyId: asset.companyId,
        },
        select: { id: true },
      });
      controlId = control.id;
    }
    await this.avisarAlertasKm(companyId ?? asset.companyId, asset.nombre || `inventario #${id}`, alertas, controlId ?? id);
    return controlId ? { ...actualizado, usoId: controlId } : actualizado;
  }

  /** El uso abierto de una unidad, si salió del inventario con actividad. */
  private async usoAbiertoDeUnidad(vehicleId: number, companyId?: number | null) {
    const uso = await this.prisma['vehicleControl'].findFirst({
      where: { vehicleId, entregaEstatus: 'En uso', estatusAprobacion: 'Aprobado', ...companyWhere(companyId ?? null) },
      orderBy: { id: 'desc' },
    });
    return uso && uso.vehicleId === vehicleId && uso.entregaEstatus === 'En uso' && !uso.fotosDevolucion ? uso : null;
  }

  /** Devolución directa al inventario. Mismas reglas, y el km final no retrocede. */
  async returnAsset(id: number, actor: ActorVehiculo, entrada: EntradaCaptura, companyId?: number | null) {
    const asset = await this.getAsset(id, companyId);
    if (!asset) throw new BadRequestException('Vehículo no encontrado');
    const uso = await this.usoAbiertoDeUnidad(id, companyId);
    const esSuyo = asset.assignedToId === actor.id || Boolean(uso && this.puedeRegistrar(uso, { id: actor.id }));
    if (!actor.isSuperAdmin && !actor.puedeInventario && !actor.puedeRevisar && !esSuyo) {
      throw new ForbiddenException('Solo el asignatario puede devolver el vehículo');
    }
    if (asset.estatus !== 'Asignado') throw new BadRequestException('El vehículo no está asignado');

    const salida = asset.salidaFotos as { odometroKm?: number } | null;
    const etiqueta =
      (asset as { alias?: string; placa?: string }).alias || (asset as { placa?: string }).placa || asset.nombre || `inventario #${id}`;
    const datos = await this.revisarCaptura(
      { ...entrada, odometroInicio: uso?.odometroInicio ?? salida?.odometroKm ?? null } as EntradaCaptura,
      'devolucion',
      { companyId, relatedId: uso?.id ?? id, etiqueta },
    );
    const alertas = this.alertasDevolucion(uso ?? { odometroInicio: salida?.odometroKm ?? null, kmEsperados: null }, datos);

    const minutosUso = asset.assignedAt
      ? Math.round((Date.now() - new Date(asset.assignedAt).getTime()) / 60000)
      : null;

    const actualizado = await this.prisma['vehicleAsset'].update({
      where: { id },
      data: {
        estatus: 'Disponible',
        assignedToId: null,
        assignedAt: null,
        devolucionFotos: this.payloadFotos(datos),
        tiempoUsoMinutos: minutosUso,
      },
    });

    if (uso) {
      await this.prisma['vehicleControl'].update({ where: { id: uso.id }, data: this.datosDevolucion(uso, datos, alertas) });
      await this.despuesDeDevolver(uso.id, companyId ?? asset.companyId, etiqueta, alertas);
    } else {
      await this.avisarAlertasKm(companyId ?? asset.companyId, etiqueta, alertas, id);
    }
    return actualizado;
  }

  // ─── Captura guiada: pasos, firmas y bloque «Vehículo» de la actividad ─────

  /** Lo que la web y las apps necesitan para guiar la captura: pasos, vistas y el último km de la unidad. */
  async capturaGuiada(vehicleId: number | null, companyId?: number | null) {
    const ultimo = vehicleId ? await this.ultimoKmDeUnidad(vehicleId, companyId) : null;
    return {
      exigida: await capturaGuiadaPrendida(this.prisma),
      pasos: PASOS_CAPTURA,
      vistasVuelta: VISTAS_VUELTA,
      fotos: FOTOS_GUIADAS,
      campoVideo: CAMPO_VIDEO_VUELTA,
      duracionVueltaSeg: { min: DURACION_VUELTA_SEG.min, max: DURACION_VUELTA_SEG.max },
      ultimoRegistro: ultimo ? { km: ultimo.km, en: ultimo.at, origen: ultimo.origen } : null,
    };
  }

  /**
   * Firma en pantalla de quien entrega y de quien recibe, cuando Liz interviene en persona. Las dos
   * se toman en el mismo teléfono; cada una guarda el nombre, quién la registró y cuándo.
   */
  async registrarFirma(
    id: number,
    actor: ActorVehiculo,
    d: { momento: unknown; rol: unknown; url: string; nombre?: unknown; userId?: unknown },
    companyId?: number | null,
  ) {
    const momento = String(d.momento ?? '');
    const rol = String(d.rol ?? '');
    if (momento !== 'salida' && momento !== 'devolucion') throw new BadRequestException('momento debe ser «salida» o «devolucion»');
    if (rol !== 'entrega' && rol !== 'recibe') throw new BadRequestException('rol debe ser «entrega» o «recibe»');
    const nombre = String(d.nombre ?? '').trim().slice(0, 120);
    if (!nombre) throw new BadRequestException('Escribe el nombre de quien firma');

    const record = await this.findOne(id, companyId);
    if (!this.puedeRegistrar(record, actor)) throw new ForbiddenException('No puedes firmar este uso de vehículo');
    if (record.estatusAprobacion !== 'Aprobado') throw new BadRequestException('La solicitud debe estar aprobada');
    if (momento === 'devolucion' && !record.fotosSalida) throw new BadRequestException('Primero registra la salida del vehículo');

    // Solo se liga a una persona del uso; cualquier otro id se ignora.
    const posible = Number(d.userId);
    const conocidos = [record.solicitanteId, record.encargadoId, actor.id].filter((v) => typeof v === 'number');
    const userId = conocidos.includes(posible) ? posible : null;

    const firmas = objeto(record.firmas);
    const delMomento = objeto(firmas[momento]);
    delMomento[rol] = { url: d.url, nombre, userId, firmadoEn: new Date().toISOString(), registradoPorId: actor.id };
    return this.prisma['vehicleControl'].update({
      where: { id },
      data: { firmas: { ...firmas, [momento]: delMomento } },
      select: { id: true, firmas: true },
    });
  }

  /** Lo que el libro de costos ya cargó a cada uso (`VEHICULO:<id>`). Solo para quien ve costos. */
  private async costoViajes(companyId: number | null | undefined, ids: number[]): Promise<Map<number, number>> {
    const mapa = new Map<number, number>();
    if (!ids.length || !companyId) return mapa;
    try {
      const filas = await this.prisma.costoMovimiento.findMany({
        where: { companyId, origen: { in: ids.map((id) => `VEHICULO:${id}`) } },
        select: { origen: true, importe: true },
      });
      for (const f of filas) {
        const id = Number(String(f.origen).split(':')[1]);
        mapa.set(id, dinero((mapa.get(id) ?? 0) + dinero(f.importe)));
      }
    } catch (e) {
      this.logger.warn(`No se pudo leer el costo de los viajes: ${String((e as Error)?.message ?? e)}`);
    }
    return mapa;
  }

  /**
   * Bloque «Vehículo» de una actividad: unidad, encargado, km, fotos, gasolina y costo. Lo ve quien
   * gestiona vehículos y quien está en la actividad (responsable, equipo, quien la creó, su jefe o quien
   * trae la unidad). Los montos, solo Liz y mandos; el costo del viaje, solo quien ve costos.
   */
  async porActividad(
    activityId: number,
    usuario: ActorCostos & { id: number; esGestor?: boolean },
    companyId?: number | null,
  ) {
    const where = companyWhere(companyId ?? null);
    const actividad = await this.prisma.activity.findFirst({
      where: { id: activityId, ...where },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        estatus: true,
        responsableId: true,
        creadoPorId: true,
        responsable: { select: { managerId: true } },
        assignees: { select: { userId: true } },
      },
    });
    if (!actividad) throw new NotFoundException('Actividad no encontrada');

    const usos = await this.prisma['vehicleControl'].findMany({
      where: { actividadId: activityId, ...where },
      orderBy: { fechaSolicitud: 'desc' },
      include: {
        vehiculo: { select: { id: true, nombre: true, placas: true } },
        solicitante: { select: { id: true, nombre: true } },
        encargado: { select: { id: true, nombre: true } },
        hallazgos: { select: { estatus: true } },
        incidencias: {
          select: { id: true, tipo: true, estatus: true, descripcion: true, quienPaga: true, costoEstimado: true, costoReal: true },
        },
      },
    });

    const esGestor = Boolean(usuario.esGestor || usuario.isSuperAdmin);
    const involucrado =
      actividad.responsableId === usuario.id ||
      actividad.creadoPorId === usuario.id ||
      actividad.responsable?.managerId === usuario.id ||
      actividad.assignees.some((a: { userId: number }) => a.userId === usuario.id) ||
      usos.some((u: any) => u.solicitanteId === usuario.id || u.encargadoId === usuario.id);
    if (!esGestor && !involucrado) throw new ForbiddenException('No puedes ver los vehículos de esta actividad');

    const veMontos = esGestor || veTodoCostos(usuario);
    const costos = veTodoCostos(usuario) ? await this.costoViajes(companyId ?? null, usos.map((u: any) => u.id)) : null;

    return {
      actividad: { id: actividad.id, folio: actividad.anNumber, titulo: actividad.titulo, estatus: actividad.estatus },
      usos: usos.map((u: any) => {
        const salida = u.fotosSalida
          ? {
              en: registradoEn(u.fotosSalida) ?? u.fechaInicio ?? null,
              km: u.odometroInicio ?? null,
              combustiblePct: u.combustibleInicioPct ?? null,
              fotos: this.fotosDe(u.fotosSalida),
              videoUrl: u.videoSalidaUrl ?? null,
            }
          : null;
        const devolucion = u.fotosDevolucion
          ? {
              en: registradoEn(u.fotosDevolucion) ?? u.fechaFin ?? null,
              km: u.odometroFin ?? null,
              combustiblePct: u.combustibleFinPct ?? null,
              fotos: this.fotosDe(u.fotosDevolucion),
              videoUrl: u.videoDevolucionUrl ?? null,
            }
          : null;
        const incidencias = (u.incidencias ?? []).map((i: any) => ({
          id: i.id,
          tipo: i.tipo,
          estatus: i.estatus,
          descripcion: i.descripcion,
          quienPaga: i.quienPaga,
          ...(veMontos ? { costo: i.costoReal != null ? dinero(i.costoReal) : i.costoEstimado != null ? dinero(i.costoEstimado) : null } : {}),
        }));
        return {
          id: u.id,
          estatus: u.entregaEstatus,
          aprobacion: u.estatusAprobacion,
          capturaVersion: u.capturaVersion ?? 1,
          unidad: u.vehiculo
            ? { id: u.vehiculo.id, nombre: u.vehiculo.nombre, placas: u.vehiculo.placas ?? null }
            : { id: null, nombre: u.nombreVehiculo ?? 'Vehículo', placas: u.placasVehiculo ?? null },
          solicitante: u.solicitante ? { id: u.solicitante.id, nombre: u.solicitante.nombre } : null,
          encargado: u.encargado
            ? { id: u.encargado.id, nombre: u.encargado.nombre }
            : u.solicitante
              ? { id: u.solicitante.id, nombre: u.solicitante.nombre }
              : null,
          regresoPrevisto: u.fechaFinAprobada ?? u.fechaFinSolicitada ?? null,
          salida,
          devolucion,
          kmRecorridos: u.odometroInicio != null && u.odometroFin != null ? u.odometroFin - u.odometroInicio : null,
          kmEsperados: u.kmEsperados ?? null,
          alertasKm: arreglo(u.alertasKm),
          firmas: u.firmas ?? null,
          danos: {
            estatus: u.analisisDanosEstatus ?? null,
            propuestos: (u.hallazgos ?? []).filter((h: any) => h.estatus === 'PROPUESTO').length,
            confirmados: (u.hallazgos ?? []).filter((h: any) => h.estatus === 'CONFIRMADO').length,
          },
          incidencias,
          costoIncidencias: veMontos ? dinero(incidencias.reduce((s: number, i: any) => s + (i.costo ?? 0), 0)) : null,
          costoViaje: costos ? (costos.get(u.id) ?? null) : null,
        };
      }),
    };
  }

  async getUsageAnalytics() {
    const rows = await this.prisma['vehicleControl'].findMany({
      where: {
        estatusAprobacion: 'Aprobado',
        odometroInicio: { not: null },
        odometroFin: { not: null },
      },
      include: {
        solicitante: { select: { id: true, nombre: true } },
        actividad: { select: { id: true, anNumber: true } },
      },
    });

    const byUser = new Map<number, {
      userId: number;
      nombre: string;
      kmTotal: number;
      fuelDeltaTotal: number;
      trips: number;
      kmPerLiterSamples: number[];
    }>();

    for (const row of rows) {
      const km = (row.odometroFin ?? 0) - (row.odometroInicio ?? 0);
      const fuelStart = row.combustibleInicioPct ?? 0;
      const fuelEnd = row.combustibleFinPct ?? 0;
      const fuelUsedPct = Math.max(0, fuelStart - fuelEnd);
      const kmPerLiter = fuelUsedPct > 0 ? km / (fuelUsedPct / 100) : null;

      const uid = row.solicitanteId;
      const cur = byUser.get(uid) ?? {
        userId: uid,
        nombre: row.solicitante?.nombre ?? '—',
        kmTotal: 0,
        fuelDeltaTotal: 0,
        trips: 0,
        kmPerLiterSamples: [],
      };
      cur.kmTotal += km;
      cur.fuelDeltaTotal += fuelUsedPct;
      cur.trips += 1;
      if (kmPerLiter != null && Number.isFinite(kmPerLiter)) cur.kmPerLiterSamples.push(kmPerLiter);
      byUser.set(uid, cur);
    }

    return {
      users: [...byUser.values()].map((u) => ({
        ...u,
        kmPromedioPorViaje: u.trips ? Math.round(u.kmTotal / u.trips) : 0,
        kmPorLitroPromedio: u.kmPerLiterSamples.length
          ? Math.round(u.kmPerLiterSamples.reduce((a, b) => a + b, 0) / u.kmPerLiterSamples.length)
          : null,
      })),
      records: rows.map((r) => ({
        id: r.id,
        solicitante: r.solicitante?.nombre,
        actividad: r.actividad?.anNumber,
        kmRecorridos: (r.odometroFin ?? 0) - (r.odometroInicio ?? 0),
        combustibleInicioPct: r.combustibleInicioPct,
        combustibleFinPct: r.combustibleFinPct,
        fotosSalida: r.fotosSalida,
        fotosDevolucion: r.fotosDevolucion,
      })),
    };
  }

  async notifyExpiringAssignments(withinHours = 24) {
    const deadline = new Date(Date.now() + withinHours * 3600_000);
    const expiring = await this.prisma['vehicleControl'].findMany({
      where: {
        estatusAprobacion: 'Aprobado',
        entregaEstatus: 'En uso',
        fechaFinAprobada: { lte: deadline, gte: new Date() },
      },
      include: { solicitante: { select: { id: true, nombre: true } } },
    });

    for (const row of expiring) {
      if (row.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleExpiring(
          row.solicitanteId,
          row.id,
          row.solicitante?.nombre ?? 'Usuario',
          row.nombreVehiculo ?? 'Vehículo',
          row.fechaFinAprobada,
        );
      }
    }
    return { notified: expiring.length };
  }

  // ─── Pantallas de Core: flotilla, ficha e «mis vehículos» ─────────────────

  private fotosDe(payload: unknown): FotoChecklist[] {
    if (!payload || typeof payload !== 'object') return [];
    const fotos = (payload as { fotos?: unknown }).fotos;
    if (!Array.isArray(fotos)) return [];
    return fotos.filter(
      (f): f is FotoChecklist => Boolean(f) && typeof f === 'object' && typeof (f as FotoChecklist).url === 'string',
    );
  }

  private numeroDe(payload: unknown, campo: string): number | null {
    if (!payload || typeof payload !== 'object') return null;
    const valor = (payload as Record<string, unknown>)[campo];
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
  }

  /** La asignación viva de un vehículo: la solicitud en uso manda sobre el inventario. */
  private controlEnUso(controles: any[]): any | null {
    return (
      controles.find((c) => c.entregaEstatus === 'En uso' && c.estatusAprobacion === 'Aprobado') ?? null
    );
  }

  private filaFlotilla(asset: any) {
    const controles: any[] = asset.controles ?? [];
    const enUso = this.controlEnUso(controles);
    const ultimoCerrado = controles.find((c) => c.odometroFin != null);

    const conductor = enUso?.solicitante
      ? { id: enUso.solicitante.id, nombre: enUso.solicitante.nombre }
      : asset.assignedTo
        ? { id: asset.assignedTo.id, nombre: asset.assignedTo.nombre }
        : null;

    const asignado = asset.estatus === 'Asignado' || Boolean(enUso);

    return {
      id: asset.id,
      nombre: asset.nombre,
      placas: asset.placas ?? null,
      estatus: asset.estatus,
      activo: asset.activo !== false,
      disponible: asset.activo !== false && !asignado && asset.estatus === 'Disponible',
      conductor,
      desde: (enUso?.fechaInicio ?? asset.assignedAt ?? null) as Date | null,
      proximaDevolucion: (enUso?.fechaFinAprobada ?? enUso?.fechaFinSolicitada ?? null) as Date | null,
      odometroUltimo:
        ultimoCerrado?.odometroFin ??
        enUso?.odometroInicio ??
        this.numeroDe(asset.devolucionFotos, 'odometroKm') ??
        this.numeroDe(asset.salidaFotos, 'odometroKm') ??
        null,
      combustibleUltimoPct:
        ultimoCerrado?.combustibleFinPct ??
        enUso?.combustibleInicioPct ??
        this.numeroDe(asset.devolucionFotos, 'combustiblePct') ??
        this.numeroDe(asset.salidaFotos, 'combustiblePct') ??
        null,
      gpsProveedor: asset.gpsProveedor ?? null,
      tieneRastreador: Boolean(asset.gpsProveedor && asset.gpsDispositivoId),
    };
  }

  private incluirParaFlotilla() {
    return {
      assignedTo: { select: { id: true, nombre: true } },
      controles: {
        orderBy: { fechaSolicitud: 'desc' as const },
        take: 25,
        include: {
          solicitante: { select: { id: true, nombre: true } },
          actividad: { select: { id: true, anNumber: true } },
        },
      },
    };
  }

  /** Lista de la flotilla: quién trae cada unidad y cuándo la regresa. */
  async listarFlotilla(companyId?: number | null) {
    const assets = await this.prisma['vehicleAsset'].findMany({
      where: companyWhere(companyId ?? null),
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
      include: this.incluirParaFlotilla(),
    });
    return { vehiculos: assets.map((a: any) => this.filaFlotilla(a)) };
  }

  /** Ficha de un vehículo con el historial de asignaciones y sus fotos. */
  async detalleFlotilla(id: number, companyId?: number | null) {
    const asset = await this.prisma['vehicleAsset'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: this.incluirParaFlotilla(),
    });
    assertCompanyAccess(asset, companyId, 'Vehículo');

    const historial = (asset!.controles ?? []).map((c: any) => ({
      id: c.id,
      origen: 'solicitud' as const,
      conductor: c.solicitante ? { id: c.solicitante.id, nombre: c.solicitante.nombre } : null,
      actividad: c.actividad?.anNumber ?? null,
      inicio: c.fechaInicio ?? c.fechaInicioAprobada ?? null,
      fin: c.fechaFin ?? c.fechaFinAprobada ?? null,
      odometroInicio: c.odometroInicio ?? null,
      odometroFin: c.odometroFin ?? null,
      kmRecorridos:
        c.odometroInicio != null && c.odometroFin != null ? c.odometroFin - c.odometroInicio : null,
      combustibleInicioPct: c.combustibleInicioPct ?? null,
      combustibleFinPct: c.combustibleFinPct ?? null,
      fotosSalida: this.fotosDe(c.fotosSalida),
      fotosDevolucion: this.fotosDe(c.fotosDevolucion),
      estatus: c.entregaEstatus ?? c.estatusAprobacion,
    }));

    // Una salida directa de inventario no deja VehicleControl: se muestra aparte
    // para que la ficha no mienta sobre quién trae el coche.
    if (asset!.salidaFotos) {
      historial.unshift({
        id: -asset!.id,
        origen: 'inventario' as any,
        conductor: asset!.assignedTo
          ? { id: asset!.assignedTo.id, nombre: asset!.assignedTo.nombre }
          : null,
        actividad: null,
        inicio: asset!.assignedAt ?? null,
        fin: asset!.devolucionFotos ? (asset!.updatedAt ?? null) : null,
        odometroInicio: this.numeroDe(asset!.salidaFotos, 'odometroKm'),
        odometroFin: this.numeroDe(asset!.devolucionFotos, 'odometroKm'),
        kmRecorridos: (() => {
          const ini = this.numeroDe(asset!.salidaFotos, 'odometroKm');
          const fin = this.numeroDe(asset!.devolucionFotos, 'odometroKm');
          return ini != null && fin != null ? fin - ini : null;
        })(),
        combustibleInicioPct: this.numeroDe(asset!.salidaFotos, 'combustiblePct'),
        combustibleFinPct: this.numeroDe(asset!.devolucionFotos, 'combustiblePct'),
        fotosSalida: this.fotosDe(asset!.salidaFotos),
        fotosDevolucion: this.fotosDe(asset!.devolucionFotos),
        estatus: asset!.devolucionFotos ? 'Devuelto' : 'En uso',
      });
    }

    return { vehiculo: this.filaFlotilla(asset), historial };
  }

  /** Lo que ve una persona en «Mis vehículos» y en la app: una sola llamada. */
  async misVehiculos(userId: number, companyId?: number | null) {
    const where = companyWhere(companyId ?? null);

    const [controles, assets] = await Promise.all([
      this.prisma['vehicleControl'].findMany({
        where: { solicitanteId: userId, ...where },
        orderBy: { fechaSolicitud: 'desc' },
        take: 30,
        include: {
          vehiculo: { select: { id: true, nombre: true, placas: true } },
          // A qué trabajo se carga el viaje: la app lo enseña al registrar el regreso.
          actividad: { select: { id: true, anNumber: true, titulo: true, project: { select: { title: true } } } },
        },
      }),
      this.prisma['vehicleAsset'].findMany({
        where,
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        include: this.incluirParaFlotilla(),
      }),
    ]);

    const flotilla = assets.map((a: any) => this.filaFlotilla(a));

    // Una asignación viva es: una solicitud aprobada sin devolver, o un vehículo
    // del inventario que salió a nombre de esta persona.
    const control = controles.find(
      (c: any) => c.estatusAprobacion === 'Aprobado' && c.entregaEstatus !== 'Devuelto',
    );
    const assetPropio = assets.find((a: any) => a.assignedToId === userId && a.estatus === 'Asignado');

    let activa: Record<string, unknown> | null = null;
    if (control) {
      activa = {
        id: control.id,
        origen: 'solicitud',
        vehiculo: control.vehiculo
          ? { id: control.vehiculo.id, nombre: control.vehiculo.nombre, placas: control.vehiculo.placas ?? null }
          : { id: 0, nombre: control.nombreVehiculo ?? 'Vehículo', placas: control.placasVehiculo ?? null },
        actividad: control.actividad
          ? {
              id: control.actividad.id,
              folio: control.actividad.anNumber ?? null,
              titulo: control.actividad.titulo ?? null,
              proyecto: control.actividad.project?.title ?? null,
            }
          : null,
        inicio: control.fechaInicio ?? control.fechaInicioAprobada ?? null,
        fin: control.fechaFin ?? control.fechaFinAprobada ?? null,
        odometroInicio: control.odometroInicio ?? null,
        combustibleInicioPct: control.combustibleInicioPct ?? null,
        requiereSalida: !control.fotosSalida,
        requiereDevolucion: Boolean(control.fotosSalida) && !control.fotosDevolucion,
      };
    } else if (assetPropio) {
      activa = {
        id: assetPropio.id,
        origen: 'inventario',
        vehiculo: { id: assetPropio.id, nombre: assetPropio.nombre, placas: assetPropio.placas ?? null },
        // La salida directa de inventario no se liga a ninguna actividad.
        actividad: null,
        inicio: assetPropio.assignedAt ?? null,
        fin: null,
        odometroInicio: this.numeroDe(assetPropio.salidaFotos, 'odometroKm'),
        combustibleInicioPct: this.numeroDe(assetPropio.salidaFotos, 'combustiblePct'),
        requiereSalida: false,
        requiereDevolucion: true,
      };
    }

    return {
      activa,
      solicitudes: controles.map((c: any) => ({
        id: c.id,
        nombreVehiculo: c.vehiculo?.nombre ?? c.nombreVehiculo ?? null,
        placasVehiculo: c.vehiculo?.placas ?? c.placasVehiculo ?? null,
        estatusAprobacion: c.estatusAprobacion,
        entregaEstatus: c.entregaEstatus,
        fechaInicioSolicitada: c.fechaInicioSolicitada ?? null,
        fechaFinSolicitada: c.fechaFinSolicitada ?? null,
      })),
      disponibles: flotilla.filter((v) => v.disponible),
    };
  }

  async remove(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma['vehicleControl'].delete({ where: { id } });
  }
}
