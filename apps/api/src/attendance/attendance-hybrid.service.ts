import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegraPushService } from '../integra/integra-push.service';
import { PERMISSIONS } from '../common/permissions.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDateColumn, workDayEnd, workDayStart } from '../common/time/workday.js';
import {
  acsIdentityKeys,
  erpIdentityKeys,
  findAcsMatchKey,
  hybridTimeFlags,
  normalizeIdentityKey,
  type HybridFlag,
  type HybridLinkStatus,
} from './attendance-hybrid.match';

type CurrentUser = {
  id: number;
  departmentId?: number;
  permissions?: string[];
  isSuperAdmin?: boolean;
};

type AcsDay = {
  day: string;
  personId: string;
  personName: string | null;
  firstAt: string;
  lastAt: string;
  firstDoor: string | null;
  firstPhoto: string | null;
  passes: number;
  denied: number;
  minutes: number | null;
  personCode?: string | null;
};

/**
 * Vista híbrida ERP checador ↔ ACS Integra.
 * No escribe en Attendance/AttendanceDay: la nómina no se inventa desde la puerta.
 */
@Injectable()
export class AttendanceHybridService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integraPush: IntegraPushService,
  ) {}

  async getHybridDay(
    currentUser: CurrentUser,
    date: string,
    companyId: number | null,
    opts: { siteId?: number | null; selfOnly?: boolean } = {},
  ) {
    if (!date) throw new BadRequestException('Fecha requerida (YYYY-MM-DD)');
    const tenantId = requireCompanyId(companyId);
    const day = this.parseDate(date);
    if (Number.isNaN(day.getTime())) {
      throw new BadRequestException('Fecha inválida');
    }

    const dayKey = workDateColumn(day).toISOString().slice(0, 10);
    const start = workDayStart(day);
    const end = workDayEnd(day);

    const users = await this.loadUsers(currentUser, tenantId, opts.selfOnly === true);
    const userIds = users.map((u) => u.id);

    const [memberships, attendances, days, acsRaw, people] = await Promise.all([
      this.prisma.userCompany.findMany({
        where: { companyId: tenantId, userId: { in: userIds } },
        select: { userId: true, employeeNumber: true },
      }),
      this.prisma.attendance.findMany({
        where: {
          companyId: tenantId,
          userId: { in: userIds },
          timestamp: { gte: start, lte: end },
        },
        orderBy: { timestamp: 'asc' },
        select: {
          userId: true,
          type: true,
          timestamp: true,
          photoUrl: true,
        },
      }),
      this.prisma.attendanceDay.findMany({
        where: {
          companyId: tenantId,
          userId: { in: userIds },
          date: workDateColumn(day),
        },
        select: {
          userId: true,
          totalMinutes: true,
          isOpen: true,
          lastEntryAt: true,
        },
      }),
      this.integraPush.attendance(tenantId, {
        siteId: opts.siteId ?? null,
        from: start,
        to: end,
      }),
      this.prisma.integraPerson.findMany({
        where: {
          companyId: tenantId,
          ...(opts.siteId ? { siteId: opts.siteId } : {}),
        },
        select: { personId: true, personCode: true, personName: true },
      }),
    ]);

    const companyEmpByUser = new Map<number, string | null>();
    for (const m of memberships) {
      companyEmpByUser.set(m.userId, m.employeeNumber);
    }

    const dayByUser = new Map(days.map((d) => [d.userId, d]));
    const punchesByUser = new Map<number, typeof attendances>();
    for (const a of attendances) {
      const list = punchesByUser.get(a.userId) ?? [];
      list.push(a);
      punchesByUser.set(a.userId, list);
    }

    const codeByPersonId = new Map<string, string | null>();
    for (const p of people) {
      codeByPersonId.set(p.personId, p.personCode);
    }

    const acsItems: AcsDay[] = (acsRaw.items as AcsDay[]).map((row) => ({
      ...row,
      personCode: codeByPersonId.get(row.personId) ?? null,
    }));

    const acsByKey = new Map<string, AcsDay>();
    for (const row of acsItems) {
      for (const k of acsIdentityKeys(row)) {
        if (!acsByKey.has(k)) acsByKey.set(k, row);
      }
    }

    const usedAcs = new Set<AcsDay>();
    const items: Array<{
      linkStatus: HybridLinkStatus;
      matchKey: string | null;
      flags: HybridFlag[];
      user: {
        id: number;
        nombre: string;
        email: string;
        employeeNumber: string | null;
        companyEmployeeNumber: string | null;
        department: string | null;
      } | null;
      erp: {
        checkIn: string | null;
        checkOut: string | null;
        totalMinutes: number;
        isOpen: boolean;
        estado: 'PRESENTE' | 'COMPLETO' | 'AUSENTE';
      } | null;
      acs: {
        personId: string;
        personName: string | null;
        personCode: string | null;
        firstAt: string;
        lastAt: string;
        minutes: number | null;
        passes: number;
        denied: number;
        firstDoor: string | null;
        firstPhoto: string | null;
      } | null;
    }> = [];

    for (const u of users) {
      const companyEmp = companyEmpByUser.get(u.id) ?? null;
      const keys = erpIdentityKeys({
        employeeNumber: u.employeeNumber,
        companyEmployeeNumber: companyEmp,
      });
      const matchKey = findAcsMatchKey(keys, acsByKey);
      const acs = matchKey ? acsByKey.get(matchKey) ?? null : null;
      if (acs) usedAcs.add(acs);

      const punches = punchesByUser.get(u.id) ?? [];
      const entrada = [...punches].reverse().find((p) => p.type === 'entrada');
      const salida = [...punches].reverse().find((p) => p.type === 'salida');
      const dayRow = dayByUser.get(u.id);
      const isOpen = Boolean(dayRow?.isOpen);
      const checkIn = entrada?.timestamp.toISOString() ?? dayRow?.lastEntryAt?.toISOString() ?? null;
      const checkOut = salida?.timestamp.toISOString() ?? null;
      const totalMinutes = dayRow?.totalMinutes ?? 0;
      const hasErp = Boolean(checkIn);
      const estado: 'PRESENTE' | 'COMPLETO' | 'AUSENTE' = isOpen
        ? 'PRESENTE'
        : checkIn && checkOut
          ? 'COMPLETO'
          : checkIn
            ? 'PRESENTE'
            : 'AUSENTE';

      const flags = hybridTimeFlags({
        erpCheckIn: checkIn,
        erpCheckOut: checkOut,
        erpOpen: isOpen,
        acsFirstAt: acs?.firstAt,
        acsLastAt: acs?.lastAt,
        acsMinutes: acs?.minutes ?? null,
        acsPasses: acs?.passes,
      });
      if (!keys.length) flags.unshift('sin_numero_empleado');

      // Sin señal en ningún lado: no ensucia la vista (salvo selfOnly).
      if (!opts.selfOnly && !hasErp && !acs) continue;

      items.push({
        linkStatus: acs ? 'linked' : 'erp_only',
        matchKey,
        flags,
        user: {
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          employeeNumber: u.employeeNumber,
          companyEmployeeNumber: companyEmp,
          department: u.department?.nombre ?? null,
        },
        erp: hasErp
          ? { checkIn, checkOut, totalMinutes, isOpen, estado }
          : null,
        acs: acs
          ? {
              personId: acs.personId,
              personName: acs.personName,
              personCode: acs.personCode ?? null,
              firstAt: acs.firstAt,
              lastAt: acs.lastAt,
              minutes: acs.minutes,
              passes: acs.passes,
              denied: acs.denied,
              firstDoor: acs.firstDoor,
              firstPhoto: acs.firstPhoto,
            }
          : null,
      });
    }

    for (const acs of acsItems) {
      if (usedAcs.has(acs)) continue;
      items.push({
        linkStatus: 'acs_only',
        matchKey: normalizeIdentityKey(acs.personId),
        flags: hybridTimeFlags({
          acsFirstAt: acs.firstAt,
          acsLastAt: acs.lastAt,
          acsMinutes: acs.minutes,
          acsPasses: acs.passes,
        }),
        user: null,
        erp: null,
        acs: {
          personId: acs.personId,
          personName: acs.personName,
          personCode: acs.personCode ?? null,
          firstAt: acs.firstAt,
          lastAt: acs.lastAt,
          minutes: acs.minutes,
          passes: acs.passes,
          denied: acs.denied,
          firstDoor: acs.firstDoor,
          firstPhoto: acs.firstPhoto,
        },
      });
    }

    const order: Record<HybridLinkStatus, number> = {
      linked: 0,
      erp_only: 1,
      acs_only: 2,
    };
    items.sort((a, b) => {
      const byStatus = order[a.linkStatus] - order[b.linkStatus];
      if (byStatus !== 0) return byStatus;
      const an = a.user?.nombre || a.acs?.personName || a.acs?.personId || '';
      const bn = b.user?.nombre || b.acs?.personName || b.acs?.personId || '';
      return an.localeCompare(bn, 'es');
    });

    const summary = {
      linked: items.filter((i) => i.linkStatus === 'linked').length,
      erpOnly: items.filter((i) => i.linkStatus === 'erp_only').length,
      acsOnly: items.filter((i) => i.linkStatus === 'acs_only').length,
      withFlags: items.filter((i) => i.flags.length > 0).length,
    };

    return {
      date: dayKey,
      sources: {
        erp: 'Checador app (foto + GPS). Fuente de nómina y pagos por minutos.',
        acs: 'Accesos concedidos en puertas Integra. No es fichaje biométrico ni AttendanceMode.',
      },
      howToLink:
        'Para vincular, pon el mismo código en User.employeeNumber (o el de la empresa) y en el employeeNo / personCode del terminal Integra. No se sincroniza biometría.',
      summary,
      items,
    };
  }

  private parseDate(value: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!m) return new Date(NaN);
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  }

  private async loadUsers(currentUser: CurrentUser, companyId: number, selfOnly: boolean) {
    const membership = { companyMemberships: { some: { companyId } } };
    const select = {
      id: true,
      nombre: true,
      email: true,
      employeeNumber: true,
      departmentId: true,
      department: { select: { nombre: true } },
      role: { select: { accesoConsoleAdmin: true } },
    } as const;

    if (selfOnly) {
      return this.prisma.user.findMany({
        where: { id: currentUser.id, ...membership },
        select,
      });
    }

    const isSuperAdmin = Boolean(currentUser.isSuperAdmin);
    const isConsoleAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));
    const canManage = Boolean(currentUser.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE));

    if (!isSuperAdmin && !isConsoleAdmin && !canManage) {
      return this.prisma.user.findMany({
        where: { id: currentUser.id, ...membership },
        select,
      });
    }

    if (isSuperAdmin || isConsoleAdmin) {
      return this.prisma.user.findMany({
        where: membership,
        select,
        orderBy: { nombre: 'asc' },
      });
    }

    return this.prisma.user.findMany({
      where: {
        ...membership,
        departmentId: currentUser.departmentId,
        role: { accesoConsoleAdmin: false },
      },
      select,
      orderBy: { nombre: 'asc' },
    });
  }
}
