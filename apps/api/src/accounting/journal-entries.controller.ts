import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CreateJournalEntryDto } from './dto/journal-entry.dto.js';
import { ListJournalEntriesQueryDto } from './dto/list-query.dto.js';

@Controller('accounting/journal-entries')
@UseGuards(UrlAccessGuard)
export class JournalEntriesController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  create(@CurrentUser() user: { id: number }, @Body() dto: CreateJournalEntryDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.createJournalEntry({ ...dto, companyId }, user.id);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findAll(@Query() query: ListJournalEntriesQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.listJournalEntries(
      { status: query.status, from: query.from, to: query.to, companyId },
      query,
    );
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findOne(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getJournalEntry(+id, companyId);
  }

  @Patch(':id/post')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_POST] })
  post(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.postJournalEntry(+id, user.id, companyId);
  }

  @Post(':id/reverse')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_POST] })
  reverse(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.reverseJournalEntry(+id, user.id, companyId);
  }
}
