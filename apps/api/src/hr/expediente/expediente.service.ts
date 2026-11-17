import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SolicitudAprobacionService } from '../../common/aprobaciones/solicitud-aprobacion.service.js';
import { PLATFORM_OWNER_EMAIL } from '../../common/platform-accounts.js';
import { esDireccion } from '../../users/user-creation-policy.js';
import { ROLES } from '../../common/rbac/roles.v2.js';
import type { TipoEmpleadoEvento } from '@prisma/client';
import { workDateKey } from '../../common/time/workday.js';
import { esCuentaAvisoRh } from '../../common/aprobaciones/cuenta-aviso.js';

type Sesion = {
  id?: number | string | null;
  email?: string | null;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  isClient?: boolean;
  isBranchUser?: boolean;
};

const TIPOS_DOC = new Set([
  'INE',
  'COMPROBANTE_DOMICILIO',
  'CONTRATO',
  'CSF',
  'ACTA',
  'CURP',
  'NSS',
]);

function fechaRh(valor: string): Date {
  const date = new Date(valor + 'T12:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== valor) {
    throw new BadRequestException('Indica una fecha válida en formato AAAA-MM-DD.');
  }
  return date;
}

@Injectable()
export class ExpedienteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aprobaciones: SolicitudAprobacionService,
  ) {}

  private async actor(sesion: Sesion, companyId: number) {
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      throw new ForbiddenException('Selecciona una empresa válida.');
    }
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0 || sesion?.isClient || sesion?.isBranchUser) {
      throw new ForbiddenException('Solo el personal interno puede ver expedientes.');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id, companyMemberships: { some: { companyId } } },
      select: { id: true, email: true, roleKey: true, isActive: true, nombre: true },
    });
    if (!actor || actor.isActive === false) throw new ForbiddenException('Tu usuario no está activo.');
    return actor;
  }

  private veSensibles(actor: { email: string | null; roleKey: string | null; isSuperAdmin?: boolean }) {
    return esDireccion(actor, PLATFORM_OWNER_EMAIL) || actor.roleKey === ROLES.RH;
  }

  private async puedeVerExpediente(
    actor: { id: number; email: string | null; roleKey: string | null; isSuperAdmin?: boolean },
    targetId: number,
    companyId: number,
  ) {
    if (actor.id === targetId) return { propio: true, jefe: false, staff: false };
    if (this.veSensibles(actor)) {
      const target = await this.prisma.user.findFirst({where: {id: targetId, companyMemberships: {some: {companyId}}}, select: {id: true}});
      if (!target) throw new NotFoundException('No encontramos a esa persona en esta empresa.');
      return {propio: false, jefe: false, staff: true};
    }
    const reporta = await this.prisma.user.findFirst({
      where: { id: targetId, managerId: actor.id, companyMemberships: { some: { companyId } } },
      select: { id: true },
    });
    if (reporta) return { propio: false, jefe: true, staff: false };
    throw new ForbiddenException('No tienes permiso para ver este expediente.');
  }

  async obtener(sesion: Sesion, userId: number, companyId: number) {
    const actor = await this.actor(sesion, companyId);
    const alcance = await this.puedeVerExpediente(actor, userId, companyId);
    const sensibles = this.veSensibles(actor);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: {
        id: true,
        nombre: true,
        email: true,
        employeeNumber: true,
        avatarUrl: true,
        puesto: true,
        tipoContrato: true,
        estadoRRHH: true,
        isActive: true,
        fechaIngreso: true,
        fechaCreacion: true,
        managerId: true,
        department: { select: { id: true, nombre: true } },
        role: { select: { id: true, nombre: true } },
        manager: { select: { id: true, nombre: true, email: true, employeeNumber: true } },
        perfil: sensibles
          ? {
              select: {
                telefono: true,
                fechaNacimiento: true,
                direccion: true,
                colonia: true,
                ciudad: true,
                estado: true,
                codigoPostal: true,
                curp: true,
                rfc: true,
                nss: true,
                sueldoSemanal: true,
                contactoEmergenciaNombre: true,
                contactoEmergenciaTelefono: true,
                correoContacto: true,
              },
            }
          : { select: { telefono: true, fechaNacimiento: true } },
        empleadoPerfil: { select: { area: true, contratoVenceAt: true, companyId: true } },
        documentos: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            tipo: true,
            archivoUrl: true,
            estatus: true,
            expiresAt: true,
            createdAt: true,
            observaciones: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('No encontramos a esa persona.');

    const [incidencias, permisos, timeline, solicitudes] = await Promise.all([
      this.prisma.incidenciaPersonal.findMany({
        where: { companyId, userId },
        orderBy: [{ fecha: 'desc' }],
        take: 50,
        select: {
          id: true,
          fecha: true,
          tipo: true,
          concepto: true,
          monto: true,
          estado: true,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: { companyId, userId },
        orderBy: [{ createdAt: 'desc' }],
        take: 50,
        select: {
          id: true,
          type: true,
          status: true,
          startDate: true,
          endDate: true,
          days: true,
          reason: true,
        },
      }),
      this.prisma.empleadoEvento.findMany({
        where: { companyId, userId },
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
        include: { actor: { select: { id: true, nombre: true } } },
      }),
      sensibles
        ? this.prisma.solicitudAprobacionRh.findMany({
            where: { companyId, userId, estado: 'PENDIENTE' },
            orderBy: [{ createdAt: 'desc' }],
            select: { id: true, tipo: true, payload: true, createdAt: true, aprobadorActualId: true },
          })
        : Promise.resolve([]),
    ]);

    const perfilEmpresa = user.empleadoPerfil?.companyId === companyId ? user.empleadoPerfil : null;
    const laborales = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      employeeNumber: user.employeeNumber,
      avatarUrl: user.avatarUrl,
      puesto: user.puesto,
      area: perfilEmpresa?.area ?? user.department?.nombre ?? null,
      tipoContrato: user.tipoContrato,
      estadoRRHH: user.estadoRRHH,
      isActive: user.isActive,
      fechaIngreso: user.fechaIngreso,
      fechaCreacion: user.fechaCreacion,
      department: user.department,
      role: user.role,
      manager: user.manager,
      contratoVenceAt: perfilEmpresa?.contratoVenceAt ?? null,
      telefono: user.perfil?.telefono ?? null,
      fechaNacimiento: user.perfil?.fechaNacimiento ?? null,
    };

    return {
      laborales,
      sensibles: sensibles ? user.perfil : null,
      documentos: sensibles || alcance.propio ? user.documentos : [],
      incidencias: sensibles || alcance.propio ? incidencias : incidencias.map(({ monto, ...rest }) => rest),
      permisos,
      timeline: sensibles ? timeline : timeline.filter((e) => e.tipo !== 'AJUSTE_SUELDO').map(({ detalle, ...rest }) => ({ ...rest, detalle: null })),
      solicitudesPendientes: solicitudes,
      permisosVista: {
        sensibles,
        puedeEditar: sensibles,
        puedeSubirDocs: sensibles || alcance.propio,
        esJefe: alcance.jefe,
        esPropio: alcance.propio,
      },
    };
  }

  async solicitarCambio(
    sesion: Sesion,
    companyId: number,
    dto: {
      userId: number;
      tipo: 'CAMBIO_PUESTO' | 'CAMBIO_JEFE' | 'AJUSTE_SUELDO';
      valor: string | number;
      comentario?: string;
    },
  ) {
    const actor = await this.actor(sesion, companyId);
    if (!this.veSensibles(actor)) {
      throw new ForbiddenException('Solo RH o dirección solicitan cambios de expediente.');
    }
    if (!['CAMBIO_PUESTO', 'CAMBIO_JEFE', 'AJUSTE_SUELDO'].includes(dto.tipo)) throw new BadRequestException('Tipo de cambio no válido.');
    const userId = Number(dto.userId);
    const target = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: {
        id: true,
        nombre: true,
        puesto: true,
        managerId: true,
        perfil: { select: { sueldoSemanal: true } },
      },
    });
    if (!target) throw new BadRequestException('No encontramos a esa persona.');

    let payload: Record<string, unknown>;
    let title: string;
    let message: string;
    if (dto.tipo === 'CAMBIO_PUESTO') {
      const puestoNuevo = String(dto.valor ?? '').trim();
      if (puestoNuevo.length < 2) throw new BadRequestException('Indica el puesto nuevo.');
      payload = { puestoAnterior: target.puesto, puestoNuevo, comentario: dto.comentario ?? null };
      title = `Cambio de puesto: ${target.nombre}`;
      message = `${actor.nombre} propone pasar de «${target.puesto ?? 'sin puesto'}» a «${puestoNuevo}».`;
    } else if (dto.tipo === 'CAMBIO_JEFE') {
      const managerId = Number(dto.valor);
      if (!Number.isSafeInteger(managerId) || managerId <= 0) throw new BadRequestException('Indica el nuevo jefe.');
      if (managerId === userId) throw new BadRequestException('Una persona no puede ser su propio jefe.');
      const jefe = await this.prisma.user.findFirst({
        where: { id: managerId, isActive: true, companyMemberships: { some: { companyId } } },
        select: { id: true, nombre: true },
      });
      if (!jefe) throw new BadRequestException('No encontramos al nuevo jefe.');
      payload = { managerIdAnterior: target.managerId, managerIdNuevo: jefe.id, jefeNombre: jefe.nombre, comentario: dto.comentario ?? null };
      title = `Cambio de jefe: ${target.nombre}`;
      message = `${actor.nombre} propone que ${target.nombre} reporte a ${jefe.nombre}.`;
    } else {
      if (dto.valor == null || String(dto.valor).trim() === '') throw new BadRequestException('Indica el sueldo semanal nuevo.');
      const sueldo = Number(dto.valor);
      if (!Number.isFinite(sueldo) || sueldo < 0) throw new BadRequestException('Indica el sueldo semanal nuevo.');
      payload = {
        sueldoAnterior: target.perfil?.sueldoSemanal != null ? Number(target.perfil.sueldoSemanal) : null,
        sueldoNuevo: sueldo,
        comentario: dto.comentario ?? null,
      };
      title = `Ajuste de sueldo: ${target.nombre}`;
      message = `${actor.nombre} solicita un ajuste de sueldo. Revísalo en Aprobaciones.`;
    }

    // Ajuste de sueldo y cambios de puesto/jefe: solo dirección aprueba.
    const dirs = await this.aprobaciones.idsDireccion(companyId, actor.id);
    return this.aprobaciones.crear({
      companyId,
      tipo: dto.tipo,
      userId,
      solicitadoPorId: actor.id,
      aprobadorActualId: dirs[0] ?? null,
      payload,
      aviso: { title, message, type: `RH_${dto.tipo}_PENDIENTE` },
    });
  }

  async decidirYAplicar(sesion: Sesion, id: number, companyId: number, aprobar: boolean, motivo?: string) {
    const actor = await this.actor(sesion, companyId);
    return this.aprobaciones.decidir(id, companyId, actor.id, aprobar ? 'APROBADA' : 'RECHAZADA', motivo);
  }

  async actualizarAreaContrato(
    sesion: Sesion,
    companyId: number,
    userId: number,
    data: { area?: string | null; contratoVenceAt?: string | null },
  ) {
    const actor = await this.actor(sesion, companyId);
    if (!this.veSensibles(actor)) throw new ForbiddenException('Solo RH o dirección editan el perfil extendido.');
    const target = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: { id: true, empleadoPerfil: { select: { companyId: true } } },
    });
    if (!target) throw new NotFoundException('No encontramos a esa persona.');
    if (target.empleadoPerfil && target.empleadoPerfil.companyId !== companyId) {
      throw new ForbiddenException('El perfil laboral pertenece a otra empresa.');
    }
    const area = data.area == null ? null : String(data.area).trim() || null;
    if (area && area.length > 120) throw new BadRequestException('El área admite hasta 120 caracteres.');

    let contratoVenceAt: Date | null | undefined = undefined;
    if (data.contratoVenceAt !== undefined) {
      if (data.contratoVenceAt === null || data.contratoVenceAt === '') contratoVenceAt = null;
      else {
        const f = String(data.contratoVenceAt).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new BadRequestException('La fecha de fin de contrato debe ser AAAA-MM-DD.');
        contratoVenceAt = fechaRh(f);
      }
    }

    return this.prisma.empleadoPerfil.upsert({
      where: { userId, companyId },
      create: {
        userId,
        companyId,
        area,
        contratoVenceAt: contratoVenceAt ?? null,
      },
      update: {
        ...(data.area !== undefined ? { area } : {}),
        ...(contratoVenceAt !== undefined ? { contratoVenceAt } : {}),
      },
    });
  }

  async actualizarSensibles(
    sesion: Sesion,
    companyId: number,
    userId: number,
    data: Record<string, unknown>,
  ) {
    const actor = await this.actor(sesion, companyId);
    if (!this.veSensibles(actor)) throw new ForbiddenException('Solo RH o dirección ven y editan datos sensibles.');
    const target = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId } } },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('No encontramos a esa persona.');

    const patch: Record<string, unknown> = {};
    for (const key of [
      'telefono', 'direccion', 'colonia', 'ciudad', 'estado', 'codigoPostal',
      'curp', 'rfc', 'nss', 'correoContacto', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono',
    ] as const) {
      if (data[key] !== undefined) {
        const v = data[key];
        patch[key] = v == null || v === '' ? null : String(v).trim();
      }
    }
    if (data.fechaNacimiento !== undefined) {
      const f = data.fechaNacimiento;
      if (f == null || f === '') patch.fechaNacimiento = null;
      else {
        const s = String(f).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('La fecha de nacimiento debe ser AAAA-MM-DD.');
        patch.fechaNacimiento = fechaRh(s);
      }
    }
    // El sueldo no se escribe directo: va por solicitud de aprobación.
    if (Object.keys(patch).length === 0) throw new BadRequestException('No hay cambios que guardar.');

    return this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...patch } as any,
      update: patch as any,
    });
  }

  async subirDocumento(
    sesion: Sesion,
    companyId: number,
    dto: { userId: number; tipo: string; archivoUrl: string; expiresAt?: string | null; observaciones?: string },
  ) {
    const actor = await this.actor(sesion, companyId);
    const userId = Number(dto.userId);
    const alcance = await this.puedeVerExpediente(actor, userId, companyId);
    if (!this.veSensibles(actor) && !alcance.propio) {
      throw new ForbiddenException('Solo la persona, RH o dirección suben documentos del expediente.');
    }
    const tipo = String(dto.tipo ?? '').trim().toUpperCase();
    if (!TIPOS_DOC.has(tipo)) throw new BadRequestException('Tipo de documento no válido.');
    const archivoUrl = String(dto.archivoUrl ?? '').trim();
    if (!archivoUrl.startsWith('/uploads/') && !archivoUrl.startsWith('https://')) {
      throw new BadRequestException('La URL del archivo no es válida.');
    }
    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      const f = String(dto.expiresAt).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new BadRequestException('El vencimiento debe ser AAAA-MM-DD.');
      expiresAt = fechaRh(f);
    }
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.userDocument.create({
        data: {
          userId,
          tipo,
          archivoUrl,
          expiresAt,
          observaciones: String(dto.observaciones ?? '').trim() || null,
          estatus: 'Pendiente',
        },
      });
      await tx.empleadoEvento.create({
        data: { companyId, userId, tipo: 'DOCUMENTO', detalle: { tipo, documentoId: doc.id }, actorId: actor.id },
      });
      return doc;
    });
  }

  async registrarEvento(
    companyId: number,
    userId: number,
    tipo: TipoEmpleadoEvento,
    detalle?: Record<string, unknown> | null,
    actorId?: number | null,
  ) {
    return this.prisma.empleadoEvento.create({
      data: {
        companyId,
        userId,
        tipo,
        detalle: detalle ? (detalle as object) : undefined,
        actorId: actorId ?? null,
      },
    });
  }

  async alertas(sesion: Sesion, companyId: number) {
    const actor = await this.actor(sesion, companyId);
    if (!this.veSensibles(actor)) throw new ForbiddenException('Solo RH o dirección ven las alertas de personal.');

    const hoy = new Date();
    const ymd = workDateKey(hoy);
    const inicioHoy = new Date(`${ymd}T00:00:00.000Z`);
    const en30 = new Date(inicioHoy.getTime() + 31 * 24 * 60 * 60 * 1000 - 1);

    const cargarPagina = (ultimoId: number) => this.prisma.user.findMany({
      where: {
        id: { gt: ultimoId },
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        puesto: true,
        employeeNumber: true,
        managerId: true,
        roleKey: true,
        fechaIngreso: true,
        perfil: { select: { fechaNacimiento: true } },
        empleadoPerfil: { select: { contratoVenceAt: true, companyId: true } },
        documentos: {
          where: { expiresAt: { gte: inicioHoy, lte: en30 } },
          select: { id: true, tipo: true, expiresAt: true },
        },
      },
      take: 5000,
      orderBy: { id: 'asc' },
    });
    const activos: Awaited<ReturnType<typeof cargarPagina>> = [];
    let ultimoId = 0;
    while (true) {
      const pagina = await cargarPagina(ultimoId);
      activos.push(...pagina.filter(esCuentaAvisoRh));
      if (pagina.length < 5000) break;
      ultimoId = pagina[pagina.length - 1].id;
    }

    const documentosPorVencer = activos.flatMap((u) =>
      u.documentos.map((d) => ({
        userId: u.id,
        nombre: u.nombre,
        employeeNumber: u.employeeNumber,
        documentoId: d.id,
        tipo: d.tipo,
        expiresAt: d.expiresAt,
      })),
    );

    const mmdd = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const hoyMd = ymd.slice(5);

    const cumpleaños = activos
      .filter((u) => u.perfil?.fechaNacimiento && mmdd(u.perfil.fechaNacimiento) === hoyMd)
      .map((u) => ({ userId: u.id, nombre: u.nombre, employeeNumber: u.employeeNumber, tipo: 'cumpleaños' as const }));

    const aniversarios = activos
      .filter((u) => u.fechaIngreso && u.fechaIngreso.getUTCFullYear() < Number(ymd.slice(0, 4)) && mmdd(u.fechaIngreso) === hoyMd)
      .map((u) => ({ userId: u.id, nombre: u.nombre, employeeNumber: u.employeeNumber, tipo: 'aniversario' as const }));

    const sinNex = activos
      .filter((u) => !u.employeeNumber || !/^NEX-\d+$/i.test(u.employeeNumber))
      .map((u) => ({ userId: u.id, nombre: u.nombre, email: u.email }));

    const sinJefe = activos
      .filter((u) => u.managerId == null && u.roleKey !== ROLES.CEO)
      .map((u) => ({ userId: u.id, nombre: u.nombre, email: u.email }));

    const contratosPorVencer = activos
      .filter((u) => u.empleadoPerfil?.companyId === companyId && u.empleadoPerfil.contratoVenceAt && u.empleadoPerfil.contratoVenceAt >= inicioHoy && u.empleadoPerfil.contratoVenceAt <= en30)
      .map((u) => ({
        userId: u.id,
        nombre: u.nombre,
        employeeNumber: u.employeeNumber,
        contratoVenceAt: u.empleadoPerfil!.contratoVenceAt,
      }));

    return {
      fecha: ymd,
      documentosPorVencer,
      cumpleaños,
      aniversarios,
      sinNex,
      sinJefe,
      contratosPorVencer,
    };
  }
}
