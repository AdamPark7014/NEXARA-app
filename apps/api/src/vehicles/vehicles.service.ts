import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
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
  type FotoChecklist,
} from './checklist-entrega.js';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  private resolveActorRole(actor: any): RoleKey | null {
    if (actor?.isSuperAdmin) return ROLES.SUPER_ADMIN;
    return actor?.roleKey ?? actor?.role?.orgRoleKey ?? null;
  }

  private controlInclude() {
    return { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true };
  }

  async create(createVehicleDto: any, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const { companyId: _ignored, ...rest } = createVehicleDto ?? {};

    const activity = await this.prisma.activity.findFirst({
      where: { id: rest.actividadId, ...companyWhere(cid) },
      select: { id: true },
    });
    if (!activity) throw new BadRequestException('Actividad no encontrada');

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

    return this.prisma['vehicleControl'].update({
      where: { id },
      data: { approvalStep: nextStep, approvalTrail: trail, estatusAprobacion: 'Pendiente' },
      include: { solicitante: { select: { id: true, nombre: true } } },
    });
  }

  /**
   * El check list de entrega/recepción, idéntico en las cuatro rutas que abren
   * o cierran una asignación. Si falta una foto, el kilometraje o la gasolina,
   * el 400 dice todo lo que falta de una vez.
   */
  private revisarOFallar(entrada: EntradaChecklist): ChecklistNormalizado {
    const revision = revisarChecklist(entrada);
    if (!revision.ok) throw new BadRequestException(mensajeErrores(revision.errores));
    return revision.datos;
  }

  /** Lo que se guarda en `fotosSalida` / `fotosDevolucion`. */
  private payloadFotos(datos: ChecklistNormalizado) {
    return {
      fotos: datos.fotos,
      fotoTableroUrl: datos.fotoTableroUrl,
      odometroKm: datos.odometroKm,
      combustiblePct: datos.combustiblePct,
      registradoEn: new Date().toISOString(),
    };
  }

  /** `fotosMeta` guarda el cuándo y el dónde de cada foto, de los dos momentos. */
  private mezclarMeta(
    previo: unknown,
    momento: 'salida' | 'devolucion',
    fotos: ChecklistNormalizado['fotos'],
  ): any {
    const base =
      previo && typeof previo === 'object' && !Array.isArray(previo)
        ? (previo as Record<string, unknown>)
        : {};
    return { ...base, [momento]: fotos };
  }

  async startUse(id: number, userId: number, entrada: EntradaChecklist, companyId?: number | null) {
    const record = await this.findOne(id, companyId);
    if (record.estatusAprobacion !== 'Aprobado') throw new BadRequestException('La solicitud debe estar aprobada');
    if (record.solicitanteId !== userId) throw new ForbiddenException('Solo el solicitante puede registrar la salida');
    if (record.fotosSalida) throw new BadRequestException('Ya registraste la salida del vehículo');

    const datos = this.revisarOFallar(entrada);

    return this.prisma['vehicleControl'].update({
      where: { id },
      data: {
        fotosSalida: this.payloadFotos(datos),
        fotosMeta: this.mezclarMeta(record.fotosMeta, 'salida', datos.fotos),
        fotoTableroSalidaUrl: datos.fotoTableroUrl,
        odometroInicio: datos.odometroKm,
        combustibleInicioPct: datos.combustiblePct,
        entregaEstatus: 'En uso',
        fechaInicio: record.fechaInicioAprobada ?? new Date(),
      },
    });
  }

  async endUse(id: number, userId: number, entrada: EntradaChecklist, companyId?: number | null) {
    const record = await this.findOne(id, companyId);
    if (record.solicitanteId !== userId) throw new ForbiddenException('Solo el solicitante puede registrar la devolución');
    if (!record.fotosSalida) throw new BadRequestException('Primero registra la salida del vehículo');

    const datos = this.revisarOFallar({ ...entrada, odometroInicio: record.odometroInicio });

    return this.prisma['vehicleControl'].update({
      where: { id },
      data: {
        fotosDevolucion: this.payloadFotos(datos),
        fotosMeta: this.mezclarMeta(record.fotosMeta, 'devolucion', datos.fotos),
        fotoTableroDevolucionUrl: datos.fotoTableroUrl,
        odometroFin: datos.odometroKm,
        combustibleFinPct: datos.combustiblePct,
        entregaEstatus: 'Devuelto',
        fechaFin: new Date(),
      },
    });
  }

  /**
   * Salida directa desde el inventario, sin solicitud previa. Hasta ahora esta
   * ruta aceptaba de 0 a 10 fotos sueltas y ni kilometraje ni gasolina: era la
   * puerta de atrás del check list. Ahora pide exactamente lo mismo.
   */
  async checkoutAsset(id: number, userId: number, entrada: EntradaChecklist, companyId?: number | null) {
    const asset = await this.getAsset(id, companyId);
    if (!asset) throw new BadRequestException('Vehículo no encontrado');
    if (asset.estatus === 'Asignado') throw new BadRequestException('El vehículo ya está asignado');
    if (asset.activo === false) throw new BadRequestException('El vehículo está dado de baja');

    const datos = this.revisarOFallar(entrada);

    return this.prisma['vehicleAsset'].update({
      where: { id },
      data: {
        estatus: 'Asignado',
        assignedToId: userId,
        assignedAt: new Date(),
        salidaFotos: this.payloadFotos(datos),
        devolucionFotos: undefined,
        tiempoUsoMinutos: null,
      },
    });
  }

  /** Devolución directa al inventario. Mismas reglas, y el km final no retrocede. */
  async returnAsset(
    id: number,
    actor: { id: number; isSuperAdmin?: boolean; puedeInventario?: boolean },
    entrada: EntradaChecklist,
    companyId?: number | null,
  ) {
    const asset = await this.getAsset(id, companyId);
    if (!asset) throw new BadRequestException('Vehículo no encontrado');
    if (!actor.isSuperAdmin && !actor.puedeInventario && asset.assignedToId !== actor.id) {
      throw new ForbiddenException('Solo el asignatario puede devolver el vehículo');
    }
    if (asset.estatus !== 'Asignado') throw new BadRequestException('El vehículo no está asignado');

    const salida = asset.salidaFotos as { odometroKm?: number } | null;
    const datos = this.revisarOFallar({ ...entrada, odometroInicio: salida?.odometroKm ?? null });

    const minutosUso = asset.assignedAt
      ? Math.round((Date.now() - new Date(asset.assignedAt).getTime()) / 60000)
      : null;

    return this.prisma['vehicleAsset'].update({
      where: { id },
      data: {
        estatus: 'Disponible',
        assignedToId: null,
        assignedAt: null,
        devolucionFotos: this.payloadFotos(datos),
        tiempoUsoMinutos: minutosUso,
      },
    });
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
        include: { vehiculo: { select: { id: true, nombre: true, placas: true } } },
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
