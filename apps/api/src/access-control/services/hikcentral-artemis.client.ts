/**
 * Cliente Artemis (HikCentral Professional OpenAPI).
 * Firma HMAC-SHA256 idéntica a HIKVISION-apps/templates/hikcentral-python.
 * Solo paths documentados en docs/HikCentral-Professional.
 */
import { createHmac } from 'crypto';

export type ArtemisConfig = {
  host: string;
  appKey: string;
  appSecret: string;
  verifyTls?: boolean;
  timeoutMs?: number;
  reqPerSecond?: number;
};

export class ArtemisNotConfiguredError extends Error {
  constructor() {
    super('Credenciales Artemis de oficinas no configuradas (OFFICES_HIK_*)');
    this.name = 'ArtemisNotConfiguredError';
  }
}

export class ArtemisApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path: string,
  ) {
    super(`[${code}] ${message} (${path})`);
    this.name = 'ArtemisApiError';
  }
}

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

  constructor(private readonly config: ArtemisConfig) {
    this.limiter = new RateLimiter(config.reqPerSecond ?? 5);
  }

  get configured(): boolean {
    return Boolean(this.config.host && this.config.appKey && this.config.appSecret);
  }

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.configured) throw new ArtemisNotConfiguredError();

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

  regions(pageNo = 1, pageSize = 100) {
    return this.post('/artemis/api/resource/v1/regions', { pageNo, pageSize });
  }

  doorList(pageNo = 1, pageSize = 100) {
    return this.post<{ list?: ArtemisDoorRaw[]; total?: number }>(
      '/artemis/api/resource/v1/acsDoor/acsDoorList',
      { pageNo, pageSize },
    );
  }

  /** controlType "0" = open (doc HikCentral ACS). */
  doorControl(doorIndexCodes: string[], controlType: '0' | '1' | '2' = '0') {
    return this.post('/artemis/api/acs/v1/door/doControl', {
      doorIndexCodes,
      controlType,
    });
  }

  doorEvents(startTime: string, endTime: string, pageNo = 1, pageSize = 200) {
    return this.post<{ list?: ArtemisEventRaw[]; total?: number }>(
      '/artemis/api/acs/v1/door/events',
      { startTime, endTime, pageNo, pageSize },
    );
  }

  version() {
    return this.post('/artemis/api/common/v1/version');
  }
}

export type ArtemisDoorRaw = {
  doorIndexCode?: string;
  doorName?: string;
  doorNo?: number | string;
  regionName?: string;
  regionIndexCode?: string;
  channelType?: string;
  doorState?: number | string;
  online?: boolean;
};

export type ArtemisEventRaw = {
  eventId?: string;
  doorIndexCode?: string;
  doorName?: string;
  cardNo?: string;
  personId?: string;
  personName?: string;
  eventTime?: string;
  eventType?: number | string;
  eventTypeName?: string;
};
