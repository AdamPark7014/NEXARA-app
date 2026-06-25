/**
 * Audit RBAC v2 — home, paneles, sidebar y panel-switch por rol demo.
 * Ejecutar: node apps/web/scripts/audit-rbac.mjs
 */
const ROLES = {
  super_admin: 'super_admin', ceo: 'ceo', arquitecto: 'arquitecto',
  dir_operaciones: 'dir_operaciones', dir_admin: 'dir_admin', coord_admin: 'coord_admin',
  administrativo: 'administrativo', coord_operaciones: 'coord_operaciones',
  ing_campo: 'ing_campo', ing_soporte: 'ing_soporte', coord_ventas: 'coord_ventas',
  vendedor: 'vendedor', lider_diseno: 'lider_diseno', disenador: 'disenador',
  rh: 'rh', contabilidad: 'contabilidad', cliente: 'cliente',
};

const SELF_ATTENDANCE = ['/erp/hr/attendance', '/erp/hr/lunch-breaks'];

const PAGE_MATRIX = {
  super_admin: ['/**'],
  ceo: ['/erp/**', '/crm/**', '/ops/**', '/studio/**', '/lab/**'],
  arquitecto: ['/ops/**', '/erp/dashboard', '/erp/calendar', '/erp/notifications-center', '/erp/my-profile', '/crm/quotes/**', ...SELF_ATTENDANCE],
  dir_operaciones: ['/erp', '/erp/dashboard', '/erp/executive', '/erp/approvals', '/erp/architecture', '/erp/companies', '/erp/calendar', '/erp/documents', '/erp/finance/**', '/erp/procurement', '/erp/warehouse', '/erp/analytics/**', '/erp/exports', '/erp/notifications-center', '/erp/my-profile', '/ops/**', '/crm/dashboard', '/crm/quotes/**', '/crm/projects/**', '/crm/tenders/**', '/crm/pipeline', '/crm/reports'],
  dir_admin: ['/erp/**', '/crm/dashboard', '/crm/quotes/**', '/crm/reports', '/crm/team', '/crm/targets', '/crm/templates', '/crm/tenders'],
  coord_admin: ['/erp', '/erp/dashboard', '/erp/approvals', '/erp/companies', '/erp/calendar', '/erp/documents', '/erp/accounting', '/erp/banking', '/erp/invoicing', '/erp/finance/**', '/erp/procurement', '/erp/warehouse', '/erp/users', '/erp/exports', '/erp/notifications-center', '/erp/my-profile', '/erp/news', ...SELF_ATTENDANCE],
  administrativo: ['/erp', '/erp/dashboard', '/erp/approvals', '/erp/companies', '/erp/calendar', '/erp/documents', '/erp/finance/viatics', '/erp/finance/expenses', '/erp/notifications-center', '/erp/my-profile', '/erp/news', ...SELF_ATTENDANCE],
  coord_operaciones: ['/ops/**', '/erp/calendar', '/erp/dashboard', '/erp/notifications-center', '/erp/my-profile', '/crm/quotes', ...SELF_ATTENDANCE],
  ing_campo: ['/ops/**', '/erp/notifications-center', '/erp/my-profile', ...SELF_ATTENDANCE],
  ing_soporte: ['/ops/**', '/erp/notifications-center', '/erp/my-profile', ...SELF_ATTENDANCE],
  coord_ventas: ['/crm/**', '/erp/dashboard', '/erp/notifications-center', '/erp/my-profile', ...SELF_ATTENDANCE],
  vendedor: ['/crm/**', '/erp/notifications-center', '/erp/my-profile', ...SELF_ATTENDANCE],
  lider_diseno: ['/studio/**', '/erp/dashboard', '/erp/notifications-center', '/erp/my-profile', ...SELF_ATTENDANCE],
  disenador: ['/studio/**', '/erp/notifications-center', '/erp/my-profile', '/erp/calendar', ...SELF_ATTENDANCE],
  rh: ['/erp', '/erp/dashboard', '/erp/hr/**', '/erp/finance/employee-payments', '/erp/calendar', '/erp/documents', '/erp/notifications-center', '/erp/my-profile', '/ops/recruiting'],
  contabilidad: ['/erp', '/erp/dashboard', '/erp/accounting', '/erp/banking', '/erp/invoicing', '/erp/finance/**', '/erp/exports', '/erp/calendar', '/erp/documents', '/erp/notifications-center', '/erp/my-profile', '/crm/quotes'],
  cliente: ['/tickets', '/tickets/**'],
};

