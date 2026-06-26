/**
 * Auditoría de sidebar por rol — simula reglas de section-views.ts
 * Ejecutar: node apps/web/scripts/audit-role-sidebar.mjs
 */
const ROLES = [
  'ceo', 'dir_operaciones', 'coord_operaciones', 'arquitecto', 'ing_campo', 'ing_soporte',
  'dir_admin', 'coord_admin', 'administrativo', 'coord_ventas', 'vendedor',
  'lider_diseno', 'disenador', 'rh', 'contabilidad', 'super_admin',
];

const EXECUTIVE = new Set(['ceo', 'super_admin']);
const OPS_MANAGERS = new Set(['dir_operaciones', 'coord_operaciones', 'arquitecto']);
const FIELD = new Set(['ing_campo']);
const SUPPORT = new Set(['ing_soporte']);
const HR_MANAGERS = new Set(['rh', 'dir_admin', 'coord_admin']);
const SALES_MANAGERS = new Set(['ceo', 'coord_ventas', 'dir_admin']);
const SALES_REP = new Set(['vendedor']);
const ERP_EXECUTIVE = new Set(['ceo', 'dir_admin', 'dir_operaciones']);
const FINANCE = new Set(['ceo', 'dir_admin', 'coord_admin', 'contabilidad', 'dir_operaciones']);
const WAREHOUSE = new Set(['ceo', 'dir_admin', 'coord_admin', 'dir_operaciones']);
const DESIGN = new Set(['lider_diseno', 'disenador']);

function isOpsManager(r) { return EXECUTIVE.has(r) || OPS_MANAGERS.has(r); }
function isField(r) { return FIELD.has(r); }
function isSupport(r) { return SUPPORT.has(r); }

function resolveOpsPairNav(role, pair) {
  switch (pair) {
    case 'activities':
    case 'evidences':
      if (isField(role)) return 'self';
      if (isOpsManager(role) || isSupport(role)) return 'team';
      return null;
    case 'viatics':
      if (isField(role)) return 'self';
      if (isOpsManager(role)) return 'team';
      return null;
    case 'vehicles':
      if (isField(role)) return 'self';
      if (role === 'arquitecto') return null;
      if (isOpsManager(role) || role === 'administrativo') return 'team';
      return null;
    default:
      return null;
  }
}

function attendanceMode(role) {
  if (EXECUTIVE.has(role) || role === 'dir_operaciones') return 'manage';
  if (HR_MANAGERS.has(role)) return 'manage_register';
  return 'register';
}

function opsSidebar(role) {
  const items = [];
  const add = (label, note) => items.push({ label, note });

  if (isOpsManager(role) || isField(role) || isSupport(role)) add('Dashboard OPS', 'equipo o personal');
  if (isOpsManager(role)) add('Proyectos operativos', '');

  for (const pair of ['activities', 'evidences', 'viatics', 'vehicles']) {
    const nav = resolveOpsPairNav(role, pair);
    if (nav) add(pair.charAt(0).toUpperCase() + pair.slice(1), nav === 'team' ? 'vista equipo' : 'vista propia');
  }

  if (isOpsManager(role)) add('GPS en vivo', '');
  if (isField(role) || isOpsManager(role) || isSupport(role)) {
    add('Herramientas', isField(role) ? 'solicitar/devolver' : 'inventario + préstamos');
  }

  if (isOpsManager(role) || isSupport(role)) {
    add('Mantenimiento', 'OT + enlace contratos');
    add('Clientes con contrato', '');
    add('Activos en campo', '');
  }

  if (EXECUTIVE.has(role) || OPS_MANAGERS.has(role) || isSupport(role)) {
    add('NOC / Soporte / SLA', 'según rol soporte');
  }

  if (EXECUTIVE.has(role) || OPS_MANAGERS.has(role) || role === 'rh') add('Reclutamiento técnico', '');

  return items;
}

function erpSidebar(role) {
  const items = [];
  const add = (label, note) => items.push({ label, note });

  if (!DESIGN.has(role)) {
    if (ERP_EXECUTIVE.has(role)) add('Dashboard / Ejecutivo', role === 'ceo' ? 'ejecutivo' : 'dashboard');
    else if (role !== 'ing_campo' && role !== 'ing_soporte') add('Dashboard', '');
  }

  if (role === 'rh' || HR_MANAGERS.has(role) || EXECUTIVE.has(role)) add('RH / KPIs / Multas', 'RH pleno; otros parcial');
  add('Asistencia', attendanceMode(role));
  if (role === 'rh') add('Comida / lunch-breaks', 'solo RH');

  if (FINANCE.has(role)) add('Contabilidad / Banca / Facturación', '');
  if (HR_MANAGERS.has(role) || EXECUTIVE.has(role) || role === 'coord_admin' || role === 'dir_operaciones') {
    add('Viáticos · Finanzas (ERP)', 'aprobación contable');
  }
  if (FINANCE.has(role) || role === 'administrativo') add('Gastos / Viáticos admin', '');

  if (WAREHOUSE.has(role)) add('Almacén + Compras', 'procurement solo dirección');
  else if (role === 'administrativo') add('Almacén · consulta', 'sin compras en menú');

  if (ERP_EXECUTIVE.has(role) || role === 'coord_admin') add('Usuarios / Auditoría / Config', '');

  add('Calendario / Notificaciones / Perfil', 'todos excepto cliente');

  return items;
}

