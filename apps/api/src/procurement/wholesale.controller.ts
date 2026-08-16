import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WholesaleService } from './wholesale.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

/**
 * Compras a mayorista.
 *
 * Cuelga de `/api/procurement` a propósito: la matriz de URLs ya concede ese
 * prefijo a Administración y Dirección, así que no se abre una puerta nueva.
 *
 * Consultar condiciones y cotizar va con permiso de lectura —quien va a comprar
 * necesita ver el precio antes de pedir la orden—; pactar crédito o cambiar un
 * escalón exige gestión de compras.
 */
@Controller('procurement/mayoristas')
@UseGuards(RbacGuard)
export class WholesaleController {
  constructor(private readonly service: WholesaleService) {}

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE] })
  list(@CurrentCompanyId() companyId: number | null) {
    return this.service.listWholesalers(companyId);
  }

  @Get(':supplierId')
  @RBAC({ anyPermissions: [PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE] })
  terms(
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getTerms(supplierId, companyId);
  }

  @Patch(':supplierId')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  updateTerms(
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @Body()
    body: {
      esMayorista?: boolean;
      creditoDias?: number | null;
      limiteCredito?: number | null;
      descuentoBase?: number | null;
      leadTimeDias?: number | null;
      pedidoMinimo?: number | null;
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateTerms(supplierId, body, companyId);
  }

  @Get(':supplierId/escalones')
  @RBAC({ anyPermissions: [PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE] })
  priceBreaks(
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @CurrentCompanyId() companyId: number | null,
    @Query('productId') productId?: string,
  ) {
    return this.service.listPriceBreaks(
      supplierId,
      companyId,
      productId ? Number(productId) : undefined,
    );
  }

  @Put(':supplierId/escalones')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  upsertPriceBreak(
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @Body()
    body: {
      productId: number;
      cantidadMinima: number;
      unitPrice: number;
      currency?: string;
      vigenteDesde?: string | null;
      vigenteHasta?: string | null;
      activo?: boolean;
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.upsertPriceBreak(supplierId, body, companyId);
  }

  @Delete(':supplierId/escalones/:id')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  deactivatePriceBreak(
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.deactivatePriceBreak(supplierId, id, companyId);
  }

  /** Precio y avisos de una compra antes de emitir la orden. */
  @Post(':supplierId/cotizar')
  @RBAC({ anyPermissions: [PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE] })
  quote(
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @Body() body: { items: Array<{ productId: number; quantity: number; listPrice?: number }> },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.quote(supplierId, body?.items ?? [], companyId);
  }
}
