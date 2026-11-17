import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES } from '../../common/rbac/roles.v2.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { domingoDe, lunesDe } from '../../employee-payments/control-nomina.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { planCuotasCargoPerdida } from './cargos-perdida.helpers.js';

type Actor = { id: number; roleKey?: string | null; isSuperAdmin?: boolean };

@Injectable()
export class CargosPerdidaService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRh(actor: Actor) {
    const rk = String(actor.roleKey ?? '');
    if (actor.isSuperAdmin) return;
    if (![ROLES.RH, ROLES.CEO, ROLES.DIR_ADMIN].includes(rk as any)) {
      throw new ForbiddenException('Solo RH o dirección gestionan cargos por pérdida.');
    }
  }

  private assertDireccion(actor: Actor) {
    const rk = String(actor.roleKey ?? '');
    if (actor.isSuperAdmin || rk === ROLES.CEO || rk === ROLES.DIR_ADMIN) return;
    throw new ForbiddenException('Solo dirección aprueba el cargo por pérdida.');
  }

  async listar(actor: Actor, companyId: number | null, userId?: number) {
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
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
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId) || userId <= 0) throw new BadRequestException('Elige a la persona.');
    const hechos = String(body?.hechos ?? '').trim();
    if (hechos.length < 10) throw new BadRequestException('Describe los hechos de la pérdida (mín. 10).');
    const montoTotal = Number(body?.montoTotal);
    const perfil = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { sueldoSemanal: true },
    });
    const sueldoSemanal = Number(perfil?.sueldoSemanal ?? 0);
    const semanaInicio = body?.semanaInicio?.trim() || lunesDe(new Date().toISOString().slice(0, 10));
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
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.cargoPorPerdida.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré ese cargo.');
    if (!row.conformidadPdfUrl) {
      throw new BadRequestException('Sube el PDF de conformidad firmada del trabajador antes de mandarlo a dirección.');
    }
    if (row.estado !== 'BORRADOR') throw new BadRequestException('Solo un borrador se envía a dirección.');
    return this.prisma.cargoPorPerdida.update({
      where: { id },
      data: { estado: 'PENDIENTE_DIRECCION' },
    });
  }

  async decidir(
    actor: Actor,
    companyId: number | null,
    id: number,
    body: { accion?: 'aprobar' | 'rechazar'; motivo?: string },
  ) {
    this.assertDireccion(actor);
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.cargoPorPerdida.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré ese cargo.');
    if (row.estado !== 'PENDIENTE_DIRECCION') throw new BadRequestException('Este cargo no está pendiente de dirección.');
    if (body?.accion === 'rechazar') {
      return this.prisma.cargoPorPerdida.update({
        where: { id },
        data: {
          estado: 'RECHAZADO',
          aprobadoPorId: actor.id,
          motivoRechazo: String(body?.motivo ?? '').trim() || 'Rechazado por dirección',
        },
      });
    }
    if (body?.accion !== 'aprobar') throw new BadRequestException('Elige aprobar o rechazar.');
    return this.prisma.cargoPorPerdida.update({
      where: { id },
      data: { estado: 'APROBADO', aprobadoPorId: actor.id, motivoRechazo: null },
    });
  }

  async adjuntarConformidad(actor: Actor, companyId: number | null, id: number, pdfUrl: string) {
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.cargoPorPerdida.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré ese cargo.');
    if (!pdfUrl?.trim()) throw new BadRequestException('Falta el PDF de conformidad.');
    return this.prisma.cargoPorPerdida.update({
      where: { id },
      data: { conformidadPdfUrl: pdfUrl.trim() },
    });
  }

  /** Manda las cuotas de la semana a prenómina sin duplicar. */
  async aplicarSemana(actor: Actor, companyId: number | null, semana: string) {
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    const lunes = lunesDe(String(semana ?? '').trim());
    const cargos = await this.prisma.cargoPorPerdida.findMany({
      where: { companyId: tenantId, estado: { in: ['APROBADO', 'EN_COBRO'] } },
    });
    let aplicadas = 0;
    for (const cargo of cargos) {
      const plan = cargo.planCuotasJson as { cuotas?: Array<{ semanaIso: string; monto: number }> } | null;
      const cuota = plan?.cuotas?.find((c) => c.semanaIso === lunes);
      if (!cuota) continue;
      const concepto = `Cargo por pérdida (multa interna) #${cargo.id}`;
      const existe = await this.prisma.nominaDescuento.findFirst({
        where: {
          companyId: tenantId,
          userId: cargo.userId,
          concepto,
          fecha: new Date(`${lunes}T12:00:00.000Z`),
        },
        select: { id: true },
      });
      if (existe) continue;
      const nomina = await this.prisma.nominaSemana.upsert({
        where: { companyId_inicio: { companyId: tenantId, inicio: new Date(`${lunes}T12:00:00.000Z`) } },
        create: {
          companyId: tenantId,
          inicio: new Date(`${lunes}T12:00:00.000Z`),
          fin: new Date(`${domingoDe(lunes)}T12:00:00.000Z`),
        },
        update: {},
      });
      if (String((nomina as any).estado ?? '') === 'CERRADA') continue;
      await this.prisma.nominaDescuento.create({
        data: {
          semanaId: nomina.id,
          companyId: tenantId,
          userId: cargo.userId,
          concepto,
          monto: cuota.monto,
          sugerido: false,
          fecha: new Date(`${lunes}T12:00:00.000Z`),
          creadoPorId: actor.id,
        },
      });
      await this.prisma.cargoPorPerdida.update({
        where: { id: cargo.id },
        data: { estado: 'EN_COBRO' },
      });
      aplicadas += 1;
    }
    return { semana: lunes, aplicadas };
  }
}
