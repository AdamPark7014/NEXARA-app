import { Injectable } from '@nestjs/common';
import { CotizacionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SUPPLIER_PRICING_POLICIES } from '../pricing/supplier-pricing.js';

export type SupplierCode = keyof typeof SUPPLIER_PRICING_POLICIES | 'MANUAL' | 'OTHER';

const resolveLineSupplier = (item: {
  supplierCode: string | null;
  productCtId: number | null;
}): string => {
  if (item.supplierCode) return item.supplierCode;
  if (item.productCtId) return 'CT';
  return 'MANUAL';
};

@Injectable()
export class SupplierAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getQuoteSupplierStats(
    companyId: number,
    opts?: { from?: string; to?: string; status?: string },
  ) {
    const dateFilter: Prisma.CotizacionWhereInput = {};
    if (opts?.from || opts?.to) {
      dateFilter.issueDate = {};
      if (opts.from) dateFilter.issueDate.gte = new Date(`${opts.from}T00:00:00`);
      if (opts.to) dateFilter.issueDate.lte = new Date(`${opts.to}T23:59:59`);
    }
    if (opts?.status && opts.status in CotizacionStatus) {
      dateFilter.status = opts.status as CotizacionStatus;
    }

    const items = await this.prisma.cotizacionItem.findMany({
      where: {
        cotizacion: {
          companyId,
          deletedAt: null,
          ...dateFilter,
        },
      },
      select: {
        qty: true,
        unitPrice: true,
        unitCost: true,
        tax: true,
        laborHours: true,
        laborRate: true,
        lineTotal: true,
        supplierCode: true,
        productCtId: true,
        cotizacion: {
          select: { id: true, status: true, quoteNumber: true },
        },
      },
    });

    type Bucket = {
      supplierCode: string;
      label: string;
      lineCount: number;
      quoteIds: Set<number>;
      costNet: number;
      sellNet: number;
      taxAmount: number;
      sellWithTax: number;
      marginAmount: number;
      priceIncludesTax: boolean;
      customerTaxPercent: number;
    };

    const buckets = new Map<string, Bucket>();

    for (const item of items) {
      const code = resolveLineSupplier(item);
      const policy = SUPPLIER_PRICING_POLICIES[code];
      const label = policy?.label ?? (code === 'MANUAL' ? 'Manual / otros' : code);

      if (!buckets.has(code)) {
        buckets.set(code, {
          supplierCode: code,
          label,
          lineCount: 0,
          quoteIds: new Set(),
          costNet: 0,
          sellNet: 0,
          taxAmount: 0,
          sellWithTax: 0,
          marginAmount: 0,
          priceIncludesTax: policy?.listPriceIncludesTax ?? false,
          customerTaxPercent: policy?.customerTaxPercent ?? 16,
        });
      }
      const b = buckets.get(code)!;
      b.lineCount += 1;
      b.quoteIds.add(item.cotizacion.id);

      const qty = item.qty;
      const cost = item.unitCost != null ? Number(item.unitCost) : 0;
      const unitSell = Number(item.unitPrice);
      const labor = Number(item.laborHours) * Number(item.laborRate);
      const lineSellNet = qty * unitSell + labor;
      const lineCost = cost > 0 ? qty * cost : 0;
      const lineTax = lineSellNet * (Number(item.tax) / 100);

      b.costNet += lineCost;
      b.sellNet += lineSellNet;
      b.taxAmount += lineTax;
      b.sellWithTax += Number(item.lineTotal);
      b.marginAmount += lineSellNet - lineCost;
    }

    const suppliers = [...buckets.values()]
      .map((b) => ({
        supplierCode: b.supplierCode,
        label: b.label,
        lineCount: b.lineCount,
        quoteCount: b.quoteIds.size,
        costNet: Math.round(b.costNet * 100) / 100,
        sellNet: Math.round(b.sellNet * 100) / 100,
        taxAmount: Math.round(b.taxAmount * 100) / 100,
        sellWithTax: Math.round(b.sellWithTax * 100) / 100,
        marginAmount: Math.round(b.marginAmount * 100) / 100,
        marginPercent:
          b.sellNet > 0 ? Math.round((b.marginAmount / b.sellNet) * 1000) / 10 : 0,
        priceIncludesTax: b.priceIncludesTax,
        customerTaxPercent: b.customerTaxPercent,
      }))
      .sort((a, b) => b.sellWithTax - a.sellWithTax);

    const totals = suppliers.reduce(
      (acc, s) => ({
        quoteCount: acc.quoteCount,
        costNet: acc.costNet + s.costNet,
        sellNet: acc.sellNet + s.sellNet,
        taxAmount: acc.taxAmount + s.taxAmount,
        sellWithTax: acc.sellWithTax + s.sellWithTax,
        marginAmount: acc.marginAmount + s.marginAmount,
      }),
      {
        quoteCount: new Set(items.map((i) => i.cotizacion.id)).size,
        costNet: 0,
        sellNet: 0,
        taxAmount: 0,
        sellWithTax: 0,
        marginAmount: 0,
      },
    );

    return {
      suppliers,
      totals: {
        ...totals,
        costNet: Math.round(totals.costNet * 100) / 100,
        sellNet: Math.round(totals.sellNet * 100) / 100,
        taxAmount: Math.round(totals.taxAmount * 100) / 100,
        sellWithTax: Math.round(totals.sellWithTax * 100) / 100,
        marginAmount: Math.round(totals.marginAmount * 100) / 100,
        marginPercent:
          totals.sellNet > 0
            ? Math.round((totals.marginAmount / totals.sellNet) * 1000) / 10
            : 0,
      },
      policies: SUPPLIER_PRICING_POLICIES,
    };
  }
}
