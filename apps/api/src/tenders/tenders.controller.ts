import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TendersService } from './tenders.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

const TENDERS_VIEW = [PERMISSIONS.TENDERS_VIEW, PERMISSIONS.TENDERS_MANAGE, PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const TENDERS_MANAGE = [PERMISSIONS.TENDERS_MANAGE, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('tenders')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class TendersController {
  constructor(private readonly service: TendersService) {}

  @Post()
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.service.create({ ...dto, ownerId: dto.ownerId ?? user?.id });
  }

  @Get()
  @RBAC({ anyPermissions: TENDERS_VIEW })
  list(
    @Query('status') status?: string,
    @Query('tenderType') tenderType?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.list({ status, tenderType, ownerId: ownerId ? +ownerId : undefined });
  }

  @Get('dashboard')
  @RBAC({ anyPermissions: TENDERS_VIEW })
  dashboard() {
    return this.service.getDashboard();
  }

  @Get(':id')
  @RBAC({ anyPermissions: TENDERS_VIEW })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; awardedToCompetitor?: string; awardNotes?: string },
  ) {
    return this.service.setStatus(id, body.status, {
      awardedToCompetitor: body.awardedToCompetitor,
      awardNotes: body.awardNotes,
    });
  }

  @Post(':id/promote-opportunity')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  promote(@Param('id', ParseIntPipe) id: number) {
    return this.service.promoteToOpportunity(id);
  }

  // Documents
  @Get(':id/documents')
  @RBAC({ anyPermissions: TENDERS_VIEW })
  listDocs(@Param('id', ParseIntPipe) id: number) {
    return this.service.listDocuments(id);
  }

  @Post(':id/documents')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  addDoc(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: any) {
    return this.service.addDocument(id, { ...dto, uploadedBy: user?.id });
  }

  @Post(':id/events')
  @RBAC({ anyPermissions: TENDERS_MANAGE })
  addEvent(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.addEvent(id, dto);
  }
}
