import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertCompanyAccess, requireCompanyId } from '../../common/tenant/tenant-scope.js';

@Injectable()
export class QuoteVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(cotizacionId: number, companyId: number | null | undefined, createdById?: number, note?: string) {
    const cid = requireCompanyId(companyId);
    const quote = await this.prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId: cid },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    assertCompanyAccess(quote, cid);

    const last = await this.prisma.cotizacionVersion.findFirst({
      where: { cotizacionId },
      orderBy: { version: 'desc' },
    });
    const version = (last?.version || 0) + 1;

    return this.prisma.cotizacionVersion.create({
      data: {
        cotizacionId,
        version,
        snapshot: JSON.parse(JSON.stringify(quote)),
        note: note || null,
        createdById: createdById || null,
      },
    });
  }

  async list(cotizacionId: number, companyId: number | null | undefined) {
    const cid = requireCompanyId(companyId);
    const quote = await this.prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId: cid },
      select: { id: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    return this.prisma.cotizacionVersion.findMany({
      where: { cotizacionId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        note: true,
        createdAt: true,
        createdById: true,
      },
    });
  }

  async get(cotizacionId: number, version: number, companyId: number | null | undefined) {
    const cid = requireCompanyId(companyId);
    const quote = await this.prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId: cid },
      select: { id: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    const row = await this.prisma.cotizacionVersion.findUnique({
      where: { cotizacionId_version: { cotizacionId, version } },
    });
    if (!row) throw new NotFoundException(`Versión ${version} no encontrada`);
    return row;
  }
}
