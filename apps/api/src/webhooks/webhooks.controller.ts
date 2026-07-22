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

@Controller('webhooks')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Get('catalog')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  catalog() {
    return this.service.listCatalog();
  }

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  list(@CurrentCompanyId() companyId: number | null) {
    return this.service.list(companyId);
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { name: string; url: string; events: string[]; secret?: string },
  ) {
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
