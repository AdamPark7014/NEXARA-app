import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { NewsletterService } from './newsletter.service.js';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  subscribe(@Body() payload: NewsletterSubscribeDto) {
    // Public site → PUBLIC_COMPANY_ID / primary
    return this.newsletterService.subscribe(payload);
  }

  // Antes de `stats`: si fuera despues, `@Get()` no lo tapa, pero mantener
  // juntas las rutas concretas evita que una futura `@Get(':id')` se coma esta.
  @Get('stats')
  @UseGuards(RbacGuard)
  stats(@CurrentCompanyId() companyId: number | null) {
    return this.newsletterService.stats(companyId);
  }

  @Get()
  @UseGuards(RbacGuard)
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('search') search?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    return this.newsletterService.list(search, query, companyId);
  }
}
