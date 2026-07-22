import { Body, Controller, Get, Headers, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { BillingService } from './billing.service.js';

@Controller('company/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  get(@CurrentCompanyId() companyId: number | null) {
    return this.billing.getPlan(companyId);
  }

  @Patch()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  update(
    @CurrentCompanyId() companyId: number | null,
    @Body()
    body: Partial<{
      planCode: string;
      seatLimit: number;
      billingStatus: string;
      stripeCustomerId: string | null;
      stripePriceId: string | null;
    }>,
  ) {
    return this.billing.updatePlan(companyId, body);
  }

  @Post('checkout')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  checkout(@CurrentCompanyId() companyId: number | null, @Body('seats') seats?: number) {
    return this.billing.createCheckoutSession(companyId, seats);
  }

  @Post('portal')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.COMPANY_SETTINGS_MANAGE] })
  portal(@CurrentCompanyId() companyId: number | null) {
    return this.billing.createPortalSession(companyId);
  }

  /** Stripe webhook — sin JWT; verifica firma HMAC. */
  @Post('stripe/webhook')
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const raw = req.rawBody || (req.body as Buffer);
    if (!Buffer.isBuffer(raw)) {
      // fallback: Nest puede parsear JSON — reconstruir (menos ideal)
      const buf = Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      return this.billing.handleStripeWebhook(buf, signature);
    }
    return this.billing.handleStripeWebhook(raw, signature);
  }
}