const ROLE_HOME = {
  super_admin: '/erp/executive', ceo: '/erp/executive', arquitecto: '/ops/dashboard',
  dir_operaciones: '/erp/dashboard', dir_admin: '/erp/dashboard', coord_admin: '/erp/dashboard',
  administrativo: '/erp/dashboard', coord_operaciones: '/ops/dashboard', ing_campo: '/ops/my-activities',
  ing_soporte: '/ops/dashboard', coord_ventas: '/crm/dashboard', vendedor: '/crm/dashboard',
  lider_diseno: '/studio/dashboard', disenador: '/studio/dashboard', rh: '/erp/dashboard',
  contabilidad: '/erp/dashboard', cliente: '/tickets',
};

const PANEL_SWITCH_HOME = {
  erp: { ceo: '/erp/executive', administrativo: '/erp/dashboard', disenador: '/erp/my-profile' },
  crm: { ceo: '/crm/dashboard', vendedor: '/crm/dashboard', administrativo: null },
  ops: { ceo: '/ops/dashboard', ing_campo: '/ops/my-activities' },
  studio: { disenador: '/studio/dashboard', ceo: '/studio/dashboard' },
  lab: { ceo: '/lab' },
};

// Módulos críticos: id → url + org roles permitidos (admin_staff = administrativo)
const CRITICAL_MODULES = [
  { id: 'executive', url: '/erp/executive', orgRoles: ['ceo', 'director_admin', 'director_ops', 'director_commercial'] },
  { id: 'crm-sales-team', url: '/crm/team', orgRoles: ['ceo', 'director_commercial', 'director_admin', 'sales_manager'] },
  { id: 'crm-targets', url: '/crm/targets', orgRoles: ['ceo', 'director_commercial', 'director_admin', 'sales_manager'] },
  { id: 'ops-activities', url: '/ops/activities', managers: ['ceo', 'dir_operaciones', 'coord_operaciones', 'arquitecto', 'ing_soporte'] },
  { id: 'ops-my-activities', url: '/ops/my-activities', field: ['ing_campo'] },
];

const V2_TO_ORG = {
  ceo: 'ceo', administrativo: 'admin_staff', vendedor: 'sales_rep', coord_ventas: 'sales_manager',
  disenador: 'designer', ing_campo: 'field_engineer', rh: 'hr_specialist', contabilidad: 'accountant',
};

const PANELS = ['erp', 'crm', 'ops', 'studio', 'lab'];