function crmSidebar(role) {
  if (DESIGN.has(role)) return [
    { label: 'Cotizaciones', note: '' },
    { label: 'Productos', note: role === 'lider_diseno' ? '+ plantillas' : '' },
  ];
  if (!SALES_MANAGERS.has(role) && !SALES_REP.has(role)) {
    if (role === 'coord_operaciones') return [{ label: 'Cotizaciones', note: 'solo lectura comercial' }];
    if (role === 'contabilidad') return [{ label: 'Cotizaciones', note: 'referencia facturación' }];
    return [];
  }
  const items = [{ label: 'Dashboard CRM', note: '' }];
  if (SALES_REP.has(role)) {
    items.push({ label: 'Mi pipeline', note: 'self' }, { label: 'Mis leads', note: 'self' });
  } else {
    items.push({ label: 'Pipeline equipo', note: 'team' }, { label: 'Leads', note: 'team' });
    items.push({ label: 'Equipo / Metas / Licitaciones', note: 'gerente' });
  }
  items.push({ label: 'Clientes / Oportunidades / Agenda', note: '' });
  return items;
}

function studioSidebar(role) {
  if (!DESIGN.has(role) && !EXECUTIVE.has(role)) return [];
  return [{ label: 'Studio (leads, assets, campañas)', note: DESIGN.has(role) ? 'principal' : 'supervisión' }];
}

function detectPairDuplicates(role) {
  const pairs = [
    ['ops-activities', 'ops-my-activities'],
    ['ops-evidences', 'ops-my-evidences'],
    ['ops-viatics', 'ops-my-viatics'],
    ['ops-vehicles', 'ops-my-vehicles'],
  ];
  const visible = pairs.filter(([team, self]) => {
    const pair = team.replace('ops-', '').replace('my-', '').replace('activities', 'activities');
    const name = team.includes('activities') ? 'activities'
      : team.includes('evidences') ? 'evidences'
      : team.includes('viatics') ? 'viatics' : 'vehicles';
    return resolveOpsPairNav(role, name);
  });
  return visible.length <= 4 ? [] : ['DUPLICADO'];
}

console.log('NEXARA · Matriz sidebar por rol (simulación section-views)\n');
console.log('═'.repeat(72));

for (const role of ROLES) {
  const panels = [];
  if (erpSidebar(role).length) panels.push('ERP');
  if (crmSidebar(role).length) panels.push('CRM');
  if (opsSidebar(role).length) panels.push('OPS');
  if (studioSidebar(role).length) panels.push('Studio');
  if (role === 'super_admin') panels.push('LAB');

  console.log(`\n▸ ${role.toUpperCase()}  [${panels.join(' · ') || '—'}]`);
  console.log(`  Asistencia: ${attendanceMode(role)}`);

  const ops = opsSidebar(role);
  if (ops.length) {
    console.log('  OPS:');
    for (const { label, note } of ops) console.log(`    · ${label}${note ? ` — ${note}` : ''}`);
  }

  const erp = erpSidebar(role);
  if (erp.length) {
    console.log('  ERP:');
    for (const { label, note } of erp) console.log(`    · ${label}${note ? ` — ${note}` : ''}`);
  }

  const crm = crmSidebar(role);
  if (crm.length) {
    console.log('  CRM:');
    for (const { label, note } of crm) console.log(`    · ${label}${note ? ` — ${note}` : ''}`);
  }

  const studio = studioSidebar(role);
  if (studio.length) {
    console.log('  Studio:');
    for (const { label, note } of studio) console.log(`    · ${label}${note ? ` — ${note}` : ''}`);
  }

  const gaps = [];
  if (role === 'coord_operaciones' && erp.some(e => e.label.includes('Dashboard'))) gaps.push('sobra dashboard ERP');
  if (role === 'arquitecto' && ops.some(e => e.label === 'Vehicles')) gaps.push('sobra flotilla');
  if (role === 'ing_campo' && ops.some(e => e.label === 'Viatics' && e.note?.includes('equipped'))) gaps.push('viáticos equipo');
  if (gaps.length) console.log(`  ⚠ ${gaps.join('; ')}`);
}

console.log('\n' + '═'.repeat(72));
console.log('Reglas clave:');
console.log('  · Pares OPS (actividades/evidencias/viáticos/vehículos): UN ítem → ruta dinámica');
console.log('  · Mantenimiento + contratos: UN ítem; contratos vía /ops/maintenance/contracts');
console.log('  · Almacén vs Compras: módulos distintos (no duplicar); compras solo dirección');
console.log('  · Viáticos OPS (campo) ≠ Viáticos Finanzas ERP (contabilidad/RH)');
console.log('\nFuente: apps/web/lib/section-views.ts + page-matrix.ts');
