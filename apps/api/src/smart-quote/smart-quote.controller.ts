import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { CtCatalogSyncService } from './sync/ct-catalog-sync.service.js';
import { ProductSearchService } from './search/product-search.service.js';
import { LaborCatalogService } from './labor/labor-catalog.service.js';
import { CommercialRulesService } from './rules/commercial-rules.service.js';
import { SolutionConfiguratorService } from './configurator/solution-configurator.service.js';
import { QuoteVersionService } from './versioning/quote-version.service.js';
import { QuoteCopilotService } from './ai/quote-copilot.service.js';
import { CtPurchaseOrderService } from './orders/ct-purchase-order.service.js';
import { SupplierAnalyticsService } from './analytics/supplier-analytics.service.js';
import type { OptimizeMode } from './scoring/quote-scoring.js';

@Controller('smart-quote')
@UseGuards(UrlAccessGuard, RbacGuard)
export class SmartQuoteController {
  constructor(
    private readonly sync: CtCatalogSyncService,
    private readonly search: ProductSearchService,
    private readonly labor: LaborCatalogService,
    private readonly rules: CommercialRulesService,
    private readonly configurator: SolutionConfiguratorService,
    private readonly versions: QuoteVersionService,
    private readonly copilot: QuoteCopilotService,
    private readonly jobs: JobQueueService,
    private readonly ctOrders: CtPurchaseOrderService,
    private readonly supplierStats: SupplierAnalyticsService,
  ) {}

