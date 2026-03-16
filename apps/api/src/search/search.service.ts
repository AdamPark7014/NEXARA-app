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

    const [users, clients, projects, activities, invoices, assets, vehicles, workProjects] = await Promise.all([
      this.prisma.user.findMany({
        where: { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, nombre: true, email: true },
        take,
      }),
      this.prisma.client.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        take,
      }),
      this.prisma.project.findMany({
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
      this.prisma.workProject.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        select: { id: true, title: true },
        take,
      }),
    ]);

    const results: SearchResult[] = [
      ...users.map((u: any) => ({ type: 'user', id: u.id, title: u.nombre, subtitle: u.email })),
      ...clients.map((c: any) => ({ type: 'client', id: c.id, title: c.name })),
      ...projects.map((p: any) => ({ type: 'project', id: p.id, title: p.title })),
      ...activities.map((a: any) => ({ type: 'activity', id: a.id, title: a.titulo })),
      ...invoices.map((i: any) => ({ type: 'invoice', id: i.id, title: i.invoiceNumber, subtitle: i.receptorName ?? undefined })),
      ...assets.map((a: any) => ({ type: 'asset', id: a.id, title: a.name, subtitle: a.code })),
      ...vehicles.map((v: any) => ({ type: 'vehicle', id: v.id, title: v.nombre, subtitle: v.placas ?? undefined })),
      ...workProjects.map((w: any) => ({ type: 'work-project', id: w.id, title: w.title })),
    ];

    return { results: results.slice(0, take), total: results.length };
  }
}
