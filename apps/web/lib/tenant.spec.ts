import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveCompanyId,
  setActiveCompanyId,
  subscribeActiveCompany,
  withTenantHeaders,
} from './tenant';

const STORAGE_KEY = 'nexara_active_company_id';

describe('lib/tenant · empresa activa (multi-tenant)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sin empresa guardada devuelve null', () => {
    expect(getActiveCompanyId()).toBeNull();
  });

  it('persiste y recupera el id de la empresa activa', () => {
    setActiveCompanyId(42);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('42');
    expect(getActiveCompanyId()).toBe(42);
  });

  it('borra la clave al pasar null (vuelta a la empresa primaria)', () => {
    setActiveCompanyId(7);
    setActiveCompanyId(null);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getActiveCompanyId()).toBeNull();
  });

  it('trata un valor corrupto en localStorage como "sin empresa"', () => {
    // Si esto devolviera NaN, el header X-Company-Id saldría como "NaN" y el
    // backend resolvería el tenant equivocado en vez de rechazar la petición.
    window.localStorage.setItem(STORAGE_KEY, 'no-soy-un-numero');
    expect(getActiveCompanyId()).toBeNull();
  });

  it('notifica a los suscriptores en cada cambio y deja de hacerlo tras desuscribir', () => {
    const spy = vi.fn();
    const unsubscribe = subscribeActiveCompany(spy);

    setActiveCompanyId(3);
    setActiveCompanyId(null);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 3);
    expect(spy).toHaveBeenNthCalledWith(2, null);

    unsubscribe();
    setActiveCompanyId(9);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('withTenantHeaders añade X-Company-Id conservando las cabeceras previas', () => {
    setActiveCompanyId(12);
    const headers = new Headers(withTenantHeaders({ Authorization: 'Bearer abc' }));
    expect(headers.get('X-Company-Id')).toBe('12');
    expect(headers.get('Authorization')).toBe('Bearer abc');
  });

  it('withTenantHeaders no inventa X-Company-Id cuando no hay empresa activa', () => {
    const headers = new Headers(withTenantHeaders({ Authorization: 'Bearer abc' }));
    expect(headers.has('X-Company-Id')).toBe(false);
    expect(headers.get('Authorization')).toBe('Bearer abc');
  });
});
