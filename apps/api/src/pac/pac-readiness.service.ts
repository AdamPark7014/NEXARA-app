import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CsdService } from './csd.service.js';
import { buildPacReadinessReport, type PacReadinessReport } from './pac-readiness.js';
import { leeEmisor, leeFacturas } from './pac-readiness.data.js';
import type { PacEmisorEntrada, PacFacturasEntrada } from './pac-readiness.js';

/**
 * Reporte de preparación para facturar (CFDI 4.0). Solo lectura: no timbra, no
 * cancela y no escribe nada. La lógica está en `pac-readiness.ts` (pura);
 * este servicio solo reúne los insumos del proceso en marcha.
 */
@Injectable()
export class PacReadinessService {
  private readonly logger = new Logger(PacReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly csd: CsdService,
  ) {}

  async readiness(companyId?: number | null): Promise<PacReadinessReport> {
    const cid = companyId != null && Number.isFinite(Number(companyId)) && Number(companyId) > 0 ? Number(companyId) : null;

    // Si la base falla, el reporte igual sale, pero el emisor queda «sin verificar» y bloquea.
    let company: PacEmisorEntrada | null | undefined;
    let invoices: PacFacturasEntrada | null = null;
    try {
      company = await leeEmisor(this.prisma, cid);
    } catch (err) {
      this.logger.warn(`Preparación PAC: no se pudieron leer los datos fiscales del emisor: ${(err as Error).message}`);
    }
    try {
      invoices = await leeFacturas(this.prisma, cid);
    } catch (err) {
      this.logger.warn(`Preparación PAC: no se pudieron contar las facturas: ${(err as Error).message}`);
    }

    return buildPacReadinessReport({
      env: process.env,
      company,
      csd: this.csd.info(),
      invoices,
    });
  }
}
