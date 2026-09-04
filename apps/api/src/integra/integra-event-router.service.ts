/**
 * Orquestador ACS → negocio. Clasifica con decideAcsRoutes y despacha
 * rutas reales (Ops + alarmas SOC); el resto queda stub/audit limpio.
 * No escribe nómina/Attendance (hybrid es solo lectura).
 */

import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AcsOpsBridgeService, type AcsOpsEventInput } from './acs-ops-bridge.service';
import { IntegraAcsAlarmsService } from './integra-acs-alarms.service';
import {
  ACS_BUSINESS_MATRIX,
  decideAcsRoutes,
  type AcsBusinessRoute,
  type AcsRouteDecision,
  type AcsRouteEvent,
} from './integra-event-router';

export type EventRouterDispatch = {
  route: AcsBusinessRoute;
  handled: boolean;
  reason?: string;
  detail?: unknown;
};

export type EventRouterResult = {
  skipped?: boolean;
  reason?: string;
  decision: AcsRouteDecision | null;
  dispatches: EventRouterDispatch[];
  at: string;
};

type RecentEntry = {
  at: string;
  siteId: number;
  personId: string | null;
  major: number | null;
  minor: number | null;
  decision: AcsRouteDecision;
  dispatches: EventRouterDispatch[];
};

const RECENT_CAP = 40;

@Injectable()
export class IntegraEventRouterService {
  private readonly logger = new Logger(IntegraEventRouterService.name);
  private readonly recent: RecentEntry[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acsOps: AcsOpsBridgeService,
    private readonly alarms: IntegraAcsAlarmsService,
  ) {}

