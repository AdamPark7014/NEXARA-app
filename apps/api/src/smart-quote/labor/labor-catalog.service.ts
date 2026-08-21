import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId, companyWhere } from '../../common/tenant/tenant-scope.js';

const DEFAULT_CARDS = [
  { code: 'CAM_INSTALL', name: 'Instalación de cámara', category: 'INSTALL', unit: 'PIECE', cost: 350, price: 550, matchCategory: 'Video Vigilancia', matchSubcategory: null as string | null, defaultHours: null as number | null },
  { code: 'AP_INSTALL', name: 'Instalación de access point', category: 'INSTALL', unit: 'PIECE', cost: 280, price: 450, matchCategory: 'Red Activa', matchSubcategory: 'Access Points', defaultHours: null },
  { code: 'SW_INSTALL', name: 'Instalación de switch', category: 'INSTALL', unit: 'PIECE', cost: 400, price: 650, matchCategory: 'Red Activa', matchSubcategory: null, defaultHours: null },
  { code: 'RACK_INSTALL', name: 'Instalación de rack', category: 'INSTALL', unit: 'JOB', cost: 1200, price: 1900, matchCategory: null, matchSubcategory: null, defaultHours: null },
  { code: 'CABLING_M', name: 'Cableado estructurado', category: 'INSTALL', unit: 'METER', cost: 18, price: 35, matchCategory: 'Cables', matchSubcategory: null, defaultHours: null },
  { code: 'CONFIG_H', name: 'Configuración / programación', category: 'ENGINEERING', unit: 'HOUR', cost: 450, price: 750, matchCategory: null, matchSubcategory: null, defaultHours: 1 },
  { code: 'COMM_START', name: 'Puesta en marcha', category: 'ENGINEERING', unit: 'JOB', cost: 2500, price: 4200, matchCategory: null, matchSubcategory: null, defaultHours: null },
  { code: 'TRAINING', name: 'Capacitación', category: 'SUPPORT', unit: 'HOUR', cost: 500, price: 850, matchCategory: null, matchSubcategory: null, defaultHours: 2 },
];

@Injectable()
export class LaborCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults(companyId?: number | null) {
    const cid = requireCompanyId(companyId);
    for (const card of DEFAULT_CARDS) {
      await this.prisma.laborRateCard.upsert({
        where: { companyId_code: { companyId: cid, code: card.code } },
        create: {
          companyId: cid,
          code: card.code,
          name: card.name,
          category: card.category,
          unit: card.unit,
          cost: new Prisma.Decimal(card.cost),
          price: new Prisma.Decimal(card.price),
          marginPercent: new Prisma.Decimal(((card.price - card.cost) / card.price) * 100),
          defaultHours: card.defaultHours != null ? new Prisma.Decimal(card.defaultHours) : null,
          matchCategory: card.matchCategory,
          matchSubcategory: card.matchSubcategory,
          active: true,
        },
        update: {},
      });
    }
    return this.list(cid);
  }

  list(companyId?: number | null) {
    const cid = requireCompanyId(companyId);
    return this.prisma.laborRateCard.findMany({
      where: { ...companyWhere(cid), active: true },
      include: { rules: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async upsert(
    companyId: number | null | undefined,
    body: {
      code: string;
      name: string;
      category: string;
      unit?: string;
      cost: number;
      price: number;
      defaultHours?: number | null;
      technicians?: number;
      matchCategory?: string | null;
      matchSubcategory?: string | null;
      active?: boolean;
    },
  ) {
    const cid = requireCompanyId(companyId);
    const margin = body.price > 0 ? ((body.price - body.cost) / body.price) * 100 : 0;
    return this.prisma.laborRateCard.upsert({
      where: { companyId_code: { companyId: cid, code: body.code } },
      create: {
        companyId: cid,
        code: body.code,
        name: body.name,
        category: body.category,
        unit: body.unit || 'PIECE',
        cost: new Prisma.Decimal(body.cost),
        price: new Prisma.Decimal(body.price),
        marginPercent: new Prisma.Decimal(margin),
        defaultHours: body.defaultHours != null ? new Prisma.Decimal(body.defaultHours) : null,
        technicians: body.technicians ?? 1,
        matchCategory: body.matchCategory ?? null,
        matchSubcategory: body.matchSubcategory ?? null,
        active: body.active ?? true,
      },
      update: {
        name: body.name,
        category: body.category,
        unit: body.unit || 'PIECE',
        cost: new Prisma.Decimal(body.cost),
        price: new Prisma.Decimal(body.price),
        marginPercent: new Prisma.Decimal(margin),
        defaultHours: body.defaultHours != null ? new Prisma.Decimal(body.defaultHours) : null,
        technicians: body.technicians ?? 1,
        matchCategory: body.matchCategory ?? null,
        matchSubcategory: body.matchSubcategory ?? null,
        active: body.active ?? true,
      },
    });
  }

  /**
   * Sugiere líneas de mano de obra a partir de productos agregados al BOM.
   */
  async suggestForLines(
    companyId: number | null | undefined,
    lines: Array<{ category?: string | null; subcategory?: string | null; qty: number; name?: string }>,
  ) {
    const cards = await this.ensureDefaults(companyId);
    const suggestions: Array<{
      code: string;
      name: string;
      category: string;
      qty: number;
      unitPrice: number;
      unitCost: number;
      laborHours: number;
      laborRate: number;
      reason: string;
    }> = [];

    for (const card of cards) {
      const matchLines = lines.filter((l) => {
        if (card.matchSubcategory && l.subcategory) {
          return l.subcategory.toLowerCase().includes(card.matchSubcategory.toLowerCase());
        }
        if (card.matchCategory && l.category) {
          return l.category.toLowerCase().includes(card.matchCategory.toLowerCase());
        }
        return false;
      });
      if (!matchLines.length) continue;

      const qtySum = matchLines.reduce((a, l) => a + Math.max(1, l.qty), 0);
      if (card.unit === 'HOUR') {
        const hours = Number(card.defaultHours || 1) * Math.max(1, card.technicians);
        suggestions.push({
          code: card.code,
          name: card.name,
          category: card.category,
          qty: 1,
          unitPrice: 0,
          unitCost: Number(card.cost) * hours,
          laborHours: hours,
          laborRate: Number(card.price),
          reason: `Tabulador ${card.code} por horas`,
        });
      } else if (card.unit === 'JOB') {
        suggestions.push({
          code: card.code,
          name: card.name,
          category: card.category,
          qty: 1,
          unitPrice: Number(card.price),
          unitCost: Number(card.cost),
          laborHours: 0,
          laborRate: 0,
          reason: `Tabulador ${card.code} por proyecto`,
        });
      } else {
        // PIECE / METER
        suggestions.push({
          code: card.code,
          name: card.name,
          category: card.category,
          qty: qtySum,
          unitPrice: Number(card.price),
          unitCost: Number(card.cost),
          laborHours: 0,
          laborRate: 0,
          reason: `Tabulador ${card.code} × ${qtySum} unidades`,
        });
      }
    }

    return suggestions;
  }

  async get(companyId: number | null | undefined, code: string) {
    const cid = requireCompanyId(companyId);
    const card = await this.prisma.laborRateCard.findUnique({
      where: { companyId_code: { companyId: cid, code } },
    });
    if (!card) throw new NotFoundException(`Tabulador ${code} no encontrado`);
    return card;
  }
}
