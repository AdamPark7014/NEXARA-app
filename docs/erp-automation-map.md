# ERP automation map — NEXARA (existing modules only)

Scope: apps/web/app/(panels)/erp/** and related apps/api services. Focus on what is already automated (jobs, crons, queues, webhooks, workflows, notifications, integrations) vs still manual, and concrete next automations that fit current patterns. No new modules are introduced.

## Inventory of ERP areas (web surface)

- ERP hub: `apps/web/app/(panels)/erp/page.tsx`, `.../dashboard/page.tsx`
- Activities/OPS: `.../actividades/**`, `.../activities/**`, `.../mis-actividades/**`, `.../pizarra/**`
- HR/Attendance: `.../hr/**`, `.../asistencias` (attendance/lunch in API)
- Finance: `.../finance/**` (expenses, viatics, employee-payments)
- Accounting: `.../contabilidad/**`, `.../accounting/page.tsx`, `.../invoicing/**`
- Procurement/Warehouse: `.../procurement/page.tsx`, `.../warehouse/**`
- Quotations (CRM surface under ERP): `.../cotizaciones/**`
- Approvals: `.../approvals/page.tsx`
- Settings: `.../settings/**` (webhooks, api-keys, billing)
- INTEGRA (facilities/access): `.../facilities/access/page.tsx`
- Notifications Center: `.../notifications-center/page.tsx`

Backend: `apps/api` (NestJS + Prisma). Shared automation primitives:
- Job queue: BullMQ fallback-in-memory `apps/api/src/jobs/job-queue.service.ts`
- Scheduler: `@nestjs/schedule` with guards `apps/api/src/common/cron/run-scheduled-job.ts`
- Webhooks: HMAC + retry/DLQ `apps/api/src/webhooks/**`
- Domain events bus → webhooks/notifications `apps/api/src/domain-events/**`
- Notifications (DB + web push + socket) `apps/api/src/notifications/**`
- Stripe billing: `apps/api/src/company/billing.*`

---

## Activities / OPS (actividades, evidencias, SLA)

Already automated
- SLA impending and breach alerts
  - Every minute/5 min admin alerts: `apps/api/src/activities/ticket-alerts.service.ts` (`@Cron('*/1 * * * *')`, `@Cron('*/5 * * * *')`) → `NotificationsService.createNotification(...)`
  - Hourly company-wide SLA breach digest (domain events): `apps/api/src/common/cron/cron.service.ts` → `handleSlaBreachEscalate` (publishes `ACTIVITY` `alertType='sla_breach'`)
- Overtime overrun alerts (per assignee): `apps/api/src/activities/activity-time-alerts.service.ts` (`@Cron('*/15 * * * *')`) → `NotificationHierarchyService.notifyActivityOvertime(...)`
- Evidence workflow (status machine persisted)
  - Prisma model with multi-step states: `apps/api/prisma/schema.prisma` → `model ActivityEvidence` (`status`, `reviewStatus`, `completedAt`, review fields)
- Approvals timeouts escalation: `apps/api/src/workflow/workflow-timeout.cron.ts` (hourly) → notifies approver, marks `[ESCALATED]`
- Domain events → outbound webhooks:
  - `apps/api/src/domain-events/webhook-domain.listener.ts`: emits `activity.completed`, `ticket.sla_breach`, `activity.closure_{approved|rejected}` etc.

Manual today / gaps
- SLA breach in `cron.service.ts` raises domain events, but assignee/manager push for breaches relies on the admin-only alerts in `ticket-alerts.service.ts`.
- Evidence review cadence is human-driven; no nudge to reviewers when evidence is pending too long per step or repeatedly rejected.

