import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CtFtpConnector } from '../connectors/ct-ftp.connector.js';
import type { NormalizedSupplierProduct, SupplierPullSource } from '../connectors/supplier-connector.js';
import { CT_WAREHOUSE_OPTIONS, normalizeExistencia, preferredCatalogWarehouse, stockAtPreferredWarehouse, stockAtWarehouseCodes } from '../ct-warehouses.js';

export function sumStock(existencia: unknown): number {
  const normalized = normalizeExistencia(existencia);
  return Object.values(normalized).reduce((a, b) => a + b, 0);
}

export function stockAtWarehouse(existencia: unknown, warehouse: string): number {
  return stockAtWarehouseCodes(existencia, [warehouse]);
}

export function costMxn(price: number, currency: string, fx: number | null | undefined): number {
  const cur = (currency || 'MXN').toUpperCase();
  if (cur === 'MXN') return price;
  const rate = fx && fx > 0 ? fx : Number(process.env.CT_FALLBACK_FX || 17);
  return Math.round(price * rate * 100) / 100;
}

type ModoSync = 'PRIMARY' | 'FULL';

/** Tras una cola atorada llegan miles de golpe: si la misma corrida acaba de pasar, la siguiente no hace nada. */
const PAUSA_ENTRE_CORRIDAS_MS: Record<ModoSync, number> = { PRIMARY: 5 * 60_000, FULL: 60 * 60_000 };
/** Con el disco lleno fallan todas: se corta aquí y no al terminar el catálogo. */
const MAX_FILAS_CON_ERROR = 20;
/** Una corrida en RUNNING más vieja que esto se quedó así por un reinicio. */
const CORRIDA_CORTADA_MS = 60 * 60_000;
/** Si el XML trae menos de esta parte de lo activo, el archivo está mal: no se apaga nada. */
const MINIMO_PARA_APAGAR = 0.5;
const APAGAR_DE_A = 500;
const CEDER_CADA = 500;
const LEER_DE_A = 2000;

const CAMPOS_COMPARADOS = {
  id: true,
  clave: true,
  numParte: true,
  nombre: true,
  modelo: true,
  marca: true,
  subcategoria: true,
  categoria: true,
  descripcion_corta: true,
  ean: true,
  upc: true,
  sustituto: true,
  activo: true,
  protegido: true,
  existencia: true,
  precio: true,
  moneda: true,
  tipoCambio: true,
  especificaciones: true,
  promociones: true,
  imagen: true,
} satisfies Prisma.ProductCTSelect;

type FilaComparada = Prisma.ProductCTGetPayload<{ select: typeof CAMPOS_COMPARADOS }>;

/** `{}` quiere decir «sin existencia», y el buscador se apoya en eso. */
function soloConPiezas(existencia: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(existencia).filter(([, piezas]) => Number(piezas) > 0));
}

/** La base guarda el JSON con otro orden de llaves. */
function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([llave, v]) => [llave, ordenado(v)]),
    );
  }
  return valor;
}

/** Para no reescribir lo que no cambió: cada 15 min serían 5,600 filas, y el disco lleno ya tumbó la base (26-10). */
export function firmaDeFila(f: Omit<FilaComparada, 'id' | 'clave'>): string {
  return JSON.stringify(
    ordenado([
      f.numParte, f.nombre, f.modelo, f.marca, f.subcategoria, f.categoria, f.descripcion_corta, f.ean, f.upc, f.sustituto,
      f.activo, f.protegido, f.existencia ?? {}, Number(f.precio) || 0, f.moneda, f.tipoCambio, f.especificaciones ?? [], f.promociones ?? [], f.imagen,
    ]),
  );
}

export function firmaDeProducto(p: NormalizedSupplierProduct): string {
  return firmaDeFila({
    numParte: p.partNumber,
    nombre: p.name,
    modelo: p.model,
    marca: p.brand,
    subcategoria: p.subcategory,
    categoria: p.category,
    descripcion_corta: p.shortDescription,
    ean: p.ean,
    upc: p.upc,
    sustituto: p.substituteSku,
    activo: p.active,
    protegido: p.protected,
    existencia: soloConPiezas(p.existencia),
    precio: p.price,
    moneda: p.currency,
    tipoCambio: p.exchangeRate,
    especificaciones: p.specifications,
    promociones: p.promotions as Prisma.JsonValue,
    imagen: p.imageUrl,
  });
}

@Injectable()
export class CtCatalogSyncService {
  private readonly logger = new Logger(CtCatalogSyncService.name);
  private enCurso = false;
  private readonly ultimaCorrida: Record<ModoSync, number> = { PRIMARY: 0, FULL: 0 };

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

