import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { BrevoService } from '../contact-messages/brevo.service.js';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto.js';
import {
  companyWhere,
  requireCompanyId,
  resolvePublicCompanyId,
} from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brevoService: BrevoService,
  ) {}

  private get db() {
    return this.prisma;
  }

  async subscribe(input: NewsletterSubscribeDto, companyId?: number | null) {
    const tenantId =
      companyId != null && Number(companyId) > 0
        ? Number(companyId)
        : await withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
    const email = input.email.trim().toLowerCase();
    const name = input.name?.trim() || null;
    const source = input.source?.trim() || null;
    const pageUrl = input.pageUrl?.trim() || null;

    const existing = await withTenantBypassAsync(() =>
      this.db.newsletterSubscriber.findFirst({
        where: { email, companyId: tenantId },
      }),
    );

    const subscriber = existing
      ? await withTenantBypassAsync(() =>
          this.db.newsletterSubscriber.update({
            where: { id: existing.id },
            data: { name, source, pageUrl, subscribedAt: new Date() },
          }),
        )
      : await withTenantBypassAsync(() =>
          this.db.newsletterSubscriber.create({
            data: {
              email,
              name,
              source,
              pageUrl,
              subscribedAt: new Date(),
              companyId: tenantId,
            },
          }),
        );

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

  async list(search?: string, query?: PaginationQueryDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const term = search?.trim();
    const where: any = {
      ...companyWhere(tenantId),
      ...(term
        ? {
            OR: [
              { email: { contains: term, mode: 'insensitive' as const } },
              { name: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.db.newsletterSubscriber.findMany({
          where,
          orderBy: { subscribedAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.db.newsletterSubscriber.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.db.newsletterSubscriber.findMany({
      where,
      orderBy: { subscribedAt: 'desc' },
    });
  }
}
