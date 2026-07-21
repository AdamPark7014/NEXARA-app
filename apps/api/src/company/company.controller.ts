import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompanyService } from './company.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

/** Endpoint público — branding & datos para landing/portales. */
@Controller('company-public')
export class CompanyPublicController {
  constructor(private readonly service: CompanyService) {}

  @Get()
  public(@Query('id') id?: string) {
    return this.service.getPublic(id ? +id : undefined);
  }

  @Get('list')
  list() {
    return this.service.list().then((cs) =>
      cs.map((c) => ({
        id: c.id,
        slug: c.slug,
        tradeName: c.tradeName,
        legalName: c.legalName,
        logoUrl: c.logoUrl,
        isPrimary: c.isPrimary,
      })),
    );
  }
}

@Controller('company')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  /** Empresas a las que el usuario pertenece (para CompanySwitcher). */
  @Get('mine')
  @RBAC({})
  async mine(@CurrentUser() user: any) {
    const isSuperAdmin = Boolean(user?.isSuperAdmin || user?.roleKey === 'super_admin');
    const rows = await this.service.listForUser(user.id, isSuperAdmin);
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      tradeName: c.tradeName,
      legalName: c.legalName,
      logoUrl: c.logoUrl,
      isPrimary: c.isPrimary,
    }));
  }

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_VIEW, PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  get(@Query('id') id?: string) {
    return this.service.resolve(id ? +id : undefined);
  }

  @Get('list')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_VIEW, PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  listAll() {
    return this.service.list();
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Patch()
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  update(@Body() dto: any) {
    return this.service.update(dto);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  updateById(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(dto, id);
  }

  @Patch(':id/primary')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  setPrimary(@Param('id', ParseIntPipe) id: number) {
    return this.service.setPrimary(id);
  }

  @Patch(':id/active')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  setActive(@Param('id', ParseIntPipe) id: number, @Body('isActive') isActive: boolean) {
    return this.service.setActive(id, Boolean(isActive));
  }
}
