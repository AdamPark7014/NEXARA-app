/**
 * Coordinación, gerencia y la encargada comercial pueden abrir el padrón.
 * Un ingeniero o un operativo no: ni la página ni el API.
 */
import { checkUrlAccess } from '../common/rbac/url-matrix.js';
import { ROLES } from '../common/rbac/roles.v2.js';

function puede(
  role: string,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
): boolean {
  return checkUrlAccess(role as never, url, method).allowed;
}

const PUEDEN = [
  ROLES.COORD_OPERACIONES,
  ROLES.ADMINISTRATIVO,
  ROLES.ARQUITECTO,
  ROLES.DIR_OPERACIONES,
  ROLES.DIR_ADMIN,
  ROLES.COORD_ADMIN,
  ROLES.COORD_VENTAS,
  ROLES.ENC_SOPORTE,
] as const;

const NO_PUEDEN = [ROLES.ING_CAMPO, ROLES.ING_SOPORTE, ROLES.DISENADOR, ROLES.CLIENTE] as const;

describe('clientes: la matriz deja entrar a coordinación y gerencia', () => {
  it.each(PUEDEN)('%s lista, crea y edita clientes', (role) => {
    expect(puede(role, '/erp/clientes')).toBe(true);
    expect(puede(role, '/erp/clientes/nuevo')).toBe(true);
    expect(puede(role, '/api/ventas/clientes', 'GET')).toBe(true);
    expect(puede(role, '/api/ventas/clientes/permisos', 'GET')).toBe(true);
    expect(puede(role, '/api/ventas/clientes', 'POST')).toBe(true);
    expect(puede(role, '/api/ventas/clientes/9', 'PATCH')).toBe(true);
  });

  it.each(NO_PUEDEN)('%s no llega al padrón ni al alta', (role) => {
    expect(puede(role, '/erp/clientes')).toBe(false);
    expect(puede(role, '/api/ventas/clientes', 'GET')).toBe(false);
    expect(puede(role, '/api/ventas/clientes', 'POST')).toBe(false);
    expect(puede(role, '/api/ventas/clientes/9', 'PATCH')).toBe(false);
  });
});
