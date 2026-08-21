import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId, companyWhere } from '../../common/tenant/tenant-scope.js';

export type MarginCheckResult = {
  ok: boolean;
  marginPercent: number;
  minRequired: number;
  requiresApproval: boolean;
  ruleName: string | null;
  message: string | null;
};

@Injectable()
export class CommercialRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults(companyId?: number | null) {
    const cid = requireCompanyId(companyId);
    const count = await this.prisma.commercialRule.count({ where: companyWhere(cid) });
    if (count === 0) {
      await this.prisma.commercialRule.create({
        data: {
          companyId: cid,
          name: 'Margen mínimo global',
          scope: 'GLOBAL',
          minMarginPercent: new Prisma.Decimal(20),
          maxDiscountPercent: new Prisma.Decimal(15),
          requiresApproval: true,
          active: true,
        },
      });
    }
    return this.list(cid);
  }

  list(companyId?: number | null) {
    const cid = requireCompanyId(companyId);
    return this.prisma.commercialRule.findMany({
      where: { ...companyWhere(cid), active: true },
      orderBy: { name: 'asc' },
    });
  }

  async upsert(
    companyId: number | null | undefined,
    body: {
      id?: number;
      name: string;
      scope?: string;
      scopeValue?: string | null;
      minMarginPercent?: number | null;
      maxDiscountPercent?: number | null;
      requiresApproval?: boolean;
      active?: boolean;
    },
  ) {
    const cid = requireCompanyId(companyId);
    if (body.id) {
      return this.prisma.commercialRule.update({
        where: { id: body.id },
        data: {
          name: body.name,
          scope: body.scope || 'GLOBAL',
          scopeValue: body.scopeValue ?? null,
          minMarginPercent:
            body.minMarginPercent != null ? new Prisma.Decimal(body.minMarginPercent) : null,
          maxDiscountPercent:
            body.maxDiscountPercent != null ? new Prisma.Decimal(body.maxDiscountPercent) : null,
          requiresApproval: body.requiresApproval ?? true,
          active: body.active ?? true,
        },
      });
    }
    return this.prisma.commercialRule.create({
      data: {
        companyId: cid,
        name: body.name,
        scope: body.scope || 'GLOBAL',
        scopeValue: body.scopeValue ?? null,
        minMarginPercent:
          body.minMarginPercent != null ? new Prisma.Decimal(body.minMarginPercent) : null,
        maxDiscountPercent:
          body.maxDiscountPercent != null ? new Prisma.Decimal(body.maxDiscountPercent) : null,
        requiresApproval: body.requiresApproval ?? true,
        active: body.active ?? true,
      },
    });
  }

  async checkMargin(
    companyId: number | null | undefined,
    input: {
      unitCost: number;
      unitPrice: number;
      discountPercent?: number;
      category?: string | null;
      brand?: string | null;
    },
  ): Promise<MarginCheckResult> {
    await this.ensureDefaults(companyId);
    const cid = requireCompanyId(companyId);
    const rules = await this.prisma.commercialRule.findMany({
      where: { ...companyWhere(cid), active: true },
    });

    const sell = input.unitPrice * (1 - (input.discountPercent || 0) / 100);
    const marginPercent =
      sell <= 0 ? 0 : Math.round(((sell - input.unitCost) / sell) * 10000) / 100;

    let applicable = rules.filter((r) => r.scope === 'GLOBAL');
    if (input.category) {
      applicable = [
        ...applicable,
        ...rules.filter(
          (r) =>
            r.scope === 'CATEGORY' &&
            r.scopeValue &&
            input.category!.toLowerCase().includes(r.scopeValue.toLowerCase()),
        ),
      ];
    }
    if (input.brand) {
      applicable = [
        ...applicable,
        ...rules.filter(
          (r) =>
            r.scope === 'BRAND' &&
            r.scopeValue &&
            input.brand!.toLowerCase().includes(r.scopeValue.toLowerCase()),
        ),
      ];
    }

    let minRequired = 0;
    let requiresApproval = false;
    let ruleName: string | null = null;
    for (const r of applicable) {
      const min = r.minMarginPercent != null ? Number(r.minMarginPercent) : 0;
      if (min > minRequired) {
        minRequired = min;
        ruleName = r.name;
        requiresApproval = r.requiresApproval;
      }
      if (r.maxDiscountPercent != null && (input.discountPercent || 0) > Number(r.maxDiscountPercent)) {
        return {
          ok: false,
          marginPercent,
          minRequired: min,
          requiresApproval: true,
          ruleName: r.name,
          message: `Descuento ${(input.discountPercent || 0).toFixed(1)}% supera el máximo ${Number(r.maxDiscountPercent)}% (${r.name}).`,
        };
      }
    }

    if (marginPercent + 0.001 < minRequired) {
      return {
        ok: false,
        marginPercent,
        minRequired,
        requiresApproval,
        ruleName,
        message: `Margen ${marginPercent.toFixed(1)}% debajo del mínimo ${minRequired}%${ruleName ? ` (${ruleName})` : ''}.`,
      };
    }

    return {
      ok: true,
      marginPercent,
      minRequired,
      requiresApproval: false,
      ruleName,
      message: null,
    };
  }
}
