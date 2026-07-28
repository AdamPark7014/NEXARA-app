import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TendersService } from './tenders.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const TENDERS_VIEW = [PERMISSIONS.TENDERS_VIEW, PERMISSIONS.TENDERS_MANAGE, PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const TENDERS_MANAGE = [PERMISSIONS.TENDERS_MANAGE, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('tenders')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class TendersController {
  constructor(private readonly service: TendersService) {}

  @Post()
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  create(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.create({ ...dto, ownerId: dto.ownerId ?? user?.id }, companyId);
  }

  @Get()
  @RBAC({ anyPermissions: TENDERS_VIEW })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('tenderType') tenderType?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.list(
      { status, tenderType, ownerId: ownerId ? +ownerId : undefined },
      companyId,
    );
  }

  @Get('dashboard')
  @RBAC({ anyPermissions: TENDERS_VIEW })
  dashboard(@CurrentCompanyId() companyId: number | null) {
    return this.service.getDashboard(companyId);
  }

  @Get(':id')
  @RBAC({ anyPermissions: TENDERS_VIEW })
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.getOne(id, companyId);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.update(id, dto, companyId);
  }

  @Patch(':id/status')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; awardedToCompetitor?: string; awardNotes?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.setStatus(id, body.status, {
      awardedToCompetitor: body.awardedToCompetitor,
      awardNotes: body.awardNotes,
    }, companyId);
  }

  @Post(':id/promote-opportunity')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  promote(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.promoteToOpportunity(id, companyId);
  }

  @Get(':id/documents')
  @RBAC({ anyPermissions: TENDERS_VIEW })
  listDocs(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.listDocuments(id, companyId);
  }

  @Post(':id/documents')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  addDoc(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.addDocument(id, { ...dto, uploadedBy: user?.id }, companyId);
  }
}
