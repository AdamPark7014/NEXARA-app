import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId, companyWhere } from '../../common/tenant/tenant-scope.js';
import { ProductSearchService } from '../search/product-search.service.js';
import type { OptimizeMode } from '../scoring/quote-scoring.js';
import { LaborCatalogService } from '../labor/labor-catalog.service.js';

export type SolutionTemplate = 'CCTV' | 'WIFI' | 'ACCESS' | 'CUSTOM';

@Injectable()
export class SolutionConfiguratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: ProductSearchService,
    private readonly labor: LaborCatalogService,
  ) {}

  async ensureLogisticsDefaults(companyId?: number | null) {
    const cid = requireCompanyId(companyId);
    const defaults = [
      { zoneCode: 'LOCAL_PUE', zoneName: 'Local Puebla', baseCost: 350, basePrice: 650 },
      { zoneCode: 'CDMX', zoneName: 'Ciudad de México', baseCost: 900, basePrice: 1500 },
      { zoneCode: 'FORANEO', zoneName: 'Foráneo nacional', baseCost: 1800, basePrice: 2800 },
    ];
    for (const z of defaults) {
      await this.prisma.logisticsZoneRate.upsert({
        where: { companyId_zoneCode: { companyId: cid, zoneCode: z.zoneCode } },
        create: {
          companyId: cid,
          ...z,
          baseCost: new Prisma.Decimal(z.baseCost),
          basePrice: new Prisma.Decimal(z.basePrice),
          active: true,
        },
        update: {},
      });
    }
    return this.prisma.logisticsZoneRate.findMany({
      where: { ...companyWhere(cid), active: true },
      orderBy: { zoneName: 'asc' },
    });
  }

  /**
   * Genera un BOM sugerido a partir de un template de solución.
   */
  async configure(
    companyId: number | null | undefined,
    input: {
      template: SolutionTemplate;
      cameras?: number;
      storageDays?: number;
      accessPoints?: number;
      doors?: number;
      optimize?: OptimizeMode;
      targetMarginPercent?: number;
      logisticsZone?: string;
      includeLabor?: boolean;
    },
  ) {
    const mode = input.optimize || 'BALANCE';
    const margin = input.targetMarginPercent ?? 30;
    const lines: Array<Record<string, unknown>> = [];
    const notes: string[] = [];

    if (input.template === 'CCTV' || (input.cameras && input.cameras > 0)) {
      const cams = Math.max(1, input.cameras || 8);
      const camSearch = await this.search.search({
        q: 'cámara IP exterior',
        category: 'Video Vigilancia',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 5,
      });
      if (camSearch.data[0]) {
        lines.push(this.search.lineFromOffer(camSearch.data[0], cams, mode));
      }

      const channels = Math.max(16, Math.ceil(cams / 8) * 8);
      const nvrSearch = await this.search.search({
        q: `NVR ${channels}`,
        category: 'Video Vigilancia',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 5,
      });
      if (nvrSearch.data[0]) {
        lines.push(this.search.lineFromOffer(nvrSearch.data[0], 1, mode));
      } else {
        notes.push(`No se encontró NVR ~${channels} canales con stock; agregar manualmente.`);
      }

      // HDD rough: ~1TB per 4 cams @ 30 days (heuristic)
      const days = input.storageDays || 30;
      const tb = Math.max(2, Math.ceil((cams * days) / 60));
      const hddSearch = await this.search.search({
        q: `disco duro ${tb}TB vigilancia`,
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 5,
      });
      if (hddSearch.data[0]) {
        lines.push(this.search.lineFromOffer(hddSearch.data[0], Math.ceil(tb / 4) || 1, mode));
      }

      const swSearch = await this.search.search({
        q: 'switch PoE',
        category: 'Red Activa',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 5,
      });
      if (swSearch.data[0]) {
        const swQty = Math.ceil(cams / 16) || 1;
        lines.push(this.search.lineFromOffer(swSearch.data[0], swQty, mode));
      }
    }

    if (input.template === 'WIFI' || (input.accessPoints && input.accessPoints > 0)) {
      const aps = Math.max(1, input.accessPoints || 4);
      const apSearch = await this.search.search({
        q: 'access point',
        subcategory: 'Access Points',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 5,
      });
      if (apSearch.data[0]) {
        lines.push(this.search.lineFromOffer(apSearch.data[0], aps, mode));
      }
      const swSearch = await this.search.search({
        q: 'switch PoE 24',
        category: 'Red Activa',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 5,
      });
      if (swSearch.data[0]) {
        lines.push(this.search.lineFromOffer(swSearch.data[0], Math.ceil(aps / 12) || 1, mode));
      }
    }

    if (input.template === 'ACCESS' || (input.doors && input.doors > 0)) {
      const doors = Math.max(1, input.doors || 1);
      const doorSearch = await this.search.search({
        q: 'control de acceso',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 5,
      });
      if (doorSearch.data[0]) {
        lines.push(this.search.lineFromOffer(doorSearch.data[0], doors, mode));
      }
    }

    // Accesorios sugeridos genéricos
    const accessoryHints = await this.suggestMissingAccessories(lines as any, mode, margin);
    lines.push(...accessoryHints.lines);
    notes.push(...accessoryHints.notes);

    let labor: Awaited<ReturnType<LaborCatalogService['suggestForLines']>> = [];
    if (input.includeLabor !== false) {
      labor = await this.labor.suggestForLines(
        companyId,
        lines.map((l) => ({
          category: String(l.category || ''),
          subcategory: undefined,
          qty: Number(l.qty) || 1,
          name: String(l.name || ''),
        })),
      );
    }

    let logistics: Record<string, unknown> | null = null;
    if (input.logisticsZone) {
      const zones = await this.ensureLogisticsDefaults(companyId);
      const zone = zones.find((z) => z.zoneCode === input.logisticsZone) || zones[0];
      if (zone) {
        logistics = {
          zoneCode: zone.zoneCode,
          zoneName: zone.zoneName,
          unitCost: Number(zone.baseCost),
          unitPrice: Number(zone.basePrice),
          name: `Logística / entrega — ${zone.zoneName}`,
          category: 'LOGISTICS',
          qty: 1,
          tax: 16,
          discount: 0,
        };
      }
    }

    return {
      template: input.template,
      optimize: mode,
      hardware: lines,
      labor,
      logistics,
      notes,
    };
  }

  async suggestMissingAccessories(
    lines: Array<{ name?: string; category?: string; sku?: string }>,
    mode: OptimizeMode,
    margin: number,
  ) {
    const notes: string[] = [];
    const out: Array<Record<string, unknown>> = [];
    const blob = lines.map((l) => `${l.name} ${l.category}`).join(' ').toLowerCase();

    const wantsPoE = /cámara|camera|access point|ap\b/.test(blob);
    const hasSwitch = /switch/.test(blob);
    if (wantsPoE && !hasSwitch) {
      const sw = await this.search.search({
        q: 'switch PoE',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 3,
      });
      if (sw.data[0]) {
        out.push(this.search.lineFromOffer(sw.data[0], 1, mode));
        notes.push('Se sugirió switch PoE por cámaras/APs sin switch en el BOM.');
      }
    }

    const wantsPower = /nvr|switch|servidor/.test(blob);
    const hasUps = /ups|no break/.test(blob);
    if (wantsPower && !hasUps) {
      const ups = await this.search.search({
        q: 'UPS',
        category: 'Respaldo y Regulación',
        inStockOnly: true,
        optimize: mode,
        targetMarginPercent: margin,
        take: 3,
      });
      if (ups.data[0]) {
        out.push(this.search.lineFromOffer(ups.data[0], 1, mode));
        notes.push('Se sugirió UPS para respaldar NVR/switch.');
      }
    }

    return { lines: out, notes };
  }
}