Recommended automations
- P0: Notify responsible chain on SLA breach using existing hierarchy
  - Files to touch: `apps/api/src/common/cron/cron.service.ts` (in `handleSlaBreachEscalate`) to call `NotificationHierarchyService.notifyTicketSlaBreach(...)` (pattern mirrors `ActivityTimeAlertsService`).
  - Acceptance: When an activity with `ticketType` breaches, assignee and line managers receive a high-priority notification with link to `/erp/actividades/[id]`. Deduped within 2h.
- P1: Evidence review reminder
  - Files to touch: new small cron in `apps/api/src/activities/evidence/` that queries `ActivityEvidence.reviewStatus='PENDING' AND updatedAt < now()-24h` → `NotificationsService.createNotification(...)` to assigned reviewer.
  - Acceptance: Reviewer receives one reminder per pending evidence per day; dedupe window 24h; link to `/erp/actividades/[id]/evidencias`.
- P2: Auto-close stale client survey requests
  - Files: lightweight cron under `activities/` to mark surveys requested > N days as expired; optional heads-up to activity owner.

---

## HR / Attendance (asistencia, comidas, prenómina)

Already automated
- Auto-close open workdays nightly: `apps/api/src/attendance/attendance-cierre.cron.service.ts` at Mexico TZ (`HORA_CIERRE_AUTOMATICO`)
- Lunch break notifications:
  - 14:50 ahead-of-time and 16:05 expiration L–F MX TZ: `apps/api/src/attendance/lunch/lunch-breaks.cron.service.ts`
  - Hierarchical notifications to reviewers on lunch events: `apps/api/src/notifications/notification-hierarchy.service.ts` (multiple lunch_* methods)
- Payroll inputs from real attendance:
  - `apps/api/src/employee-payments/employee-payments.service.ts::calculateFromAttendance(...)` derives suggested minutes/amount from KPIs (excludes lunch, uses approved overtime)

Manual today / gaps
- Prenómina generation is on-demand via API/UI; no scheduled batch to prefill period suggestions for RH at cut-off.
- No periodic nudge for open attendance days (`AttendanceDay.isOpen = true`) near cut-off.

Recommended automations
- P0: Prenómina prefill at period end
  - Files to touch: new cron (e.g. `hr-prenomina.cron.ts`) to iterate active companies on configured cadence and call `EmployeePaymentsService.preNomina(...)`, persisting a snapshot table or caching per user-period (without forcing final amounts).
  - Acceptance: At period close morning, RH sees pre-populated suggestions; notifications sent to RH role with link to `/erp/contabilidad/pre-nomina`.
- P1: Open-attendance reminders to users + managers
  - Files: extend `CronService` to scan `attendanceDay.isOpen` and notify via `NotificationsService`, grouping by user and manager; dedupe per day.

---

## Finance (expenses, viatics, employee payments)

Already automated
- Overdue invoices (email + domain event): `apps/api/src/common/cron/cron.service.ts::handleOverdueInvoices` (daily 08:00)
- PO reminders near expected date (email): `cron.service.ts::handlePOReminders` (daily 09:00)
- Maintenance/predictive reminders (email): `cron.service.ts::handleMaintenanceReminders`
- Accounting entries on action:
  - Expenses: `apps/api/src/expenses/expenses.service.ts::markPagado` posts disbursement via `AccountingService.postOperationalDisbursement(...)`
  - Viatics: `apps/api/src/viaticos/viaticos.service.ts` posts accounting entries on approve/pay; prevents repartition after paid
- Notifications on viatic approval/rejection: `apps/api/src/notifications/notifications.service.ts` (`notifyViatic{Approved,Rejected}`)

Manual today / gaps
- No scheduled periodic AR aging / AP aging digest to finance roles.
- No proactive nudge on un-reviewed employee payments drafts near payday.

Recommended automations
- P1: Weekly aging digests (AR/AP)
  - Files: add cron tasks in `cron.service.ts` querying invoices by status/age; publish domain events and email summary to `contabilidad`/admin roles.
  - Acceptance: Monday 08:00 digests with counts and totals; link to `/erp/contabilidad/cuentas-por-{cobrar|pagar}`.
