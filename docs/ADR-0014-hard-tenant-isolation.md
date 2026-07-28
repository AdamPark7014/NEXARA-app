# ADR-0014: Hard multi-tenant isolation (fail-closed)

## Status
Accepted — 2026-07-25

## Context
NEXARA had soft multi-company scaffolding (`companyWhere(null) → {}`) which allowed
cross-tenant data leaks on Search, Analytics, CMMS and any path missing `X-Company-Id`.
Enterprise SaaS buyers require hard isolation comparable to Stripe/Atlassian.

## Decision
1. `companyWhere` never returns `{}`; missing tenant → deny-all `{ companyId: -1 }`.
2. `TenantInterceptor` propagates `companyId` via AsyncLocalStorage.
3. Prisma middleware auto-scopes `TENANT_SCOPED_MODELS` on reads/writes inside request context.
4. `resolveRequiredCompanyId` no longer falls back to primary unless `TENANT_ALLOW_PRIMARY_FALLBACK=1`.
5. CMMS (`Asset`, `MaintenanceOrder`) and product KPIs stamped with `companyId`.
6. Global search and analytics require tenant context and return intelligence payloads.

## Consequences
- Single-tenant legacy installs must keep `TENANT_ALLOW_PRIMARY_FALLBACK=1` until clients send headers.
- Cron/seed paths use `withTenantBypassAsync`.
- Remaining unscoped models (HR leave, Studio CMS, Notifications) are next isolation wave.