  // ── Sync CT (Fase 0) ──────────────────────────────────────────
  @Get('ct/status')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.COTIZACIONES_ACCESS,
      PERMISSIONS.PROCUREMENT_VIEW,
      PERMISSIONS.PROCUREMENT_MANAGE,
      PERMISSIONS.SALES_VIEW,
    ],
  })
  ctStatus() {
    return this.sync.catalogStats();
  }

  @Get('ct/runs')
  @RBAC({ anyPermissions: [PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE] })
  ctRuns(@Query('take') take?: string) {
    return this.sync.latestRuns(take ? Number(take) : 10);
  }

  @Post('ct/sync')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  async triggerSync(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { source?: 'PRIMARY' | 'FULL'; async?: boolean },
  ) {
    if (body?.async) {
      await this.jobs.enqueue('supplier.ct.sync', {
        source: body.source || 'PRIMARY',
        companyId,
      });
      return { queued: true };
    }
    return this.sync.sync({ source: body?.source || 'PRIMARY', companyId });
  }

  // ── Search + scoring (Fase 1) ─────────────────────────────────
  @Get('search')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  searchProducts(
    @Query('q') q?: string,
    @Query('brand') brand?: string,
    @Query('category') category?: string,
    @Query('subcategory') subcategory?: string,
    @Query('inStockOnly') inStockOnly?: string,
    @Query('optimize') optimize?: OptimizeMode,
    @Query('targetMargin') targetMargin?: string,
    @Query('take') take?: string,
  ) {
    return this.search.search({
      q,
      brand,
      category,
      subcategory,
      inStockOnly: inStockOnly !== '0' && inStockOnly !== 'false',
      optimize: optimize || 'BALANCE',
      targetMarginPercent: targetMargin ? Number(targetMargin) : 30,
      take: take ? Number(take) : 24,
    });
  }

  @Get('facets')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  facets() {
    return this.search.facets();
  }

  @Get('substitutes/:clave')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  substitutes(
    @Param('clave') clave: string,
    @Query('optimize') optimize?: OptimizeMode,
    @Query('targetMargin') targetMargin?: string,
  ) {
    return this.search.findSubstitutes(
      clave,
      optimize || 'BALANCE',
      targetMargin ? Number(targetMargin) : 30,
    );
  }

  @Post('line-from-offer')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE] })
  lineFromOffer(
    @Body()
    body: {
      offer: Parameters<ProductSearchService['lineFromOffer']>[0];
      qty?: number;
      optimize?: OptimizeMode;
    },
  ) {
    return this.search.lineFromOffer(body.offer, body.qty || 1, body.optimize || 'BALANCE');
  }

  // ── Labor (Fase 2) ────────────────────────────────────────────
  @Get('labor')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  laborList(@CurrentCompanyId() companyId: number | null) {
    return this.labor.ensureDefaults(companyId);
  }

  @Put('labor')
  @RBAC({ anyPermissions: [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PROCUREMENT_MANAGE] })
  laborUpsert(@CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.labor.upsert(companyId, body);
  }

  @Post('labor/suggest')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE] })
  laborSuggest(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { lines: Array<{ category?: string; subcategory?: string; qty: number; name?: string }> },
  ) {
    return this.labor.suggestForLines(companyId, body.lines || []);
  }

  // ── Commercial rules (Fase 2) ─────────────────────────────────
  @Get('rules')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  rulesList(@CurrentCompanyId() companyId: number | null) {
    return this.rules.ensureDefaults(companyId);
  }

  @Put('rules')
  @RBAC({ permissions: [PERMISSIONS.SALES_MANAGE] })
  rulesUpsert(@CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.rules.upsert(companyId, body);
  }

  @Post('rules/check-margin')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  checkMargin(@CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.rules.checkMargin(companyId, body);
  }

  // ── Configurator + logistics (Fase 3) ─────────────────────────
  @Get('logistics')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  logistics(@CurrentCompanyId() companyId: number | null) {
    return this.configurator.ensureLogisticsDefaults(companyId);
  }

  @Post('configure')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE] })
  configure(@CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.configurator.configure(companyId, body);
  }

  // ── Versioning (Fase 2) ───────────────────────────────────────
  @Get('quotes/:id/versions')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  listVersions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.versions.list(id, companyId);
  }

  @Post('quotes/:id/versions')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE] })
  createVersion(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Body() body: { note?: string },
  ) {
    return this.versions.snapshot(id, companyId, user?.id, body?.note);
  }

  @Get('quotes/:id/versions/:version')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  getVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.versions.get(id, version, companyId);
  }

  // ── CT Online — pedidos (solo partidas CT, post-aprobación) ───
  @Get('ct/orders/preview/:cotizacionId')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE] })
  previewCtOrder(
    @Param('cotizacionId', ParseIntPipe) cotizacionId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ctOrders.previewCtLines(cotizacionId, companyId!);
  }

  @Get('ct/orders/:cotizacionId')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  listCtOrders(
    @Param('cotizacionId', ParseIntPipe) cotizacionId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ctOrders.listForQuote(cotizacionId, companyId!);
  }

  @Post('ct/orders/:cotizacionId')
  @RBAC({ permissions: [PERMISSIONS.SALES_MANAGE] })
  submitCtOrder(
    @Param('cotizacionId', ParseIntPipe) cotizacionId: number,
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ctOrders.submitFromQuote(cotizacionId, companyId!, user?.id, body as any);
  }

  @Get('ct/config')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  ctConfig() {
    return this.ctOrders.getCtConfig();
  }

  @Post('ct/orders/confirm/:orderId')
  @RBAC({ permissions: [PERMISSIONS.SALES_MANAGE] })
  confirmCtOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ctOrders.confirmOrder(orderId, companyId!);
  }

  @Post('ct/orders/refresh/:orderId')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE] })
  refreshCtOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ctOrders.refreshOrderStatus(orderId, companyId!);
  }

  @Get('supplier-stats')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  supplierStatsQuery(
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.supplierStats.getQuoteSupplierStats(companyId!, { from, to, status });
  }

  // ── AI Copilot (Fase 4) ───────────────────────────────────────
  @Post('copilot/draft')
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE] })
  copilotDraft(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { prompt: string },
  ) {
    return this.copilot.draft(companyId, body.prompt || '');
  }
}
