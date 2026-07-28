import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { WebhooksService } from './webhooks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertFeature } from '../common/tenant/plan-features.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';

@Controller('webhooks')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class WebhooksController {
  constructor(
    private readonly service: WebhooksService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertWebhooksPlan(companyId: number | null) {
    const id = requireCompanyId(companyId);
    const company = await this.prisma.companyProfile.findUnique({
      where: { id },
      select: { planCode: true },
    });
    assertFeature(company?.planCode, 'webhooks', 'Webhooks outbound');
  }

  @Get('catalog')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  catalog() {
    return this.service.listCatalog();
  }

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  async list(@CurrentCompanyId() companyId: number | null) {
    await this.assertWebhooksPlan(companyId);
    return this.service.list(companyId);
  }

  @Get('dlq')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  async dlq(
    @CurrentCompanyId() companyId: number | null,
    @Query('limit') limit?: string,
  ) {
    await this.assertWebhooksPlan(companyId);
    return this.service.listDlq(companyId, limit ? Number(limit) : 50);
  }

  @Post('deliveries/:deliveryId/replay')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  async replay(
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    await this.assertWebhooksPlan(companyId);
    return this.service.replayDelivery(deliveryId, companyId);
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  async create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { name: string; url: string; events: string[]; secret?: string },
  ) {
    await this.assertWebhooksPlan(companyId);
    return this.service.create(body, user?.id, companyId);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: any,
  ) {
    return this.service.update(id, body, companyId);
  }

  @Delete(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.remove(id, companyId);
  }

  @Get(':id/deliveries')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  deliveries(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Query('limit') limit?: string,
  ) {
    return this.service.listDeliveries(id, limit ? Number(limit) : 50, companyId);
  }

  @Post(':id/test')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  test(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.testPing(id, companyId);
  }
}
