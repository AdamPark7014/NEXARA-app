import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CtOnlineApiConnector,
  type CtPedidoEnvio,
  type CtSolicitarPedidoRequest,
} from '../connectors/ct-online-api.connector.js';
import { costMxn } from '../sync/ct-catalog-sync.service.js';
import { SUPPLIER_PRICING_POLICIES } from '../pricing/supplier-pricing.js';

export type CtPedidoFromQuoteDto = {
  almacen?: string;
  tipoPago?: string;
  cfdi?: string;
  confirm?: boolean;
  envio: CtSolicitarPedidoRequest['envio'];
};

import { CT_ORDER_WAREHOUSES, preferredCatalogWarehouse, stockAtApiWarehouse } from '../ct-warehouses.js';

/** Almacenes CT comunes (código API → etiqueta). */
export const CT_WAREHOUSES = CT_ORDER_WAREHOUSES;

@Injectable()
export class CtPurchaseOrderService {
  private readonly logger = new Logger(CtPurchaseOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctApi: CtOnlineApiConnector,
  ) {}

  defaultAlmacen() {
    const env = process.env.CT_API_ALMACEN;
    if (env && env.length <= 4) return env;
    const wh = preferredCatalogWarehouse();
    const map: Record<string, string> = {
      PUE: '14A',
      MTY: '35A',
      GDL: '46A',
      CDMX: '13A',
      HMO: '01A',
    };
    return map[wh.toUpperCase()] || '01A';
  }

  private almacenLabel(code: string | null | undefined): string | null {
    if (!code) return null;
    const hit = CT_WAREHOUSES.find((w) => w.code === code);
    return hit ? `${hit.code} · ${hit.label}` : code;
  }

  /** Almacén sugerido desde partidas (si todas coinciden) o default. */
  resolveAlmacenFromItems(
    items: Array<{ productCtId?: number | null; supplierWarehouseCode?: string | null }>,
    override?: string,
  ): string {
    if (override?.trim()) return override.trim().toUpperCase();
    const codes = items
      .filter((i) => i.productCtId && i.supplierWarehouseCode?.trim())
      .map((i) => String(i.supplierWarehouseCode).trim().toUpperCase());
    if (codes.length) {
      const unique = [...new Set(codes)];
      if (unique.length === 1) return unique[0];
    }
    return this.defaultAlmacen();
  }

  getCtConfig() {
    return {
      apiConfigured: this.ctApi.isConfigured(),
      defaultAlmacen: this.defaultAlmacen(),
      warehouses: CT_WAREHOUSES,
      pricing: SUPPLIER_PRICING_POLICIES.CT,
    };
  }

  /** Prellena envío desde datos del cliente / proyecto en la cotización. */
  buildDefaultEnvio(quote: {
    clientName?: string | null;
    clientCompany?: string | null;
    clientPhone?: string | null;
    clientAddress?: string | null;
    projectName?: string | null;
  }): CtPedidoEnvio {
    const nombre =
      quote.clientCompany?.trim() ||
      quote.clientName?.trim() ||
      quote.projectName?.trim() ||
      'Cliente NEXARA';
    const phoneDigits = String(quote.clientPhone || '0000000000').replace(/\D/g, '').slice(-10);
    return {
      nombre,
      direccion: quote.clientAddress?.split(',')[0]?.trim() || 'Por confirmar',
      entreCalles: ' ',
      noExterior: 'S/N',
      colonia: 'Por confirmar',
      estado: 'Por confirmar',
      ciudad: 'Por confirmar',
      codigoPostal: '00000',
      telefono: phoneDigits || '0000000000',
    };
  }

  async previewCtLines(cotizacionId: number, companyId: number) {
    const quote = await this.prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId, deletedAt: null },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');

    const ctItems = quote.items.filter((i) => i.productCtId && (i.supplierSku || i.sku));
    if (!ctItems.length) {
      return {
        lines: [],
        subtotalCost: 0,
        subtotalSell: 0,
        marginAmount: 0,
        message: 'No hay partidas de catálogo CT en esta cotización.',
        defaultEnvio: null,
        config: this.getCtConfig(),
        suggestedAlmacen: this.defaultAlmacen(),
        warehouseMismatch: false,
        stockWarnings: [] as string[],
      };
    }

