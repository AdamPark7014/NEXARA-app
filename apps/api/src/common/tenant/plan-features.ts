import { ForbiddenException } from '@nestjs/common';

/**
 * Feature gates por plan SaaS (Iter 13).
 * planCode en CompanyProfile: starter | growth | enterprise (default).
 */

export type PlanCode = 'starter' | 'growth' | 'enterprise' | string;

const PLAN_FEATURES: Record<string, Set<string>> = {
  starter: new Set([
    'core.crm',
    'core.ops',
    'core.finance.basic',
    'audit.basic',
  ]),
  growth: new Set([
    'core.crm',
    'core.ops',
    'core.finance.basic',
    'core.finance.banking',
    'audit.basic',
    'webhooks',
    'api_keys',
    'scim',
    'sso',
  ]),
  enterprise: new Set([
    'core.crm',
    'core.ops',
    'core.finance.basic',
    'core.finance.banking',
    'core.finance.gl',
    'audit.basic',
    'audit.advanced',
    'webhooks',
    'api_keys',
    'scim',
    'sso',
    'billing.portal',
    'insights',
  ]),
};

export function featuresForPlan(planCode?: string | null): Set<string> {
  const key = String(planCode || 'enterprise').trim().toLowerCase();
  return PLAN_FEATURES[key] ?? PLAN_FEATURES.enterprise;
}

export function hasFeature(planCode: string | null | undefined, feature: string): boolean {
  return featuresForPlan(planCode).has(feature);
}

export function assertFeature(planCode: string | null | undefined, feature: string, label = feature) {
  if (!hasFeature(planCode, feature)) {
    throw new ForbiddenException(
      `Tu plan no incluye «${label}». Actualiza el plan en Facturación.`,
    );
  }
}