- P2: Employee-payments review reminder two days before payday
  - Files: small cron under `hr/` or `finance/` reading `EmployeePayment.status` and per-company payday setting (env/param).

---

## Accounting (contabilidad)

Already automated
- Period close gating with checklist and forced-close justification:
  - `apps/api/src/accounting/period-close.service.ts` (computes blockers: invoices without XML, bank not reconciled, draft journal entries, prenómina open, lines without cost center, entries without period)
  - Audit trail on close (forced or normal) via `AuditService`
- Reports workspace, permissions and controllers under `apps/api/src/accounting/**`
- Domain events for invoice paid/overdue: `webhook-domain.listener.ts`

Manual today / gaps
- Period close is user-initiated (by design). No recurring reminder to accounting owners if blockers linger > N days after period end.
- No scheduled DIOT / Trial Balance export generation; they are on-demand from reporting endpoints.

Recommended automations
- P1: Post-period reminder if blockers persist > 3 days
  - Files: cron under `accounting/` invoking `PeriodCloseService.getChecklist(...)` and notifying `accounting.manage` users when `bloqueantes>0`.
  - Acceptance: One reminder per period per day until blockers cleared; link to `/erp/contabilidad/cierres`.
- P2: First-business-day DIOT/trial-balance pre-generation
  - Files: cron kicking `AccountingWorkspaceReportsService` to cache/generate artifacts and notify; reuse existing CSV/PDF generators.

---

## Procurement and Warehouse (compras, reabastecimiento, almacén)

Already automated
- Nightly min/max recomputation + stock alerts:
  - `apps/api/src/warehouse/reabastecimiento-cron.service.ts` (3AM daily) → `ReabastecimientoService.recalcularTodasLasEmpresas()`
  - Low/dead stock domain events: `cron.service.ts::handleInventoryHealth` (daily 07:00)
- Purchase requisitions / orders events → notifications:
  - `apps/api/src/notifications/notification-hierarchy.service.ts` (`notifyPurchaseRequisition*`, `notifyPurchaseOrder*`, `notifyGoodsReceipt*`)
- PO approval workflow hook and webhooks:
  - `apps/api/src/workflow/workflow.service.ts` handles `PURCHASE_ORDER` instances; `webhook-domain.listener.ts` emits `purchase_order.{confirmed|rejected}`
- Goods receipt → accounting accrual and optional AP invoice creation:
  - `apps/api/src/procurement/procurement.service.ts` uses `AccountingService.postPurchaseReceiptAccrual(...)` and `createInvoiceFromGoodsReceipt(...)`

Manual today / gaps
- No escalation for POs past `expectedDate` without full receipt (email exists for “upcoming”, not for overdue).
- Reabastecimiento alerts suggest purchase, but do not draft a Purchase Requisition automatically.

Recommended automations
- P0: Overdue PO receipt alerts
  - Files: add cron in `cron.service.ts` to scan `PurchaseOrder.status IN (DRAFT, CONFIRMED, PARTIALLY_RECEIVED) AND expectedDate < now()`; notify creator/approver and procurement role with `/erp/procurement?tab=orders&id={id}`.
  - Acceptance: One alert per PO per day until fully received or canceled.
- P1: Auto-draft Purchase Requisition from top shortages
  - Files: extend `ReabastecimientoService` with helper to produce top-N `RenglonReabastecimiento`; new service in `procurement/` to draft `PurchaseRequisition` lines (no submit); gated by feature flag.
  - Acceptance: Daily at 06:00, if shortages exist, a DRAFT PR with suggested quantities is created and requester notified; idempotent per day.

---

## Quotations (cotizaciones CRM surface)

Already automated
- Quote expiration checks: `apps/api/src/notifications/notifications.service.ts`
  - Hourly expiring soon → creator and opportunity owner: `@Cron('0 * * * *')`
  - Every 30 min expired → creator and opportunity owner: `@Cron('0 */30 * * * *')`
