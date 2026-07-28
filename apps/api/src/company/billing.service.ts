import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { featuresForPlan } from '../common/tenant/plan-features.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (key) {
      this.stripe = new Stripe(key);
    }
  }

  isStripeConfigured() {
    return Boolean(this.stripe && process.env.STRIPE_PRICE_ID);
  }

  async getPlan(companyId: number | null | undefined) {
    const id = requireCompanyId(companyId);
    const company = await this.prisma.companyProfile.findUnique({
      where: { id },
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        contactEmail: true,
        planCode: true,
        seatLimit: true,
        billingStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        trialEndsAt: true,
      },
    });
    if (!company) throw new BadRequestException('Empresa no encontrada');

    const seatsUsed = await this.prisma.userCompany.count({
      where: { companyId: id, user: { isActive: true } },
    });

    const since = new Date(Date.now() - 30 * 86_400_000);
    const usage = await this.prisma.companyUsageEvent.groupBy({
      by: ['metric'],
      where: { companyId: id, occurredAt: { gte: since } },
      _sum: { quantity: true },
    });

    return {
      company,
      seats: { used: seatsUsed, limit: company.seatLimit, remaining: Math.max(0, company.seatLimit - seatsUsed) },
      features: Array.from(featuresForPlan(company.planCode)).sort(),
      usage30d: usage.map((u) => ({
        metric: u.metric,
        quantity: Number(u._sum.quantity || 0),
      })),
      stripe: {
        configured: this.isStripeConfigured(),
        hasCustomer: Boolean(company.stripeCustomerId),
        hasSubscription: Boolean(company.stripeSubscriptionId),
      },
    };
  }

  async updatePlan(
    companyId: number | null | undefined,
    dto: Partial<{
      planCode: string;
      seatLimit: number;
      billingStatus: string;
      stripeCustomerId: string | null;
      stripePriceId: string | null;
    }>,
  ) {
    const id = requireCompanyId(companyId);
    return this.prisma.companyProfile.update({
      where: { id },
      data: {
        ...(dto.planCode !== undefined ? { planCode: dto.planCode.trim() } : {}),
        ...(dto.seatLimit !== undefined ? { seatLimit: Math.max(1, Number(dto.seatLimit)) } : {}),
        ...(dto.billingStatus !== undefined ? { billingStatus: dto.billingStatus.trim() } : {}),
        ...(dto.stripeCustomerId !== undefined ? { stripeCustomerId: dto.stripeCustomerId } : {}),
        ...(dto.stripePriceId !== undefined ? { stripePriceId: dto.stripePriceId } : {}),
      },
      select: {
        id: true,
        planCode: true,
        seatLimit: true,
        billingStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
      },
    });
  }

  async assertSeatAvailable(companyId: number) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
      select: { seatLimit: true, billingStatus: true },
    });
    if (!company) return;
    if (company.billingStatus === 'suspended') {
      throw new BadRequestException('Empresa suspendida por billing');
    }
    const used = await this.prisma.userCompany.count({
      where: { companyId, user: { isActive: true } },
    });
    if (used >= company.seatLimit) {
      throw new BadRequestException(
        `Límite de asientos alcanzado (${used}/${company.seatLimit}). Amplía el plan.`,
      );
    }
  }

  async recordUsage(
    companyId: number,
    metric: string,
    quantity = 1,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.companyUsageEvent.create({
      data: {
        companyId,
        metric: metric.slice(0, 60),
        quantity,
        metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as object) : undefined,
      },
    });
  }

  private requireStripe() {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe no configurado (STRIPE_SECRET_KEY). Usa sandbox keys rk_/sk_.',
      );
    }
    return this.stripe;
  }

  async ensureStripeCustomer(companyId: number) {
    const stripe = this.requireStripe();
    const company = await this.prisma.companyProfile.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Empresa no encontrada');
    if (company.stripeCustomerId) {
      return company.stripeCustomerId;
    }
    const customer = await stripe.customers.create({
      name: company.tradeName || company.legalName,
      email: company.contactEmail || undefined,
      metadata: { nexaraCompanyId: String(company.id) },
    });
    await this.prisma.companyProfile.update({
      where: { id: companyId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  async createCheckoutSession(companyId: number | null | undefined, seats?: number) {
    const id = requireCompanyId(companyId);
    const stripe = this.requireStripe();
    const priceId = process.env.STRIPE_PRICE_ID?.trim();
    if (!priceId) throw new BadRequestException('STRIPE_PRICE_ID requerido');

    const customerId = await this.ensureStripeCustomer(id);
    const web = process.env.WEB_PUBLIC_URL || 'http://localhost:3000';
    const qty = Math.max(1, Number(seats) || 1);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: qty }],
      success_url: `${web}/erp/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${web}/erp/settings/billing?checkout=cancel`,
      client_reference_id: String(id),
      metadata: { nexaraCompanyId: String(id) },
      subscription_data: {
        metadata: { nexaraCompanyId: String(id) },
      },
    });

    void this.recordUsage(id, 'billing.checkout_started', 1, { sessionId: session.id }).catch(() => undefined);
    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(companyId: number | null | undefined) {
    const id = requireCompanyId(companyId);
    const stripe = this.requireStripe();
    const customerId = await this.ensureStripeCustomer(id);
    const web = process.env.WEB_PUBLIC_URL || 'http://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${web}/erp/settings/billing`,
    });
    return { url: session.url };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.requireStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET no configurado');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature inválida: ${(err as Error).message}`);
      throw new BadRequestException('Firma de webhook inválida');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = Number(session.metadata?.nexaraCompanyId || session.client_reference_id);
        if (!Number.isFinite(companyId)) break;
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        await this.prisma.companyProfile.update({
          where: { id: companyId },
          data: {
            billingStatus: 'active',
            stripeSubscriptionId: subId || undefined,
            stripeCustomerId:
              typeof session.customer === 'string' ? session.customer : session.customer?.id || undefined,
          },
        });
        void this.recordUsage(companyId, 'billing.checkout_completed', 1, { sessionId: session.id }).catch(
          () => undefined,
        );
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        const companyId = Number(sub.metadata?.nexaraCompanyId);
        if (!Number.isFinite(companyId)) break;
        const qty = sub.items.data[0]?.quantity ?? undefined;
        await this.prisma.companyProfile.update({
          where: { id: companyId },
          data: {
            stripeSubscriptionId: sub.id,
            billingStatus: sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status,
            ...(qty ? { seatLimit: qty } : {}),
            stripePriceId: sub.items.data[0]?.price?.id || undefined,
          },
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const companyId = Number(sub.metadata?.nexaraCompanyId);
        if (!Number.isFinite(companyId)) break;
        await this.prisma.companyProfile.update({
          where: { id: companyId },
          data: { billingStatus: 'canceled', stripeSubscriptionId: null },
        });
        break;
      }
      default:
        break;
    }

    return { received: true, type: event.type };
  }
}
