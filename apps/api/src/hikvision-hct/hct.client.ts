/** Cliente mínimo HCT OpenAPI — solo paths documentados en llms-full.txt. */

export class HctApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'HctApiError';
  }
}

export class HctNotConfiguredError extends Error {
  constructor(scope: string) {
    super(`HCT no configurado (${scope})`);
    this.name = 'HctNotConfiguredError';
  }
}

type HctOpts = {
  /** areaDomain inicial (p.ej. https://ius.hikcentralconnect.com) */
  host: string;
  appKey: string;
  secretKey: string;
  timeoutMs?: number;
  scope?: string;
};

type TokenData = {
  accessToken: string;
  areaDomain: string;
  expireTime?: number;
};

export class HikConnectTeamsClient {
  private token: TokenData | null = null;
  readonly configured: boolean;
  private readonly timeoutMs: number;
  private readonly scope: string;
  private readonly initialHost: string;
  private readonly appKey: string;
  private readonly secretKey: string;

  constructor(opts: HctOpts) {
    this.initialHost = (opts.host || '').replace(/\/$/, '');
    this.appKey = opts.appKey || '';
    this.secretKey = opts.secretKey || '';
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.scope = opts.scope || 'integra-hct';
    this.configured = Boolean(this.initialHost && this.appKey && this.secretKey);
  }

  private async ensureToken(): Promise<TokenData> {
    if (!this.configured) throw new HctNotConfiguredError(this.scope);
    const now = Date.now() / 1000;
    if (this.token?.accessToken && this.token.expireTime && this.token.expireTime - 60 > now) {
      return this.token;
    }
    const base = this.initialHost;
    const path = '/api/hccgw/platform/v1/token/get';
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: this.appKey, secretKey: this.secretKey }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as {
      errorCode?: string;
      message?: string;
      data?: { accessToken?: string; areaDomain?: string; expireTime?: number };
    };
    if (!res.ok || json.errorCode !== '0' || !json.data?.accessToken) {
      throw new HctApiError(
        String(json.errorCode ?? res.status),
        json.message || 'token/get failed',
        path,
      );
    }
    const areaDomain = (json.data.areaDomain || base).replace(/\/$/, '');
    this.token = {
      accessToken: json.data.accessToken,
      areaDomain,
      expireTime: json.data.expireTime
        ? Number(json.data.expireTime) > 1e12
          ? Number(json.data.expireTime) / 1000
          : Number(json.data.expireTime)
        : now + 6 * 24 * 3600,
    };
    return this.token;
  }

  private async post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const tok = await this.ensureToken();
    const res = await fetch(`${tok.areaDomain}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Token: tok.accessToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as {
      errorCode?: string;
      message?: string;
      data?: T;
    };
    if (!res.ok || (json.errorCode != null && json.errorCode !== '0')) {
      throw new HctApiError(
        String(json.errorCode ?? res.status),
        json.message || 'HCT request failed',
        path,
      );
    }
    return (json.data ?? json) as T;
  }

  private async get<T = unknown>(path: string): Promise<T> {
    const tok = await this.ensureToken();
    const res = await fetch(`${tok.areaDomain}${path}`, {
      method: 'GET',
      headers: { Token: tok.accessToken },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as {
      errorCode?: string;
      message?: string;
      data?: T;
    };
    if (!res.ok || (json.errorCode != null && json.errorCode !== '0')) {
      throw new HctApiError(
        String(json.errorCode ?? res.status),
        json.message || 'HCT request failed',
        path,
      );
    }
    return (json.data ?? json) as T;
  }

  /** Documentado: GET streamtoken/get */
  streamToken() {
    return this.get<{
      appKey?: string;
      appToken?: string;
      streamAreaDomain?: string;
      expireTime?: string;
    }>('/api/hccgw/platform/v1/streamtoken/get');
  }

  /** Documentado: POST areas/cameras/get */
  cameras(pageIndex = 1, pageSize = 100) {
    return this.post<{ cameraList?: Array<Record<string, unknown>>; total?: number }>(
      '/api/hccgw/resource/v1/areas/cameras/get',
      {
        pageIndex,
        pageSize,
        filter: {},
        includeSubArea: '-1',
      },
    );
  }

  /** Documentado: POST areas/doors/get */
  doors(pageIndex = 1, pageSize = 100) {
    return this.post<{ doorList?: Array<Record<string, unknown>>; total?: number }>(
      '/api/hccgw/resource/v1/areas/doors/get',
      {
        pageIndex,
        pageSize,
        filter: {},
        includeSubArea: '1',
      },
    );
  }

  /** Documentado: POST devices/get */
  devices(pageIndex = 1, pageSize = 100) {
    return this.post<{ deviceList?: Array<Record<string, unknown>>; total?: number }>(
      '/api/hccgw/resource/v1/devices/get',
      { pageIndex, pageSize, filter: {} },
    );
  }

  /**
   * Documentado: POST acs/v1/remote/control
   * actionType 1 = open (Developer Guide HCT).
   */
  remoteDoorControl(elementIds: string[]) {
    return this.post('/api/hccgw/acs/v1/remote/control', {
      remoteControl: {
        actionType: 1,
        elementlist: elementIds.map((id) => ({ elementId: id })),
        direction: 0,
        areaId: '',
        depthTraversal: 0,
      },
    });
  }
}
