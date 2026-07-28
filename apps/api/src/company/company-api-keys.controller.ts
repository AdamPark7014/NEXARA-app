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
import { assertFeature } from '../common/tenant/plan-features.js';
import { CompanyApiKeysService } from './company-api-keys.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('company/api-keys')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CompanyApiKeysController {
  constructor(
    private readonly service: CompanyApiKeysService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('catalog')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  catalog() {
    return this.service.listCatalog();
  }

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  async list(@CurrentCompanyId() companyId: number | null) {
    const id = requireCompanyId(companyId);
    const company = await this.prisma.companyProfile.findUnique({
      where: { id },
      select: { planCode: true },
    });
    assertFeature(company?.planCode, 'api_keys', 'API keys');
    return this.service.list(id);
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  async create(
    @CurrentCompanyId() companyId: number | null,
    @CurrentUser() user: any,
    @Body() body: { name: string; scopes?: string[]; expiresAt?: string | null },
  ) {
    const id = requireCompanyId(companyId);
    const company = await this.prisma.companyProfile.findUnique({
      where: { id },
      select: { planCode: true },
    });
    assertFeature(company?.planCode, 'api_keys', 'API keys');
    if (body.scopes?.includes('scim')) {
      assertFeature(company?.planCode, 'scim', 'SCIM');
    }
    return this.service.create(id, body, user?.id);
  }

  @Delete(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  revoke(@CurrentCompanyId() companyId: number | null, @Param('id', ParseIntPipe) id: number) {
    return this.service.revoke(id, requireCompanyId(companyId));
  }
}
