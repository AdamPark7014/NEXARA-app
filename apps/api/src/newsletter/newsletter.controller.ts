import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { NewsletterService } from './newsletter.service.js';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto.js';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  subscribe(@Body() payload: NewsletterSubscribeDto) {
    return this.newsletterService.subscribe(payload);
  }

  @Get()
  list(@Query('search') search?: string) {
    return this.newsletterService.list(search);
  }
}
