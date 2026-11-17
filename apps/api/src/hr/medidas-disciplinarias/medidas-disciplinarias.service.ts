import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES } from '../../common/rbac/roles.v2.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { validarCreacion } from './medidas-disciplinarias.helpers.js';

type Actor = { id: number; roleKey?: string | null; isSuperAdmin?: boolean };

@Injectable()
export class MedidasDisciplinariasService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRh(actor: Actor) {
    const rk = String(actor.roleKey ?? '');
    if (actor.isSuperAdmin) return;
    if (![ROLES.RH, ROLES.CEO, ROLES.DIR_ADMIN].includes(rk as any)) {
      throw new ForbiddenException('Solo RH o dirección registran medidas disciplinarias.');
    }
  }

  private async reglamentoCargado(companyId: number): Promise<boolean> {
    // Documentos de expediente van por persona; buscamos tipo «reglamento» en la empresa.
    const members = await this.prisma.userCompany.findMany({
      where: { companyId },
      select: { userId: true },
      take: 500,
    });
    const ids = members.map((m) => m.userId);
    if (!ids.length) return false;
    const doc = await this.prisma.userDocument.findFirst({
      where: { userId: { in: ids }, tipo: { contains: 'reglamento', mode: 'insensitive' } },
      select: { id: true },
    });
    return Boolean(doc);
  }

  async listar(actor: Actor, companyId: number | null, userId?: number) {
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    return this.prisma.medidaDisciplinaria.findMany({
      where: { companyId: tenantId, ...(userId ? { userId } : {}) },
      include: {
        user: { select: { id: true, nombre: true, email: true, puesto: true } },
        registradaPor: { select: { id: true, nombre: true } },
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
      tipo?: string;
      hechos?: string;
      testigos?: string;
      descargo?: string;
      diasSuspension?: number | null;
      notas?: string;
    },
  ) {
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId) || userId <= 0) throw new ForbiddenException('Elige a la persona.');
    const sujeto = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true },
    });
    if (!sujeto) throw new NotFoundException('No encontré a esa persona en la empresa.');
    const reglamentoInteriorCargado = await this.reglamentoCargado(tenantId);
    const v = validarCreacion({
      tipo: String(body?.tipo ?? ''),
      hechos: body?.hechos,
      testigos: body?.testigos,
      descargo: body?.descargo ?? (String(body?.tipo).toUpperCase() === 'ACTA_ADMINISTRATIVA' ? '' : undefined),
      diasSuspension: body?.diasSuspension,
      reglamentoInteriorCargado,
    });
    return this.prisma.medidaDisciplinaria.create({
      data: {
        companyId: tenantId,
        userId,
        registradaPorId: actor.id,
        tipo: v.tipo,
        hechos: String(body?.hechos ?? '').trim(),
        testigos: body?.testigos != null ? String(body.testigos) : null,
        descargo: body?.descargo != null ? String(body.descargo) : null,
        diasSuspension: v.diasSuspension,
        avisoReglamento: v.avisoReglamento,
        notas: body?.notas?.trim() || null,
        estado: 'BORRADOR',
      },
      include: {
        user: { select: { id: true, nombre: true } },
        registradaPor: { select: { id: true, nombre: true } },
      },
    });
  }

  async actualizarEstado(
    actor: Actor,
    companyId: number | null,
    id: number,
    estado: string,
  ) {
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    const row = await this.prisma.medidaDisciplinaria.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré esa medida.');
    const ok = ['BORRADOR', 'NOTIFICADA', 'FIRMADA', 'CERRADA', 'ANULADA'];
    if (!ok.includes(estado)) throw new ForbiddenException('Estado no válido.');
    return this.prisma.medidaDisciplinaria.update({
      where: { id },
      data: { estado: estado as any },
    });
  }

  async tableroDesempeno(actor: Actor, companyId: number | null, userId: number) {
    this.assertRh(actor);
    const tenantId = requireCompanyId(companyId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, nombre: true, email: true, puesto: true },
    });
    if (!user) throw new NotFoundException('Persona no encontrada.');
    const [reviews, medidas, evidencias] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: { companyId: tenantId, userId },
        orderBy: { reviewDate: 'desc' },
        take: 12,
      }),
      this.prisma.medidaDisciplinaria.findMany({
        where: { companyId: tenantId, userId, estado: { not: 'ANULADA' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.activityEvidence.findMany({
        where: { companyId: tenantId, userId, reviewStatus: 'APPROVED' },
        select: { eficienciaScore: true },
        take: 200,
        orderBy: { id: 'desc' },
      }),
    ]);
    const ratings = evidencias.map((e) => Number(e.eficienciaScore)).filter((n) => Number.isFinite(n) && n > 0);
    const calificacionPromedio =
      ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    return {
      user,
      reviews,
      medidas,
      kpis: {
        evaluaciones: reviews.length,
        calificacionPromedio,
        medidasActivas: medidas.filter((m) => m.estado !== 'CERRADA').length,
        evidenciasCalificadas: ratings.length,
      },
    };
  }
}
