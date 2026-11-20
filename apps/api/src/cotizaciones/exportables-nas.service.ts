import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CotizacionesService } from './cotizaciones.service.js';
import {
  parseLimiteExportable,
  parseSoloConProyecto,
  nombreArchivoExportable,
  rutaPdfExportable,
  estadoExportable,
  folioExportable,
  clienteExportable,
  proyectoExportable,
} from './exportables-nas.js';

@Injectable()
export class ExportablesNasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cotizacionesService: CotizacionesService,
  ) {}

  async listar(companyId: number, query: { desde?: string; limite?: unknown; soloConProyecto?: unknown }) {
    const limite = parseLimiteExportable(query.limite);
    const soloConProyecto = parseSoloConProyecto(query.soloConProyecto);
    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (query.desde && this.isValidIsoDate(query.desde)) {
      where.updatedAt = { gt: new Date(query.desde) };
    }
    if (soloConProyecto) {
      where.proyectos = { some: { deletedAt: null } };
    }
    const rows = await this.prisma.cotizacion.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      take: limite,
      select: {
        id: true,
        quoteNumber: true,
        revision: true,
        status: true,
        updatedAt: true,
        total: true,
        currency: true,
        projectName: true,
        clientName: true,
        clientCompany: true,
        salesClient: { select: { name: true } },
        proyectos: {
          where: { deletedAt: null },
          orderBy: { id: 'desc' },
          take: 1,
          select: { id: true, title: true },
        },
      },
    });
    const items = rows.map((row) => {
      const folio = folioExportable(row);
      const cliente = clienteExportable(row);
      return {
        id: row.id,
        folio,
        cliente,
        proyecto: proyectoExportable(row),
        estado: estadoExportable(row.status),
        actualizada: row.updatedAt.toISOString(),
        total: Number(row.total),
        moneda: row.currency,
        operationalProjectId: row.proyectos[0]?.id ?? null,
        nombreArchivo: nombreArchivoExportable({ folio, cliente, actualizada: row.updatedAt }),
        pdf: rutaPdfExportable(row.id),
      };
    });
    const siguienteDesde = rows.length ? rows[rows.length - 1].updatedAt.toISOString() : null;
    return { items, siguienteDesde, limite };
  }

  async pdf(id: number, companyId: number) {
    const row = await this.prisma.cotizacion.findFirst({
      where: { id, companyId, deletedAt: null },
      select: {
        id: true,
        quoteNumber: true,
        revision: true,
        updatedAt: true,
        projectName: true,
        clientName: true,
        clientCompany: true,
        salesClient: { select: { name: true } },
        proyectos: {
          where: { deletedAt: null },
          orderBy: { id: 'desc' },
          take: 1,
          select: { id: true, title: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Cotización no encontrada');
    const buffer = await this.cotizacionesService.getPdfBuffer(id, companyId);
    const folio = folioExportable(row);
    const cliente = clienteExportable(row);
    const nombreArchivo = nombreArchivoExportable({ folio, cliente, actualizada: row.updatedAt });
    return { buffer, nombreArchivo };
  }

  private isValidIsoDate(value: string): boolean {
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  }
}