import { canManageAlmacen } from './almacen-access';
import { ALMACEN_POR_CORREO_URL_RULES, checkUrlAccess, checkUrlRules } from '../common/rbac/url-matrix';

describe('almacén concedido por persona', () => {
  it('solo a quien está en la lista (sin importar mayúsculas)', () => {
    expect(canManageAlmacen(' Administracion.Ventas@nexara.com.mx ')).toBe(true);
    expect(canManageAlmacen('soporte@nexara.com.mx')).toBe(false);
    expect(canManageAlmacen(null)).toBe(false);
  });

  it('abre la página y mover existencias, nada más', () => {
    expect(checkUrlRules(ALMACEN_POR_CORREO_URL_RULES, '/erp/almacen', 'GET').allowed).toBe(true);
    expect(checkUrlRules(ALMACEN_POR_CORREO_URL_RULES, '/api/stock/movements', 'POST').allowed).toBe(true);
    expect(checkUrlRules(ALMACEN_POR_CORREO_URL_RULES, '/api/warehouse/1', 'PATCH').allowed).toBe(true);
    expect(checkUrlRules(ALMACEN_POR_CORREO_URL_RULES, '/api/stock/1', 'DELETE').allowed).toBe(false);
    expect(checkUrlRules(ALMACEN_POR_CORREO_URL_RULES, '/api/users', 'GET').allowed).toBe(false);
  });

  it('el rol de campo sigue igual para todos los demás', () => {
    expect(checkUrlAccess('ing_campo', '/api/stock/movements', 'POST').allowed).toBe(false);
  });
});