function compilePattern(path) {
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*/g, '(/.*)?')
    .replace(/\/\*/g, '/[^/]+')
    .replace(/:[a-zA-Z_]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

const rxCache = new Map();
function rx(p) {
  if (!rxCache.has(p)) rxCache.set(p, compilePattern(p));
  return rxCache.get(p);
}

function canOpenPage(role, pathname) {
  if (role === 'super_admin') return true;
  const rules = PAGE_MATRIX[role] ?? [];
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return rules.some((p) => rx(p).test(clean));
}

function canAccessPanel(role, panel) {
  if (role === 'super_admin') return true;
  const prefix = `/${panel}`;
  return (PAGE_MATRIX[role] ?? []).some((rule) => rule === prefix || rule.startsWith(`${prefix}/`) || rule === `${prefix}/**`);
}

function moduleVisibleForRole(role, mod) {
  const org = V2_TO_ORG[role];
  if (mod.orgRoles && org) return mod.orgRoles.includes(org);
  if (mod.managers) return mod.managers.includes(role);
  if (mod.field) return mod.field.includes(role);
  return true;
}

function shouldShowInSidebar(role, modId) {
  const EXEC = new Set(['ceo', 'super_admin']);
  const OPS_MGR = new Set(['dir_operaciones', 'coord_operaciones', 'arquitecto']);
  const FIELD = new Set(['ing_campo']);
  const SALES_MGR = new Set(['ceo', 'coord_ventas', 'dir_admin']);

  switch (modId) {
    case 'ops-activities': return EXEC.has(role) || OPS_MGR.has(role) || role === 'ing_soporte';
    case 'ops-my-activities': return FIELD.has(role) || OPS_MGR.has(role);
    case 'executive': return EXEC.has(role) || role === 'dir_admin' || role === 'dir_operaciones';
    case 'crm-sales-team':
    case 'crm-targets': return SALES_MGR.has(role);
    default: return true;
  }
}

let issues = 0;
const report = [];

for (const role of Object.keys(ROLES)) {
  const home = ROLE_HOME[role];
  if (!canOpenPage(role, home)) {
    report.push(`❌ ${role}: home ${home} BLOCKED`);
    issues++;
  }

  for (const panel of PANELS) {
    const allowed = canAccessPanel(role, panel);
    if (role === 'administrativo' && panel === 'crm' && allowed) {
      report.push(`❌ ${role}: should be DENIED on ${panel}`);
      issues++;
    }
    if (role === 'lider_diseno' && panel === 'crm' && allowed) {
      report.push(`❌ ${role}: should be DENIED on ${panel}`);
      issues++;
    }
  }

  // Sidebar: ningún ítem visible debe estar bloqueado por PAGE_MATRIX
  for (const mod of CRITICAL_MODULES) {
    if (!shouldShowInSidebar(role, mod.id)) continue;
    if (!moduleVisibleForRole(role, mod)) continue;
    if (!canOpenPage(role, mod.url)) {
      report.push(`❌ ${role}: sidebar would show ${mod.id} (${mod.url}) but route BLOCKED`);
      issues++;
    }
  }

  // Reglas negativas explícitas
  if (role === 'administrativo' && canOpenPage(role, '/erp/executive')) {
    report.push(`❌ administrativo: must NOT access /erp/executive`);
    issues++;
  }
  if (role === 'vendedor' && shouldShowInSidebar(role, 'crm-sales-team')) {
    report.push(`❌ vendedor: must NOT see crm-sales-team in sidebar`);
    issues++;
  }
  if (role === 'ing_campo' && shouldShowInSidebar(role, 'ops-activities')) {
    report.push(`❌ ing_campo: must NOT see ops-activities in sidebar`);
    issues++;
  }

  // Panel switch paths
  for (const [panel, homes] of Object.entries(PANEL_SWITCH_HOME)) {
    const expected = homes[role];
    if (expected === null && canAccessPanel(role, panel)) {
      report.push(`❌ ${role}: should not access panel ${panel}`);
      issues++;
    }
    if (expected && canAccessPanel(role, panel) && !canOpenPage(role, expected)) {
      report.push(`❌ ${role}: panel switch ${panel} → ${expected} BLOCKED`);
      issues++;
    }
  }

  const panels = PANELS.filter((p) => canAccessPanel(role, p));
  report.push(`✅ ${role.padEnd(18)} home=${home.padEnd(22)} panels=[${panels.join(', ')}]`);
}

console.log(report.join('\n'));
if (issues === 0) {
  console.log('\n✅ Audit OK — 0 issues');
} else {
  console.log(`\n❌ ${issues} issues found`);
  process.exit(1);
}
