/**
 * Cliente Artemis (HikCentral Professional OpenAPI).
 * Firma HMAC-SHA256 idéntica a HIKVISION-apps/templates/hikcentral-python.
 * Solo paths documentados en docs/HikCentral-Professional.
 */
import { createHmac } from 'crypto';
import { ArtemisApiError, ArtemisNotConfiguredError } from './artemis.errors';
import type {
  ArtemisCameraRaw,
  ArtemisDeviceRaw,
  ArtemisDoorRaw,
  ArtemisEventRaw,
  ArtemisList,
  ArtemisOrgRaw,
  ArtemisPersonRaw,
  ArtemisPreviewData,
  ArtemisPrivilegeGroupRaw,
  ArtemisRegionRaw,
  ArtemisVehicleRaw,
} from './artemis.types';

export type ArtemisConfig = {
  host: string;
  appKey: string;
  appSecret: string;
  /** Etiqueta en errores (oficinas | integra). */
  scope?: string;
  timeoutMs?: number;
  reqPerSecond?: number;
};

/** Mensaje canónico que firma HikCentral (POST únicamente en esta OpenAPI). */
export function buildArtemisSignMessage(
  path: string,
  appKey: string,
  withBody: boolean,
): string {
  const contentTypeLine = withBody ? 'application/json\n' : '';
  return `POST\n*/*\n${contentTypeLine}x-ca-key:${appKey}\n${path}`;
}

export function signArtemisRequest(
  path: string,
  appKey: string,
  appSecret: string,
  withBody: boolean,
): string {
  const message = buildArtemisSignMessage(path, appKey, withBody);
  return createHmac('sha256', appSecret).update(message, 'utf8').digest('base64');
}

class RateLimiter {
  private available: number;
  private last = Date.now();

  constructor(private readonly perSecond: number) {
    this.available = perSecond;
  }

  async waitTurn(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const generated = ((now - this.last) / 1000) * this.perSecond;
      if (generated >= 1) {
        this.available = Math.min(this.perSecond, this.available + Math.floor(generated));
        this.last = now;
      }
      if (this.available >= 1) {
        this.available -= 1;
        return;
      }
      await new Promise((r) => setTimeout(r, Math.max(50, 1000 / this.perSecond)));
    }
  }
}

export class HikCentralArtemisClient {
  private readonly limiter: RateLimiter;
  private readonly scope: string;

  constructor(private readonly config: ArtemisConfig) {
    this.limiter = new RateLimiter(config.reqPerSecond ?? 5);
    this.scope = config.scope ?? 'Artemis';
  }

  get configured(): boolean {
    return Boolean(this.config.host && this.config.appKey && this.config.appSecret);
  }

