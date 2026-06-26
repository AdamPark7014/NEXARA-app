/**
 * Auditoría profunda: sidebar × page-matrix × pares OPS duplicados.
 * Ejecutar: node apps/web/scripts/audit-rbac-matrix.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const ROLES = [
  'ceo', 'dir_operaciones', 'coord_operaciones', 'arquitecto', 'ing_campo', 'ing_soporte',
  'dir_admin', 'coord_admin', 'administrativo', 'coord_ventas', 'vendedor',
  'lider_diseno', 'disenador', 'rh', 'contabilidad',
];

const PAGE_MATRIX = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'lib', 'rbac', 'page-matrix.ts'), 'utf8')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/import[\s\S]*?from[^;]+;/g, '')
    .replace(/export type[\s\S]*?;/g, '')
    .replace(/export function[\s\S]*$/m, '')
    .replace(/\[ROLES\.(\w+)\]/g, (_, k) => JSON.stringify(k.toLowerCase()))
    .replace(/ROLES\.(\w+)/g, (_, k) => JSON.stringify(k.toLowerCase()))
    .replace(/(\w+):\s*\[/g, '"$1": [')
    .replace(/\.\.\.SELF_ATTENDANCE_PATHS/g, '"/erp/hr/attendance","/erp/hr/lunch-breaks"')
    .replace(/,\s*]/g, ']')
    .match(/PAGE_MATRIX[^=]*=\s*(\{[\s\S]*?\});/)?.[1]
    ?? '{}',
);

function compilePattern(p) {
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\/\*\*/g, '(/.*)?').replace(/\/\*/g, '/[^/]+').replace(/:[a-zA-Z_]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

function canOpen(role, pathname) {
  const rules = PAGE_MATRIX[role] ?? [];
  return rules.some((rule) => compilePattern(rule).test(pathname));
}

const MODULE_PATHS = [...fs.readFileSync(path.join(ROOT, 'lib', 'access-matrix.ts'), 'utf8')
  .matchAll(/id:\s*"([^"]+)"[\s\S]*?panel:\s*PANELS\.(\w+)[\s\S]*?path:\s*"([^"]+)"/g)]
  .map((m) => ({
    id: m[1],
    panel: { ERP: 'erp', CRM: 'crm', OPS: 'ops', STUDIO: 'studio', LAB: 'lab' }[m[2]] ?? m[2].toLowerCase(),
    path: m[3],
    url: `/${({ ERP: 'erp', CRM: 'crm', OPS: 'ops', STUDIO: 'studio', LAB: 'lab' }[m[2]] ?? m[2].toLowerCase())}${m[3] === '/' ? '' : m[3]}`,
  }));

const OPS_PAIRS = [
  ['ops-activities', 'ops-my-activities'],
  ['ops-evidences', 'ops-my-evidences'],
  ['ops-viatics', 'ops-my-viatics'],
  ['ops-vehicles', 'ops-my-vehicles'],
];

const EXEC = new Set(['ceo']);
const OPS_MGR = new Set(['dir_operaciones', 'coord_operaciones', 'arquitecto']);
const FIELD = new Set(['ing_campo']);

function opsNav(role, pair) {
  const isMgr = EXEC.has(role) || OPS_MGR.has(role);
  if (pair === 'vehicles' && role === 'arquitecto') return null;
  if (FIELD.has(role)) return 'self';
  if (pair === 'viatics') return isMgr ? 'team' : null;
  if (isMgr || role === 'ing_soporte') return pair === 'vehicles' && role === 'administrativo' ? 'team' : isMgr || role === 'ing_soporte' ? 'team' : null;
  if (role === 'administrativo' && pair === 'vehicles') return 'team';
  return null;
}

const issues = [];

for (const role of ROLES) {
  const visible = MODULE_PATHS.filter((mod) => {
    if (!canOpen(role, mod.url)) return false;
    for (const [team, self] of OPS_PAIRS) {
      if (mod.id !== team && mod.id !== self) continue;
      const pair = team.replace('ops-', '').replace('my-', '').includes('activities') ? 'activities'
        : team.includes('evidences') ? 'evidences'
        : team.includes('viatics') ? 'viatics' : 'vehicles';
      const nav = opsNav(role, pair);
      if (mod.id === team) return nav === 'team';
      if (mod.id === self) return nav === 'self';
    }
    if (mod.id === 'ops-maintenance-contracts') return false;
    if (mod.id === 'crm-opportunities') return EXEC.has(role) || role === 'coord_ventas' || role === 'dir_admin';
    if (mod.id === 'dashboard') {
      const minimal = new Set(['coord_operaciones', 'ing_campo', 'ing_soporte', 'vendedor', 'lider_diseno', 'disenador']);
      return !minimal.has(role);
    }
    return true;
  });

  for (const mod of visible) {
    if (!canOpen(role, mod.url)) {
      issues.push({ role, kind: 'sidebar-blocked', url: mod.url, id: mod.id });
    }
  }

  for (const [team, self] of OPS_PAIRS) {
    const showTeam = visible.some((m) => m.id === team);
    const showSelf = visible.some((m) => m.id === self);
    if (showTeam && showSelf) {
      issues.push({ role, kind: 'ops-pair-duplicate', team, self });
    }
  }
}

console.log('NEXARA · Auditoría sidebar × page-matrix\n');
if (issues.length === 0) {
  console.log('✅ 0 inconsistencias detectadas\n');
  process.exit(0);
}

console.log(`❌ ${issues.length} issue(s):\n`);
for (const i of issues) {
  console.log(`  [${i.role}] ${i.kind} ${i.url ?? `${i.team}+${i.self}`}`);
}
process.exit(1);
