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

  it('todo el personal pide préstamo, de cualquier rol', () => {
    for (const roleKey of [
      'ing_campo',
      'ing_soporte',
      'enc_soporte',
      'coord_operaciones',
      'arquitecto',
      'administrativo',
      'contabilidad',
      'vendedor',
      'coord_ventas',
      'disenador',
      'lider_diseno',
      'rh',
      'coord_admin',
      'dir_operaciones',
      'dir_admin',
    ]) {
      expect(canCreateToolLoan({ roleKey })).toBe(true);
    }
  });

  it('dirección no pide: administra; y una cuenta sin rol o de cliente tampoco', () => {
    expect(canCreateToolLoan({ roleKey: 'ceo' })).toBe(false);
    expect(canCreateToolLoan({ roleKey: 'super_admin' })).toBe(false);
    expect(canCreateToolLoan({ roleKey: 'ing_campo', isSuperAdmin: true })).toBe(false);
    expect(canCreateToolLoan({ roleKey: 'cliente' })).toBe(false);
    expect(canCreateToolLoan({ roleKey: null })).toBe(false);
    expect(canCreateToolLoan({})).toBe(false);
    expect(canCreateToolLoan(null)).toBe(false);
  });

  it('assertCanCreateToolLoan lanza ForbiddenException si no aplica', () => {
    expect(() => assertCanCreateToolLoan({ roleKey: 'ceo' })).toThrow(ForbiddenException);
    expect(() => assertCanCreateToolLoan({ roleKey: 'ing_soporte' })).not.toThrow();
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
