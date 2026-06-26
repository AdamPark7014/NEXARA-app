/**
 * Lista módulos sin regla explícita en shouldShowModuleInSidebar.
 * Ejecutar: node apps/web/scripts/audit-modules.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matrix = fs.readFileSync(path.join(__dirname, '..', 'lib', 'access-matrix.ts'), 'utf8');
const views = fs.readFileSync(path.join(__dirname, '..', 'lib', 'section-views.ts'), 'utf8');

const ids = [...matrix.matchAll(/^\s+"?([a-z0-9-]+)"?:\s*\{/gm)].map((m) => m[1]);
const explicit = new Set([...views.matchAll(/case\s+'([^']+)':/g)].map((m) => m[1]));

const implicit = ids.filter((id) => !explicit.has(id));
const pairs = [
  ['ops-activities', 'ops-my-activities'],
  ['ops-evidences', 'ops-my-evidences'],
  ['ops-viatics', 'ops-my-viatics'],
  ['ops-vehicles', 'ops-my-vehicles'],
];

console.log('NEXARA · Auditoría de módulos\n');
console.log(`Total módulos access-matrix: ${ids.length}`);
console.log(`Reglas explícitas section-views: ${explicit.size}\n`);

if (implicit.length) {
  console.log('Módulos con regla default (visible !== false):');
  for (const id of implicit.sort()) console.log(`  · ${id}`);
} else {
  console.log('✅ Todos los módulos tienen regla explícita en shouldShowModuleInSidebar');
}

console.log('\nPares OPS (deben tener regla team/self):');
for (const [a, b] of pairs) {
  const ok = explicit.has(a) && explicit.has(b);
  console.log(`  ${ok ? '✅' : '❌'} ${a} + ${b}`);
}

console.log('\nConfigs de página esperados:');
const configs = [
  'getCrmSalesSectionConfig', 'getCrmManagerSubmoduleConfig', 'getOpsTeamSectionConfig', 'getErpFinanceSectionConfig',
  'getErpGovernanceSectionConfig', 'getErpInventorySectionConfig', 'getStudioSectionConfig',
  'getAttendanceSectionConfig', 'getHrSubmoduleConfig', 'getCrmCatalogSectionConfig', 'getApprovalsSectionConfig',
  'getLunchBreaksSectionConfig', 'getBiSectionConfig', 'getLabSectionConfig',
];
for (const fn of configs) {
  console.log(`  ${views.includes(`export function ${fn}`) ? '✅' : '❌'} ${fn}`);
}
