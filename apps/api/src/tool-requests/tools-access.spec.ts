import { canManageTools, canCreateToolLoan, assertCanCreateToolLoan } from './tools-access.js';

describe('tools-access', () => {
  it('solo Christian e Iván administran', () => {
    expect(canManageTools('gerencia@nexara.com.mx')).toBe(true);
    expect(canManageTools('administracion.ventas@nexara.com.mx')).toBe(true);
    expect(canManageTools('operaciones@nexara.com.mx')).toBe(false);
    expect(canManageTools('jose.ramirez@nexara.com.mx')).toBe(false);
  });

  it('solo José Antonio y David crean préstamos', () => {
    expect(canCreateToolLoan('jose.ramirez@nexara.com.mx')).toBe(true);
    expect(canCreateToolLoan('operaciones@nexara.com.mx')).toBe(true);
    expect(canCreateToolLoan('gerencia@nexara.com.mx')).toBe(false);
    expect(canCreateToolLoan('administracion.ventas@nexara.com.mx')).toBe(false);
  });

  it('assertCanCreateToolLoan lanza si no aplica', () => {
    expect(() => assertCanCreateToolLoan('soporte@nexara.com.mx')).toThrow(/José Antonio/);
    expect(() => assertCanCreateToolLoan('operaciones@nexara.com.mx')).not.toThrow();
  });
});
