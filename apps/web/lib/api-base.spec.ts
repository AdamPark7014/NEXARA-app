import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, buildApiUrl, getApiBase, parseResponseJson } from './api-base';
import { setActiveCompanyId } from './tenant';

/** jsdom fija window.location; para probar el enrutado por host hay que sustituirlo. */
function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      href: url.href,
      origin: url.origin,
      hostname: url.hostname,
      protocol: url.protocol,
      port: url.port,
    },
  });
}

const realLocation = window.location;

describe('getApiBase · a qué backend apunta la web', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, configurable: true, value: realLocation });
  });

  it('en un subdominio de panel usa el mismo origen (Traefik enruta /api)', () => {
    setLocation('https://core.nexara.com.mx/erp/dashboard');
    expect(getApiBase()).toBe('https://core.nexara.com.mx/api');
    setLocation('https://ops.nexara.com.mx/ops/activities');
    expect(getApiBase()).toBe('https://ops.nexara.com.mx/api');
  });

  it('cae al mismo origen cuando el host no es un panel conocido', () => {
    setLocation('http://localhost:3000/');
    expect(getApiBase()).toBe('http://localhost:3000/api');
  });

  it('buildApiUrl no duplica ni se come las barras', () => {
    setLocation('https://core.nexara.com.mx/');
    expect(buildApiUrl('company/mine')).toBe('https://core.nexara.com.mx/api/company/mine');
    expect(buildApiUrl('/company/mine')).toBe('https://core.nexara.com.mx/api/company/mine');
  });
});

describe('apiRequest · cabecera de tenant', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envía X-Company-Id cuando hay empresa activa', async () => {
    setActiveCompanyId(5);
    await apiRequest('clients');
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('X-Company-Id')).toBe('5');
  });

  it('no envía X-Company-Id sin empresa activa', async () => {
    await apiRequest('clients');
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.has('X-Company-Id')).toBe(false);
  });

  it('ignora un id corrupto en vez de mandar "NaN" al backend', () => {
    window.localStorage.setItem('nexara_active_company_id', 'xx');
    return apiRequest('clients').then(() => {
      const headers = new Headers(fetchMock.mock.calls[0][1].headers);
      expect(headers.has('X-Company-Id')).toBe(false);
    });
  });

  it('pone Content-Type JSON por defecto pero no sobre un FormData', async () => {
    await apiRequest('clients', { method: 'POST', body: '{}' });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Content-Type')).toBe('application/json');

    await apiRequest('clients', { method: 'POST', body: new FormData() });
    expect(new Headers(fetchMock.mock.calls[1][1].headers).has('Content-Type')).toBe(false);
  });

  it('respeta un Content-Type explícito', async () => {
    await apiRequest('clients', { headers: { 'Content-Type': 'text/plain' } });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Content-Type')).toBe('text/plain');
  });
});

describe('parseResponseJson · Nest a veces responde 200 con cuerpo vacío', () => {
  it('devuelve null en 204', async () => {
    await expect(parseResponseJson(new Response(null, { status: 204 }))).resolves.toBeNull();
  });

  it('devuelve null en 200 con cuerpo vacío en vez de reventar el JSON.parse', async () => {
    await expect(parseResponseJson(new Response('   ', { status: 200 }))).resolves.toBeNull();
  });

  it('parsea el cuerpo cuando lo hay', async () => {
    await expect(parseResponseJson(new Response('{"id":3}', { status: 200 }))).resolves.toEqual({ id: 3 });
  });
});