  get host(): string {
    return this.config.host;
  }

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.configured) throw new ArtemisNotConfiguredError(this.scope);

    const withBody = body !== undefined;
    const headers: Record<string, string> = {
      'x-ca-key': this.config.appKey,
      'x-ca-signature': signArtemisRequest(
        path,
        this.config.appKey,
        this.config.appSecret,
        withBody,
      ),
      'x-ca-signature-headers': 'x-ca-key',
      Accept: '*/*',
    };
    if (withBody) headers['Content-Type'] = 'application/json';

    const url = `${this.config.host.replace(/\/$/, '')}${path}`;
    let lastStatus = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      await this.limiter.waitTurn();
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: withBody ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 15000),
      });
      lastStatus = res.status;
      if (res.status >= 500 && attempt === 0) continue;

      const json = (await res.json()) as { code?: string | number; msg?: string; data?: T };
      if (!res.ok) {
        throw new ArtemisApiError(String(lastStatus), res.statusText || 'HTTP error', path);
      }
      if (String(json.code) !== '0') {
        throw new ArtemisApiError(String(json.code ?? '?'), json.msg ?? 'Artemis error', path);
      }
      return json.data as T;
    }

    throw new ArtemisApiError(String(lastStatus), 'Artemis unavailable', path);
  }

  version() {
    return this.post('/artemis/api/common/v1/version');
  }

  /** Áreas / regiones (Developer Guide). */
  regions(pageNo = 1, pageSize = 200) {
    return this.post<ArtemisList<ArtemisRegionRaw>>('/artemis/api/resource/v1/regions', {
      pageNo,
      pageSize,
    });
  }

  subRegions(parentIndexCode: string, pageNo = 1, pageSize = 200) {
    return this.post<ArtemisList<ArtemisRegionRaw>>(
      '/artemis/api/resource/v1/regions/subRegions',
      { parentIndexCode, pageNo, pageSize },
    );
  }

  regionCameras(regionIndexCode: string, pageNo = 1, pageSize = 200) {
    return this.post<ArtemisList<ArtemisCameraRaw>>(
      '/artemis/api/resource/v1/regions/regionIndexCode/cameras',
      { regionIndexCode, pageNo, pageSize },
    );
  }

  doorList(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisDoorRaw>>(
      '/artemis/api/resource/v1/acsDoor/acsDoorList',
      { pageNo, pageSize },
    );
  }

  /** controlType: 0 remain open, 1 close, 2 open, 3 remain closed (Developer Guide). */
  doorControl(doorIndexCodes: string[], controlType: '0' | '1' | '2' | '3' = '2') {
    return this.post('/artemis/api/acs/v1/door/doControl', {
      doorIndexCodes,
      controlType,
    });
  }

  doorEvents(
    startTime: string,
    endTime: string,
    pageNo = 1,
    pageSize = 200,
    opts?: { doorIndexCodes?: string[]; eventType?: number },
  ) {
    const body: Record<string, unknown> = {
      startTime,
      endTime,
      pageNo,
      pageSize,
    };
    if (opts?.doorIndexCodes?.length) body.doorIndexCodes = opts.doorIndexCodes;
    if (opts?.eventType != null && Number.isFinite(opts.eventType)) {
      body.eventType = opts.eventType;
    }
    return this.post<ArtemisList<ArtemisEventRaw>>('/artemis/api/acs/v1/door/events', body);
  }

  cameras(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisCameraRaw>>('/artemis/api/resource/v1/cameras', {
      pageNo,
      pageSize,
    });
  }

  /** Live preview — protocol rtsp_s (LAN). */
  previewUrls(cameraIndexCode: string) {
    return this.post<ArtemisPreviewData>('/artemis/api/video/v1/cameras/previewURLs', {
      cameraIndexCode,
      streamType: 0,
      protocol: 'rtsp_s',
      transmode: 1,
      requestWebsocketProtocol: 0,
    });
  }

  cameraCapture(cameraIndexCode: string) {
    return this.post('/artemis/api/video/v1/camera/capture', { cameraIndexCode });
  }

  orgList(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisOrgRaw>>('/artemis/api/resource/v1/org/orgList', {
      pageNo,
      pageSize,
    });
  }

  personList(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisPersonRaw>>(
      '/artemis/api/resource/v1/person/personList',
      { pageNo, pageSize },
    );
  }

  personAdd(body: Record<string, unknown>) {
    return this.post('/artemis/api/resource/v1/person/single/add', body);
  }

  personDelete(personId: string) {
    return this.post('/artemis/api/resource/v1/person/single/delete', { personId });
  }

  personInfoById(personId: string) {
    return this.post('/artemis/api/resource/v1/person/personId/personInfo', { personId });
  }

  privilegeGroups(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisPrivilegeGroupRaw>>(
      '/artemis/api/acs/v1/privilege/group',
      { pageNo, pageSize },
    );
  }

  privilegeAddPersons(privilegeGroupId: string, personIds: string[]) {
    return this.post('/artemis/api/acs/v1/privilege/group/single/addPersons', {
      privilegeGroupId,
      personIds,
    });
  }

  authReapplication() {
    return this.post('/artemis/api/visitor/v1/auth/reapplication', {});
  }

  acsDeviceList(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisDeviceRaw>>(
      '/artemis/api/resource/v1/acsDevice/acsDeviceList',
      { pageNo, pageSize },
    );
  }

  encodeDeviceList(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisDeviceRaw>>(
      '/artemis/api/resource/v1/encodeDevice/encodeDeviceList',
      { pageNo, pageSize },
    );
  }

  vehicleList(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<ArtemisVehicleRaw>>(
      '/artemis/api/resource/v1/vehicle/vehicleList',
      { pageNo, pageSize },
    );
  }

  vehicleAdd(body: Record<string, unknown>) {
    return this.post('/artemis/api/resource/v1/vehicle/single/add', body);
  }

  vehicleUpdate(body: Record<string, unknown>) {
    return this.post('/artemis/api/resource/v1/vehicle/single/update', body);
  }

  vehicleDelete(vehicleId: string) {
    return this.post('/artemis/api/resource/v1/vehicle/single/delete', { vehicleId });
  }

  /** Playback — fechas ISO con offset. */
  playbackUrls(cameraIndexCode: string, beginTime: string, endTime: string) {
    return this.post<ArtemisPreviewData>('/artemis/api/video/v1/cameras/playbackURLs', {
      cameraIndexCode,
      beginTime,
      endTime,
      protocol: 'rtsp_s',
      lockType: 0,
    });
  }

  eventPictures(picUri: string) {
    return this.post('/artemis/api/acs/v1/event/pictures', { picUri });
  }

  eventRecordsPage(body: Record<string, unknown>) {
    return this.post('/artemis/api/eventService/v1/eventRecords/page', body);
  }

  eventSubscription(body: Record<string, unknown>) {
    return this.post('/artemis/api/eventService/v1/eventSubscriptionByEventTypes', body);
  }

  visitorQr(body: Record<string, unknown>) {
    return this.post('/artemis/api/visitor/v1/visitor/qr/get', body);
  }

  visitorAppointment(body: Record<string, unknown>) {
    return this.post('/artemis/api/visitor/v1/appointment/registration', body);
  }

  anprCrossRecords(body: Record<string, unknown>) {
    return this.post('/artemis/api/pms/v1/crossRecords/page', body);
  }

  /** Sitios RSM multi-site HikCentral (si licencia). */
  siteList(pageNo = 1, pageSize = 100) {
    return this.post<ArtemisList<Record<string, unknown>>>(
      '/artemis/api/resource/v1/site/siteList',
      { pageNo, pageSize },
    );
  }

  personUpdate(body: Record<string, unknown>) {
    return this.post('/artemis/api/resource/v1/person/single/update', body);
  }

  /** Postman: personId/personInfo */
  personInfo(personId: string) {
    return this.post('/artemis/api/resource/v1/person/personId/personInfo', { personId });
  }

  personInfoByCode(personCode: string) {
    return this.post('/artemis/api/resource/v1/person/personCode/personInfo', { personCode });
  }

  doorInfo(doorIndexCode: string) {
    return this.post('/artemis/api/resource/v1/acsDoor/indexCode/acsDoorInfo', {
      doorIndexCode,
    });
  }

  cameraInfo(cameraIndexCode: string) {
    return this.post('/artemis/api/resource/v1/cameras/indexCode', { cameraIndexCode });
  }
}

export {
  ArtemisApiError,
  ArtemisNotConfiguredError,
} from './artemis.errors';
export type * from './artemis.types';
