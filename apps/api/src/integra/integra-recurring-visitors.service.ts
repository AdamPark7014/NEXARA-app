import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  buildWeekPlanCfg,
  isHhMmSs,
  putPlanTemplate,
  putWeekPlan,
  type Weekday,
  WEEKDAYS,
} from '../hikvision-isapi/isapi-schedules';
import { uploadFaceData } from '../hikvision-isapi/index';
import { writeLocalPersonFace } from './integra-person-media';
import { IntegraSiteService } from './integra-site.service';
import { IntegraAcsFanoutService } from './integra-acs-fanout.service';
import { formatLocalValid } from './access-schedule-defaults';

type Actor = { id?: number; email?: string };

export type RecurringVisitorInput = {
  visitorName: string;
  phone?: string;
  hostEmployeeId?: string;
  hostPersonId?: string;
  hostEmployeeName?: string;
  hostName?: string;
  doorIds?: string[];
  doorIndexCodes?: string[];
  weekdays: string[];
  timeFrom: string;
  timeTo: string;
  beginTime?: string;
  endTime?: string;
  validFrom: string;
  validTo: string;
  faceBase64?: string;
  notes?: string;
};

const WEEKDAY_SET = new Set<string>(WEEKDAYS);

/** Normaliza HH:MM o HH:MM:SS → HH:MM:SS verificado ISAPI. */
export function normalizeHhMmSs(raw: string, label: string): string {
  const t = String(raw || '').trim();
  if (!t) throw new BadRequestException(`${label} requerido`);
  let out = t;
  if (/^\d{1,2}:\d{2}$/.test(t)) out = `${t.padStart(5, '0')}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(t)) {
    const [h, m, s] = t.split(':');
    out = `${h.padStart(2, '0')}:${m}:${s}`;
  }
  if (!isHhMmSs(out)) {
    throw new BadRequestException(`${label} inválido (usa HH:MM o HH:MM:SS)`);
  }
  return out;
}

export function normalizeWeekdays(raw: unknown[]): Weekday[] {
  const out: Weekday[] = [];
  const seen = new Set<string>();
  for (const item of raw || []) {
    const s = String(item || '').trim();
    if (!WEEKDAY_SET.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s as Weekday);
  }
  if (!out.length) {
    throw new BadRequestException(
      'Selecciona al menos un día (Monday…Sunday, nombres ISAPI en inglés)',
    );
  }
  return out;
}

export function parseLocalDate(iso: string, label: string): Date {
  const s = String(iso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestException(`${label} inválida (YYYY-MM-DD)`);
  }
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) throw new BadRequestException(`${label} inválida`);
  return dt;
}

export function dateToYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Slot plantilla por visita: 10–29 (1–4 = presets sistema). */
export function planSlotForVisitorId(id: number): number {
  return 10 + (Math.max(1, Math.floor(id)) % 20);
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean);
}

function computeUiStatus(row: {
  status: string;
  validTo: Date;
}): 'synced' | 'pending' | 'expired' | 'cancelled' | 'error' {
  const s = String(row.status || '').toUpperCase();
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'ERROR') return 'error';
  const end = new Date(row.validTo);
  end.setHours(23, 59, 59, 0);
  if (s === 'EXPIRED' || end.getTime() < Date.now()) return 'expired';
  if (s === 'SYNCED' || s === 'ACTIVE') return 'synced';
  return 'pending';
}

@Injectable()
export class IntegraRecurringVisitorsService {
  private readonly logger = new Logger(IntegraRecurringVisitorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: IntegraSiteService,
    private readonly acsFanout: IntegraAcsFanoutService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async requireIsapi(companyId: number, siteId?: number | null) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId) {
      throw new BadRequestException(
        'Visitas recurrentes con acceso ACS solo en sitios ISAPI (Oficinas). Usa citas Artemis en HikCentral.',
      );
    }
    return resolved as typeof resolved & {
      siteId: number;
      isapiForHost: NonNullable<typeof resolved.isapiForHost>;
    };
  }

  private async resolveDoors(
    siteId: number,
    doorCodes: string[],
  ): Promise<Array<{ doorIndexCode: string; name: string; ip: string; doorNo: number }>> {
    const doors = await this.prisma.integraDoor.findMany({
      where: { siteId },
      select: { doorIndexCode: true, name: true },
    });
    const byCode = new Map(doors.map((d) => [d.doorIndexCode, d]));

    let codes = doorCodes.filter(Boolean);
    if (!codes.length) {
      // Default Oficinas: Acceso General + Sala de Juntas
      codes = doors
        .filter((d) => {
          const n = d.name.toLowerCase();
          return /junta|meeting|acceso\s*general|general|recepci|lobby/.test(n);
        })
        .map((d) => d.doorIndexCode);
      if (!codes.length) {
        throw new BadRequestException(
          'Indica al menos una puerta (p. ej. Acceso General y Sala de Juntas)',
        );
      }
    }

    const out: Array<{ doorIndexCode: string; name: string; ip: string; doorNo: number }> = [];
    for (const code of codes) {
      const d = byCode.get(code);
      const parts = code.split('|');
      const ip = parts[0]?.trim();
      const doorNo = Number(parts[1] || 1) || 1;
      if (!ip) throw new BadRequestException(`Puerta inválida: ${code}`);
      out.push({
        doorIndexCode: code,
        name: d?.name || code,
        ip,
        doorNo,
      });
    }
    return out;
  }

  private async allocateEmployeeNo(companyId: number, siteId: number): Promise<string> {
    const [people, visitors] = await Promise.all([
      this.prisma.integraPerson.findMany({
        where: { companyId, siteId },
        select: { personId: true },
      }),
      this.prisma.integraRecurringVisitor.findMany({
        where: { companyId, siteId },
        select: { employeeNo: true },
      }),
    ]);
    const used = new Set(
      [...people.map((p) => p.personId), ...visitors.map((v) => v.employeeNo)].map((s) =>
        String(s).trim(),
      ),
    );
    // Rango visitante 8xxxxxxx — no choca con nómina corta típica.
    for (let i = 0; i < 40; i++) {
      const candidate = `8${String(Date.now() + i).slice(-9)}`;
      if (!used.has(candidate)) return candidate;
    }
    return `8${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 32);
  }

  private serialize(row: {
    id: number;
    visitorName: string;
    phone: string | null;
    hostPersonId: string | null;
    hostName: string | null;
    employeeNo: string;
    doorIndexCodes: unknown;
    weekdays: unknown;
    timeFrom: string;
    timeTo: string;
    validFrom: Date;
    validTo: Date;
    planTemplateNo: string;
    status: string;
    hasFace: boolean;
    lastError: string | null;
    notes: string | null;
    createdAt: Date;
    doorNames?: string[];
  }) {
    const doorIds = asStringArray(row.doorIndexCodes);
    const weekdays = asStringArray(row.weekdays);
    const ui = computeUiStatus(row);
    return {
      id: String(row.id),
      visitorName: row.visitorName,
      phone: row.phone,
      hostEmployeeId: row.hostPersonId,
      hostPersonId: row.hostPersonId,
      hostEmployeeName: row.hostName,
      hostName: row.hostName,
      doorIds,
      doorIndexCodes: doorIds,
      doorNames: row.doorNames,
      weekdays,
      timeFrom: row.timeFrom.slice(0, 5),
      timeTo: row.timeTo.slice(0, 5),
      beginTime: row.timeFrom,
      endTime: row.timeTo,
      validFrom: dateToYmd(row.validFrom),
      validTo: dateToYmd(row.validTo),
      planTemplateNo: row.planTemplateNo,
      status: ui,
      syncStatus: row.status,
      employeeNo: row.employeeNo,
      personId: row.employeeNo,
      hasFace: row.hasFace,
      note: row.lastError || row.notes || undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(companyId: number, siteId?: number | null) {
    const resolved = await this.requireIsapi(companyId, siteId);
    await this.expireDue(companyId, resolved.siteId).catch(() => undefined);

    const rows = await this.prisma.integraRecurringVisitor.findMany({
      where: { companyId, siteId: resolved.siteId },
      orderBy: [{ status: 'asc' }, { validTo: 'desc' }, { id: 'desc' }],
      take: 200,
    });

    const doors = await this.prisma.integraDoor.findMany({
      where: { siteId: resolved.siteId },
      select: { doorIndexCode: true, name: true },
    });
    const nameBy = new Map(doors.map((d) => [d.doorIndexCode, d.name]));

    const items = rows.map((r) =>
      this.serialize({
        ...r,
        doorNames: asStringArray(r.doorIndexCodes)
          .map((c) => nameBy.get(c) || c)
          .filter(Boolean),
      }),
    );
    return {
      items,
      list: items,
      provider: 'ISAPI' as const,
      siteId: resolved.siteId,
      note: 'Acceso limitado empujado a terminales (Valid + RightPlan). Al llegar, cara/tarjeta en ventana autorizada.',
    };
  }

  async create(companyId: number, input: RecurringVisitorInput, actor?: Actor, siteId?: number | null) {
    const resolved = await this.requireIsapi(companyId, siteId);
    const name = String(input.visitorName || '').trim();
    if (!name) throw new BadRequestException('Nombre del visitante requerido');

    const weekdays = normalizeWeekdays(input.weekdays || []);
    const timeFrom = normalizeHhMmSs(input.timeFrom || input.beginTime || '', 'Hora inicio');
    const timeTo = normalizeHhMmSs(input.timeTo || input.endTime || '', 'Hora fin');
    const validFrom = parseLocalDate(input.validFrom, 'Vigencia inicio');
    const validTo = parseLocalDate(input.validTo, 'Vigencia fin');
    if (validTo.getTime() < validFrom.getTime()) {
      throw new BadRequestException('La vigencia fin no puede ser anterior al inicio');
    }

    const doorCodes = [
      ...asStringArray(input.doorIds),
      ...asStringArray(input.doorIndexCodes),
    ];
    const uniqueDoors = [...new Set(doorCodes)];
    const doors = await this.resolveDoors(resolved.siteId, uniqueDoors);
    const employeeNo = await this.allocateEmployeeNo(companyId, resolved.siteId);
    const hostPersonId = String(
      input.hostEmployeeId || input.hostPersonId || '',
    ).trim() || null;
    const hostName = String(
      input.hostEmployeeName || input.hostName || '',
    ).trim() || null;

    const row = await this.prisma.integraRecurringVisitor.create({
      data: {
        companyId,
        siteId: resolved.siteId,
        visitorName: name,
        phone: String(input.phone || '').trim() || null,
        hostPersonId,
        hostName,
        employeeNo,
        doorIndexCodes: doors.map((d) => d.doorIndexCode) as Prisma.InputJsonValue,
        weekdays: weekdays as unknown as Prisma.InputJsonValue,
        timeFrom,
        timeTo,
        validFrom,
        validTo,
        planTemplateNo: '10',
        status: 'PENDING',
        notes: String(input.notes || '').trim() || null,
        createdById: actor?.id ?? null,
      },
    });

    const planNo = planSlotForVisitorId(row.id);
    await this.prisma.integraRecurringVisitor.update({
      where: { id: row.id },
      data: { planTemplateNo: String(planNo) },
    });

    let faceBuf: Buffer | null = null;
    if (input.faceBase64) {
      const b64 = String(input.faceBase64).replace(/^data:image\/\w+;base64,/, '');
      faceBuf = Buffer.from(b64, 'base64');
      if (faceBuf.length < 8_000 || faceBuf.length > 1_800_000) {
        throw new BadRequestException('JPEG de rostro: entre 8 KB y 1.8 MB');
      }
      if (faceBuf[0] !== 0xff || faceBuf[1] !== 0xd8) {
        throw new BadRequestException('La foto debe ser JPEG');
      }
    }

    try {
      const push = await this.pushToAcs({
        companyId,
        siteId: resolved.siteId,
        isapiForHost: resolved.isapiForHost,
        employeeNo,
        name,
        weekdays,
        timeFrom,
        timeTo,
        validFrom,
        validTo,
        planNo,
        doors,
        enable: true,
        faceJpeg: faceBuf,
      });

      const updated = await this.prisma.integraRecurringVisitor.update({
        where: { id: row.id },
        data: {
          status: push.anyOk ? 'SYNCED' : 'ERROR',
          hasFace: Boolean(faceBuf && push.faceOk),
          lastPushAt: new Date(),
          lastError: push.anyOk
            ? push.allOk
              ? null
              : `Push parcial: ${push.errors.join('; ')}`
            : push.errors.join('; ') || 'Sin respuesta de terminales',
        },
      });

      await this.audit.log(
        {
          entityType: 'Integra',
          entityId: resolved.siteId,
          action: 'integra.visitor.recurring.create',
          changes: {
            id: row.id,
            employeeNo,
            doors: doors.map((d) => d.doorIndexCode),
            weekdays,
            planNo,
            results: push.results,
          },
          companyId,
          source: 'integra',
        },
        actor?.id,
      );
      this.emit(companyId, resolved.siteId, { kind: 'recurring-visitor', id: row.id, op: 'create' });

      return this.serialize({
        ...updated,
        doorNames: doors.map((d) => d.name),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.integraRecurringVisitor.update({
        where: { id: row.id },
        data: { status: 'ERROR', lastError: msg },
      });
      throw e;
    }
  }

  async cancel(
    companyId: number,
    id: string,
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.requireIsapi(companyId, siteId);
    const rowId = Number(id);
    if (!Number.isFinite(rowId)) throw new BadRequestException('id inválido');

    const row = await this.prisma.integraRecurringVisitor.findFirst({
      where: { id: rowId, companyId, siteId: resolved.siteId },
    });
    if (!row) throw new NotFoundException('Visita recurrente no encontrada');

    const doors = await this.resolveDoors(resolved.siteId, asStringArray(row.doorIndexCodes));
    const push = await this.pushToAcs({
      companyId,
      siteId: resolved.siteId,
      isapiForHost: resolved.isapiForHost,
      employeeNo: row.employeeNo,
      name: row.visitorName,
      weekdays: normalizeWeekdays(asStringArray(row.weekdays)),
      timeFrom: row.timeFrom,
      timeTo: row.timeTo,
      validFrom: row.validFrom,
      validTo: row.validTo,
      planNo: Number(row.planTemplateNo) || planSlotForVisitorId(row.id),
      doors,
      enable: false,
      faceJpeg: null,
    });

    await this.prisma.integraRecurringVisitor.update({
      where: { id: row.id },
      data: {
        status: 'CANCELLED',
        lastPushAt: new Date(),
        lastError: push.anyOk ? null : push.errors.join('; ') || 'No se pudo deshabilitar en ACS',
      },
    });

    await this.audit.log(
      {
        entityType: 'Integra',
        entityId: resolved.siteId,
        action: 'integra.visitor.recurring.cancel',
        changes: { id: row.id, employeeNo: row.employeeNo, results: push.results },
        companyId,
        source: 'integra',
      },
      actor?.id,
    );
    this.emit(companyId, resolved.siteId, { kind: 'recurring-visitor', id: row.id, op: 'cancel' });

    return {
      success: push.anyOk,
      ok: push.anyOk,
      note: push.anyOk
        ? 'Recurrencia cancelada: Valid.enable=false en terminales autorizados.'
        : 'Cancelación registrada, pero falló el push ACS — revisa fan-out.',
      results: push.results,
    };
  }

  /** Deshabilita visitas cuya vigencia ya pasó (Valid.enable=false). */
  async expireDue(companyId?: number | null, siteId?: number | null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const where: Prisma.IntegraRecurringVisitorWhereInput = {
      status: { in: ['SYNCED', 'ACTIVE', 'PENDING', 'ERROR'] },
      validTo: { lt: today },
      ...(companyId ? { companyId } : {}),
      ...(siteId ? { siteId } : {}),
    };
    const due = await this.prisma.integraRecurringVisitor.findMany({
      where,
      take: 80,
      orderBy: { validTo: 'asc' },
    });
    let n = 0;
    for (const row of due) {
      try {
        const resolved = await this.sites.resolveClient({
          companyId: row.companyId,
          siteId: row.siteId,
        });
        if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost) {
          await this.prisma.integraRecurringVisitor.update({
            where: { id: row.id },
            data: { status: 'EXPIRED' },
          });
          n++;
          continue;
        }
        const doors = await this.resolveDoors(row.siteId, asStringArray(row.doorIndexCodes));
        await this.pushToAcs({
          companyId: row.companyId,
          siteId: row.siteId,
          isapiForHost: resolved.isapiForHost,
          employeeNo: row.employeeNo,
          name: row.visitorName,
          weekdays: normalizeWeekdays(asStringArray(row.weekdays)),
          timeFrom: row.timeFrom,
          timeTo: row.timeTo,
          validFrom: row.validFrom,
          validTo: row.validTo,
          planNo: Number(row.planTemplateNo) || planSlotForVisitorId(row.id),
          doors,
          enable: false,
          faceJpeg: null,
        });
        await this.prisma.integraRecurringVisitor.update({
          where: { id: row.id },
          data: { status: 'EXPIRED', lastPushAt: new Date(), lastError: null },
        });
        this.emit(row.companyId, row.siteId, {
          kind: 'recurring-visitor',
          id: row.id,
          op: 'expire',
        });
        n++;
      } catch (e) {
        this.logger.warn(
          `expire visitor ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
        await this.prisma.integraRecurringVisitor.update({
          where: { id: row.id },
          data: {
            status: 'EXPIRED',
            lastError: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }
    return { expired: n };
  }

  @Cron('12 * * * *')
  async cronExpire() {
    try {
      const r = await this.expireDue();
      if (r.expired > 0) this.logger.log(`Visitas recurrentes expiradas: ${r.expired}`);
    } catch (e) {
      this.logger.warn(`cronExpire: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async pushToAcs(opts: {
    companyId: number;
    siteId: number;
    isapiForHost: (ip: string) => ReturnType<IntegraSiteService['resolveClient']> extends Promise<
      infer R
    >
      ? R extends { isapiForHost?: infer F }
        ? F extends (...a: never[]) => infer C
          ? C
          : never
        : never
      : never;
    employeeNo: string;
    name: string;
    weekdays: Weekday[];
    timeFrom: string;
    timeTo: string;
    validFrom: Date;
    validTo: Date;
    planNo: number;
    doors: Array<{ doorIndexCode: string; name: string; ip: string; doorNo: number }>;
    enable: boolean;
    faceJpeg: Buffer | null;
  }) {
    const targetIps = [...new Set(opts.doors.map((d) => d.ip))];
    const begin = new Date(
      opts.validFrom.getFullYear(),
      opts.validFrom.getMonth(),
      opts.validFrom.getDate(),
      0,
      0,
      0,
    );
    const end = new Date(
      opts.validTo.getFullYear(),
      opts.validTo.getMonth(),
      opts.validTo.getDate(),
      23,
      59,
      59,
    );

    const results: Array<{ deviceIp: string; ok: boolean; error?: string; step?: string }> = [];
    const errors: string[] = [];

    if (opts.enable) {
      const cfg = buildWeekPlanCfg(
        opts.weekdays.map((week) => ({
          week,
          id: 1,
          beginTime: opts.timeFrom,
          endTime: opts.timeTo,
        })),
        true,
      );
      for (const ip of targetIps) {
        const client = opts.isapiForHost(ip);
        if (!client) {
          results.push({ deviceIp: ip, ok: false, error: 'Sin cliente ISAPI', step: 'weekPlan' });
          errors.push(`${ip}: sin cliente`);
          continue;
        }
        try {
          await putWeekPlan(client, opts.planNo, cfg);
          await putPlanTemplate(client, opts.planNo, {
            enable: true,
            templateName: `Visita ${opts.employeeNo}`.slice(0, 32),
            weekPlanNo: opts.planNo,
            holidayGroupNo: '',
          });
          results.push({ deviceIp: ip, ok: true, step: 'weekPlan' });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push({ deviceIp: ip, ok: false, error: msg, step: 'weekPlan' });
          errors.push(`${ip} plan: ${msg}`);
        }
      }
    }

    const push = await this.acsFanout.pushErpUser({
      companyId: opts.companyId,
      employeeNo: opts.employeeNo,
      name: opts.name,
      enable: opts.enable,
      createIfMissing: true,
      userType: 'visitor',
      doorRight: '1',
      RightPlan: [
        ...new Set(opts.doors.map((d) => d.doorNo || 1)),
      ].map((doorNo) => ({
        doorNo,
        planTemplateNo: String(opts.planNo),
      })),
      beginTime: formatLocalValid(begin),
      endTime: formatLocalValid(end),
      targetIps,
      disableOthers: true,
      scheduleKey: 'recurring_visitor',
    });

    for (const site of push.sites) {
      for (const r of site.results) {
        results.push({
          deviceIp: r.deviceIp,
          ok: r.ok,
          error: r.error,
          step: 'userInfo',
        });
        if (!r.ok && r.error) errors.push(`${r.deviceIp}: ${r.error}`);
      }
    }

    let faceOk = false;
    if (opts.enable && opts.faceJpeg && targetIps.length) {
      writeLocalPersonFace(opts.companyId, opts.employeeNo, opts.faceJpeg);
      let anyFace = false;
      for (const ip of targetIps) {
        const client = opts.isapiForHost(ip);
        if (!client) continue;
        try {
          await uploadFaceData(client, {
            employeeNo: opts.employeeNo,
            jpeg: opts.faceJpeg,
          });
          anyFace = true;
          results.push({ deviceIp: ip, ok: true, step: 'face' });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push({ deviceIp: ip, ok: false, error: msg, step: 'face' });
          errors.push(`${ip} face: ${msg}`);
        }
      }
      faceOk = anyFace;
    }

    const userResults = results.filter((r) => r.step === 'userInfo');
    const anyOk =
      userResults.some((r) => r.ok) ||
      (opts.enable === false && results.some((r) => r.ok));
    const allOk = userResults.length > 0 && userResults.every((r) => r.ok);

    return { results, errors, anyOk, allOk, faceOk, skipped: push.skipped };
  }

  private emit(companyId: number, siteId: number, payload: Record<string, unknown>) {
    try {
      this.realtime.emitToCompany(companyId, 'integra:access-updated', {
        siteId,
        ...payload,
      });
      this.realtime.emitToCompany(companyId, 'entity:updated', {
        entity: 'IntegraRecurringVisitor',
        siteId,
        ...payload,
      });
    } catch {
      /* socket opcional */
    }
  }
}
