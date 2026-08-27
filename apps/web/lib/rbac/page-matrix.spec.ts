import { describe, expect, it } from 'vitest';
import { allowedPrefixes, canOpenPage, normalizePathToCanonical } from './page-matrix';
import { ALL_ROLES, ROLES } from './roles';

describe('canOpenPage · guardas de ruta por rol', () => {
  it('super_admin entra en cualquier ruta', () => {
    expect(canOpenPage(ROLES.SUPER_ADMIN, '/erp/accounting')).toBe(true);
    expect(canOpenPage(ROLES.SUPER_ADMIN, '/lab/ai')).toBe(true);
    expect(canOpenPage(ROLES.SUPER_ADMIN, '/tickets/9')).toBe(true);
  });

  it('el cliente externo solo ve el portal de tickets', () => {
    expect(canOpenPage(ROLES.CLIENTE, '/tickets')).toBe(true);
    expect(canOpenPage(ROLES.CLIENTE, '/tickets/1234')).toBe(true);
    expect(canOpenPage(ROLES.CLIENTE, '/erp/dashboard')).toBe(false);
    expect(canOpenPage(ROLES.CLIENTE, '/crm/quotes')).toBe(false);
    expect(canOpenPage(ROLES.CLIENTE, '/ops/activities')).toBe(false);
  });

  it('el vendedor se queda en su panel y no llega a contabilidad', () => {
    expect(canOpenPage(ROLES.VENDEDOR, '/erp/accounting')).toBe(false);
    expect(canOpenPage(ROLES.VENDEDOR, '/erp/banking')).toBe(false);
    expect(canOpenPage(ROLES.VENDEDOR, '/erp/users')).toBe(false);
  });

  it('contabilidad entra en finanzas pero no en el laboratorio', () => {
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/accounting')).toBe(true);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/invoicing')).toBe(true);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/finance/viatics')).toBe(true);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/lab/ai')).toBe(false);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/ops/activities')).toBe(false);
  });

  it('el comodín /** cubre el prefijo desnudo y sus descendientes', () => {
    expect(canOpenPage(ROLES.CEO, '/erp')).toBe(true);
    expect(canOpenPage(ROLES.CEO, '/erp/finance/expenses')).toBe(true);
  });

  it('los ejecutivos no entran en las páginas "mis-*" de OPS, que son personales', () => {
    // /ops/** les da acceso al panel entero; la denegación explícita evita que
    // un director acabe en la bandeja personal de otro y la vea como propia.
    for (const role of [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES, ROLES.ARQUITECTO]) {
      expect(canOpenPage(role, '/ops/my-activities')).toBe(false);
      expect(canOpenPage(role, '/ops/my-viatics')).toBe(false);
      expect(canOpenPage(role, '/ops/my-vehicles')).toBe(false);
    }
    // El ingeniero de campo sí es el dueño de esas páginas.
    expect(canOpenPage(ROLES.ING_CAMPO, '/ops/my-activities')).toBe(true);
  });

  it('acepta rutas legacy en español normalizándolas antes de decidir', () => {
    expect(canOpenPage(ROLES.CONTABILIDAD, '/core/contabilidad')).toBe(true);
    expect(canOpenPage(ROLES.VENDEDOR, '/sales/cotizaciones')).toBe(true);
    expect(canOpenPage(ROLES.CLIENTE, '/portal/1')).toBe(true);
  });

  it('deniega por defecto: un panel que no está en ninguna whitelist se bloquea para todos', () => {
    // Ojo: dentro de un panel permitido con `/erp/**` cualquier sub-ruta pasa,
    // aunque la página no exista. La whitelist es por panel, no por página.
    for (const role of ALL_ROLES) {
      if (role === ROLES.SUPER_ADMIN) continue;
      expect(canOpenPage(role, '/panel-inexistente/lo-que-sea')).toBe(false);
    }
  });

  it('un rol acotado a páginas concretas no hereda el resto del panel', () => {
    // CONTABILIDAD no tiene `/erp/**`, solo páginas sueltas: una ruta ERP que
    // no esté listada tiene que caer.
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/procurement')).toBe(false);
    expect(canOpenPage(ROLES.CONTABILIDAD, '/erp/users')).toBe(false);
    expect(canOpenPage(ROLES.VENDEDOR, '/erp/ruta-que-no-existe')).toBe(false);
  });

  it('cada rol declarado tiene reglas: ninguno se queda sin panel', () => {
    for (const role of ALL_ROLES) {
      expect(allowedPrefixes(role).length).toBeGreaterThan(0);
    }
  });
});

describe('normalizePathToCanonical', () => {
  it('traduce prefijos de panel legacy', () => {
    expect(normalizePathToCanonical('/core/dashboard')).toBe('/erp/dashboard');
    expect(normalizePathToCanonical('/sales/cotizaciones')).toBe('/crm/quotes');
    expect(normalizePathToCanonical('/portal')).toBe('/tickets');
  });

  it('deja intacta una ruta ya canónica', () => {
    expect(normalizePathToCanonical('/erp/accounting')).toBe('/erp/accounting');
  });
});
