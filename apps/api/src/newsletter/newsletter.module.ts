import { Module } from '@nestjs/common';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BrevoService } from '../contact-messages/brevo.service';

@Module({
  imports: [PrismaModule],
  controllers: [NewsletterController],
  providers: [NewsletterService, BrevoService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
