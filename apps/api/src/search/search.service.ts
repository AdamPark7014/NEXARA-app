import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface SearchResult {
  type: string;
  id: number;
  title: string;
  subtitle?: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(term: string, limit = 10): Promise<{ results: SearchResult[]; total: number }> {
    if (!term || term.trim().length < 2) return { results: [], total: 0 };
    const q = term.trim();
    const take = Math.min(limit, 50);

    const [users, salesClients, salesProjects, operationalProjects, activities, invoices, assets, vehicles] = await Promise.all([
      this.prisma.user.findMany({
        where: { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, nombre: true, email: true },
        take,
      }),
      this.prisma.salesClient.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { legalName: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, name: true, legalName: true },
        take,
      }),
      this.prisma.salesProject.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        take,
      }),
      this.prisma.operationalProject.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        select: { id: true, title: true },
        take,
      }),
      this.prisma.activity.findMany({
        where: { OR: [{ titulo: { contains: q, mode: 'insensitive' } }, { descripcion: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, titulo: true },
        take,
      }),
      this.prisma.invoice.findMany({
        where: { OR: [{ invoiceNumber: { contains: q, mode: 'insensitive' } }, { receptorName: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, invoiceNumber: true, receptorName: true },
        take,
      }),
      this.prisma.asset.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, name: true, code: true },
        take,
      }),
      this.prisma.vehicleAsset.findMany({
        where: { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { placas: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, nombre: true, placas: true },
        take,
      }),
    ]);

    const results: SearchResult[] = [
      ...users.map((u: any) => ({ type: 'user', id: u.id, title: u.nombre, subtitle: u.email })),
      ...salesClients.map((c: any) => ({ type: 'sales-client', id: c.id, title: c.name, subtitle: c.legalName ?? undefined })),
      ...salesProjects.map((p: any) => ({ type: 'sales-project', id: p.id, title: p.name })),
      ...operationalProjects.map((p: any) => ({ type: 'operational-project', id: p.id, title: p.title })),
      ...activities.map((a: any) => ({ type: 'activity', id: a.id, title: a.titulo })),
      ...invoices.map((i: any) => ({ type: 'invoice', id: i.id, title: i.invoiceNumber, subtitle: i.receptorName ?? undefined })),
      ...assets.map((a: any) => ({ type: 'asset', id: a.id, title: a.name, subtitle: a.code })),
      ...vehicles.map((v: any) => ({ type: 'vehicle', id: v.id, title: v.nombre, subtitle: v.placas ?? undefined })),
    ];

    return { results: results.slice(0, take), total: results.length };
  }
}
