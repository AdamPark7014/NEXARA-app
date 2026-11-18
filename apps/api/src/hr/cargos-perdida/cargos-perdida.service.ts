import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { domingoDe, lunesDe } from '../../employee-payments/control-nomina.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertRhActor } from '../rh-actor.js';
import { workDateKey } from '../../common/time/workday.js';
import { parseFechaIso } from '../../supervision/supervision-helpers.js';
import { topeSemanalArt110, sueldoMensualDeSemanal, planCuotasCargoPerdida } from './cargos-perdida.helpers.js';

type Actor = { id: number; roleKey?: string | null; isSuperAdmin?: boolean };

@Injectable()
export class CargosPerdidaService {
  constructor(private readonly prisma: PrismaService) {}



  async listar(actor: Actor, companyId: number | null, userId?: number) {
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    return this.prisma.cargoPorPerdida.findMany({
      where: { companyId: tenantId, ...(userId ? { userId } : {}) },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        registradaPor: { select: { id: true, nombre: true } },
        aprobadoPor: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async crear(
    actor: Actor,
    companyId: number | null,
    body: {
      userId?: number;
      montoTotal?: number;
      hechos?: string;
      actividadId?: number | null;
      incidenciaId?: number | null;
      evidenciaUrl?: string;
      descargo?: string;
      semanaInicio?: string;
    },
  ) {
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    const userId = Number(body?.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new BadRequestException('Elige a la persona.');
    const hechos = String(body?.hechos ?? '').trim();
    if (hechos.length < 10) throw new BadRequestException('Describe los hechos de la pérdida (mín. 10).');
    const sujeto = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, companyMemberships: { some: { companyId: tenantId } } }, select: { id: true },
    });
    if (!sujeto) throw new BadRequestException('Elige una persona activa de esta empresa.');
    for (const [valor, modelo] of [[body.actividadId, this.prisma.activity], [body.incidenciaId, this.prisma.incidenciaPersonal]] as const) {
      if (valor == null) continue;
      if (!Number.isSafeInteger(Number(valor)) || Number(valor) <= 0 || !await (modelo as any).findFirst({
        where: { id: Number(valor), companyId: tenantId }, select: { id: true },
      })) throw new BadRequestException('La actividad o incidencia debe pertenecer a esta empresa.');
    }
    if (!body.actividadId && !body.incidenciaId) throw new BadRequestException('Liga el cargo a la actividad o incidencia que causó la pérdida.');
    if (!String(body.evidenciaUrl ?? '').trim() || !String(body.descargo ?? '').trim()) {
      throw new BadRequestException('Agrega la evidencia y el descargo del trabajador antes de registrar el cargo.');
    }
    const montoTotal = Number(body?.montoTotal);
    const perfil = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { sueldoSemanal: true },
    });
    const sueldoSemanal = Number(perfil?.sueldoSemanal ?? 0);
    const semanaInicio = body?.semanaInicio?.trim() || lunesDe(workDateKey(new Date()));
    const plan = planCuotasCargoPerdida({ montoTotal, sueldoSemanal, semanaInicio });
    return this.prisma.cargoPorPerdida.create({
      data: {
        companyId: tenantId,
        userId,
        registradaPorId: actor.id,
        montoTotal,
        hechos,
        actividadId: body?.actividadId ? Number(body.actividadId) : null,
        incidenciaId: body?.incidenciaId ? Number(body.incidenciaId) : null,
        evidenciaUrl: body?.evidenciaUrl?.trim() || null,
        descargo: body?.descargo != null ? String(body.descargo) : null,
        planCuotasJson: plan,
        estado: 'BORRADOR',
      },
      include: { user: { select: { id: true, nombre: true } } },
    });
  }

  async enviarADireccion(actor: Actor, companyId: number | null, id: number) {
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    const row = await this.prisma.cargoPorPerdida.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré ese cargo.');
    if (!row.conformidadPdfUrl) {
      throw new BadRequestException('Sube el PDF de conformidad firmada del trabajador antes de mandarlo a dirección.');
    }
    if (row.estado !== 'BORRADOR') throw new BadRequestException('Solo un borrador se envía a dirección.');
    return this.prisma.cargoPorPerdida.update({
      where: { id, companyId: tenantId, estado: 'BORRADOR' },
      data: { estado: 'PENDIENTE_DIRECCION' },
    });
  }

  async decidir(
    actor: Actor,
    companyId: number | null,
    id: number,
    body: { accion?: 'aprobar' | 'rechazar'; motivo?: string },
  ) {
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId, true);
    const row = await this.prisma.cargoPorPerdida.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré ese cargo.');
    if (row.estado !== 'PENDIENTE_DIRECCION') throw new BadRequestException('Este cargo no está pendiente de dirección.');
    if (body?.accion === 'aprobar' && !row.conformidadPdfUrl) throw new BadRequestException('Falta la conformidad firmada.');
    if (body?.accion === 'rechazar' && !String(body.motivo ?? '').trim()) throw new BadRequestException('Escribe el motivo del rechazo.');
    if (body?.accion === 'rechazar') {
      return this.prisma.cargoPorPerdida.update({
        where: { id, companyId: tenantId, estado: 'PENDIENTE_DIRECCION' },
        data: { estado: 'RECHAZADO',
          aprobadoPorId: actor.id,
          motivoRechazo: String(body?.motivo ?? '').trim() || 'Rechazado por dirección',
        },
      });
    }
    if (body?.accion !== 'aprobar') throw new BadRequestException('Elige aprobar o rechazar.');
    return this.prisma.cargoPorPerdida.update({
      where: { id, companyId: tenantId, estado: 'PENDIENTE_DIRECCION' },
      data: { estado: 'APROBADO', aprobadoPorId: actor.id, motivoRechazo: null },
    });
  }

  async adjuntarConformidad(actor: Actor, companyId: number | null, id: number, pdfUrl: string) {
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    const row = await this.prisma.cargoPorPerdida.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré ese cargo.');
    if (row.estado !== 'BORRADOR') throw new BadRequestException('La conformidad solo se cambia en borrador.');
    const url = String(pdfUrl ?? '').trim();
    if (!(url.startsWith('https://') || url.startsWith('/uploads/')) || !/\.pdf(?:[?#].*)?$/i.test(url) || url.length > 500 || /\s/.test(url)) {
      throw new BadRequestException('Indica una URL HTTPS o de archivos subidos que corresponda al PDF firmado.');
    }
    return this.prisma.cargoPorPerdida.update({
      where: { id, companyId: tenantId, estado: 'BORRADOR' },
      data: { conformidadPdfUrl: pdfUrl.trim() },
    });
  }

  /** Manda las cuotas de la semana a prenómina sin duplicar. */
  async aplicarSemana(actor: Actor, companyId: number | null, semana: string) {
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    const fecha = String(semana ?? '').trim();
    parseFechaIso(fecha);
    const lunes = lunesDe(fecha);
    if (lunes.slice(0, 4) !== '2026') throw new BadRequestException('Actualiza el salario mínimo para aplicar cuotas de otro año.');
    return this.prisma.$transaction(async (tx) => {
      const inicio = new Date(lunes + 'T12:00:00.000Z');
      const nomina = await tx.nominaSemana.upsert({
        where: { companyId_inicio: { companyId: tenantId, inicio } },
        create: { companyId: tenantId, inicio, fin: new Date(domingoDe(lunes) + 'T12:00:00.000Z') }, update: {},
      });
      // Escritura condicional: bloquea la semana hasta el commit. Cierre y otras aplicaciones esperan.
      const abierta = await tx.nominaSemana.updateMany({
        where: { id: nomina.id, companyId: tenantId, estado: { not: 'CERRADA' } }, data: { fin: nomina.fin },
      });
      if (abierta.count !== 1) throw new BadRequestException('La semana de nómina está cerrada; no se puede aplicar.');
      const cargos = await tx.cargoPorPerdida.findMany({
        where: { companyId: tenantId, estado: { in: ['APROBADO', 'EN_COBRO'] } }, orderBy: { id: 'asc' },
      });
      let aplicadas = 0;
      for (const cargo of cargos) {
        const plan = cargo.planCuotasJson as { cuotas?: Array<{ semanaIso: string; monto: number }> } | null;
        const cuota = plan?.cuotas?.find(c => c.semanaIso === lunes);
        if (!cuota) continue;
        if (!cargo.conformidadPdfUrl || !cargo.aprobadoPorId) throw new BadRequestException('El cargo requiere conformidad firmada y aprobación de dirección.');
        const concepto = 'Cargo por pérdida (multa interna) #' + cargo.id;
        const existe = await tx.nominaDescuento.findFirst({
          where: { companyId: tenantId, semanaId: nomina.id, userId: cargo.userId, concepto }, select: { id: true },
        });
        if (existe) continue;
        const perfil = await tx.userProfile.findUnique({ where: { userId: cargo.userId }, select: { sueldoSemanal: true } });
        const sueldo = Number(perfil?.sueldoSemanal ?? 0);
        const monto = Number(cuota.monto);
        const previos = await tx.nominaDescuento.findMany({
          where: { companyId: tenantId, semanaId: nomina.id, userId: cargo.userId, concepto: { startsWith: 'Cargo por pérdida' } }, select: { monto: true },
        });
        const cents = (n: number) => Math.round(n * 100);
        const acumulado = previos.reduce((sum, d) => sum + cents(Number(d.monto)), 0);
        const historial = await tx.nominaDescuento.findMany({
          where: { companyId: tenantId, userId: cargo.userId, concepto }, select: { monto: true },
        });
        const cobrado = historial.reduce((sum, d) => sum + cents(Number(d.monto)), 0);
        if (!Number.isFinite(monto) || monto <= 0 || Math.abs(monto * 100 - cents(monto)) > 1e-6 ||
            cents(monto) + acumulado > cents(topeSemanalArt110(sueldo)) ||
            cents(Number(cargo.montoTotal)) > cents(sueldoMensualDeSemanal(sueldo)) ||
            cobrado + cents(monto) > cents(Number(cargo.montoTotal))) {
          throw new BadRequestException('Las cuotas exceden el saldo o el límite legal de la persona. Revisa el plan antes de aplicar la semana.');
        }
        await tx.nominaDescuento.create({ data: {
          semanaId: nomina.id, companyId: tenantId, userId: cargo.userId, concepto, monto,
          sugerido: false, fecha: inicio, creadoPorId: actor.id,
        } });
        await tx.cargoPorPerdida.update({ where: { id: cargo.id, companyId: tenantId }, data: { estado: 'EN_COBRO' } });
        aplicadas++;
      }
      return { semana: lunes, aplicadas };
    });
  }
}
