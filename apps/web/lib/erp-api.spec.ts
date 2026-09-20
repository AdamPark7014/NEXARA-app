import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { erpFetch } from './erp-api';
import * as tenant from './tenant';
import { setActiveCompanyId } from './tenant';

describe('erpFetch · cabecera de tenant', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envía X-Company-Id cuando hay empresa activa', async () => {
    setActiveCompanyId(5);
    await erpFetch('clients', 'tok');
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('X-Company-Id')).toBe('5');
  });

  it('no envía X-Company-Id sin empresa activa', async () => {
    await erpFetch('clients', 'tok');
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.has('X-Company-Id')).toBe(false);
  });

  it('pasa las cabeceras base por withTenantHeaders', async () => {
    const withTenantSpy = vi.spyOn(tenant, 'withTenantHeaders');
    setActiveCompanyId(12);
    await erpFetch('me/activities', 'session-cookie', {
      headers: { 'X-Request-Id': 'abc' },
    });
    expect(withTenantSpy).toHaveBeenCalledOnce();
    const baseHeaders = withTenantSpy.mock.calls[0][0] as Record<string, string>;
    expect(baseHeaders.Authorization).toBe('Bearer session-cookie');
    expect(baseHeaders['Content-Type']).toBe('application/json');
    expect(baseHeaders['X-Request-Id']).toBe('abc');
  });
});
