import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  deleteFaceData,
  deleteUserInfo,
  modifyUserInfo,
  recordUserInfo,
  uploadFaceData,
  type HikvisionIsapiClient,
  type UserInfoWrite,
} from '../hikvision-isapi/index';
import { IntegraSiteService } from './integra-site.service';
import { readLocalPersonFace } from './integra-person-media';

export type AcsDeviceResult = {
  deviceIp: string;
  ok: boolean;
  error?: string;
  attempts?: number;
};

export type AcsFanoutStatus = {
  id: string;
  at: string;
  companyId: number;
  siteId: number;
  op: string;
  employeeNo: string;
  results: AcsDeviceResult[];
  pendingRetry: boolean;
  note?: string;
};

type RetryPayload = {
  companyId: number;
  siteId: number;
  op: 'userUpsert' | 'userDisable' | 'userDelete' | 'faceUpload' | 'faceDelete';
  user: UserInfoWrite;
  failedIps: string[];
  attempt: number;
  statusId: string;
};

const RECENT_CAP = 80;
const INLINE_RETRY_MS = 1500;

/**
 * Fan-out ISAPI en vivo a todos los ACS del sitio.
 * Alta/edición/baja y push ERP → terminales; reintento por IP si falla.
 */
@Injectable()
export class IntegraAcsFanoutService implements OnModuleInit {
  private readonly logger = new Logger(IntegraAcsFanoutService.name);
  private readonly recent: AcsFanoutStatus[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: IntegraSiteService,
    private readonly jobs: JobQueueService,
  ) {}

  onModuleInit() {
    this.jobs.register('integra.acs.fanout.retry', async (payload) => {
      await this.handleRetry(payload as RetryPayload);
    });
  }

  listRecent(companyId: number, siteId?: number | null): AcsFanoutStatus[] {
    return this.recent
      .filter((r) => r.companyId === companyId && (siteId == null || r.siteId === siteId))
      .slice(-40)
      .reverse();
  }

