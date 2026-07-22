import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CatalogService } from './catalog.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const CATALOG_ACCESS = [
  PERMISSIONS.CATALOG_VIEW,
  PERMISSIONS.CATALOG_MANAGE,
  PERMISSIONS.SALES_VIEW,
  PERMISSIONS.SALES_MANAGE,
  PERMISSIONS.COTIZACIONES_ACCESS,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.CONSOLE_ADMIN,
];

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('products')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CATALOG_MANAGE] })
  createProduct(
    @CurrentCompanyId() companyId: number | null,
    @Body() dto: {
    sku?: string;
    name: string;
    category?: string;
    subcategory?: string;
    price?: number;
    currency?: string;
    unit?: string;
    imageUrl?: string;
    description?: string;
    satProductKey?: string;
    satUnitKey?: string;
    unitName?: string;
  }) {
    return this.catalogService.createProduct({ ...dto, companyId });
  }

  @Patch('products/:id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CATALOG_MANAGE] })
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Body() dto: {
      name?: string;
      category?: string;
      subcategory?: string;
      price?: number;
      currency?: string;
      unit?: string;
      imageUrl?: string;
      description?: string;
      satProductKey?: string;
      satUnitKey?: string;
      unitName?: string;
    },
  ) {
    return this.catalogService.updateProduct(id, dto, companyId);
  }

  @Get('products/next-sku')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: CATALOG_ACCESS })
  nextSku(@CurrentCompanyId() companyId: number | null) {
    return this.catalogService.generateNextSku(companyId);
  }

  @Get('products')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: CATALOG_ACCESS })
  listProducts(
    @CurrentCompanyId() companyId: number | null,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.catalogService.listProducts({
      q,
      category,
      brand,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      companyId,
    });
  }

  @Get('products/:id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: CATALOG_ACCESS })
  getProduct(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.catalogService.getProduct(id, companyId);
  }

  @Get('categories')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: CATALOG_ACCESS })
  listCategories(@CurrentCompanyId() companyId: number | null) {
    return this.catalogService.listCategories(companyId);
  }
}
