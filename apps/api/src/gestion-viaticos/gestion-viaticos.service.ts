import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type NotificationType } from '@prisma/client';
import { esDestinatarioFinanzas } from '../common/finance-notification-recipient.js';
import { assertRefsBelongToCompany } from '../common/tenant/assert-refs.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LecturaVehiculoService } from '../costos/vehiculos/lectura-vehiculo.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { ROLES } from '../common/rbac/roles.v2.js';
import {
  diaMexico,
  esContadora,
  esGestora,
  normalizarTipo,
  ordenarBandeja,
  plazoFacturacionPorOmision,
  sumaTicketsParaCosto,
  venceHoy,
  type FilaBandeja,
  type TipoTicket,
} from './gestion-viaticos.helpers.js';
import { portalDeGasolinera } from '../accounting/buzon-sat/portales-gasolina.js';

type Sesion = {
  id?: number | string | null;
  roleKey?: string | null;
  email?: string | null;
  puesto?: string | null;
  isSuperAdmin?: boolean;
  isClient?: boolean;
  isBranchUser?: boolean;
  permissions?: string[];
};

@Injectable()
export class GestionViaticosService {
  private readonly logger = new Logger(GestionViaticosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly lectura: LecturaVehiculoService,
  ) {}

  private async actor(sesion: Sesion, companyId: number) {
    requireCompanyId(companyId);
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0 || sesion?.isClient || sesion?.isBranchUser) {
      throw new ForbiddenException('Solo el personal interno puede usar esta mesa.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, roleKey: true, puesto: true, nombre: true, isActive: true },
    });
    if (!user || user.isActive === false) throw new ForbiddenException('Tu usuario no está activo.');
    return {
      ...user,
      isSuperAdmin: Boolean(sesion.isSuperAdmin),
      permissions: sesion.permissions ?? [],
    };
  }

  private num(v: unknown): number {
    if (typeof v === 'object' && v && 'toNumber' in (v as object)) {
      return (v as { toNumber: () => number }).toNumber();
    }
    return Number(v) || 0;
  }

  private async idsPorRol(companyId: number, roleKey: string): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: { roleKey, isActive: true, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, puesto: true },
    }).catch((error) => {
      this.logger.warn(`No se pudieron buscar destinatarios de viáticos: ${String(error)}`);
      return [];
    });
    return rows.filter((r) => this.cuentaReal(r)).map((r) => r.id);
  }

  private async idsContadora(companyId: number): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        companyMemberships: { some: { companyId } },
        OR: [
          { roleKey: ROLES.CONTABILIDAD },
          { roleKey: ROLES.ADMINISTRATIVO, email: { startsWith: 'finanzas@' } },
          { roleKey: ROLES.ADMINISTRATIVO, puesto: { contains: 'contadora', mode: 'insensitive' } },
          { roleKey: ROLES.ADMINISTRATIVO, puesto: { contains: 'contable', mode: 'insensitive' } },
          { roleKey: ROLES.ADMINISTRATIVO, puesto: { contains: 'finanza', mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, puesto: true },
    }).catch((error) => {
      this.logger.warn(`No se pudieron buscar destinatarios contables: ${String(error)}`);
      return [];
    });
    return rows.filter((r) => this.cuentaReal(r)).map((r) => r.id);
  }

  private cuentaReal(user: { email?: string | null; puesto?: string | null }) {
    return esDestinatarioFinanzas(user);
  }

  private async avisar(
    userIds: number[],
    payload: {
      type: NotificationType;
      title: string;
      message: string;
      triggerUserId?: number;
      relatedEntityId: number;
      companyId: number;
      relatedUrl?: string;
      priority?: 'low' | 'normal' | 'high';
    },
  ) {
    const destinatarios = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] }, isActive: true,
        companyMemberships: { some: { companyId: payload.companyId } } },
      select: { id: true, email: true, puesto: true },
    }).catch((error) => {
      this.logger.warn(`No se pudieron validar destinatarios del aviso: ${String(error)}`);
      return [];
    });
    for (const userId of destinatarios.filter((u) => this.cuentaReal(u)).map((u) => u.id)) {
      await this.notifications
        .createNotification({
          userId,
          type: payload.type,
          category: 'finance',
          title: payload.title,
          message: payload.message,
          triggerUserId: payload.triggerUserId,
          relatedEntityId: payload.relatedEntityId,
          entityType: 'ViaticoTicket',
          relatedUrl: payload.relatedUrl ?? '/erp/gestion-viaticos',
          priority: payload.priority ?? 'normal',
          companyId: payload.companyId,
          dedupeSeconds: payload.type === 'VIATICO_TICKET_VENCE_HOY' ? 86400 : 120,
          excludeActor: false,
        })
        .catch((error) =>
          this.logger.warn(`Aviso ${payload.type} falló para user=${userId}: ${String(error?.message ?? error)}`),
        );
    }
  }

  /** Recalcula montoComprobado del viático con la suma de tickets que ya cuentan. */
  async sincronizarCostoViatico(viaticoId: number, companyId: number, actorId: number, db: Prisma.TransactionClient = this.prisma) {
    const tickets = await db.viaticoTicket.findMany({
      where: { viaticoId, ...companyWhere(companyId) },
      select: { estado: true, monto: true },
    });
    const suma = sumaTicketsParaCosto(tickets);
    await db.viatico.updateMany({
      where: { id: viaticoId, ...companyWhere(companyId) },
      data: {
        montoComprobado: suma > 0 ? suma : null,
        fechaComprobacion: suma > 0 ? new Date() : null,
        comprobadoPorId: suma > 0 ? actorId : null,
      },
    });
    return suma;
  }

  /** El bloqueo del padre serializa también aprobaciones de tickets distintos del mismo viático. */
  private async cambiarEstado(id: number, viaticoId: number, companyId: number, actorId: number,
    origen: string, destino: string, data: Prisma.ViaticoTicketUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM viaticos WHERE id = ${viaticoId} AND "companyId" = ${companyId} FOR UPDATE`;
      const actual = await tx.viaticoTicket.findFirst({ where: { id, companyId } });
      if (!actual) throw new NotFoundException('No encontramos ese ticket.');
      if (actual.estado === destino) return { ticket: actual, cambio: false };
      if (actual.estado !== origen) throw new BadRequestException('El ticket ya cambió de estado. Actualiza la lista.');
      const ticket = await tx.viaticoTicket.update({ where: { id, companyId }, data });
      if (destino !== 'RECHAZADO') await this.sincronizarCostoViatico(viaticoId, companyId, actorId, tx);
      return { ticket, cambio: true };
    });
  }

  async bandeja(sesion: Sesion, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const actor = await this.actor(sesion, companyId);
    if (!esGestora(actor.roleKey, actor.isSuperAdmin) && !esContadora(actor)) {
      throw new ForbiddenException('Solo la gestora de viáticos, dirección o la contadora ven esta bandeja.');
    }

    if (!esGestora(actor.roleKey, actor.isSuperAdmin)) {
      const pendientes = await this.porFacturar(sesion, companyId);
      return { hoy: pendientes.hoy, items: pendientes.items.map((t) => ({
        clave: `ticket_hoy:${t.id}`, urgencia: 'ticket_hoy' as const,
        titulo: 'Ticket por facturar', resumen: `$${t.monto.toFixed(2)}`,
        accion: 'Facturar', href: '/erp/gestion-viaticos?vista=por-facturar', entidadId: t.id,
        venceHoy: t.venceHoy,
      })), conteo: { total: pendientes.items.length }, iaTicketsDisponible: false };
    }

    const hoy = diaMexico(new Date());
    const filas: FilaBandeja[] = [];

    const ticketsHoy = await this.prisma.viaticoTicket.findMany({
      where: {
        ...companyWhere(companyId),
        estado: 'APROBADO',
        puedeFacturar: true,
        fechaLimiteFacturacion: { equals: new Date(`${hoy}T00:00:00.000Z`) },
      },
      include: {
        viatico: {
          select: {
            id: true,
            motivo: true,
            User: { select: { nombre: true } },
          },
        },
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const t of ticketsHoy) {
      filas.push({
        clave: `ticket_hoy:${t.id}`,
        urgencia: 'ticket_hoy',
        titulo: `Ticket por facturar hoy · ${t.tipo.toLowerCase()}`,
        resumen: `${t.viatico.User?.nombre ?? 'Técnico'} · $${this.num(t.monto).toFixed(2)} · ${t.estacionComercio || 'sin comercio'}`,
        accion: 'Facturar o marcar no facturable',
        href: '/erp/gestion-viaticos?vista=por-facturar',
        entidadId: t.id,
        venceHoy: true,
        monto: this.num(t.monto),
        createdAt: t.createdAt.toISOString(),
      });
    }

    // Tickets pendientes de Liz
    const ticketsPend = await this.prisma.viaticoTicket.findMany({
      where: { ...companyWhere(companyId), estado: 'PENDIENTE' },
      include: { viatico: { select: { User: { select: { nombre: true } }, motivo: true } } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const t of ticketsPend) {
      const urgencia = venceHoy(t.fechaLimiteFacturacion, hoy) ? 'ticket_hoy' : 'comprobacion';
      filas.push({
        clave: `ticket_pend:${t.id}`,
        fotoUrl: t.fotoUrl,
        puedeRevisar: true,
        urgencia,
        titulo: `Ticket por revisar · ${t.tipo.toLowerCase()}`,
        resumen: `${t.viatico.User?.nombre ?? 'Técnico'} · $${this.num(t.monto).toFixed(2)}`,
        accion: 'Aprobar o rechazar ticket',
        href: '/erp/gestion-viaticos?vista=tickets',
        entidadId: t.id,
        venceHoy: urgencia === 'ticket_hoy',
        monto: this.num(t.monto),
        createdAt: t.createdAt.toISOString(),
      });
    }

    // Viáticos entregados sin tickets / sin comprobar
    const sinComprobar = await this.prisma.viatico.findMany({
      where: {
        ...companyWhere(companyId),
        deletedAt: null,
        estatus: { in: ['Aprobado', 'Pagado'] },
        montoComprobado: null,
      },
      select: {
        id: true,
        motivo: true,
        montoAprobado: true,
        montoSolicitado: true,
        fechaSolicitud: true,
        User: { select: { nombre: true } },
        tickets: { select: { id: true }, take: 1 },
      },
      take: 80,
      orderBy: { fechaSolicitud: 'asc' },
    });
    for (const v of sinComprobar) {
      filas.push({
        clave: `comp:${v.id}`,
        urgencia: 'comprobacion',
        titulo: v.tickets.length ? 'Viático con tickets aún sin cerrar' : 'Viático entregado sin tickets',
        resumen: `${v.User?.nombre ?? 'Persona'} · $${this.num(v.montoAprobado ?? v.montoSolicitado).toFixed(2)} · ${v.motivo || 'sin motivo'}`,
        accion: 'Pedir tickets o marcar comprobado',
        href: `/erp/finance/viatics?id=${v.id}`,
        entidadId: v.id,
        monto: this.num(v.montoAprobado ?? v.montoSolicitado),
        createdAt: v.fechaSolicitud.toISOString(),
      });
    }

    // Solicitudes de viático pendientes (paso gestora o CEO)
    const viaticosPend = await this.prisma.viatico.findMany({
      where: { ...companyWhere(companyId), deletedAt: null, estatus: 'Pendiente' },
      select: {
        id: true,
        motivo: true,
        montoSolicitado: true,
        approvalStep: true,
        fechaSolicitud: true,
        User: { select: { nombre: true } },
      },
      take: 80,
      orderBy: { fechaSolicitud: 'asc' },
    });
    for (const v of viaticosPend) {
      filas.push({
        clave: `via:${v.id}`,
        puedeRevisar: actor.isSuperAdmin || (v.approvalStep === 0 ? actor.roleKey === 'coord_admin' : actor.roleKey === 'ceo'),
        urgencia: 'viatico',
        titulo: v.approvalStep === 0 ? 'Viático por revisar' : 'Viático por autorizar (CEO)',
        resumen: `${v.User?.nombre ?? 'Persona'} · $${this.num(v.montoSolicitado).toFixed(2)} · ${v.motivo || 'sin motivo'}`,
        accion: v.approvalStep === 0 ? 'Revisar y mandar a Christian' : 'Autorizar o rechazar',
        href: `/erp/finance/viatics?id=${v.id}`,
        entidadId: v.id,
        monto: this.num(v.montoSolicitado),
        createdAt: v.fechaSolicitud.toISOString(),
      });
    }

    // Solicitudes de vehículo pendientes
    const vehPend = await this.prisma.vehicleControl.findMany({
      where: { ...companyWhere(companyId), estatusAprobacion: 'Pendiente' },
      select: {
        id: true,
        motivoUso: true,
        fechaSolicitud: true,
        nombreVehiculo: true,
        solicitante: { select: { nombre: true } },
      },
      take: 60,
      orderBy: { fechaSolicitud: 'asc' },
    });
    for (const v of vehPend) {
      filas.push({
        clave: `veh:${v.id}`,
        urgencia: 'vehiculo',
        titulo: 'Solicitud de vehículo',
        resumen: `${v.solicitante?.nombre ?? 'Persona'} · ${v.nombreVehiculo || 'sin unidad'} · ${v.motivoUso || 'sin motivo'}`,
        accion: 'Asignar vehículo y mandar a autorizar',
        href: `/erp/vehiculos?solicitud=${v.id}`,
        entidadId: v.id,
        createdAt: v.fechaSolicitud.toISOString(),
      });
    }

    // Multas pendientes de aprobación
    const multas = await this.prisma.fine.findMany({
      where: { ...companyWhere(companyId), estatusAprobacion: 'Pendiente' },
      select: {
        id: true,
        razon: true,
        monto: true,
        fechaCreacion: true,
        usuario: { select: { nombre: true } },
      },
      take: 40,
      orderBy: { fechaCreacion: 'asc' },
    });
    for (const m of multas) {
      filas.push({
        clave: `multa:${m.id}`,
        urgencia: 'multa',
        titulo: 'Multa por revisar',
        resumen: `${m.usuario?.nombre ?? 'Persona'} · $${this.num(m.monto).toFixed(2)} · ${m.razon}`,
        accion: 'Revisar multa',
        href: '/erp/hr/fines',
        entidadId: m.id,
        monto: this.num(m.monto),
        createdAt: m.fechaCreacion.toISOString(),
      });
    }

    // Mantenimientos vencidos (próximo servicio por km/fecha ya pasado — usa planes + último servicio)
    const planes = await this.prisma.vehiculoServicioPlan.findMany({
      where: { ...companyWhere(companyId), activo: true },
      select: { id: true, vehicleId: true, concepto: true, cadaKm: true, cadaMeses: true },
      take: 200,
    });
    if (planes.length) {
      const vehicleIds = [...new Set(planes.map((p) => p.vehicleId))];
      const vehiculos = await this.prisma.vehicleAsset.findMany({
        where: { id: { in: vehicleIds }, ...companyWhere(companyId), activo: true },
        select: { id: true, nombre: true, placas: true },
      });
      const porVehiculo = new Map(vehiculos.map((v) => [v.id, v]));
      const servicios = await this.prisma.vehiculoServicio.findMany({
        where: { vehicleId: { in: vehicleIds }, ...companyWhere(companyId) },
        select: { vehicleId: true, fecha: true, odometro: true, planIds: true },
        orderBy: { fecha: 'desc' },
        take: 500,
      });
      const ahora = new Date();
      for (const plan of planes) {
        const veh = porVehiculo.get(plan.vehicleId);
        if (!veh) continue;
        const hechos = servicios.filter((s) => s.vehicleId === plan.vehicleId && s.planIds?.includes(plan.id));
        const ultimo = hechos[0];
        let vencido = false;
        if (plan.cadaMeses && ultimo) {
          const limite = new Date(ultimo.fecha);
          limite.setMonth(limite.getMonth() + plan.cadaMeses);
          if (limite < ahora) vencido = true;
        } else if (plan.cadaMeses && !ultimo) {
          vencido = true;
        }
        if (vencido) {
          filas.push({
            clave: `mant:${plan.id}`,
            urgencia: 'mantenimiento',
            titulo: `Mantenimiento vencido · ${plan.concepto}`,
            resumen: `${veh.nombre}${veh.placas ? ` (${veh.placas})` : ''}`,
            accion: 'Registrar servicio',
            href: `/erp/vehiculos/${veh.id}`,
            entidadId: plan.id,
            createdAt: ultimo?.fecha?.toISOString?.() ?? null,
          });
        }
      }
    }

    // Vehículos sin responsable
    const sinResp = await this.prisma.vehicleAsset.findMany({
      where: { ...companyWhere(companyId), activo: true, assignedToId: null, estatus: { not: 'Baja' } },
      select: { id: true, nombre: true, placas: true, updatedAt: true },
      take: 40,
    });
    for (const v of sinResp) {
      filas.push({
        clave: `sinresp:${v.id}`,
        urgencia: 'sin_responsable',
        titulo: 'Vehículo sin responsable',
        resumen: `${v.nombre}${v.placas ? ` (${v.placas})` : ''}`,
        accion: 'Asignar responsable',
        href: `/erp/vehiculos/${v.id}`,
        entidadId: v.id,
        createdAt: v.updatedAt.toISOString(),
      });
    }

    const ordenadas = ordenarBandeja(filas);
    const conteo = ordenadas.reduce(
      (acc, f) => {
        acc[f.urgencia] = (acc[f.urgencia] ?? 0) + 1;
        acc.total += 1;
        return acc;
      },
      { total: 0 } as Record<string, number>,
    );

    return { hoy, items: ordenadas, conteo, iaTicketsDisponible: this.lectura.disponible(),
      avisoLimite: 'Esta vista muestra hasta 100 tickets por revisar, 100 por facturar hoy, 80 viáticos por comprobar, 80 solicitudes de viáticos, 60 de vehículos, 40 multas y 40 vehículos sin responsable. Consulta el módulo correspondiente para ver el resto.' };
  }

  async crearTicket(
    sesion: Sesion,
    companyIdRaw: number | null,
    body: {
      viaticoId: number;
      tipo?: string;
      monto: number;
      fechaHora?: string;
      estacionComercio?: string;
      rfcEmisor?: string;
      puedeFacturar?: boolean | string;
      fechaLimiteFacturacion?: string;
      actividadId?: number;
      notas?: string;
    },
    fotoUrl: string,
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const actor = await this.actor(sesion, companyId);
    if (!fotoUrl) throw new BadRequestException('Sube la foto del ticket.');
    for (const campo of ['tipo', 'fechaHora', 'estacionComercio', 'rfcEmisor', 'fechaLimiteFacturacion', 'notas'] as const) {
      if (body[campo] != null && typeof body[campo] !== 'string') throw new BadRequestException(`El campo ${campo} debe ser texto.`);
    }
    if (body.puedeFacturar != null && ![true, false, 'true', 'false', '0', '1'].includes(body.puedeFacturar)) {
      throw new BadRequestException('Indica si el ticket se puede facturar.');
    }
    const viaticoId = Number(body.viaticoId);
    if (!Number.isSafeInteger(viaticoId) || viaticoId <= 0) {
      throw new BadRequestException('Indica el viático al que pertenece el ticket.');
    }
    const viatico = await this.prisma.viatico.findFirst({
      where: { id: viaticoId, deletedAt: null, ...companyWhere(companyId) },
      select: { id: true, usuarioId: true, actividadId: true, estatus: true, motivo: true },
    });
    if (!viatico) throw new NotFoundException('No encontramos ese viático.');
    const gestora = esGestora(actor.roleKey, actor.isSuperAdmin);
    if (!gestora && viatico.usuarioId !== actor.id) {
      throw new ForbiddenException('Solo puedes subir tickets de tus propios viáticos.');
    }
    if (!['Aprobado', 'Pagado'].includes(viatico.estatus)) {
      throw new BadRequestException(
        `Este viático está en «${viatico.estatus}»: espera a que te entreguen el dinero para comprobarlo.`,
      );
    }
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0 || monto > 99999999.99 || Math.abs(monto * 100 - Math.round(monto * 100)) > 0.00001) {
      throw new BadRequestException('Indica un monto mayor a cero, con un máximo de dos decimales.');
    }
    const tipo = normalizarTipo(body.tipo);
    const fechaHora = body.fechaHora ? new Date(body.fechaHora) : new Date();
    if (Number.isNaN(fechaHora.getTime())) throw new BadRequestException('Fecha u hora del ticket inválida.');
    const puedeFacturar =
      body.puedeFacturar === false || body.puedeFacturar === 'false' || body.puedeFacturar === '0'
        ? false
        : true;
    let fechaLimite: Date | null = null;
    if (body.fechaLimiteFacturacion) {
      const dia = body.fechaLimiteFacturacion;
      const d = new Date(`${dia}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia) {
        throw new BadRequestException('Fecha límite de facturación inválida.');
      }
      fechaLimite = puedeFacturar ? d : null;
    } else {
      fechaLimite = plazoFacturacionPorOmision(tipo, fechaHora, puedeFacturar);
    }
    let actividadId =
      body.actividadId != null && body.actividadId !== ('' as unknown)
        ? Number(body.actividadId)
        : viatico.actividadId;
    if (actividadId != null && (!Number.isSafeInteger(actividadId) || actividadId <= 0)) {
      throw new BadRequestException('Indica una actividad válida.');
    }
    await assertRefsBelongToCompany(companyId, [{ modelo: this.prisma.activity, ids: [actividadId], etiqueta: 'Actividad' }]);
    if (actividadId != null && actividadId !== viatico.actividadId) {
      throw new BadRequestException('El ticket debe corresponder a la misma actividad del viático. Vincula primero el viático a la actividad.');
    }

    const ticket = await this.prisma.viaticoTicket.create({
      data: {
        companyId,
        viaticoId,
        actividadId: actividadId ?? null,
        usuarioId: viatico.usuarioId,
        tipo,
        monto,
        fechaHora,
        estacionComercio: body.estacionComercio?.trim().slice(0, 160) || null,
        rfcEmisor: body.rfcEmisor?.trim().toUpperCase().slice(0, 13) || null,
        puedeFacturar,
        fechaLimiteFacturacion: fechaLimite,
        fotoUrl,
        estado: 'PENDIENTE',
        notas: body.notas?.trim().slice(0, 400) || null,
      },
    });

    const liz = await this.idsPorRol(companyId, ROLES.COORD_ADMIN);
    await this.avisar(liz, {
      type: 'VIATICO_TICKET_NUEVO',
      title: 'Nuevo ticket de viático',
      message: `Hay un ticket de ${tipo.toLowerCase()} por $${monto.toFixed(2)} esperando tu revisión.`,
      triggerUserId: actor.id,
      relatedEntityId: ticket.id,
      companyId,
      priority: fechaLimite && venceHoy(fechaLimite) ? 'high' : 'normal',
    });

    return ticket;
  }

  async misTickets(sesion: Sesion, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const actor = await this.actor(sesion, companyId);
    return this.prisma.viaticoTicket.findMany({
      where: { usuarioId: actor.id, ...companyWhere(companyId) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async porFacturar(sesion: Sesion, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const actor = await this.actor(sesion, companyId);
    if (!esContadora(actor) && !esGestora(actor.roleKey, actor.isSuperAdmin)) {
      throw new ForbiddenException('Solo la contadora o la gestora ven la lista por facturar.');
    }
    const hoy = diaMexico(new Date());
    const items = await this.prisma.viaticoTicket.findMany({
      where: {
        ...companyWhere(companyId),
        estado: 'APROBADO',
        puedeFacturar: true,
      },
      include: {
        viatico: {
          select: {
            id: true,
            motivo: true,
            User: { select: { id: true, nombre: true, email: true } },
          },
        },
      },
      orderBy: [{ fechaLimiteFacturacion: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return {
      hoy,
      puedeFacturarTickets: esContadora(actor),
      items: items.map((t) => ({
        ...t,
        monto: this.num(t.monto),
        venceHoy: venceHoy(t.fechaLimiteFacturacion, hoy),
      })),
    };
  }

  async revisarTicket(
    sesion: Sesion,
    companyIdRaw: number | null,
    id: number,
    body: { accion: 'aprobar' | 'rechazar'; motivo?: string },
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const actor = await this.actor(sesion, companyId);
    if (!esGestora(actor.roleKey, actor.isSuperAdmin)) {
      throw new ForbiddenException('Solo la gestora de viáticos puede aprobar o rechazar tickets.');
    }
    if (!['aprobar', 'rechazar'].includes(body.accion)) throw new BadRequestException('Elige aprobar o rechazar.');
    const ticket = await this.prisma.viaticoTicket.findFirst({
      where: { id, ...companyWhere(companyId) },
      include: { viatico: { select: { id: true, usuarioId: true, motivo: true } } },
    });
    if (!ticket) throw new NotFoundException('No encontramos ese ticket.');
    const destino = body.accion === 'aprobar' ? 'APROBADO' : 'RECHAZADO';
    if (ticket.estado === destino) return ticket;
    if (ticket.estado !== 'PENDIENTE') {
      throw new BadRequestException(`Este ticket ya está en «${ticket.estado}».`);
    }
    if (body.accion === 'rechazar') {
      const motivo = String(body.motivo || '').trim();
      if (motivo.length < 3) throw new BadRequestException('Escribe el motivo del rechazo (mínimo 3 caracteres).');
      const resultado = await this.cambiarEstado(id, ticket.viaticoId, companyId, actor.id, 'PENDIENTE', 'RECHAZADO', {
          estado: 'RECHAZADO',
          motivoRechazo: motivo.slice(0, 400),
          revisadoPorId: actor.id,
          revisadoAt: new Date(),
      });
      const updated = resultado.ticket;
      if (!resultado.cambio) return updated;
      await this.avisar([ticket.viatico.usuarioId], {
        type: 'VIATICO_TICKET_RECHAZADO',
        title: 'Ticket de viático rechazado',
        message: `Tu ticket fue rechazado: ${motivo.slice(0, 120)}`,
        triggerUserId: actor.id,
        relatedEntityId: ticket.id,
        companyId,
        relatedUrl: '/erp/finance/viatics',
      });
      return updated;
    }

    const resultado = await this.cambiarEstado(id, ticket.viaticoId, companyId, actor.id, 'PENDIENTE', 'APROBADO', {
      estado: 'APROBADO', revisadoPorId: actor.id, revisadoAt: new Date(), motivoRechazo: null,
    });
    const updated = resultado.ticket;
    if (!resultado.cambio) return updated;
    if (ticket.puedeFacturar) {
      const contadoras = await this.idsContadora(companyId);
      await this.avisar(contadoras, {
        type: 'VIATICO_TICKET_POR_FACTURAR',
        title: 'Ticket por facturar',
        message: `Hay un ticket de $${this.num(ticket.monto).toFixed(2)} listo para facturar${venceHoy(ticket.fechaLimiteFacturacion) ? ' (vence hoy)' : ''}.`,
        triggerUserId: actor.id,
        relatedEntityId: ticket.id,
        companyId,
        relatedUrl: '/erp/gestion-viaticos?vista=por-facturar',
        priority: venceHoy(ticket.fechaLimiteFacturacion) ? 'high' : 'normal',
      });
    }
    await this.avisar([ticket.viatico.usuarioId], {
      type: 'VIATICO_TICKET_APROBADO',
      title: 'Ticket de viático aprobado',
      message: ticket.puedeFacturar ? 'Tu ticket fue aprobado y pasó a la contadora.' : 'Tu ticket fue aprobado como comprobante del gasto.',
      triggerUserId: actor.id,
      relatedEntityId: ticket.id,
      companyId,
      relatedUrl: '/erp/finance/viatics',
    });
    return updated;
  }

  async facturarTicket(
    sesion: Sesion,
    companyIdRaw: number | null,
    id: number,
    body: {
      accion: 'facturado' | 'no_facturable';
      notas?: string;
      facturaXmlUrl?: string;
      facturaPdfUrl?: string;
    },
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const actor = await this.actor(sesion, companyId);
    if (!esContadora(actor)) {
      throw new ForbiddenException('Solo la contadora puede marcar el ticket como facturado.');
    }
    if (!['facturado', 'no_facturable'].includes(body.accion)) throw new BadRequestException('Elige facturado o no facturable.');
    const ticket = await this.prisma.viaticoTicket.findFirst({
      where: { id, ...companyWhere(companyId) },
    });
    if (!ticket) throw new NotFoundException('No encontramos ese ticket.');
    const estado = body.accion === 'facturado' ? 'FACTURADO' : 'NO_FACTURABLE';
    if (ticket.estado === estado) return ticket;
    if (ticket.estado !== 'APROBADO') {
      throw new BadRequestException(`Este ticket está en «${ticket.estado}», no se puede facturar.`);
    }
    if (body.accion === 'facturado' && !body.facturaXmlUrl && !body.facturaPdfUrl) {
      throw new BadRequestException('Adjunta el XML o el PDF de la factura.');
    }
    const resultado = await this.cambiarEstado(id, ticket.viaticoId, companyId, actor.id, 'APROBADO', estado, {
        estado,
        facturadoPorId: actor.id,
        facturadoAt: new Date(),
        facturaXmlUrl: body.facturaXmlUrl?.slice(0, 500) || null,
        facturaPdfUrl: body.facturaPdfUrl?.slice(0, 500) || null,
        notas: body.notas?.trim().slice(0, 400) || ticket.notas,
    });
    return resultado.ticket;
  }

  async leerTicketIa(sesion: Sesion, companyIdRaw: number | null, buffer: Buffer | undefined) {
    const companyId = requireCompanyId(companyIdRaw);
    await this.actor(sesion, companyId);
    if (!this.lectura.disponible()) {
      return {
        disponible: false,
        mensaje: 'La lectura de fotos no está disponible: captura los datos a mano.',
        datos: null,
      };
    }
    const leido = await this.lectura.leerTicket(companyId, buffer);
    const tipo: TipoTicket = normalizarTipo(
      (leido as { tipo?: string }).tipo ||
        (leido as { combustible?: string | null }).combustible ||
        (leido as { concepto?: string }).concepto ||
        'GASOLINA',
    );
    const portal = portalDeGasolinera(
      (leido as { comercio?: string | null }).comercio,
      (leido as { rfc?: string | null }).rfc,
    );
    return {
      disponible: true,
      mensaje: null,
      datos: {
        ...leido,
        tipo,
        estacionComercio: (leido as { comercio?: string | null }).comercio ?? null,
        rfcEmisor: (leido as { rfc?: string | null }).rfc ?? null,
        puedeFacturar: true,
        fechaLimiteFacturacion: plazoFacturacionPorOmision(tipo, new Date(), true)
          ?.toISOString()
          .slice(0, 10),
        portalFacturacion: portal
          ? {
              nombre: portal.nombre,
              url: portal.url,
              recordatorio: portal.recordatorio,
              datosACopiar: {
                rfc: (leido as { rfc?: string | null }).rfc ?? null,
                folio: (leido as { folio?: string | null }).folio ?? null,
                importe: (leido as { importe?: number | null }).importe ?? null,
                fecha: (leido as { fecha?: string | null }).fecha ?? null,
              },
            }
          : (leido as { webFacturacion?: string | null }).webFacturacion
            ? {
                nombre: 'Portal del ticket',
                url: (leido as { webFacturacion?: string | null }).webFacturacion!,
                recordatorio: tipo === 'GASOLINA' ? 'Gasolina: factura el mismo día del ticket.' : 'Factura dentro del plazo.',
                datosACopiar: {
                  rfc: (leido as { rfc?: string | null }).rfc ?? null,
                  folio: (leido as { folio?: string | null }).folio ?? null,
                  importe: (leido as { importe?: number | null }).importe ?? null,
                  fecha: (leido as { fecha?: string | null }).fecha ?? null,
                },
              }
            : null,
      },
    };
  }

  /** Recordatorio 15:00 MX: tickets cuyo plazo vence hoy y siguen por facturar. */
  async recordarTicketsHoy(): Promise<number> {
    const hoy = diaMexico(new Date());
    const tickets = await this.prisma.viaticoTicket.findMany({
      where: {
        estado: 'APROBADO',
        puedeFacturar: true,
        fechaLimiteFacturacion: { equals: new Date(`${hoy}T00:00:00.000Z`) },
      },
      select: { id: true, companyId: true, monto: true, tipo: true },
      take: 200,
      orderBy: { id: 'asc' },
    });
    let pagina = tickets;
    while (pagina.length === 200) {
      pagina = await this.prisma.viaticoTicket.findMany({
        where: { id: { gt: pagina[pagina.length - 1].id }, estado: 'APROBADO', puedeFacturar: true,
          fechaLimiteFacturacion: { equals: new Date(`${hoy}T00:00:00.000Z`) } },
        select: { id: true, companyId: true, monto: true, tipo: true },
        take: 200, orderBy: { id: 'asc' },
      });
      tickets.push(...pagina);
    }
    if (!tickets.length) return 0;
    const porEmpresa = new Map<number, typeof tickets>();
    for (const t of tickets) {
      const lista = porEmpresa.get(t.companyId) ?? [];
      lista.push(t);
      porEmpresa.set(t.companyId, lista);
    }
    let avisos = 0;
    for (const [companyId, lista] of porEmpresa) {
      const dest = [...(await this.idsContadora(companyId)), ...(await this.idsPorRol(companyId, ROLES.COORD_ADMIN))];
      for (const t of lista) {
        await this.avisar(dest, {
          type: 'VIATICO_TICKET_VENCE_HOY',
          title: 'Ticket vence hoy',
          message: `Queda un ticket de ${t.tipo.toLowerCase()} por $${this.num(t.monto).toFixed(2)} que hay que facturar hoy.`,
          relatedEntityId: t.id,
          companyId,
          relatedUrl: '/erp/gestion-viaticos?vista=por-facturar',
          priority: 'high',
        });
        avisos += 1;
      }
    }
    return avisos;
  }

  @Cron('0 15 * * *', { name: 'gestion-viaticos-tickets-hoy', timeZone: WORKDAY_TIMEZONE })
  async cronTicketsHoy() {
    await runScheduledJob('gestion-viaticos:tickets-hoy', this.logger, () => this.recordarTicketsHoy());
  }
}