  /**
   * Propaga `fn` a cada ACS. Un reintento en línea por IP fallida;
   * el resto queda en cola con estado visible.
   */
  async fanout(
    opts: {
      companyId: number;
      siteId: number;
      op: string;
      employeeNo: string;
      isapiForHost: (ip: string) => HikvisionIsapiClient | null;
      fn: (client: HikvisionIsapiClient) => Promise<void>;
      /** Si falla, encola reintento con este payload serializable. */
      retry?: Omit<RetryPayload, 'failedIps' | 'attempt' | 'statusId'>;
      skipQueue?: boolean;
    },
  ): Promise<AcsDeviceResult[]> {
    const acs = await this.prisma.integraDevice.findMany({
      where: { siteId: opts.siteId, kind: 'ACS', ip: { not: null } },
      select: { ip: true },
    });
    if (acs.length === 0) {
      const empty: AcsDeviceResult[] = [];
      this.remember({
        id: `empty-${Date.now()}`,
        at: new Date().toISOString(),
        companyId: opts.companyId,
        siteId: opts.siteId,
        op: opts.op,
        employeeNo: opts.employeeNo,
        results: empty,
        pendingRetry: false,
        note: 'Sin terminales ACS en el sitio',
      });
      return empty;
    }

    const results: AcsDeviceResult[] = [];
    for (const d of acs) {
      const ip = d.ip as string;
      const client = opts.isapiForHost(ip);
      if (!client) {
        results.push({ deviceIp: ip, ok: false, error: 'Sin cliente ISAPI', attempts: 0 });
        continue;
      }
      let lastErr = '';
      let ok = false;
      let attempts = 0;
      for (let tryN = 1; tryN <= 2; tryN++) {
        attempts = tryN;
        try {
          if (tryN > 1) await sleep(INLINE_RETRY_MS);
          await opts.fn(client);
          ok = true;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      results.push(
        ok
          ? { deviceIp: ip, ok: true, attempts }
          : { deviceIp: ip, ok: false, error: lastErr || 'falló', attempts },
      );
    }

    const failed = results.filter((r) => !r.ok).map((r) => r.deviceIp);
    const statusId = `${opts.siteId}-${opts.employeeNo}-${opts.op}-${Date.now()}`;
    let pendingRetry = false;

    if (failed.length && opts.retry && !opts.skipQueue) {
      pendingRetry = true;
      await this.jobs.enqueue(
        'integra.acs.fanout.retry',
        {
          ...opts.retry,
          failedIps: failed,
          attempt: 1,
          statusId,
        } satisfies RetryPayload,
        { delayMs: 4_000, maxAttempts: 4, jobId: `acs-fo-${statusId}` },
      );
    }

    this.remember({
      id: statusId,
      at: new Date().toISOString(),
      companyId: opts.companyId,
      siteId: opts.siteId,
      op: opts.op,
      employeeNo: opts.employeeNo,
      results,
      pendingRetry,
      note: summarize(results, pendingRetry),
    });

    return results;
  }

  /** Espejo local inmediato — no esperar sync completo. */
  async upsertMirror(opts: {
    companyId: number;
    siteId: number;
    employeeNo: string;
    name: string;
    raw?: Record<string, unknown>;
  }) {
    const personId = String(opts.employeeNo).trim();
    if (!personId) return;
    await this.prisma.integraPerson.upsert({
      where: { siteId_personId: { siteId: opts.siteId, personId } },
      create: {
        companyId: opts.companyId,
        siteId: opts.siteId,
        personId,
        personName: opts.name || personId,
        personCode: personId,
        raw: (opts.raw ?? undefined) as never,
        syncedAt: new Date(),
      },
      update: {
        personName: opts.name || personId,
        personCode: personId,
        ...(opts.raw ? { raw: opts.raw as never } : {}),
        syncedAt: new Date(),
      },
    });
  }

  /**
   * ERP → ACS: employeeNumber es el employeeNo del terminal (unificación identidad).
   * Solo sitios ISAPI activos de la empresa.
   */
  async pushErpUser(opts: {
    companyId: number;
    employeeNo: string | null | undefined;
    name: string;
    enable: boolean;
    /** Si false, no crea si no existe (solo deshabilitar). */
    createIfMissing?: boolean;
    userType?: 'normal' | 'visitor';
    doorRight?: string;
    RightPlan?: Array<{ doorNo: number; planTemplateNo: string }>;
    beginTime?: string;
    endTime?: string;
    /** Solo estos IPs reciben upsert; el resto se deshabilita si disableOthers. */
    targetIps?: string[] | null;
    disableOthers?: boolean;
    scheduleKey?: string;
  }): Promise<{
    skipped?: boolean;
    reason?: string;
    scheduleKey?: string;
    sites: Array<{
      siteId: number;
      siteName: string;
      results: AcsDeviceResult[];
      success: boolean;
      partial: boolean;
    }>;
  }> {
    const employeeNo = String(opts.employeeNo || '').trim();
    if (!employeeNo) {
      return { skipped: true, reason: 'Sin employeeNumber', sites: [] };
    }
    if (employeeNo.length > 32) {
      return {
        skipped: true,
        reason: 'employeeNumber > 32 (límite ISAPI employeeNo)',
        sites: [],
      };
    }

    const isapiSites = await this.prisma.integraSite.findMany({
      where: { companyId: opts.companyId, isActive: true, provider: 'ISAPI' },
      select: { id: true, name: true },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    if (!isapiSites.length) {
      return { skipped: true, reason: 'Sin sitio ISAPI activo', sites: [] };
    }

    const user: UserInfoWrite = {
      employeeNo,
      name: String(opts.name || employeeNo).trim() || employeeNo,
      userType: opts.userType || 'normal',
      Valid: {
        enable: opts.enable,
        beginTime: opts.beginTime || '2020-01-01T00:00:00',
        endTime: opts.endTime || '2037-12-31T23:59:59',
      },
      ...(opts.doorRight != null && opts.doorRight !== ''
        ? { doorRight: opts.doorRight }
        : {}),
      ...(opts.RightPlan != null ? { RightPlan: opts.RightPlan } : {}),
    };

    const targetSet =
      opts.targetIps && opts.targetIps.length
        ? new Set(opts.targetIps.map((ip) => String(ip).trim()).filter(Boolean))
        : null;

    const sitesOut: Array<{
      siteId: number;
      siteName: string;
      results: AcsDeviceResult[];
      success: boolean;
      partial: boolean;
    }> = [];

    for (const site of isapiSites) {
      const resolved = await this.sites.resolveClient({
        companyId: opts.companyId,
        siteId: site.id,
      });
      if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost) continue;

      const devices = await this.prisma.integraDevice.findMany({
        where: { siteId: site.id, kind: 'ACS', ip: { not: null } },
        select: { ip: true },
      });
      const allIps = devices.map((d) => d.ip as string);
      const upsertIps = targetSet
        ? allIps.filter((ip) => targetSet.has(ip))
        : allIps;
      const disableIps =
        opts.disableOthers && targetSet
          ? allIps.filter((ip) => !targetSet.has(ip))
          : !opts.enable
            ? allIps
            : [];

      const op = opts.enable
        ? `erp.upsert.${opts.scheduleKey || 'default'}`
        : 'erp.disable';
      const results: AcsDeviceResult[] = [];

      for (const ip of allIps) {
        const client = resolved.isapiForHost(ip);
        if (!client) {
          results.push({ deviceIp: ip, ok: false, error: 'Sin cliente ISAPI', attempts: 0 });
          continue;
        }
        const shouldUpsert = opts.enable && upsertIps.includes(ip);
        const shouldDisable = disableIps.includes(ip);
        if (!shouldUpsert && !shouldDisable) {
          results.push({ deviceIp: ip, ok: true, attempts: 0 });
          continue;
        }
        try {
          if (shouldUpsert) {
            await this.upsertUserOnDevice(client, user, opts.createIfMissing !== false);
          } else {
            await this.disableOrModify(client, {
              ...user,
              Valid: { ...user.Valid, enable: false },
            });
          }
          results.push({ deviceIp: ip, ok: true, attempts: 1 });
        } catch (e) {
          results.push({
            deviceIp: ip,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            attempts: 1,
          });
        }
      }

      const anyOk = results.some((r) => r.ok);
      const allOk = results.length > 0 && results.every((r) => r.ok);
      if (anyOk && opts.enable) {
        await this.upsertMirror({
          companyId: opts.companyId,
          siteId: site.id,
          employeeNo,
          name: user.name,
          raw: {
            ...user,
            source: 'erp',
            scheduleKey: opts.scheduleKey,
            targetIps: opts.targetIps ?? null,
          },
        });
      }
      this.remember({
        id: `${site.id}-${employeeNo}-erp-${Date.now()}`,
        at: new Date().toISOString(),
        companyId: opts.companyId,
        siteId: site.id,
        op,
        employeeNo,
        results,
        pendingRetry: false,
        note: summarize(results, false),
      });
      sitesOut.push({
        siteId: site.id,
        siteName: site.name,
        results,
        success: allOk,
        partial: anyOk && !allOk,
      });
    }

    return { sites: sitesOut, scheduleKey: opts.scheduleKey };
  }

  /** Actualiza nombre en espejo desde evento push (sin sync completo). */
  async touchMirrorName(opts: {
    companyId: number;
    siteId: number;
    personId: string;
    personName: string;
  }) {
    const personId = String(opts.personId || '').trim();
    const personName = String(opts.personName || '').trim();
    if (!personId || !personName) return;
    await this.prisma.integraPerson.updateMany({
      where: { companyId: opts.companyId, siteId: opts.siteId, personId },
      data: { personName, syncedAt: new Date() },
    });
  }

  private async upsertUserOnDevice(
    client: HikvisionIsapiClient,
    user: UserInfoWrite,
    createIfMissing: boolean,
  ) {
    try {
      await modifyUserInfo(client, user);
    } catch (e) {
      if (!createIfMissing) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      // Firmware: no existe → Record. Otros errores se relanzan.
      if (!/not exist|does not exist|no such|UserInfo|404|0x\w+/i.test(msg) && !/failed/i.test(msg)) {
        // Intentar Record de todas formas: muchos DS-K1T devuelven statusCode genérico.
      }
      try {
        await recordUserInfo(client, user);
      } catch (e2) {
        // Si Record falla porque ya existe, reintentar Modify.
        try {
          await modifyUserInfo(client, user);
        } catch {
          throw e2 instanceof Error ? e2 : e;
        }
      }
    }
  }

  private async disableOrModify(client: HikvisionIsapiClient, user: UserInfoWrite) {
    try {
      await modifyUserInfo(client, { ...user, Valid: { ...user.Valid, enable: false } });
    } catch {
      // Si no existe en el terminal, no hay nada que deshabilitar.
    }
  }

  private async handleRetry(payload: RetryPayload) {
    const { companyId, siteId, user, failedIps, attempt, statusId, op } = payload;
    if (!failedIps?.length) return;
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.isapiForHost) return;

    const results: AcsDeviceResult[] = [];
    const stillFailed: string[] = [];

    for (const ip of failedIps) {
      const client = resolved.isapiForHost(ip);
      if (!client) {
        results.push({ deviceIp: ip, ok: false, error: 'Sin cliente ISAPI', attempts: attempt });
        stillFailed.push(ip);
        continue;
      }
      try {
        if (op === 'userDelete') {
          await deleteUserInfo(client, user.employeeNo);
        } else if (op === 'userDisable') {
          await this.disableOrModify(client, user);
        } else if (op === 'faceDelete') {
          await deleteFaceData(client, user.employeeNo);
        } else if (op === 'faceUpload') {
          const local = readLocalPersonFace(companyId, user.employeeNo);
          if (!local?.buffer?.length) throw new Error('Sin JPEG local para reintento FaceDataRecord');
          await uploadFaceData(client, { employeeNo: user.employeeNo, jpeg: local.buffer });
        } else {
          await this.upsertUserOnDevice(client, user, true);
        }
        results.push({ deviceIp: ip, ok: true, attempts: attempt + 1 });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        results.push({ deviceIp: ip, ok: false, error: err, attempts: attempt + 1 });
        stillFailed.push(ip);
      }
    }

    this.remember({
      id: `${statusId}-r${attempt}`,
      at: new Date().toISOString(),
      companyId,
      siteId,
      op: `retry.${op}`,
      employeeNo: user.employeeNo,
      results,
      pendingRetry: stillFailed.length > 0 && attempt < 3,
      note: summarize(results, stillFailed.length > 0),
    });

    if (stillFailed.length && attempt < 3) {
      await this.jobs.enqueue(
        'integra.acs.fanout.retry',
        { ...payload, failedIps: stillFailed, attempt: attempt + 1 },
        { delayMs: 8_000 * attempt, maxAttempts: 2 },
      );
      if (op === 'userDelete') {
        await this.prisma.integraPersonDeletePending.upsert({
          where: { siteId_personId: { siteId, personId: user.employeeNo } },
          create: {
            companyId,
            siteId,
            personId: user.employeeNo,
            personName: user.name,
            failedIps: stillFailed,
            force: true,
            note: `Reintento ${attempt}: quedan ${stillFailed.join(', ')}`,
          },
          update: {
            failedIps: stillFailed,
            note: `Reintento ${attempt}: quedan ${stillFailed.join(', ')}`,
          },
        });
      }
    } else if (op === 'userDelete') {
      // Nunca re-crear el espejo tras un Delete. Limpiar tombstone si ya no hay fallos.
      if (!stillFailed.length) {
        await this.prisma.integraPerson.deleteMany({
          where: { companyId, siteId, personId: user.employeeNo },
        });
        await this.prisma.integraPersonDeletePending.deleteMany({
          where: { siteId, personId: user.employeeNo },
        });
      } else {
        await this.prisma.integraPersonDeletePending.upsert({
          where: { siteId_personId: { siteId, personId: user.employeeNo } },
          create: {
            companyId,
            siteId,
            personId: user.employeeNo,
            personName: user.name,
            failedIps: stillFailed,
            force: true,
            note: `Agotados reintentos; huérfana en ${stillFailed.join(', ')}`,
          },
          update: {
            failedIps: stillFailed,
            note: `Agotados reintentos; huérfana en ${stillFailed.join(', ')}`,
          },
        });
      }
    } else if (results.some((r) => r.ok)) {
      await this.upsertMirror({
        companyId,
        siteId,
        employeeNo: user.employeeNo,
        name: user.name,
        raw: { ...user, source: 'retry' },
      });
    }
  }

  private remember(row: AcsFanoutStatus) {
    this.recent.push(row);
    while (this.recent.length > RECENT_CAP) this.recent.shift();
    const failed = row.results.filter((r) => !r.ok);
    if (failed.length) {
      this.logger.warn(
        `ACS fan-out ${row.op} ${row.employeeNo} site=${row.siteId}: ${failed
          .map((f) => `${f.deviceIp}=${f.error}`)
          .join('; ')}`,
      );
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function summarize(results: AcsDeviceResult[], pendingRetry: boolean): string {
  if (!results.length) return 'Sin terminales';
  const ok = results.filter((r) => r.ok).length;
  const base = `${ok}/${results.length} terminales OK`;
  if (ok === results.length) return base;
  return pendingRetry ? `${base} · reintento en cola` : `${base} · fallos sin reintento`;
}