    const lines = await Promise.all(
      ctItems.map(async (item) => {
        const product = await this.prisma.productCT.findUnique({
          where: { id: item.productCtId! },
        });
        const listPrice = product ? Number(product.precio) : Number(item.unitCost || 0);
        const currency = product?.moneda || 'MXN';
        const fx = product?.tipoCambio ? Number(product.tipoCambio) : null;
        const unitCost =
          item.unitCost != null ? Number(item.unitCost) : costMxn(listPrice, currency, fx);
        const unitSell = Number(item.unitPrice);
        const supplierWarehouseCode = item.supplierWarehouseCode?.trim()?.toUpperCase() || null;
        const stockAtWarehouse =
          product?.existencia != null && supplierWarehouseCode
            ? stockAtApiWarehouse(product.existencia, supplierWarehouseCode)
            : null;
        const stockOk = stockAtWarehouse == null ? true : stockAtWarehouse >= item.qty;
        return {
          cotizacionItemId: item.id,
          clave: item.supplierSku || item.sku,
          nombre: item.name,
          qty: item.qty,
          unitCost,
          unitSell,
          marginPercent: item.marginPercent != null ? Number(item.marginPercent) : null,
          currency: 'MXN',
          lineCost: Math.round(unitCost * item.qty * 100) / 100,
          lineSell: Math.round(unitSell * item.qty * 100) / 100,
          supplierCode: 'CT',
          priceIncludesTax: SUPPLIER_PRICING_POLICIES.CT.listPriceIncludesTax,
          supplierWarehouseCode,
          almacenLabel: this.almacenLabel(supplierWarehouseCode),
          stockAtWarehouse,
          stockOk,
        };
      }),
    );

