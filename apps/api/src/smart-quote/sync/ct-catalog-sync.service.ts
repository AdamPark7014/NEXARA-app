import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CtFtpConnector } from '../connectors/ct-ftp.connector.js';
import type { NormalizedSupplierProduct, SupplierPullSource } from '../connectors/supplier-connector.js';

export function sumStock(existencia: Record<string, number> | null | undefined): number {
  if (!existencia) return 0;
  return Object.values(existencia).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function stockAtWarehouse(
  existencia: Record<string, number> | null | undefined,
  warehouse: string,
): number {
  if (!existencia) return 0;
  return Number(existencia[warehouse] || 0);
}

export function costMxn(price: number, currency: string, fx: number | null | undefined): number {
  const cur = (currency || 'MXN').toUpperCase();
  if (cur === 'MXN') return price;
  const rate = fx && fx > 0 ? fx : Number(process.env.CT_FALLBACK_FX || 17);
  return Math.round(price * rate * 100) / 100;
}

@Injectable()
export class CtCatalogSyncService {
  private readonly logger = new Logger(CtCatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connector: CtFtpConnector,
  ) {}

  preferredWarehouse() {
    return process.env.CT_PREFERRED_WAREHOUSE || 'PUE';
  }

  async ensureCtSupplier(companyId: number) {
    const name = 'CT Online';
    const existing = await this.prisma.supplier.findFirst({
      where: { companyId, name },
    });
    if (existing) {
      if (!existing.esMayorista) {
        return this.prisma.supplier.update({
          where: { id: existing.id },
          data: { esMayorista: true, isActive: true, leadTimeDias: existing.leadTimeDias ?? 3 },
        });
      }
      return existing;
    }
    return this.prisma.supplier.create({
      data: {
        companyId,
        name,
        esMayorista: true,
        isActive: true,
        leadTimeDias: 3,
        description: 'Feed FTP CT Online (productos.json)',
        apiUrl: process.env.CT_FTP_HOST || undefined,
      },
    });
  }

  async sync(opts: { source?: 'PRIMARY' | 'FULL'; companyId?: number | null } = {}) {
    const sourceMode = opts.source || 'PRIMARY';
    const run = await this.prisma.supplierCatalogSyncRun.create({
      data: {
        supplierCode: this.connector.code,
        source: sourceMode === 'FULL' ? 'XML' : 'JSON',
        status: 'RUNNING',
        companyId: opts.companyId ?? null,
      },
    });

    try {
      const pull =
        sourceMode === 'FULL' && this.connector.pullFull
          ? await this.connector.pullFull()
          : await this.connector.pullPrimary();

      let upserted = 0;
      const batchSize = 100;
      for (let i = 0; i < pull.products.length; i += batchSize) {
        const batch = pull.products.slice(i, i + batchSize);
        for (const product of batch) {
          await this.upsertProduct(product);
          upserted += 1;
        }
      }

      if (opts.companyId) {
        const supplier = await this.ensureCtSupplier(opts.companyId);
        await this.linkSupplierProducts(supplier.id, pull.products);
      }

      const finished = await this.prisma.supplierCatalogSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'OK',
          finishedAt: new Date(),
          rowsRead: pull.products.length,
          rowsUpserted: upserted,
          fileModifiedAt: pull.fileModifiedAt,
          checksum: pull.checksum,
          source: pull.source as SupplierPullSource,
        },
      });

      this.logger.log(
        `CT sync OK source=${pull.source} read=${pull.products.length} upserted=${upserted}`,
      );
      return finished;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`CT sync failed: ${message}`);
      return this.prisma.supplierCatalogSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'ERROR',
          finishedAt: new Date(),
          error: message.slice(0, 2000),
        },
      });
    }
  }

  private async upsertProduct(p: NormalizedSupplierProduct) {
    const data = {
      idProducto: p.externalId,
      clave: p.sku,
      numParte: p.partNumber,
      nombre: p.name,
      modelo: p.model,
      idMarca: p.brandIdExternal,
      marca: p.brand,
      idSubCategoria: p.subcategoryIdExternal,
      subcategoria: p.subcategory,
      idCategoria: p.categoryIdExternal,
      categoria: p.category,
      descripcion_corta: p.shortDescription,
      ean: p.ean,
      upc: p.upc,
      sustituto: p.substituteSku,
      activo: p.active,
      protegido: p.protected,
      existencia: p.existencia as Prisma.InputJsonValue,
      precio: p.price,
      moneda: p.currency,
      tipoCambio: p.exchangeRate,
      especificaciones: p.specifications as Prisma.InputJsonValue,
      promociones: p.promotions as Prisma.InputJsonValue,
      imagen: p.imageUrl,
      name: p.name,
      description: p.shortDescription,
      imageUrl: p.imageUrl,
      thumbnailUrl: p.imageUrl,
    };

    await this.prisma.productCT.upsert({
      where: { clave: p.sku },
      create: data,
      update: data,
    });
  }

  private async linkSupplierProducts(supplierId: number, products: NormalizedSupplierProduct[]) {
    const preferred = this.preferredWarehouse();
    for (const p of products) {
      const ct = await this.prisma.productCT.findUnique({ where: { clave: p.sku } });
      if (!ct) continue;
      const stock = sumStock(p.existencia);
      const warehouseStock = stockAtWarehouse(p.existencia, preferred);
      const leadTime = warehouseStock > 0 ? 1 : stock > 0 ? 3 : 15;
      await this.prisma.supplierProduct.upsert({
        where: {
          supplierId_productId: { supplierId, productId: ct.id },
        },
        create: {
          supplierId,
          productId: ct.id,
          supplierSku: p.sku,
          price: new Prisma.Decimal(p.price),
          currency: p.currency,
          stock,
          leadTime,
          active: p.active,
        },
        update: {
          supplierSku: p.sku,
          price: new Prisma.Decimal(p.price),
          currency: p.currency,
          stock,
          leadTime,
          active: p.active,
        },
      });
    }
  }

  async latestRuns(take = 10) {
    return this.prisma.supplierCatalogSyncRun.findMany({
      where: { supplierCode: this.connector.code },
      orderBy: { startedAt: 'desc' },
      take,
    });
  }

  async catalogStats() {
    const [total, active, withStock] = await Promise.all([
      this.prisma.productCT.count(),
      this.prisma.productCT.count({ where: { activo: true } }),
      this.prisma.productCT.count({
        where: {
          activo: true,
          NOT: { existencia: { equals: {} } },
        },
      }),
    ]);
    const last = await this.prisma.supplierCatalogSyncRun.findFirst({
      where: { supplierCode: this.connector.code, status: 'OK' },
      orderBy: { finishedAt: 'desc' },
    });
    return { total, active, withStock, lastSync: last };
  }
}
