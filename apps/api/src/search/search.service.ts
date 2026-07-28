import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

interface SearchResult {
  type: string;
  id: number;
  title: string;
  subtitle?: string;
  risk?: 'low' | 'medium' | 'high';
  recommendation?: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(
    term: string,
    companyId: number | null | undefined,
    limit = 10,
  ): Promise<{
    results: SearchResult[];
    total: number;
    intelligence: {
      what: string;
      why: string;
      next: string[];
      risk: 'low' | 'medium' | 'high';
    };
  }> {
    const tenantId = requireCompanyId(companyId);
    if (!term || term.trim().length < 2) {
      return {
        results: [],
        total: 0,
        intelligence: {
          what: 'Sin consulta',
          why: 'El término de búsqueda es demasiado corto',
          next: ['Escribe al menos 2 caracteres'],
          risk: 'low',
        },
      };
    }
    const q = term.trim();
    const take = Math.min(limit, 50);
    const scope = companyWhere(tenantId);

    const [users, salesClients, salesProjects, operationalProjects, activities, invoices, assets, vehicles] =
      await Promise.all([
        this.prisma.user.findMany({
          where: {
            companyMemberships: { some: { companyId: tenantId } },
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, nombre: true, email: true },
          take,
        }),
        this.prisma.salesClient.findMany({
          where: {
            ...scope,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { legalName: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, legalName: true, status: true },
          take,
        }),
        this.prisma.salesProject.findMany({
          where: {
            opportunity: { companyId: tenantId },
            name: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, name: true, status: true },
          take,
        }),
        this.prisma.operationalProject.findMany({
          where: {
            ...scope,
            title: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, title: true, status: true },
          take,
        }),
        this.prisma.activity.findMany({
          where: {
            ...scope,
            OR: [
              { titulo: { contains: q, mode: 'insensitive' } },
              { descripcion: { contains: q, mode: 'insensitive' } },
              { anNumber: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, titulo: true, estatus: true, fechaMaxima: true },
          take,
        }),
        this.prisma.invoice.findMany({
          where: {
            ...scope,
            OR: [
              { invoiceNumber: { contains: q, mode: 'insensitive' } },
              { receptorName: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, invoiceNumber: true, receptorName: true, status: true },
          take,
        }),
        this.prisma.asset.findMany({
          where: {
            ...scope,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, code: true, status: true },
          take,
        }),
        this.prisma.vehicleAsset.findMany({
          where: {
            ...scope,
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { placas: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, nombre: true, placas: true, estatus: true },
          take,
        }),
      ]);

    const now = Date.now();
    const activityResults: SearchResult[] = activities.map((a: any) => {
      const overdue = a.fechaMaxima && new Date(a.fechaMaxima).getTime() < now && a.estatus !== 'Finalizado';
      return {
        type: 'activity',
        id: a.id,
        title: a.titulo,
        subtitle: a.estatus,
        risk: overdue ? 'high' : a.estatus === 'Pendiente' ? 'medium' : 'low',
        recommendation: overdue
          ? 'Escalar SLA: actividad vencida'
          : a.estatus === 'Pendiente'
            ? 'Asignar prioridad y fecha de inicio'
            : undefined,
      };
    });

    const results: SearchResult[] = [
      ...users.map((u: any) => ({
        type: 'user',
        id: u.id,
        title: u.nombre,
        subtitle: u.email,
        risk: 'low' as const,
      })),
      ...salesClients.map((c: any) => ({
        type: 'sales-client',
        id: c.id,
        title: c.name,
        subtitle: c.legalName ?? undefined,
        risk: c.status === 'INACTIVE' ? ('medium' as const) : ('low' as const),
        recommendation: c.status === 'INACTIVE' ? 'Reactivar o archivar cliente' : undefined,
      })),
      ...salesProjects.map((p: any) => ({
        type: 'sales-project',
        id: p.id,
        title: p.name,
        subtitle: p.status,
        risk: 'low' as const,
      })),
      ...operationalProjects.map((p: any) => ({
        type: 'operational-project',
        id: p.id,
        title: p.title,
        subtitle: String(p.status),
        risk: 'low' as const,
      })),
      ...activityResults,
      ...invoices.map((i: any) => ({
        type: 'invoice',
        id: i.id,
        title: i.invoiceNumber,
        subtitle: i.receptorName ?? undefined,
        risk: i.status === 'OVERDUE' ? ('high' as const) : ('low' as const),
        recommendation: i.status === 'OVERDUE' ? 'Cobrar o renegociar factura vencida' : undefined,
      })),
      ...assets.map((a: any) => ({
        type: 'asset',
        id: a.id,
        title: a.name,
        subtitle: a.code,
        risk: a.status === 'DOWN' || a.status === 'MAINTENANCE' ? ('medium' as const) : ('low' as const),
      })),
      ...vehicles.map((v: any) => ({
        type: 'vehicle',
        id: v.id,
        title: v.nombre,
        subtitle: v.placas ?? undefined,
        risk: 'low' as const,
      })),
    ];

    const sliced = results.slice(0, take);
    const highRisk = sliced.filter((r) => r.risk === 'high').length;
    const mediumRisk = sliced.filter((r) => r.risk === 'medium').length;

    return {
      results: sliced,
      total: results.length,
      intelligence: {
        what: `${sliced.length} resultados para «${q}» en el tenant`,
        why:
          highRisk > 0
            ? `${highRisk} ítems de alto riesgo (SLA/cobranza)`
            : mediumRisk > 0
              ? `${mediumRisk} ítems requieren atención`
              : 'Sin alertas críticas en los resultados',
        next: [
          ...(highRisk > 0 ? ['Revisar ítems de alto riesgo primero'] : []),
          ...(activityResults.some((a) => a.risk === 'high')
            ? ['Abrir cola de actividades vencidas']
            : []),
          'Refinar búsqueda con código AN, RFC o folio',
        ],
        risk: highRisk > 0 ? 'high' : mediumRisk > 0 ? 'medium' : 'low',
      },
    };
  }
}