    const subtotalCost = lines.reduce((s, l) => s + l.lineCost, 0);
    const subtotalSell = lines.reduce((s, l) => s + l.lineSell, 0);
    const warehouseCodes = [
      ...new Set(lines.map((l) => l.supplierWarehouseCode).filter(Boolean) as string[]),
    ];
    const suggestedAlmacen = this.resolveAlmacenFromItems(ctItems);
    const warehouseMismatch = warehouseCodes.length > 1;
    const stockWarnings = lines
      .filter((l) => l.supplierWarehouseCode && l.stockOk === false)
      .map(
        (l) =>
          `${l.clave}: solo ${l.stockAtWarehouse ?? 0} u. en ${l.almacenLabel || l.supplierWarehouseCode} (pides ${l.qty})`,
      );
    return {
      lines,
      subtotalCost,
      subtotalSell,
      marginAmount: Math.round((subtotalSell - subtotalCost) * 100) / 100,
      quoteStatus: quote.status,
      defaultEnvio: this.buildDefaultEnvio(quote),
      config: this.getCtConfig(),
      existingOrders: await this.listForQuote(cotizacionId, companyId),
      suggestedAlmacen,
      warehouseMismatch,
      stockWarnings,
    };
  }

  private async assertStockAtAlmacen(
    cotizacionId: number,
    companyId: number,
    almacen: string,
  ) {
    const preview = await this.previewCtLines(cotizacionId, companyId);
    const code = almacen.trim().toUpperCase();
    const shortages: string[] = [];

    for (const line of preview.lines) {
      const product = await this.prisma.productCT.findFirst({
        where: { clave: String(line.clave || '') },
      });
      if (!product?.existencia) continue;
      const avail = stockAtApiWarehouse(product.existencia, code);
      if (avail < line.qty) {
        shortages.push(
          `${line.clave}: ${avail} u. en ${this.almacenLabel(code)} (necesitas ${line.qty})`,
        );
      }
    }

    if (shortages.length) {
      throw new BadRequestException(
        `Stock insuficiente en almacén ${this.almacenLabel(code)}:\n${shortages.join('\n')}`,
      );
    }
  }

  /** Borrador local al aprobar — sin llamar API hasta que operaciones confirme envío. */
  async createDraftOnApproval(cotizacionId: number, companyId: number) {
    const existing = await this.prisma.supplierPurchaseOrder.findFirst({
      where: { cotizacionId, companyId, supplierCode: 'CT' },
    });
    if (existing) return existing;

    const preview = await this.previewCtLines(cotizacionId, companyId);
    if (!preview.lines.length) return null;

    const quote = await this.prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId },
      include: { items: true },
    });
    if (!quote) return null;

    const almacen = this.resolveAlmacenFromItems(quote.items);
    const envio = this.buildDefaultEnvio(quote);
    const payload: CtSolicitarPedidoRequest = {
      idPedido: cotizacionId,
      almacen,
      tipoPago: '99',
      cfdi: 'G01',
      envio: [envio],
      producto: preview.lines.map((l) => ({
        cantidad: l.qty,
        clave: String(l.clave),
        precio: l.unitCost,
        moneda: 'MXN',
      })),
    };

    return this.prisma.supplierPurchaseOrder.create({
      data: {
        companyId,
        cotizacionId,
        supplierCode: 'CT',
        idPedido: cotizacionId,
        almacen,
        status: 'DRAFT',
        requestPayload: payload as object,
      },
    });
  }

  async submitFromQuote(
    cotizacionId: number,
    companyId: number,
    userId: number | undefined,
    dto: CtPedidoFromQuoteDto,
  ) {
    if (!this.ctApi.isConfigured()) {
      throw new BadRequestException(
        'CT API no configurada. Define CT_API_EMAIL, CT_API_CLIENTE y CT_API_RFC en el servidor.',
      );
    }

    const quote = await this.prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId, deletedAt: null },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    if (quote.status !== 'APPROVED') {
      throw new BadRequestException(
        'Solo se pueden pedir productos cuando el cliente aprobó la cotización.',
      );
    }

    const preview = await this.previewCtLines(cotizacionId, companyId);
    if (!preview.lines.length) {
      throw new BadRequestException(preview.message || 'Sin partidas CT');
    }

    if (!dto.envio?.length) {
      throw new BadRequestException('Indica al menos una dirección de envío.');
    }

    const almacen = (dto.almacen || preview.suggestedAlmacen || this.defaultAlmacen()).trim().toUpperCase();

    if (preview.warehouseMismatch) {
      this.logger.warn(
        `Cotización ${cotizacionId}: partidas con almacenes distintos (${preview.lines.map((l) => l.supplierWarehouseCode).join(', ')}). Pedido único desde ${almacen}.`,
      );
    }

    await this.assertStockAtAlmacen(cotizacionId, companyId, almacen);
    const idPedido = cotizacionId;
    const payload: CtSolicitarPedidoRequest = {
      idPedido,
      almacen,
      tipoPago: dto.tipoPago || '99',
      cfdi: dto.cfdi || 'G01',
      envio: dto.envio,
      producto: preview.lines.map((l) => ({
        cantidad: l.qty,
        clave: String(l.clave),
        precio: l.unitCost,
        moneda: 'MXN',
      })),
    };

    const draft = await this.prisma.supplierPurchaseOrder.findFirst({
      where: { cotizacionId, companyId, supplierCode: 'CT', status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    });

    const record =
      draft ??
      (await this.prisma.supplierPurchaseOrder.create({
        data: {
          companyId,
          cotizacionId,
          supplierCode: 'CT',
          idPedido,
          almacen,
          status: 'PENDING',
          requestPayload: payload as object,
          createdById: userId ?? null,
        },
      }));

    if (draft) {
      await this.prisma.supplierPurchaseOrder.update({
        where: { id: draft.id },
        data: { requestPayload: payload as object, almacen, status: 'PENDING' },
      });
    }

    try {
      const response = await this.ctApi.solicitarPedido(payload);
      const folio = response.respuestaCT?.pedidoWeb ?? null;
      let confirmedAt: Date | null = null;
      let status = response.respuestaCT?.estatus || 'PENDING';

      if (dto.confirm && folio) {
        await this.ctApi.confirmarPedido(folio);
        confirmedAt = new Date();
        status = 'CONFIRMED';
      }

      return this.prisma.supplierPurchaseOrder.update({
        where: { id: record.id },
        data: {
          status,
          externalFolio: folio,
          confirmedAt,
          responsePayload: response as object,
          errorMessage: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error CT pedido';
      this.logger.error(`CT pedido cotización ${cotizacionId}: ${message}`);
      await this.prisma.supplierPurchaseOrder.update({
        where: { id: record.id },
        data: { status: 'ERROR', errorMessage: message },
      });
      throw new BadRequestException(message);
    }
  }

  async confirmOrder(orderId: number, companyId: number) {
    const order = await this.prisma.supplierPurchaseOrder.findFirst({
      where: { id: orderId, companyId, supplierCode: 'CT' },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (!order.externalFolio) {
      throw new BadRequestException('El pedido aún no tiene folio CT. Envíalo primero.');
    }
    if (order.status === 'CONFIRMED') return order;

    await this.ctApi.confirmarPedido(order.externalFolio);
    return this.prisma.supplierPurchaseOrder.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
  }

  async refreshOrderStatus(orderId: number, companyId: number) {
    const order = await this.prisma.supplierPurchaseOrder.findFirst({
      where: { id: orderId, companyId },
    });
    if (!order?.externalFolio) throw new BadRequestException('Sin folio CT');
    const status = await this.ctApi.consultarEstatus(order.externalFolio);
    const st = Array.isArray(status) ? status[0]?.status : (status as { status?: string })?.status;
    if (st) {
      return this.prisma.supplierPurchaseOrder.update({
        where: { id: order.id },
        data: { status: String(st).toUpperCase(), responsePayload: status as object },
      });
    }
    return order;
  }

  listForQuote(cotizacionId: number, companyId: number) {
    return this.prisma.supplierPurchaseOrder.findMany({
      where: { cotizacionId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
