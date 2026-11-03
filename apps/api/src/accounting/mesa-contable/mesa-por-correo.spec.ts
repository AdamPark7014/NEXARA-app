import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { PERMISSIONS } from '../../common/permissions';
import { RbacGuard } from '../../common/rbac.guard';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard';
import { ROLES } from '../../common/rbac/roles.v2';
import { MESA_CONTABLE_POR_CORREO_URL_RULES, checkUrlAccess, checkUrlRules } from '../../common/rbac/url-matrix';
import { puedeUsarModulo } from '../../common/tenant/module-policy';
import { canUsarMesaContable } from './mesa-por-correo';
import { PagosGastosService } from './pagos-gastos.service';

const CORREO = 'finanzas@nexara.com.mx';
const contadora = { id: 41, email: CORREO, roleKey: ROLES.ADMINISTRATIVO };
const otraPersona = { id: 42, email: 'oficina@nexara.com.mx', roleKey: ROLES.ADMINISTRATIVO };

/** Permisos reales, con el mismo código que usa el login; sin levantar el módulo de Nest. */
function permisosDe(user: { email: string; roleKey: string }): string[] {
  const proto = AuthService.prototype as unknown as {
    resolveUserPermissions: (u: unknown, superAdmin: boolean) => string[];
  };
  return proto.resolveUserPermissions.call(proto, user, false);
}

function contexto(user: Record<string, unknown>, method: string, url: string): ExecutionContext {
  const request = { user, method, originalUrl: url, url };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

describe('Mesa contable por persona · quién', () => {
  it('es la cuenta de la Contadora General y nadie más, sin importar mayúsculas', () => {
    expect(canUsarMesaContable(' Finanzas@Nexara.com.mx ')).toBe(true);
    expect(canUsarMesaContable(otraPersona.email)).toBe(false);
    expect(canUsarMesaContable(null)).toBe(false);
  });

  it('su rol por sí solo no abre la Mesa: lo abre la concesión', () => {
    expect(checkUrlAccess(ROLES.ADMINISTRATIVO, '/api/accounting/workspace/mesa/resumen', 'GET').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.ADMINISTRATIVO, '/api/accounting/banking/accounts', 'GET').allowed).toBe(false);
  });
});

describe('Mesa contable por persona · rutas', () => {
  const abre = (url: string, method: 'GET' | 'POST' | 'DELETE' = 'GET') =>
    checkUrlRules(MESA_CONTABLE_POR_CORREO_URL_RULES, url, method).allowed;

  it('abre la Mesa, los bancos y sus pantallas', () => {
    expect(abre('/api/accounting/workspace/mesa/pagos-gastos')).toBe(true);
    expect(abre('/api/accounting/workspace/mesa/pagos-gastos/GASTO/1/poliza', 'POST')).toBe(true);
    expect(abre('/api/accounting/workspace/mesa/vinculos/1', 'DELETE')).toBe(true);
    expect(abre('/api/accounting/banking/accounts')).toBe(true);
    expect(abre('/erp/contabilidad')).toBe(true);
    expect(abre('/erp/banking')).toBe(true);
  });

  it('no abre Nómina', () => {
    expect(abre('/api/employee-payments')).toBe(false);
    expect(abre('/api/employee-payments/preview-period')).toBe(false);
    expect(abre('/api/employee-payments/pre-nomina')).toBe(false);
    expect(abre('/api/employee-payments/control-semanal/2026-W44')).toBe(false);
    expect(abre('/api/overtime-approvals')).toBe(false);
    expect(abre('/erp/finance/employee-payments')).toBe(false);
  });
});

