import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ORG_ROLE_KEYS } from '../common/org-roles.js';
import { appUrls } from '../common/app-urls.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { empaqueDeCompra, pluralEmpaque, type Empaque } from './empaque.js';
import {
  VENTANA_CONSUMO_DIAS,
  calcularMinMax,
  redondear4,
  sugerenciaReabastecimiento,
  type MovimientoConsumo,
} from './reabastecimiento.js';

/**
 * Lo que cuenta como consumo. Una salida a obra (`DISPATCH`) es demanda real; la merma
 * (`SCRAP`) y los traspasos no lo son, y meterlos inflaría los mínimos de todos.
 */
const TIPOS_CONSUMO: Prisma.StockMovementWhereInput['type'] = { in: ['DISPATCH'] };

/** Un renglón de la vista «Reabastecimiento». */
export type RenglonReabastecimiento = {
  stockLevelId: number;
  productId: number;
  sku: string;
  producto: string;
  unidadBase: string;
  warehouseId: number;
  almacen: string;
  onHand: number;
  reservado: number;
  disponible: number;
  min: number;
  max: number;
  calculadoAt: string | null;
  consumoDiario: number;
  diasDeCobertura: number | null;
  reponer: boolean;
  /** Cantidad a comprar, en unidad base, ya subida a empaque y compra mínima. */
  sugerido: number;
  /** La misma cantidad contada en presentaciones de compra, si el producto tiene. */
  sugeridoEmpaque: { nombre: string; unidades: number; piezasPorUnidad: number } | null;
  leadTimeDias: number;
  compraMinima: number | null;
  /** Historia insuficiente: el número es orientativo. */
  historiaCorta: boolean;
};

type NivelConProducto = {
  id: number;
  productId: number;
  warehouseId: number;
  quantity: Prisma.Decimal | number;
  reservedQty: Prisma.Decimal | number;
  minCalculado: Prisma.Decimal | number | null;
  maxCalculado: Prisma.Decimal | number | null;
  calculadoAt: Date | null;
  product: {
    id: number;
    sku: string;
    name: string;
    unitName: string | null;
    esCirculante: boolean;
    leadTimeDias: number | null;
    compraMinima: Prisma.Decimal | number | null;
    stockSeguridadDias: number | null;
    packagings: Array<{
      id: number;
      nombre: string;
      piezasPorUnidad: Prisma.Decimal | number;
      esDefaultCompra: boolean;
    }>;
  };
  warehouse: { id: number; code: string; name: string };
};

const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

/**
 * Alertamiento de stock y lista de compra.
 *
 * Calcula el mínimo y el máximo de cada material circulante a partir de lo que de verdad
 * salió (ver `reabastecimiento.ts`), los guarda en `StockLevel.minCalculado/maxCalculado`
 * con su `calculadoAt`, y arma la vista «Reabastecimiento» con la cantidad sugerida
 * redondeada al empaque y a la compra mínima del proveedor.
 *
 * El `reorderPoint` capturado a mano sigue viviendo y sigue alertando: esto se suma, no
 * lo sustituye. Cuando hay mínimo calculado, manda el más alto de los dos.
 */