- Smart-quote supplier catalog sync (CT):
  - `apps/api/src/smart-quote/smart-quote.cron.ts` every 15 min JSON, 3×/day XML; enqueues `supplier.ct.sync` via `JobQueueService`
- On approval, CT order draft notification: `NotificationsService.notifyCtOrderDraftReady(...)`

Manual today / gaps
- Optional: no periodic digest of quotes expiring in next 7 days by salesperson/team.

Recommended automations
- P2: Morning digest of expiring quotes per seller
  - Files: small cron inside `notifications.service.ts` or new `quotes-digest.cron.ts`, reusing existing queries; target seller and sales admin.

---

## INTEGRA (facilities/access mirror + warmup)

Already automated
- Mirror sync every 15 min with backoff and reentrancy guard: `apps/api/src/integra/integra-sync.service.ts` (`@Cron('*/15 * * * *')`)
- Warmup go2rtc streams every 10 min and single-shot on boot; daily capabilities probe: `apps/api/src/integra/integra-warmup.service.ts`
- Recurring visitors auto-expire hourly: `apps/api/src/integra/integra-recurring-visitors.service.ts` (`@Cron('12 * * * *')`)
- Push fan-out and event routing to domain effects: `apps/api/src/integra/integra-acs-fanout.service.ts`, `.../integra-event-router.ts`

Manual today / gaps
- Inventory mirror is robust; procurement of missing camera inventory (not in scope) remains pending per docs.

Recommended automations
- P2: Alert when mirror drift persists > 24h for a site
  - Files: add drift check in `integra-sync.service.ts` using `integraSite.lastHealthOkAt`; notify ops managers.

---

## Settings, Webhooks, Billing

Already automated
- Outbound webhooks with SSRF guard and HMAC; retry/DLQ every 5 min:
  - `apps/api/src/webhooks/webhooks.service.ts` + `apps/api/src/common/cron/cron.service.ts::handleWebhookRetries`
- Domain-event → webhook bridge: `apps/api/src/domain-events/webhook-domain.listener.ts` (≈30 public events)
- Stripe Checkout + Portal + webhook (HMAC verified): `apps/api/src/company/billing.*`; server keeps `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`

Manual today / gaps
- No weekly webhook delivery health digest (counts of DLQ, most failing endpoints) to admins.

Recommended automations
- P1: Weekly webhook health digest
  - Files: new cron in `webhooks/` querying `WebhookDelivery` by outcome; notify console admins with top failing endpoints and totals.

---

## Cross-cutting primitives in place

- Queues: `apps/api/src/jobs/job-queue.service.ts` (BullMQ with Redis when available; DLQ surfaced; in-memory fallback)
- Scheduler: `@nestjs/schedule` used consistently; guards via `runScheduledJob(...)`
- Notifications: `apps/api/src/notifications/notifications.service.ts` with dedupe, collapse keys, and channel selection; hierarchy service routes to managers
- Domain events bus: `apps/api/src/domain-events/**` decouples side-effects; Webhook bridge emits standardized events

---

## Summary of recommended automations (prioritized)

- P0
  - Activities SLA breach → notify assignee and managers (`cron.service.ts` + `NotificationHierarchy`)
  - Procurement overdue receipt alerts (PO past `expectedDate`)
  - HR prenómina prefill at period end
- P1
  - Weekly AR/AP aging digests
  - Webhook delivery health digest
  - Evidence review reminder after 24h pending
  - Auto-draft Purchase Requisition from top shortages (feature-flag)
  - Accounting period-close reminder if blockers persist > 3 days
- P2
  - Quotes expiring morning digest per seller
  - INTEGRA site drift alert (>24h without health OK)

All proposals extend existing patterns (NestJS `@Cron`, `NotificationsService`, `DomainEventBusService`, `WebhooksService`, `JobQueueService`) and touch only the modules noted above.

