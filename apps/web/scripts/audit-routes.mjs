/**
 * Audit de rutas — verifica que módulos, remaps legacy y homes apunten a page.tsx reales.
 * Ejecutar: node apps/web/scripts/audit-routes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeLegacyPath, remapLegacySlugs } from '../lib/legacy-path-remap.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, '..', 'app');
const PANELS_ROOT = path.join(APP_ROOT, '(panels)');
const SUBDOMAINS_ROOT = path.join(APP_ROOT, '(subdomains)');

/** Recolecta rutas estáticas desde page.tsx bajo un directorio app. */
function collectRoutesFrom(dir, segments = []) {
  const routes = new Set();
  if (!fs.existsSync(dir)) return routes;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const seg = entry.name.startsWith('[') ? `:${entry.name.slice(1, -1)}` : entry.name;
      for (const r of collectRoutesFrom(full, [...segments, seg])) routes.add(r);
    } else if (entry.name === 'page.tsx') {
      routes.add('/' + segments.join('/'));
    }
  }
  return routes;
}

function collectPanelRoutes() {
  return collectRoutesFrom(PANELS_ROOT);
}

function collectSubdomainRoutes() {
  return collectRoutesFrom(SUBDOMAINS_ROOT);
}

/** ¿Existe página para esta ruta? Soporta segmentos dinámicos :id */
function routeExists(routes, pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (routes.has(clean)) return true;

  const parts = clean.split('/').filter(Boolean);
  for (const route of routes) {
    const rParts = route.split('/').filter(Boolean);
    if (rParts.length !== parts.length) continue;
    let ok = true;
    for (let i = 0; i < rParts.length; i++) {
      if (rParts[i].startsWith(':')) continue;
      if (rParts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Extrae URLs de módulos desde access-matrix.ts (evita lista manual desincronizada). */
function parseModuleUrlsFromMatrix() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'access-matrix.ts'), 'utf8');
  const urls = new Set();
  const panelMap = { ERP: 'erp', CRM: 'crm', OPS: 'ops', STUDIO: 'studio', LAB: 'lab' };
  for (const m of src.matchAll(/panel:\s*PANELS\.(\w+),\s*path:\s*"([^"]+)"/g)) {
    const panel = panelMap[m[1]] ?? m[1].toLowerCase();
    const p = m[2];
    urls.add(p === '/' ? `/${panel}` : `/${panel}${p.startsWith('/') ? p : `/${p}`}`);
  }
  urls.add('/lab/dashboard');
  return [...urls];
}

/** Rutas entryPath del switcher legacy (panel-routing.ts). */
function parsePanelRoutingEntryPaths() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'panel-routing.ts'), 'utf8');
  const urls = [];
  for (const m of src.matchAll(/entryPath:\s*"([^"]+)"/g)) urls.push(m[1]);
  return urls;
}

/** Rutas canónicas en module-map.ts. */
function parseModuleMapRoutes() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'module-map.ts'), 'utf8');
  const urls = [];
  for (const m of src.matchAll(/path:\s*"(\/[^"]+)"/g)) {
    const p = m[1];
    if (p.startsWith('/erp/') || p.startsWith('/crm/') || p.startsWith('/ops/') || p.startsWith('/studio/') || p.startsWith('/lab') || p === '/tickets') {
      urls.push(p);
    }
  }
  return urls;
}

const MODULE_URLS = parseModuleUrlsFromMatrix();

const PANEL_ROOTS = ['/erp', '/crm', '/ops', '/studio', '/lab'];

const HOME_PATHS = [
  '/erp/executive', '/erp/dashboard', '/crm/dashboard', '/ops/dashboard',
  '/ops/my-activities', '/studio/dashboard', '/lab', '/tickets',
];

const LEGACY_SAMPLES = [
  '/core', '/core/dashboard', '/core/clientes', '/core/clientes/5', '/core/clientes/5/cotizaciones',
  '/core/actividades', '/core/actividades/1', '/core/actividades/1/viaticos',
  '/core/executive', '/core/aprobaciones', '/core/cotizaciones',
  '/sales/dashboard', '/sales/oportunidades', '/sales/oportunidades/42',
  '/sales/oportunidades/42/notas', '/sales/cotizaciones', '/sales/mis-leads',
  '/ventas/dashboard', '/operacion/dashboard', '/console/dashboard',
  '/contabilidad/accounting', '/people/hr/attendance', '/people/attendance', '/erp/hr/hr/attendance', '/web/dashboard',
  '/noc', '/support', '/core/sla', '/erp/viaticos', '/erp/cotizaciones', '/erp/clients/3',
  '/ops/actividades', '/ops/mis-actividades', '/crm/cotizaciones',
];

const issues = [];
const panelRoutes = collectPanelRoutes();
const subdomainRoutes = collectSubdomainRoutes();
const routes = new Set([...panelRoutes, ...subdomainRoutes]);

console.log(`📁 ${panelRoutes.size} rutas en (panels), ${subdomainRoutes.size} en (subdomains)\n`);

for (const url of MODULE_URLS) {
  if (!routeExists(routes, url)) issues.push({ kind: 'module', url });
}

for (const url of parsePanelRoutingEntryPaths()) {
  if (!routeExists(routes, url)) issues.push({ kind: 'panel-routing', url });
}

for (const url of parseModuleMapRoutes()) {
  if (!routeExists(routes, url)) issues.push({ kind: 'module-map', url });
}

for (const url of PANEL_ROOTS) {
  if (!routeExists(routes, url)) issues.push({ kind: 'panel-root', url });
}

for (const url of HOME_PATHS) {
  if (!routeExists(routes, url)) issues.push({ kind: 'home', url });
}

for (const legacy of LEGACY_SAMPLES) {
  const target = normalizeLegacyPath(legacy);
  if (!routeExists(routes, target)) {
    issues.push({ kind: 'legacy-remap', from: legacy, url: target });
  }
}

// lab/dashboard → redirect a /lab (incluido en parseModuleUrlsFromMatrix)

const DETAIL_SUFFIXES = [
  ['/crm/opportunities', '/:id', '/:id/notas', '/:id/quotes', '/:id/cotizaciones', '/:id/adjuntos', '/:id/historial'],
  ['/crm/clients', '/:id', '/:id/quotes', '/:id/cotizaciones', '/:id/facturas', '/:id/servicios', '/:id/sucursales', '/:id/tickets'],
  ['/crm/quotes', '/:id'],
  ['/ops/activities', '/:id', '/:id/viatics', '/:id/viaticos', '/:id/evidences', '/:id/evidencias', '/:id/approvals', '/:id/aprobaciones', '/:id/historial'],
  ['/crm/projects', '/:id'],
  ['/ops/projects', '/:id'],
];

for (const [base, ...suffixes] of DETAIL_SUFFIXES) {
  for (const suf of suffixes) {
    const url = base + suf.replace(':id', '42');
    if (!routeExists(routes, url)) {
      issues.push({ kind: 'detail-missing', url, hint: 'detalle o redirect esperado' });
    }
  }
}

// lab/dashboard ya cubierto en MODULE_URLS

if (issues.length === 0) {
  console.log('✅ Audit routes OK — 0 issues\n');
  process.exit(0);
}

console.log(`❌ ${issues.length} issue(s):\n`);
for (const i of issues) {
  if (i.kind === 'legacy-remap') {
    console.log(`  [${i.kind}] ${i.from} → ${i.url}`);
  } else {
    console.log(`  [${i.kind}] ${i.url}${i.hint ? ` (${i.hint})` : ''}`);
  }
}
process.exit(1);
