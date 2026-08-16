import { buildRoleAccessSummary, resolveMatrixKey } from './role-access-summary.js';

describe('resolveMatrixKey', () => {
  it('resuelve una clave de matriz directa', () => {
    expect(resolveMatrixKey('ing_campo')).toBe('ing_campo');
  });

  it('traduce la clave de plantilla a la de matriz', () => {
    // Las plantillas usan vocabulario propio; LEGACY_TO_V2 es el puente.
    expect(resolveMatrixKey('field_engineer')).toBe('ing_campo');
    expect(resolveMatrixKey('admin_staff')).toBe('administrativo');
  });

  it('devuelve null si la matriz no la reconoce', () => {
    expect(resolveMatrixKey('rol_inventado')).toBeNull();
    expect(resolveMatrixKey(null)).toBeNull();
  });
});

describe('buildRoleAccessSummary', () => {
  it('marca como no reconocido un rol sin plantilla válida', () => {
    // Es la señal que faltaba: un rol asi no tiene linea base de permisos.
    const summary = buildRoleAccessSummary({ orgRoleKey: 'rol_inventado' });
    expect(summary.recognizedByMatrix).toBe(false);
    expect(summary.modules).toEqual([]);
  });

  it('señala al super admin sin enumerar módulos', () => {
    const summary = buildRoleAccessSummary({ orgRoleKey: 'super_admin' });
    expect(summary.isSuperAdmin).toBe(true);
    expect(summary.recognizedByMatrix).toBe(true);
  });

  it('enumera los módulos que alcanza un ingeniero de campo', () => {
    const summary = buildRoleAccessSummary({ orgRoleKey: 'field_engineer' });
    expect(summary.recognizedByMatrix).toBe(true);
    expect(summary.resolvedRoleKey).toBe('ing_campo');
    expect(summary.modules.length).toBeGreaterThan(0);
    expect(summary.modules.map((m) => m.module)).toContain('activities');
  });

  it('el área creativa alcanza el contenido del sitio', () => {
    // Alineado con el organigrama: Daniela lleva redes, diseno y branding.
    const modules = buildRoleAccessSummary({ orgRoleKey: 'lider_diseno' }).modules.map(
      (m) => m.module,
    );
    expect(modules).toContain('hero-slides');
    expect(modules).toContain('social-posts');
  });

  it('un ingeniero de campo NO alcanza el contenido del sitio', () => {
    const modules = buildRoleAccessSummary({ orgRoleKey: 'ing_campo' }).modules.map(
      (m) => m.module,
    );
    expect(modules).not.toContain('hero-slides');
    expect(modules).not.toContain('social-posts');
  });

  it('operaciones alcanza vehículos', () => {
    const modules = buildRoleAccessSummary({ orgRoleKey: 'coord_operaciones' }).modules.map(
      (m) => m.module,
    );
    expect(modules).toContain('vehicles');
  });

  it('cada módulo aparece una sola vez, con su mayor alcance', () => {
    const summary = buildRoleAccessSummary({ orgRoleKey: 'coord_operaciones' });
    const names = summary.modules.map((m) => m.module);
    expect(new Set(names).size).toBe(names.length);
  });

  it('devuelve los módulos ordenados alfabéticamente', () => {
    const names = buildRoleAccessSummary({ orgRoleKey: 'ceo' }).modules.map((m) => m.module);
    expect([...names].sort()).toEqual(names);
  });

  it('separa las rutas de panel de los módulos de API', () => {
    const summary = buildRoleAccessSummary({ orgRoleKey: 'lider_diseno' });
    expect(summary.panels.every((p) => !p.startsWith('/api/'))).toBe(true);
  });
});
