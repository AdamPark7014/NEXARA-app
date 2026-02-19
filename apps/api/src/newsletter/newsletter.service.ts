import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BrevoService } from '../contact-messages/brevo.service.js';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto.js';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brevoService: BrevoService,
  ) {}

  private get db() {
    return this.prisma;
  }

  async subscribe(input: NewsletterSubscribeDto) {
    const email = input.email.trim().toLowerCase();
    const name = input.name?.trim() || null;
    const source = input.source?.trim() || null;
    const pageUrl = input.pageUrl?.trim() || null;

    const subscriber = await this.db.newsletterSubscriber.upsert({
      where: { email },
      create: {
        email,
        name,
        source,
        pageUrl,
        subscribedAt: new Date(),
      },
      update: {
        name,
        source,
        pageUrl,
        subscribedAt: new Date(),
      },
    });

    const listIdRaw = process.env.BREVO_NEWSLETTER_LIST_ID;
    const listId = listIdRaw ? Number(listIdRaw) : undefined;

    try {
      await this.brevoService.upsertContact({
        email: subscriber.email,
        name: subscriber.name || undefined,
        listId: Number.isFinite(listId) ? listId : undefined,
      });
    } catch (err) {
      console.warn('[newsletter] Brevo sync failed', err);
    }

    return subscriber;
  }

  async list(search?: string) {
    const term = search?.trim();
    return this.db.newsletterSubscriber.findMany({
      where: term
        ? {
            OR: [
              { email: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { subscribedAt: 'desc' },
    });
  }
}
