import { ForbiddenException } from '@nestjs/common';
import {
  canManageTools,
  canCreateToolLoan,
  assertCanCreateToolLoan,
  assertCanManageTools,
  hasToolsManageAccess,
} from './tools-access.js';

describe('tools-access', () => {
  it('solo Christian e Iván administran', () => {
    expect(canManageTools('gerencia@nexara.com.mx')).toBe(true);
    expect(canManageTools('administracion.ventas@nexara.com.mx')).toBe(true);
    expect(canManageTools('GERENCIA@NEXARA.COM.MX')).toBe(true);
    expect(canManageTools('operaciones@nexara.com.mx')).toBe(false);
    expect(canManageTools('jose.ramirez@nexara.com.mx')).toBe(false);
    expect(canManageTools('developer@nexara.com.mx')).toBe(false);
  });

  it('solo José Antonio y David crean préstamos', () => {
    expect(canCreateToolLoan('jose.ramirez@nexara.com.mx')).toBe(true);
    expect(canCreateToolLoan('operaciones@nexara.com.mx')).toBe(true);
    expect(canCreateToolLoan('gerencia@nexara.com.mx')).toBe(false);
    expect(canCreateToolLoan('administracion.ventas@nexara.com.mx')).toBe(false);
  });

  it('assertCanCreateToolLoan lanza ForbiddenException si no aplica', () => {
    expect(() => assertCanCreateToolLoan('soporte@nexara.com.mx')).toThrow(ForbiddenException);
    expect(() => assertCanCreateToolLoan('operaciones@nexara.com.mx')).not.toThrow();
  });

  it('assertCanManageTools solo pasa Christian/Iván', () => {
    expect(() => assertCanManageTools('gerencia@nexara.com.mx')).not.toThrow();
    expect(() => assertCanManageTools('administracion.ventas@nexara.com.mx')).not.toThrow();
    expect(() => assertCanManageTools('operaciones@nexara.com.mx')).toThrow(ForbiddenException);
    expect(() => assertCanManageTools('developer@nexara.com.mx')).toThrow(ForbiddenException);
    expect(() => assertCanManageTools(null)).toThrow(ForbiddenException);
  });

  it('hasToolsManageAccess: email o tools.manage; CONSOLE_ADMIN solo no basta', () => {
    expect(hasToolsManageAccess('gerencia@nexara.com.mx', [])).toBe(true);
    expect(hasToolsManageAccess('operaciones@nexara.com.mx', ['tools.manage'])).toBe(true);
    expect(hasToolsManageAccess('operaciones@nexara.com.mx', ['console.admin'])).toBe(false);
    expect(hasToolsManageAccess('operaciones@nexara.com.mx', ['console.admin', 'tools.view'])).toBe(
      false,
    );
    expect(hasToolsManageAccess(null, ['console.admin'])).toBe(false);
  });
});
