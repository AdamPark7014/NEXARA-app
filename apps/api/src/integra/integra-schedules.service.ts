import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ACCESS_SCHEDULE_MODEL_ES,
  assignUserAccess,
  classifyValid,
  ensurePresetTemplate,
  getPlanTemplate,
  getWeekPlan,
  listPlanTemplates,
  listWeekPlanSummaries,
  parseRightPlan,
  putPlanTemplate,
  putWeekPlan,
  buildWeekPlanCfg,
  validFromMode,
  PRESET_TEMPLATE_SLOTS,
  presetSlot,
  type AccessPresetKey,
  type PlanTemplate,
  type RightPlanEntry,
  type ValidMode,
  type WeekPlanCfg,
  type Weekday,
} from '../hikvision-isapi/isapi-schedules';
import {
  listAllUserInfo,
  searchUserInfo,
  type HikvisionIsapiClient,
} from '../hikvision-isapi/index';
import { IntegraSiteService } from './integra-site.service';
import { IntegraSyncService } from './integra-sync.service';

type Actor = { id?: number; email?: string };

type DoorPlanInput = {
  deviceIp: string;
  doorNo?: number;
  planTemplateNo?: string | number;
  /** Quitar derecho en ese terminal (Valid.enable=false allí). */
  disable?: boolean;
};

@Injectable()
export class IntegraSchedulesService {
  private readonly logger = new Logger(IntegraSchedulesService.name);

