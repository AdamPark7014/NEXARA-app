import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { NewsletterService } from './newsletter.service.js';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { RbacGuard } from '../common/rbac.guard.js';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  subscribe(@Body() payload: NewsletterSubscribeDto) {
    return this.newsletterService.subscribe(payload);
  }

  @Get()
  @UseGuards(RbacGuard)
  list(@Query('search') search?: string, @Query() query?: PaginationQueryDto) {
    return this.newsletterService.list(search, query);
  }
}
