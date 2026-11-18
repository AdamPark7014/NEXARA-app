import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { validarCreacion } from './medidas-disciplinarias.helpers.js';
import { assertRhActor } from '../rh-actor.js';

type Actor = { id: number; roleKey?: string | null; isSuperAdmin?: boolean };

@Injectable()
export class MedidasDisciplinariasService {
  constructor(private readonly prisma: PrismaService) {}


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
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
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
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    const userId = Number(body?.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new BadRequestException('Elige a la persona.');
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
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    const row = await this.prisma.medidaDisciplinaria.findFirst({ where: { id, companyId: tenantId } });
    if (!row) throw new NotFoundException('No encontré esa medida.');
    const siguientes: Record<string, string[]> = {
      BORRADOR: ['NOTIFICADA', 'ANULADA'], NOTIFICADA: ['FIRMADA', 'ANULADA'],
      FIRMADA: ['CERRADA', 'ANULADA'], CERRADA: [], ANULADA: [],
    };
    if (estado === row.estado) return row;
    if (!siguientes[row.estado]?.includes(estado)) throw new BadRequestException('Ese cambio de estado no está permitido.');
    if (row.tipo === 'SUSPENSION' && estado !== 'ANULADA' &&
        (row.avisoReglamento || !await this.reglamentoCargado(tenantId))) {
      throw new BadRequestException('La suspensión permanece en borrador hasta acreditar que el reglamento interior la prevé y que se escuchó al trabajador.');
    }
    if (estado === 'FIRMADA' && !row.pdfUrl) throw new BadRequestException('Falta el documento firmado de la medida.');
    return this.prisma.medidaDisciplinaria.update({
      where: { id, companyId: tenantId, estado: row.estado },
      data: { estado: estado as any },
    });
  }

  async tableroDesempeno(actor: Actor, companyId: number | null, userId: number) {
    const tenantId = requireCompanyId(companyId);
    await assertRhActor(this.prisma, actor, tenantId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, nombre: true, email: true, puesto: true },
    });
    if (!user) throw new NotFoundException('Persona no encontrada.');
    const [reviews, medidas, calificaciones, evaluaciones, medidasActivas] = await Promise.all([
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
      this.prisma.activityEvidence.aggregate({
        where: { companyId: tenantId, userId, reviewStatus: 'APPROVED', eficienciaScore: { gt: 0 } },
        _avg: { eficienciaScore: true }, _count: { eficienciaScore: true },
      }),
      this.prisma.performanceReview.count({ where: { companyId: tenantId, userId } }),
      this.prisma.medidaDisciplinaria.count({ where: { companyId: tenantId, userId, estado: { notIn: ['CERRADA', 'ANULADA'] } } }),
    ]);
    const calificacionPromedio =
      calificaciones._avg.eficienciaScore != null ? Math.round(Number(calificaciones._avg.eficienciaScore) * 10) / 10 : null;
    return {
      user,
      reviews,
      medidas,
      kpis: {
        evaluaciones,
        calificacionPromedio,
        medidasActivas,
        evidenciasCalificadas: calificaciones._count.eficienciaScore,
      },
    };
  }
}