  async sync(opts: { source?: ModoSync; companyId?: number | null; saltarSiReciente?: boolean } = {}) {
    const sourceMode = opts.source || 'PRIMARY';
    const reciente = Date.now() - this.ultimaCorrida[sourceMode] < PAUSA_ENTRE_CORRIDAS_MS[sourceMode];
    if (this.enCurso || (opts.saltarSiReciente && reciente)) {
      return { status: 'SKIPPED' as const, rowsUpserted: 0, error: null };
    }
    this.enCurso = true;
    try {
      return await this.correr(sourceMode, opts.companyId ?? null);
    } finally {
      this.enCurso = false;
      this.ultimaCorrida[sourceMode] = Date.now();
    }
  }

  private async correr(sourceMode: ModoSync, companyId: number | null) {
    await this.prisma.supplierCatalogSyncRun.updateMany({
      where: { supplierCode: this.connector.code, status: 'RUNNING', startedAt: { lt: new Date(Date.now() - CORRIDA_CORTADA_MS) } },
      data: { status: 'ERROR', finishedAt: new Date(), error: 'Interrumpida: el proceso terminó antes de cerrar la corrida.' },
    });
    const run = await this.prisma.supplierCatalogSyncRun.create({
      data: {
        supplierCode: this.connector.code,
        source: sourceMode === 'FULL' ? 'XML' : 'JSON',
        status: 'RUNNING',
        companyId,
      },
    });

    try {
      const pull =
        sourceMode === 'FULL' && this.connector.pullFull
          ? await this.connector.pullFull()
          : await this.connector.pullPrimary();

      const existentes = await this.leerCatalogoGuardado();
      const porClave = new Map(existentes.map((f) => [f.clave, f]));

      let vistos = 0;
      let upserted = 0;
      let conError = 0;
      let primerError: string | null = null;
      for (const product of pull.products) {
        // Comparar 15 mil filas sin soltar el hilo detendría las peticiones de la API.
        if (++vistos % CEDER_CADA === 0) await new Promise((listo) => setImmediate(listo));
        const guardada = porClave.get(product.sku);
        if (guardada && firmaDeFila(guardada) === firmaDeProducto(product)) continue;
        try {
          await this.upsertProduct(product);
          upserted += 1;
        } catch (err) {
          conError += 1;
          primerError ??= `${product.sku}: ${err instanceof Error ? err.message : String(err)}`;
          if (conError >= MAX_FILAS_CON_ERROR) throw err;
        }
      }

      // Solo el XML es el catálogo completo: el JSON trae nada más lo que hay en existencia.
      const apagados = pull.source === 'XML' ? await this.apagarLoQueYaNoViene(existentes, pull.products) : 0;

      if (companyId) {
        const supplier = await this.ensureCtSupplier(companyId);
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
          error: primerError ? `${conError} filas sin guardar. ${primerError}`.slice(0, 2000) : null,
        },
      });

      this.logger.log(
        `CT sync OK source=${pull.source} read=${pull.products.length} upserted=${upserted} apagados=${apagados} conError=${conError}`,
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

  /** Por páginas: un `findMany` sin `take` se corta en 5,000 filas (`row-cap.ts`) y lo demás parecería nuevo o no se apagaría. */
  private async leerCatalogoGuardado() {
    const filas: FilaComparada[] = [];
    for (;;) {
      const pagina = await this.prisma.productCT.findMany({
        select: CAMPOS_COMPARADOS,
        where: { id: { gt: filas[filas.length - 1]?.id ?? 0 } },
        orderBy: { id: 'asc' },
        take: LEER_DE_A,
      });
      filas.push(...pagina);
      if (pagina.length < LEER_DE_A) return filas;
    }
  }

  /** Lo que CT dejó de publicar no se borra: alguna cotización u orden puede apuntarle. */
  private async apagarLoQueYaNoViene(existentes: FilaComparada[], productos: NormalizedSupplierProduct[]) {
    const activas = existentes.filter((f) => f.activo && f.clave);
    if (productos.length < activas.length * MINIMO_PARA_APAGAR) {
      this.logger.warn(`CT XML con ${productos.length} productos contra ${activas.length} activos: no se apaga nada`);
      return 0;
    }
    const vigentes = new Set(productos.map((p) => p.sku));
    const ausentes = activas.filter((f) => !vigentes.has(f.clave!)).map((f) => f.id);
    for (let i = 0; i < ausentes.length; i += APAGAR_DE_A) {
      await this.prisma.productCT.updateMany({ where: { id: { in: ausentes.slice(i, i + APAGAR_DE_A) } }, data: { activo: false } });
    }
    return ausentes.length;
  }

  private async upsertProduct(p: NormalizedSupplierProduct) {
    const data = {
      // El XML no trae este id: no se pisa el que dejó el JSON.
      ...(p.externalId != null ? { idProducto: p.externalId } : {}),
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
      existencia: soloConPiezas(p.existencia) as Prisma.InputJsonValue,
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
      const warehouseStock = stockAtPreferredWarehouse(p.existencia, preferred);
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
    return {
      total,
      active,
      withStock,
      lastSync: last,
      preferredWarehouse: preferredCatalogWarehouse(),
      warehouses: CT_WAREHOUSE_OPTIONS,
    };
  }
}