  constructor(
    private readonly sites: IntegraSiteService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sync: IntegraSyncService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async requireIsapi(companyId: number | null, siteId?: number | null) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost || !resolved.siteId) {
      throw new BadRequestException('Horarios ACS solo en sitios ISAPI');
    }
    return resolved as typeof resolved & {
      siteId: number;
      isapiForHost: (ip: string) => HikvisionIsapiClient | null;
    };
  }

  private async acsDevices(siteId: number) {
    const [devices, doors] = await Promise.all([
      this.prisma.integraDevice.findMany({
        where: { siteId, kind: 'ACS', ip: { not: null } },
        select: { ip: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.integraDoor.findMany({
        where: { siteId },
        select: { doorIndexCode: true, name: true },
      }),
    ]);
    const doorByIp = new Map<string, { doorIndexCode: string; name: string }>();
    for (const d of doors) {
      const ip = String(d.doorIndexCode).split('|')[0];
      if (ip) doorByIp.set(ip, d);
    }
    return devices.map((d) => {
      const ip = d.ip as string;
      const door = doorByIp.get(ip);
      return {
        deviceIp: ip,
        deviceName: d.name,
        doorIndexCode: door?.doorIndexCode || `${ip}|1`,
        doorName: door?.name || d.name,
      };
    });
  }

  /** Catálogo de plantillas/horarios en TODOS los ACS del sitio. */
  async listSiteSchedules(companyId: number | null, siteId?: number | null) {
    const resolved = await this.requireIsapi(companyId, siteId);
    const devices = await this.acsDevices(resolved.siteId);
    const items = [];
    for (const d of devices) {
      const client = resolved.isapiForHost(d.deviceIp);
      if (!client) {
        items.push({ ...d, ok: false, error: 'Sin cliente ISAPI', templates: [], weekPlans: [] });
        continue;
      }
      try {
        const [templates, weekPlans] = await Promise.all([
          listPlanTemplates(client, 32),
          listWeekPlanSummaries(client, 8), // resumen corto; detalle por GET puntual
        ]);
        items.push({
          ...d,
          ok: true,
          maxTemplateId: 32,
          maxWeekPlanId: 32,
          templates,
          weekPlans,
        });
      } catch (e) {
        items.push({
          ...d,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          templates: [],
          weekPlans: [],
        });
      }
    }
    return {
      provider: 'ISAPI' as const,
      siteId: resolved.siteId,
      model: ACCESS_SCHEDULE_MODEL_ES,
      presets: [
        { key: 'always', label: 'Siempre (24/7)', planTemplateNo: '1', validMode: 'indefinite' },
        { key: 'never', label: 'Sin acceso', validMode: 'disabled' },
        {
          key: 'office_hours',
          label: 'Horario de oficina (L–V)',
          ensuresTemplateId: PRESET_TEMPLATE_SLOTS.office_hours,
          planTemplateNo: String(PRESET_TEMPLATE_SLOTS.office_hours),
          validMode: 'indefinite',
        },
        {
          key: 'after_hours',
          label: 'Fuera de horario (L–V noches)',
          ensuresTemplateId: PRESET_TEMPLATE_SLOTS.after_hours,
          planTemplateNo: String(PRESET_TEMPLATE_SLOTS.after_hours),
          validMode: 'indefinite',
        },
        {
          key: 'weekend',
          label: 'Solo fin de semana',
          ensuresTemplateId: PRESET_TEMPLATE_SLOTS.weekend,
          planTemplateNo: String(PRESET_TEMPLATE_SLOTS.weekend),
          validMode: 'indefinite',
        },
        { key: 'visitor_today', label: 'Pase del día (visitante)', validMode: 'window' },
        { key: 'contractor', label: 'Contratista (ventana Valid)', validMode: 'window' },
      ],
      devices: items,
    };
  }

  async getWeekPlanDetail(
    companyId: number | null,
    deviceIp: string,
    planId: number,
    siteId?: number | null,
  ) {
    const resolved = await this.requireIsapi(companyId, siteId);
    const client = resolved.isapiForHost(deviceIp);
    if (!client) throw new BadRequestException(`ACS ${deviceIp} no disponible`);
    const cfg = await getWeekPlan(client, planId);
    if (!cfg) throw new NotFoundException(`WeekPlan ${planId} no soportado en ${deviceIp}`);
    return { deviceIp, id: planId, ...cfg };
  }

  async putWeekPlanDetail(
    companyId: number | null,
    deviceIp: string,
    planId: number,
    body: {
      enable?: boolean;
      segments?: Array<{ week: string; id?: number; beginTime: string; endTime: string }>;
      WeekPlanCfg?: WeekPlanCfg;
    },
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.requireIsapi(companyId, siteId);
    if (!companyId) throw new BadRequestException('companyId requerido');
    const client = resolved.isapiForHost(deviceIp);
    if (!client) throw new BadRequestException(`ACS ${deviceIp} no disponible`);
    if (planId === 1 && body.segments) {
      // Permitir editar slot 1 pero avisar — es el 24/7 de fábrica.
      this.logger.warn(`Sobrescribiendo week plan 1 (fábrica) en ${deviceIp}`);
    }
    let cfg: WeekPlanCfg;
    if (body.WeekPlanCfg?.WeekPlanCfg?.length) {
      cfg = {
        enable: body.enable !== false && body.WeekPlanCfg.enable !== false,
        WeekPlanCfg: body.WeekPlanCfg.WeekPlanCfg,
      };
    } else if (body.segments) {
      cfg = buildWeekPlanCfg(
        body.segments.map((s) => ({
          week: s.week as Weekday,
          id: s.id,
          beginTime: s.beginTime,
          endTime: s.endTime,
        })),
        body.enable !== false,
      );
    } else {
      throw new BadRequestException('Envía segments[] o WeekPlanCfg completo (56 franjas)');
    }
    await putWeekPlan(client, planId, cfg);
    await this.audit.log(
      {
        entityType: 'Integra',
        entityId: resolved.siteId,
        action: 'integra.schedule.weekPlan.put',
        changes: { deviceIp, planId, enabledSegs: cfg.WeekPlanCfg.filter((s) => s.enable).length },
        companyId,
        source: 'integra',
      },
      actor?.id,
    );
    this.emitAccess(companyId, resolved.siteId, { kind: 'weekPlan', deviceIp, planId });
    return { success: true, deviceIp, id: planId, enable: cfg.enable };
  }

  async getTemplateDetail(
    companyId: number | null,
    deviceIp: string,
    templateId: number,
    siteId?: number | null,
  ) {
    const resolved = await this.requireIsapi(companyId, siteId);
    const client = resolved.isapiForHost(deviceIp);
    if (!client) throw new BadRequestException(`ACS ${deviceIp} no disponible`);
    const tmpl = await getPlanTemplate(client, templateId);
    if (!tmpl) throw new NotFoundException(`Plantilla ${templateId} no soportada en ${deviceIp}`);
    return { deviceIp, ...tmpl };
  }

  async putTemplateDetail(
    companyId: number | null,
    deviceIp: string,
    templateId: number,
    body: PlanTemplate,
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.requireIsapi(companyId, siteId);
    if (!companyId) throw new BadRequestException('companyId requerido');
    const client = resolved.isapiForHost(deviceIp);
    if (!client) throw new BadRequestException(`ACS ${deviceIp} no disponible`);
    await putPlanTemplate(client, templateId, body);
    await this.audit.log(
      {
        entityType: 'Integra',
        entityId: resolved.siteId,
        action: 'integra.schedule.template.put',
        changes: { deviceIp, templateId, templateName: body.templateName, weekPlanNo: body.weekPlanNo },
        companyId,
        source: 'integra',
      },
      actor?.id,
    );
    this.emitAccess(companyId, resolved.siteId, { kind: 'template', deviceIp, templateId });
    return { success: true, deviceIp, id: templateId };
  }

  /**
   * Materializa presets de franjas (oficina / after-hours / weekend) en
   * slots ≥2 de uno o todos los ACS. No toca plantilla 1 (24/7).
   */
  async ensurePresets(
    companyId: number | null,
    input: {
      preset: 'office_hours' | 'after_hours' | 'weekend';
      deviceIp?: string;
      templateId?: number;
      weekPlanId?: number;
      officeBegin?: string;
      officeEnd?: string;
    },
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.requireIsapi(companyId, siteId);
    if (!companyId) throw new BadRequestException('companyId requerido');
    const devices = await this.acsDevices(resolved.siteId);
    const targets = input.deviceIp
      ? devices.filter((d) => d.deviceIp === input.deviceIp)
      : devices;
    if (!targets.length) throw new NotFoundException('ACS no encontrado');

    const defaultSlot = presetSlot(input.preset);
    const results = [];
    for (const d of targets) {
      const client = resolved.isapiForHost(d.deviceIp);
      if (!client) {
        results.push({ deviceIp: d.deviceIp, ok: false, error: 'Sin cliente' });
        continue;
      }
      try {
        const ensured = await ensurePresetTemplate(client, {
          preset: input.preset,
          templateId: input.templateId ?? defaultSlot,
          weekPlanId: input.weekPlanId ?? defaultSlot,
          officeBegin: input.officeBegin,
          officeEnd: input.officeEnd,
        });
        results.push({ deviceIp: d.deviceIp, ok: true, ...ensured, doorName: d.doorName });
      } catch (e) {
        results.push({
          deviceIp: d.deviceIp,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await this.audit.log(
      {
        entityType: 'Integra',
        entityId: resolved.siteId,
        action: 'integra.schedule.preset.ensure',
        changes: { preset: input.preset, results },
        companyId,
        source: 'integra',
      },
      actor?.id,
    );
    this.emitAccess(companyId, resolved.siteId, { kind: 'preset', preset: input.preset });
    const allOk = results.every((r) => r.ok);
    return { success: allOk, partial: results.some((r) => r.ok) && !allOk, results };
  }

  /** Acceso de una persona en todos los terminales/puertas del sitio. */
  async getPersonAccess(companyId: number | null, personId: string, siteId?: number | null) {
    const resolved = await this.requireIsapi(companyId, siteId);
    const employeeNo = decodeURIComponent(String(personId || '').trim());
    if (!employeeNo) throw new BadRequestException('personId requerido');

    const mirror = companyId
      ? await this.prisma.integraPerson.findFirst({
          where: { companyId, personId: employeeNo, siteId: resolved.siteId },
        })
      : null;

    const devices = await this.acsDevices(resolved.siteId);
    const doors: Array<Record<string, unknown>> = [];
    let anyValid: {
      enable?: boolean;
      beginTime?: string;
      endTime?: string;
      timeType?: string;
    } | null = null;

    for (const d of devices) {
      const client = resolved.isapiForHost(d.deviceIp);
      if (!client) {
        doors.push({ ...d, present: false, error: 'Sin cliente', doorNo: 1 });
        continue;
      }
      try {
        let user =
          (
            await searchUserInfo(client, {
              position: 0,
              maxResults: 30,
              employeeNos: [employeeNo],
            })
          ).users.find((u) => String(u.employeeNo).trim() === employeeNo) || null;
        if (!user) {
          // Firmware a veces ignora EmployeeNoList
          const all = await listAllUserInfo(client, 80);
          user = all.find((u) => String(u.employeeNo).trim() === employeeNo) || null;
        }
        if (!user) {
          doors.push({
            ...d,
            present: false,
            doorNo: 1,
            doorRight: null,
            planTemplateNo: null,
            rightPlan: [],
            Valid: null,
          });
          continue;
        }
        const rightPlan = parseRightPlan(user.RightPlan);
        const planTemplateNo = rightPlan[0]?.planTemplateNo ?? null;
        let templateName: string | null = null;
        if (planTemplateNo) {
          const tmpl = await getPlanTemplate(client, Number(planTemplateNo));
          templateName = tmpl?.templateName || null;
        }
        if (!anyValid && user.Valid) {
          anyValid = user.Valid as {
            enable?: boolean;
            beginTime?: string;
            endTime?: string;
            timeType?: string;
          };
        }
        doors.push({
          ...d,
          present: true,
          doorNo: rightPlan[0]?.doorNo ?? 1,
          doorRight: user.doorRight != null ? String(user.doorRight) : '1',
          planTemplateNo,
          templateName,
          rightPlan,
          Valid: user.Valid || null,
          validMode: classifyValid(user.Valid as { enable?: boolean; beginTime?: string; endTime?: string }),
          name: user.name,
          userType: user.userType,
        });
      } catch (e) {
        doors.push({
          ...d,
          present: false,
          doorNo: 1,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const fromMirror =
      mirror?.raw && typeof mirror.raw === 'object'
        ? (mirror.raw as { Valid?: typeof anyValid }).Valid
        : null;
    const valid = anyValid || fromMirror || null;
    const namedDoor = doors.find((d) => d.present === true && typeof d.name === 'string');

    return {
      personId: employeeNo,
      name: mirror?.personName || (namedDoor?.name as string | undefined) || employeeNo,
      valid,
      validMode: classifyValid(valid),
      doors,
      modelNote: ACCESS_SCHEDULE_MODEL_ES.useCases,
    };
  }

  /**
   * Asigna vigencia y/o plantillas. Soporta presets + planes por puerta/IP.
   * Empuja al instante (Modify) y refresca espejo + socket — sin sync manual.
   */
  async patchPersonAccess(
    companyId: number | null,
    personId: string,
    input: {
      validMode?: ValidMode;
      beginTime?: string;
      endTime?: string;
      planTemplateNo?: string | number;
      doorPlans?: DoorPlanInput[];
      preset?: AccessPresetKey;
      /** Días de contratista desde hoy si preset=contractor sin endTime. */
      contractorDays?: number;
      deviceIps?: string[];
      ensurePresetsOnDevices?: boolean;
    },
    actor?: Actor,
    siteId?: number | null,
  ) {
    const resolved = await this.requireIsapi(companyId, siteId);
    if (!companyId) throw new BadRequestException('companyId requerido');
    const employeeNo = decodeURIComponent(String(personId || '').trim());
    if (!employeeNo) throw new BadRequestException('personId requerido');

    const devices = await this.acsDevices(resolved.siteId);
    const scopeIps = new Set(
      (input.deviceIps?.length ? input.deviceIps : devices.map((d) => d.deviceIp)).map(String),
    );
    const targets = devices.filter((d) => scopeIps.has(d.deviceIp));
    if (!targets.length) throw new BadRequestException('Sin ACS en el alcance');

    // Resolver preset → valid + planTemplateNo
    let validMode = input.validMode;
    let beginTime = input.beginTime;
    let endTime = input.endTime;
    let planTemplateNo =
      input.planTemplateNo != null ? String(input.planTemplateNo) : undefined;
    const preset = input.preset;

    if (preset === 'always') {
      validMode = validMode || 'indefinite';
      planTemplateNo = planTemplateNo || '1';
    } else if (preset === 'never') {
      validMode = 'disabled';
    } else if (preset === 'visitor_today') {
      validMode = 'window';
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 0);
      beginTime = beginTime || toLocalIso(start);
      endTime = endTime || toLocalIso(end);
      planTemplateNo = planTemplateNo || '1';
    } else if (preset === 'contractor') {
      validMode = 'window';
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const days = Math.min(365, Math.max(1, Math.floor(input.contractorDays ?? 30) || 30));
      const end = new Date(start);
      end.setDate(end.getDate() + days);
      end.setHours(23, 59, 59, 0);
      beginTime = beginTime || toLocalIso(start);
      endTime = endTime || toLocalIso(end);
      planTemplateNo = planTemplateNo || '1';
    } else if (preset === 'office_hours' || preset === 'after_hours' || preset === 'weekend') {
      validMode = validMode || 'indefinite';
      const slot = presetSlot(preset);
      planTemplateNo = planTemplateNo || String(slot);
      if (input.ensurePresetsOnDevices !== false) {
        await this.ensurePresets(
          companyId,
          { preset, deviceIp: undefined, templateId: slot, weekPlanId: slot },
          actor,
          resolved.siteId,
        );
      }
    }

    // Si doorPlans piden plantillas 2/4/5, materializar franjas aunque el
    // preset sea contractor / meeting_only / window libre. Slot 3 = contratista.
    if (input.ensurePresetsOnDevices !== false) {
      const needed = new Set<keyof typeof PRESET_TEMPLATE_SLOTS>();
      const consider = (n: string) => {
        if (n === String(PRESET_TEMPLATE_SLOTS.office_hours)) needed.add('office_hours');
        if (n === String(PRESET_TEMPLATE_SLOTS.after_hours)) needed.add('after_hours');
        if (n === String(PRESET_TEMPLATE_SLOTS.weekend)) needed.add('weekend');
      };
      for (const dp of input.doorPlans || []) {
        consider(String(dp.planTemplateNo ?? ''));
      }
      if (planTemplateNo) consider(planTemplateNo);
      for (const p of needed) {
        const slot = presetSlot(p);
        await this.ensurePresets(
          companyId,
          {
            preset: p,
            templateId: slot,
            weekPlanId: slot,
          },
          actor,
          resolved.siteId,
        );
      }
    }

    const Valid = validMode
      ? validFromMode(validMode, { beginTime, endTime })
      : beginTime || endTime
        ? validFromMode('window', { beginTime, endTime })
        : undefined;

    const doorPlanByIp = new Map<string, DoorPlanInput>();
    for (const dp of input.doorPlans || []) {
      if (dp.deviceIp) doorPlanByIp.set(dp.deviceIp, dp);
    }

    const results: Array<{ deviceIp: string; ok: boolean; error?: string }> = [];

    for (const d of targets) {
      const client = resolved.isapiForHost(d.deviceIp);
      if (!client) {
        results.push({ deviceIp: d.deviceIp, ok: false, error: 'Sin cliente' });
        continue;
      }
      try {
        let user =
          (
            await searchUserInfo(client, {
              position: 0,
              maxResults: 30,
              employeeNos: [employeeNo],
            })
          ).users.find((u) => String(u.employeeNo).trim() === employeeNo) || null;
        if (!user) {
          const all = await listAllUserInfo(client, 80);
          user = all.find((u) => String(u.employeeNo).trim() === employeeNo) || null;
        }
        if (!user) {
          results.push({
            deviceIp: d.deviceIp,
            ok: false,
            error: 'Persona no dada de alta en este terminal',
          });
          continue;
        }

        const perDoor = doorPlanByIp.get(d.deviceIp);
        let rightPlan: RightPlanEntry[] = parseRightPlan(user.RightPlan);
        if (!rightPlan.length) {
          rightPlan = [{ doorNo: 1, planTemplateNo: '1' }];
        }

        if (perDoor?.disable) {
          await assignUserAccess(client, {
            employeeNo,
            name: String(user.name || employeeNo),
            userType: user.userType != null ? String(user.userType) : 'normal',
            gender: user.gender != null ? String(user.gender) : undefined,
            doorRight: user.doorRight != null ? String(user.doorRight) : '1',
            Valid: validFromMode('disabled'),
            rightPlan,
          });
          results.push({ deviceIp: d.deviceIp, ok: true });
          continue;
        }

        const tmpl =
          perDoor?.planTemplateNo != null
            ? String(perDoor.planTemplateNo)
            : planTemplateNo != null
              ? String(planTemplateNo)
              : rightPlan[0]?.planTemplateNo || '1';
        const doorNo = perDoor?.doorNo ?? rightPlan[0]?.doorNo ?? 1;
        rightPlan = [{ doorNo, planTemplateNo: tmpl }];

        await assignUserAccess(client, {
          employeeNo,
          name: String(user.name || employeeNo),
          userType: user.userType != null ? String(user.userType) : 'normal',
          gender: user.gender != null ? String(user.gender) : undefined,
          doorRight: user.doorRight != null ? String(user.doorRight) : String(doorNo),
          Valid: Valid
            ? {
                enable: Valid.enable,
                beginTime: Valid.beginTime,
                endTime: Valid.endTime,
              }
            : user.Valid
              ? {
                  enable: (user.Valid as { enable?: boolean }).enable !== false,
                  beginTime: (user.Valid as { beginTime?: string }).beginTime,
                  endTime: (user.Valid as { endTime?: string }).endTime,
                }
              : undefined,
          rightPlan,
        });
        results.push({ deviceIp: d.deviceIp, ok: true });
      } catch (e) {
        results.push({
          deviceIp: d.deviceIp,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await this.audit.log(
      {
        entityType: 'Integra',
        entityId: resolved.siteId,
        action: 'integra.person.access.patch',
        changes: { employeeNo, preset, validMode, planTemplateNo, results },
        companyId,
        source: 'integra',
      },
      actor?.id,
    );

    // Espejo + push en vivo (sin botón Sync)
    await this.sync.syncSite(companyId, resolved.siteId).catch((e) => {
      this.logger.warn(`sync tras access patch: ${String(e)}`);
    });
    this.emitAccess(companyId, resolved.siteId, {
      kind: 'personAccess',
      personId: employeeNo,
      results,
    });

    const allOk = results.length > 0 && results.every((r) => r.ok);
    return {
      success: allOk,
      partial: results.some((r) => r.ok) && !allOk,
      personId: employeeNo,
      results,
      provider: 'ISAPI' as const,
      note: allOk
        ? 'Acceso aplicado en los terminales; espejo actualizado.'
        : 'Aplicación parcial — revisa results por IP.',
    };
  }

  private emitAccess(companyId: number, siteId: number, payload: Record<string, unknown>) {
    try {
      this.realtime.emitToCompany(companyId, 'integra:access-updated', {
        siteId,
        at: new Date().toISOString(),
        ...payload,
      });
      this.realtime.emitToCompany(companyId, 'entity:updated', {
        model: 'IntegraPerson',
        action: 'update',
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      this.logger.warn(`emit access: ${String(e)}`);
    }
  }
}

function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
