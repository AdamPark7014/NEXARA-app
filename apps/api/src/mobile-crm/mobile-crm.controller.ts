import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrmActivitiesService } from '../crm-activities/crm-activities.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';

/**
 * Endpoints compactos para la app móvil (iOS/Android Native).
 * Devuelven payloads ligeros y precalculados, optimizados para conexiones lentas.
 */
@Controller('mobile/crm')
@UseGuards(AuthGuard('jwt'))
export class MobileCrmController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crmActivities: CrmActivitiesService,
  ) {}

  /** Resumen del vendedor para pantalla principal de la app. */
  @Get('home')
  async home(@CurrentUser() user: any) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [agenda, hotLeads, openOpps, monthClosed, target] = await Promise.all([
      this.crmActivities.getMyAgenda(user.id),
      this.prisma.salesLead.findMany({
        where: { ownerId: user.id, status: { in: ['NEW' as any, 'CONTACTED' as any, 'QUALIFIED' as any] } },
        select: { id: true, name: true, company: true, score: true, status: true, createdAt: true },
        orderBy: { score: 'desc' },
        take: 10,
      }),
      this.prisma.salesOpportunity.findMany({
        where: { ownerId: user.id, stage: { notIn: ['WON' as any, 'LOST' as any] } },
        select: { id: true, title: true, stage: true, value: true, probability: true, expectedCloseDate: true },
        orderBy: { expectedCloseDate: 'asc' },
        take: 10,
      }),
      this.prisma.salesOpportunity.aggregate({
        where: { ownerId: user.id, stage: 'WON' as any, closedAt: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { value: true },
        _count: { _all: true },
      }),
      (this.prisma as any).salesTarget.findFirst({
        where: { ownerId: user.id, period: 'MONTHLY', year: now.getFullYear(), month: now.getMonth() + 1 },
      }),
    ]);

    const revenueAchieved = Number(monthClosed._sum?.value || 0);
    const revenueTarget = Number(target?.revenueTarget || 0);
    const attainment = revenueTarget > 0 ? Math.min(100, (revenueAchieved / revenueTarget) * 100) : 0;

    return {
      kpis: {
        pendingToday: agenda.pendingToday.length,
        overdue: agenda.overdue.length,
        hotLeads: hotLeads.length,
        openOpps: openOpps.length,
        revenueAchieved,
        revenueTarget,
        attainmentPct: +attainment.toFixed(1),
        wonThisMonth: monthClosed._count?._all || 0,
      },
      agendaToday: agenda.pendingToday.slice(0, 8),
      overdue: agenda.overdue.slice(0, 5),
      hotLeads,
      openOpps,
    };
  }

  /** Búsqueda global del CRM móvil. */
  @Get('search')
  async search(@Query('q') q: string, @CurrentUser() user: any) {
    if (!q || q.trim().length < 2) return { leads: [], opportunities: [], clients: [] };
    const term = q.trim();
    const [leads, opportunities, clients] = await Promise.all([
      this.prisma.salesLead.findMany({
        where: { ownerId: user.id, OR: [{ name: { contains: term, mode: 'insensitive' } }, { company: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] },
        select: { id: true, name: true, company: true, email: true, phone: true, score: true },
        take: 10,
      }),
      this.prisma.salesOpportunity.findMany({
        where: { ownerId: user.id, title: { contains: term, mode: 'insensitive' } },
        select: { id: true, title: true, stage: true, value: true },
        take: 10,
      }),
      this.prisma.salesClient.findMany({
        where: { OR: [{ name: { contains: term, mode: 'insensitive' } }, { taxId: { contains: term, mode: 'insensitive' } }] },
        select: { id: true, name: true, taxId: true, billingEmail: true, billingPhone: true },
        take: 10,
      }),
    ]);
    return { leads, opportunities, clients };
  }
}
