import { describe, expect, it } from 'vitest';
import { getUserHomePath } from '@/lib/user-access';
import { getUserHome } from '@/lib/panel-home';
import { canOpenPage } from '@/lib/rbac/page-matrix';
import { ROLES } from '@/lib/rbac/roles';
import { CONTABILIDAD_HOME_PATH } from '@/lib/core-surface';

describe('Workspace Contadora home + page matrix', () => {
  it('contabilidad aterriza en /erp/contabilidad', () => {
    const user = { roleKey: ROLES.CONTABILIDAD, token: 'x' };
    expect(getUserHomePath(user)).toBe(CONTABILIDAD_HOME_PATH);
    expect(getUserHome(user).path).toBe(CONTABILIDAD_HOME_PATH);
  });

  it('contabilidad puede abrir el hub y subrutas', () => {
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/contabilidad')).toBe(true);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/contabilidad/cuentas-por-cobrar')).toBe(true);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/contabilidad/conciliacion')).toBe(true);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/contabilidad/cierres')).toBe(true);
  });

  it('vendedor no abre el hub contadora', () => {
    expect(canOpenPage(ROLES.VENDEDOR, '/erp/contabilidad')).toBe(false);
  });

  it('ing campo no abre el hub contadora', () => {
    expect(canOpenPage(ROLES.ING_CAMPO, '/erp/contabilidad')).toBe(false);
  });
});
