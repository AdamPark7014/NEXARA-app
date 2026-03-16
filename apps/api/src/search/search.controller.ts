import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('search')
@UseGuards(RbacGuard)
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @Get()
  @RBAC({ permissions: [PERMISSIONS.SEARCH_VIEW] })
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.svc.globalSearch(q, limit ? +limit : undefined);
  }
}
