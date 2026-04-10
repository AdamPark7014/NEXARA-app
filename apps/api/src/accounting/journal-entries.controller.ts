import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('accounting/journal-entries')
export class JournalEntriesController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createJournalEntry(dto, user.id);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findAll(@Query('status') status?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.listJournalEntries({ status, from, to });
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findOne(@Param('id') id: string) {
    return this.service.getJournalEntry(+id);
  }

  @Patch(':id/post')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_POST] })
  post(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.postJournalEntry(+id, user.id);
  }

  @Post(':id/reverse')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_POST] })
  reverse(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.reverseJournalEntry(+id, user.id);
  }
}
