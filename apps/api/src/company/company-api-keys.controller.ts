import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { CompanyApiKeysService } from './company-api-keys.service.js';

@Controller('company/api-keys')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CompanyApiKeysController {
  constructor(private readonly service: CompanyApiKeysService) {}

  @Get('catalog')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  catalog() {
    return this.service.listCatalog();
  }

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  list(@CurrentCompanyId() companyId: number | null) {
    return this.service.list(requireCompanyId(companyId));
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  create(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Body() body: { name: string; scopes?: string[]; expiresAt?: string | null },
  ) {
    return this.service.create(requireCompanyId(companyId), body, user?.id);
  }

  @Delete(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  revoke(@CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.service.revoke(id, requireCompanyId(companyId));
  }
}