  enabled(): boolean {
    const raw = (process.env.INTEGRA_EVENT_ROUTER || '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'off';
  }

  matrix() {
    return {
      cases: ACS_BUSINESS_MATRIX,
      flags: {
        INTEGRA_EVENT_ROUTER: this.enabled() ? '1' : '0',
        ACS_OPS_BRIDGE: this.acsOps.enabled() ? '1' : '0',
      },
      note:
        'ops_activity + denied_alarm son E2E desde push. Resto: stub/audit (sin nómina).',
    };
  }

  listRecent(limit = 20) {
    const take = Math.min(Math.max(limit, 1), RECENT_CAP);
    return this.recent.slice(0, take);
  }

  /**
   * Replay / prueba con payload normalizado (sin side-effects de foto).
   */
  async routeDryRun(ev: AcsRouteEvent): Promise<AcsRouteDecision> {
    return decideAcsRoutes(ev);
  }

  /**
   * Hook post-ingest ACS. Best-effort: no tumba el push.
   */
  async onPushEvent(
    site: { id: number; companyId: number },
    ev: AcsOpsEventInput & { deviceIp?: string | null },
    opts?: { pushEventId?: number | null; photoPath?: string | null },
  ): Promise<EventRouterResult> {
    const at = new Date().toISOString();
    if (!this.enabled()) {
      return { skipped: true, reason: 'router_off', decision: null, dispatches: [], at };
    }
    if (ev.eventType !== 'AccessControllerEvent' || ev.major !== 5) {
      return { skipped: true, reason: 'not_acs', decision: null, dispatches: [], at };
    }

    try {
      const hasErpLink = await this.resolveHasErpLink(site.companyId, ev.personId);
      const ctx: AcsRouteEvent = {
        eventType: ev.eventType,
        major: ev.major,
        minor: ev.minor,
        deviceName: ev.deviceName,
        deviceIp: ev.deviceIp ?? null,
        personId: ev.personId,
        hasErpLink,
        // Flags opcionales: sin query extra de ocupación (siblings pueden enriquecer).
        hadPriorGrantToday: undefined,
        wasOnSite: undefined,
      };
      const decision = decideAcsRoutes(ctx);
      const dispatches: EventRouterDispatch[] = [];
      let alarmAttempted = false;

      for (const route of decision.routes) {
        if (route === 'denied_alarm') alarmAttempted = true;
        dispatches.push(
          await this.dispatch(route, site, ev, opts, decision).catch((e) => ({
            route,
            handled: false,
            reason: e instanceof Error ? e.message : String(e),
          })),
        );
      }

      // AFTER_HOURS: classifyPushForAlarm también aplica en entradas concedidas.
      if (!alarmAttempted && opts?.pushEventId) {
        dispatches.push(
          await this.dispatch('denied_alarm', site, ev, opts, decision).catch((e) => ({
            route: 'denied_alarm' as const,
            handled: false,
            reason: e instanceof Error ? e.message : String(e),
          })),
        );
      }

      this.pushRecent({
        at,
        siteId: site.id,
        personId: ev.personId,
        major: ev.major,
        minor: ev.minor,
        decision,
        dispatches,
      });

      return { decision, dispatches, at };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Event router: ${msg}`);
      return {
        skipped: true,
        reason: msg,
        decision: null,
        dispatches: [],
        at,
      };
    }
  }

  private async dispatch(
    route: AcsBusinessRoute,
    site: { id: number; companyId: number },
    ev: AcsOpsEventInput & { deviceIp?: string | null },
    opts: { pushEventId?: number | null; photoPath?: string | null } | undefined,
    decision: AcsRouteDecision,
  ): Promise<EventRouterDispatch> {
    switch (route) {
      case 'ops_activity': {
        const r = await this.acsOps.handlePushEvent(site, ev);
        return {
          route,
          handled: r.handled,
          reason: r.reason ?? r.action,
          detail: {
            direction: r.direction,
            activityId: r.activityId,
            userId: r.userId,
          },
        };
      }
      case 'denied_alarm': {
        if (!opts?.pushEventId) {
          return { route, handled: false, reason: 'sin_push_event_id' };
        }
        const r = await this.alarms.onPushEvent({
          companyId: site.companyId,
          siteId: site.id,
          pushEventId: opts.pushEventId,
          major: ev.major,
          minor: ev.minor,
          occurredAt: ev.occurredAt,
          personId: ev.personId,
          personName: ev.personName,
          doorNo: ev.doorNo,
          deviceIp: ev.deviceIp,
          deviceName: ev.deviceName,
          photoPath: opts.photoPath,
        });
        return {
          route,
          handled: Boolean(r),
          reason: r ? (r.escalated ? 'alarm_escalated' : 'alarm_open') : 'not_alarmable',
          detail: r,
        };
      }
      case 'employee_entry':
      case 'employee_exit':
      case 'presence_clear':
        // Asistencia híbrida es lectura; no inventar checadas ERP aquí.
        return {
          route,
          handled: false,
          reason: 'stub_no_attendance_write',
        };
      case 'visitor_arrived':
      case 'meeting_usage':
      case 'restricted_audit':
      case 'first_access_host':
        await this.auditStub(site, route, ev, decision);
        return { route, handled: true, reason: 'audit_stub' };
      default:
        return { route, handled: false, reason: 'unknown_route' };
    }
  }

  private async auditStub(
    site: { id: number; companyId: number },
    route: AcsBusinessRoute,
    ev: AcsOpsEventInput,
    decision: AcsRouteDecision,
  ) {
    try {
      await this.audit.log(
        {
          entityType: 'IntegraPushEvent',
          entityId: site.id,
          action: `acs.${route}`,
          companyId: site.companyId,
          source: 'integra-event-router',
          changes: {
            personId: ev.personId,
            personName: ev.personName,
            deviceName: ev.deviceName,
            major: ev.major,
            minor: ev.minor,
            doorRole: decision.doorRole,
            personKind: decision.personKind,
            direction: decision.direction,
          },
        },
        undefined,
      );
    } catch (e) {
      this.logger.warn(
        `Audit stub ${route}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async resolveHasErpLink(
    companyId: number,
    personId?: string | null,
  ): Promise<boolean> {
    const key = String(personId || '').trim();
    if (!key) return false;
    const hit = await this.prisma.userCompany.findFirst({
      where: {
        companyId,
        OR: [
          { employeeNumber: { equals: key, mode: 'insensitive' } },
          { user: { employeeNumber: { equals: key, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    });
    if (hit) return true;
    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        employeeNumber: { equals: key, mode: 'insensitive' },
        companyMemberships: { some: { companyId } },
      },
      select: { id: true },
    });
    return Boolean(user);
  }

  private pushRecent(entry: RecentEntry) {
    this.recent.unshift(entry);
    if (this.recent.length > RECENT_CAP) this.recent.length = RECENT_CAP;
  }
}
