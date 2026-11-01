import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CompanyService } from './company.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

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

const esSuperAdmin = (user: any) => Boolean(user?.isSuperAdmin || user?.roleKey === 'super_admin');

/**
 * Datos de la empresa (RFC, CLABE, Stripe). Quien no es súper admin solo ve y edita la suya: antes
 * `?id=`, `/list` y `PATCH :id` alcanzaban a cualquier empresa. Crear, marcar principal y
 * desactivar empresas es solo de la plataforma.
 */
@Controller('company')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  /** Empresas a las que el usuario pertenece (para CompanySwitcher). */
  @Get('mine')
  @RBAC({})
  async mine(@CurrentUser() user: any) {
    const rows = await this.service.listForUser(user.id, esSuperAdmin(user));
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
  get(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Query('id') id?: string) {
    if (esSuperAdmin(user)) return this.service.resolve(id ? +id : undefined);
    if (id && +id !== companyId) throw new ForbiddenException('Solo puedes ver tu empresa.');
    return this.service.resolve(companyId ?? undefined);
  }

  @Get('list')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_VIEW, PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  listAll(@CurrentUser() user: any) {
    return esSuperAdmin(user) ? this.service.list() : this.service.listForUser(user.id, false);
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  create(@CurrentUser() user: any, @Body() dto: any) {
    if (!esSuperAdmin(user)) throw new ForbiddenException('Solo la plataforma da de alta empresas.');
    return this.service.create(dto);
  }

  /** Sin id: la empresa de quien edita (antes era la principal). */
  @Patch()
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  update(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() dto: any) {
    if (esSuperAdmin(user)) return this.service.update(dto);
    if (!companyId) throw new ForbiddenException('Sin empresa seleccionada.');
    return this.service.update(dto, companyId);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  updateById(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    if (!esSuperAdmin(user) && id !== companyId) throw new ForbiddenException('Solo puedes editar tu empresa.');
    return this.service.update(dto, id);
  }

  @Patch(':id/primary')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  setPrimary(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    if (!esSuperAdmin(user)) throw new ForbiddenException('Solo la plataforma cambia la empresa principal.');
    return this.service.setPrimary(id);
  }

  @Patch(':id/active')
  @RBAC({ anyPermissions: [PERMISSIONS.COMPANY_SETTINGS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  setActive(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body('isActive') isActive: boolean) {
    if (!esSuperAdmin(user)) throw new ForbiddenException('Solo la plataforma activa o desactiva empresas.');
    return this.service.setActive(id, Boolean(isActive));
  }
}
