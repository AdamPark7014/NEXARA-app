import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CatalogService } from './catalog.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

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
  createProduct(@Body() dto: { sku: string; name: string; category?: string; price?: number; description?: string }) {
    return this.catalogService.createProduct(dto);
  }

  @Get('products')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: CATALOG_ACCESS })
  listProducts(
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
    });
  }

  @Get('products/:id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: CATALOG_ACCESS })
  getProduct(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.getProduct(id);
  }

  @Get('categories')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: CATALOG_ACCESS })
  listCategories() {
    return this.catalogService.listCategories();
  }
}