describe('Mesa contable por persona · permisos', () => {
  it('trae lo de la Mesa y los bancos', () => {
    const p = permisosDe(contadora);
    for (const permiso of [
      PERMISSIONS.ACCOUNTING_VIEW,
      PERMISSIONS.ACCOUNTING_POST,
      PERMISSIONS.ACCOUNTING_CLOSE_PERIOD,
      PERMISSIONS.INVOICING_MANAGE,
      PERMISSIONS.BANKING_VIEW,
      PERMISSIONS.BANKING_RECONCILE,
    ]) {
      expect(p).toContain(permiso);
    }
  });

  it('no trae el permiso que deja ver los pagos a personal de todos', () => {
    expect(permisosDe(contadora)).not.toContain(PERMISSIONS.CONTABILIDAD_MANAGE);
  });

  it('conserva lo que ya usa y no le da nada a otra persona del mismo rol', () => {
    const p = permisosDe(contadora);
    expect(p).toContain(PERMISSIONS.ATTENDANCE_VIEW);
    expect(p).toContain(PERMISSIONS.CONTABILIDAD_VIEW);
    expect(permisosDe(otraPersona)).not.toContain(PERMISSIONS.BANKING_VIEW);
    expect(permisosDe(otraPersona)).not.toContain(PERMISSIONS.ACCOUNTING_VIEW);
  });

  it('con la política de la empresa, Pagos a personal sigue siendo del CEO', () => {
    const politica = { 'employee-payments': ['ceo'] };
    expect(puedeUsarModulo(politica, 'employee-payments', contadora)).toBe(false);
    expect(puedeUsarModulo(politica, 'employee-payments', { roleKey: ROLES.CEO })).toBe(true);
  });
});

describe('Mesa contable por persona · los guardias reales', () => {
  beforeAll(() => {
    jest.spyOn(Object.getPrototypeOf(RbacGuard.prototype), 'canActivate').mockResolvedValue(true);
    jest.spyOn(Object.getPrototypeOf(UrlAccessGuard.prototype), 'canActivate').mockResolvedValue(true);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  const rbac = () => new RbacGuard({ get: () => ({}) } as unknown as Reflector);
  const url = () => new UrlAccessGuard();
  const MESA = '/api/accounting/workspace/mesa/resumen';
  const BANCO = '/api/accounting/banking/accounts';
  const NOMINA = '/api/employee-payments/preview-period';

  it('los dos guardias la dejan entrar a la Mesa y al banco', async () => {
    for (const ruta of [MESA, BANCO]) {
      await expect(rbac().canActivate(contexto(contadora, 'GET', ruta))).resolves.toBe(true);
      await expect(url().canActivate(contexto(contadora, 'GET', ruta))).resolves.toBe(true);
    }
  });

  it('los dos guardias le cierran Nómina', async () => {
    await expect(rbac().canActivate(contexto(contadora, 'GET', NOMINA))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(url().canActivate(contexto(contadora, 'GET', NOMINA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a otra persona del mismo rol le siguen cerrando la Mesa', async () => {
    await expect(rbac().canActivate(contexto(otraPersona, 'GET', MESA))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(url().canActivate(contexto(otraPersona, 'GET', MESA))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Pagos y gastos · los pagos de nómina', () => {
  const fila = (tipo: string, importe: number, pendiente = false) => ({
    tipo,
    importe,
    pendiente,
    titulo: tipo === 'NOMINA' ? 'Persona de ejemplo' : 'Papelería',
    cfdi: { estado: 'no_aplica' },
    banco: { estado: 'no_aplica', sugerencia: null },
    poliza: { estado: 'lista' },
  });

  function servicio() {
    const prisma = { bankAccount: { aggregate: async () => ({ _sum: { currentBalance: 0 }, _count: { _all: 0 } }) } };
    const s = new PagosGastosService(prisma as never, {} as never);
    jest
      .spyOn(s as unknown as { movimientos: () => Promise<unknown[]> }, 'movimientos')
      .mockResolvedValue([fila('GASTO', -100, true), fila('NOMINA', -900, true)]);
    return s;
  }

  it('quien no ve Pagos a personal no los recibe ni en la suma, y sabe cuántos faltan', async () => {
    const r = await servicio().listar(1, { mes: '2026-10' }, { verNomina: false });
    expect(r.items.map((i) => i.tipo)).toEqual(['GASTO']);
    expect(JSON.stringify(r)).not.toContain('Persona de ejemplo');
    expect(r.resumen.salio.importe).toBe(100);
    expect(r.conteos.NOMINA).toBe(0);
    expect(r.nominaOculta).toBe(1);
    await expect(servicio().conteoPendientes(1, { verNomina: false })).resolves.toBe(1);
  });

  it('quien sí los ve recibe lo mismo de siempre', async () => {
    const r = await servicio().listar(1, { mes: '2026-10' });
    expect(r.items.map((i) => i.tipo)).toEqual(['GASTO', 'NOMINA']);
    expect(r.resumen.salio.importe).toBe(1000);
    expect(r.nominaOculta).toBeNull();
    await expect(servicio().conteoPendientes(1)).resolves.toBe(2);
  });
});