@Injectable()
export class ReabastecimientoService {
  private readonly logger = new Logger(ReabastecimientoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Niveles de material circulante de la empresa, con su producto y sus empaques. */
  private async nivelesCirculantes(
    tenantId: number,
    filtros?: { warehouseId?: number; productId?: number },
  ): Promise<NivelConProducto[]> {
    const where: Prisma.StockLevelWhereInput = {
      locationId: null,
      warehouse: { ...companyWhere(tenantId), isActive: true },
      product: { esCirculante: true, ...companyWhere(tenantId) },
    };
    if (filtros?.warehouseId) where.warehouseId = filtros.warehouseId;
    if (filtros?.productId) where.productId = filtros.productId;

    return this.prisma.stockLevel.findMany({
      where,
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        quantity: true,
        reservedQty: true,
        minCalculado: true,
        maxCalculado: true,
        calculadoAt: true,
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            unitName: true,
            esCirculante: true,
            leadTimeDias: true,
            compraMinima: true,
            stockSeguridadDias: true,
            packagings: {
              select: { id: true, nombre: true, piezasPorUnidad: true, esDefaultCompra: true },
            },
          },
        },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { warehouseId: 'asc' }],
    }) as unknown as Promise<NivelConProducto[]>;
  }

  /**
   * Salidas de los últimos `VENTANA_CONSUMO_DIAS` agrupadas por producto+almacén origen.
   * Una sola consulta para todos los productos: hacerlo renglón por renglón eran cientos
   * de queries en cada recálculo.
   */
  private async consumoPorProductoAlmacen(
    tenantId: number,
    productIds: number[],
    hasta: Date,
  ): Promise<Map<string, MovimientoConsumo[]>> {
    const mapa = new Map<string, MovimientoConsumo[]>();
    if (!productIds.length) return mapa;

    const desde = new Date(hasta.getTime() - VENTANA_CONSUMO_DIAS * 86_400_000);
    const movimientos = await this.prisma.stockMovement.findMany({
      where: {
        ...companyWhere(tenantId),
        type: TIPOS_CONSUMO,
        productId: { in: productIds },
        fromWarehouseId: { not: null },
        createdAt: { gte: desde, lte: hasta },
      },
      select: { productId: true, fromWarehouseId: true, quantity: true, createdAt: true },
    });

    for (const mov of movimientos) {
      if (mov.fromWarehouseId == null) continue;
      const clave = `${mov.productId}:${mov.fromWarehouseId}`;
      const lista = mapa.get(clave) ?? [];
      lista.push({ quantity: Number(mov.quantity), createdAt: mov.createdAt });
      mapa.set(clave, lista);
    }
    return mapa;
  }

  private empaquesDe(nivel: NivelConProducto): Empaque[] {
    return nivel.product.packagings.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      piezasPorUnidad: Number(p.piezasPorUnidad),
      esDefaultCompra: p.esDefaultCompra,
    }));
  }

  /**
   * Recalcula mínimos y máximos y los guarda. Lo llama el job nocturno y el botón
   * «Recalcular» del almacén.
   */
  async recalcular(
    companyId: number | null | undefined,
    filtros?: { warehouseId?: number; productId?: number },
  ) {
    const tenantId = requireCompanyId(companyId);
    const ahora = new Date();
    const niveles = await this.nivelesCirculantes(tenantId, filtros);
    if (!niveles.length) {
      return { recalculados: 0, conMinimo: 0, calculadoAt: ahora.toISOString() };
    }

    const consumo = await this.consumoPorProductoAlmacen(
      tenantId,
      [...new Set(niveles.map((n) => n.productId))],
      ahora,
    );

    let conMinimo = 0;
    for (const nivel of niveles) {
      const empaque = empaqueDeCompra(this.empaquesDe(nivel));
      const calculo = calcularMinMax({
        movimientos: consumo.get(`${nivel.productId}:${nivel.warehouseId}`) ?? [],
        hasta: ahora,
        leadTimeDias: nivel.product.leadTimeDias,
        stockSeguridadDias: nivel.product.stockSeguridadDias,
        compraMinima: num(nivel.product.compraMinima) || null,
        piezasPorEmpaque: empaque ? empaque.piezasPorUnidad : null,
      });
      if (calculo.min > 0) conMinimo += 1;

      await this.prisma.stockLevel.update({
        where: { id: nivel.id },
        data: {
          minCalculado: new Prisma.Decimal(calculo.min),
          maxCalculado: new Prisma.Decimal(calculo.max),
          calculadoAt: ahora,
        },
      });
    }

    this.logger.log(
      `Reabastecimiento empresa ${tenantId}: ${niveles.length} niveles, ${conMinimo} con mínimo`,
    );
    return {
      recalculados: niveles.length,
      conMinimo,
      calculadoAt: ahora.toISOString(),
    };
  }

  /**
   * La vista «Reabastecimiento»: qué comprar y cuánto. Por defecto solo lo que toca
   * pedir; con `todos` se ve el panorama completo del material circulante.
   */
  async listar(
    companyId: number | null | undefined,
    filtros?: { warehouseId?: number; todos?: boolean },
  ): Promise<RenglonReabastecimiento[]> {
    const tenantId = requireCompanyId(companyId);
    const ahora = new Date();
    const niveles = await this.nivelesCirculantes(tenantId, { warehouseId: filtros?.warehouseId });
    if (!niveles.length) return [];

    const consumo = await this.consumoPorProductoAlmacen(
      tenantId,
      [...new Set(niveles.map((n) => n.productId))],
      ahora,
    );

    const renglones: RenglonReabastecimiento[] = [];
    for (const nivel of niveles) {
      const empaque = empaqueDeCompra(this.empaquesDe(nivel));
      const piezasPorEmpaque = empaque ? empaque.piezasPorUnidad : null;
      const compraMinima = num(nivel.product.compraMinima) || null;

      // El guardado manda cuando existe; si el job aún no corrió, se calcula al vuelo
      // para que la pantalla nunca salga vacía por falta de job.
      const guardadoMin = nivel.minCalculado == null ? null : num(nivel.minCalculado);
      const calculo = calcularMinMax({
        movimientos: consumo.get(`${nivel.productId}:${nivel.warehouseId}`) ?? [],
        hasta: ahora,
        leadTimeDias: nivel.product.leadTimeDias,
        stockSeguridadDias: nivel.product.stockSeguridadDias,
        compraMinima,
        piezasPorEmpaque,
      });
      const min = guardadoMin != null ? guardadoMin : calculo.min;
      const max = nivel.maxCalculado != null ? num(nivel.maxCalculado) : calculo.max;

      const sugerencia = sugerenciaReabastecimiento({
        onHand: num(nivel.quantity),
        reservado: num(nivel.reservedQty),
        min,
        max,
        consumoDiario: calculo.consumoDiario,
        compraMinima,
        piezasPorEmpaque,
      });

      if (!filtros?.todos && !sugerencia.reponer) continue;

      renglones.push({
        stockLevelId: nivel.id,
        productId: nivel.productId,
        sku: nivel.product.sku,
        producto: nivel.product.name,
        unidadBase: nivel.product.unitName?.trim() || 'pz',
        warehouseId: nivel.warehouseId,
        almacen: [nivel.warehouse.code, nivel.warehouse.name].filter(Boolean).join(' '),
        onHand: redondear4(num(nivel.quantity)),
        reservado: redondear4(num(nivel.reservedQty)),
        disponible: sugerencia.disponible,
        min,
        max,
        calculadoAt: nivel.calculadoAt ? nivel.calculadoAt.toISOString() : null,
        consumoDiario: calculo.consumoDiario,
        diasDeCobertura: sugerencia.diasDeCobertura,
        reponer: sugerencia.reponer,
        sugerido: sugerencia.sugerido,
        sugeridoEmpaque:
          empaque && piezasPorEmpaque && sugerencia.sugerido > 0
            ? {
                nombre: empaque.nombre,
                unidades: redondear4(sugerencia.sugerido / piezasPorEmpaque),
                piezasPorUnidad: piezasPorEmpaque,
              }
            : null,
        leadTimeDias: calculo.leadTimeDias,
        compraMinima,
        historiaCorta: calculo.historiaCorta,
      });
    }

    // Lo más urgente primero: menos días de cobertura arriba.
    return renglones.sort((a, b) => {
      const da = a.diasDeCobertura ?? Number.POSITIVE_INFINITY;
      const db = b.diasDeCobertura ?? Number.POSITIVE_INFINITY;
      return da - db || a.producto.localeCompare(b.producto, 'es');
    });
  }

  /** Quién se entera de que hay que comprar: almacén, compras y dirección administrativa. */
  private async destinatarios(tenantId: number): Promise<number[]> {
    const usuarios = await this.prisma.user.findMany({
      where: {
        isActive: true,
        companyMemberships: { some: { companyId: tenantId } },
        role: {
          orgRoleKey: {
            in: [
              ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
              ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
              ORG_ROLE_KEYS.DIRECTOR_ADMIN,
            ],
          },
        },
      },
      select: { id: true },
    });
    return [...new Set(usuarios.map((u) => u.id))];
  }

  /**
   * Avisa a almacén y compras de lo que tocó el mínimo. Un aviso por renglón, con
   * dedupe de 24 h dentro de `NotificationsService`, para que el job diario no repita
   * el mismo material todos los días. Devuelve cuántos renglones se reportaron.
   */
  async notificarFaltantes(companyId: number | null | undefined) {
    const tenantId = requireCompanyId(companyId);
    const faltantes = await this.listar(tenantId, {});
    if (!faltantes.length) return 0;

    const destinatarios = await this.destinatarios(tenantId);
    if (!destinatarios.length) return 0;

    for (const renglon of faltantes) {
      const sugerido = renglon.sugeridoEmpaque
        ? `${renglon.sugeridoEmpaque.unidades} ${pluralEmpaque(renglon.sugeridoEmpaque.nombre, renglon.sugeridoEmpaque.unidades)} (${renglon.sugerido} ${renglon.unidadBase})`
        : `${renglon.sugerido} ${renglon.unidadBase}`;
      await this.notifications.createBulkNotifications(
        destinatarios.map((userId) => ({
          userId,
          type: 'STOCK_ALERT',
          category: 'stock-alert',
          title: `Reabastecer — ${renglon.sku}`,
          message: `${renglon.producto} en ${renglon.almacen}: quedan ${renglon.disponible} ${renglon.unidadBase} (mínimo ${renglon.min}). Comprar ${sugerido}.`,
          entityType: 'StockLevel',
          relatedEntityId: renglon.stockLevelId,
          relatedUrl: appUrls.erpAlmacen({ tab: 'reabastecimiento', productId: renglon.productId }),
          priority: renglon.disponible <= 0 ? 'high' : 'normal',
          companyId: tenantId,
          // Un aviso al día por renglón: el job corre de noche y nadie quiere el
          // mismo «faltan conectores» cada mañana mientras la compra va en camino.
          dedupeSeconds: 24 * 3600,
        })),
      );
    }
    return faltantes.length;
  }

  /** Recalcula y avisa en todas las empresas. Lo usa el job nocturno. */
  async recalcularTodasLasEmpresas() {
    const empresas = await this.prisma.companyProfile.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    let renglones = 0;
    for (const empresa of empresas) {
      try {
        await this.recalcular(empresa.id);
        renglones += await this.notificarFaltantes(empresa.id);
      } catch (err) {
        this.logger.warn(
          `Reabastecimiento empresa ${empresa.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { empresas: empresas.length, faltantes: renglones };
  }
}
