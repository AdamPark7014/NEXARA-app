/**
 * Pone como avatar (`User.avatarUrl`) de cada empleado la foto de rostro que
 * ya tiene enrolada en los terminales ACS (Hikvision). Es la misma lógica que
 * `POST /api/integra/people/import-avatars`, pero sin sesión HTTP.
 *
 * Necesita la API compilada con `AcsAvatarImportService` (es decir: desplegada;
 * lee `dist/integra/acs-avatar-import.cli-module.js`). No arranca `AppModule`:
 * usa un contexto mínimo sin crons, sin workers de BullMQ y sin precalentado,
 * para no duplicar tareas del contenedor que ya está sirviendo.
 *
 * ── En el servidor, desde la raíz del repo ─────────────────────────────────
 * La imagen no copia `apps/api/scripts/`, así que el script entra por stdin
 * (`node -`) y corre con el cwd de la API dentro del contenedor:
 *
 *   # 1) Simulación: empareja y descarga cada foto, pero NO escribe archivos ni base
 *   docker exec -i -w /app/apps/api nexara-api node - --dry-run < apps/api/scripts/import-acs-avatars.js
 *
 *   # 2) Aplicar: guarda en /app/uploads/users y actualiza User.avatarUrl
 *   docker exec -i -w /app/apps/api nexara-api node - --apply < apps/api/scripts/import-acs-avatars.js
 *
 * Opciones:
 *   --company=1    empresa (defecto 1)
 *   --overwrite    también reemplaza avatares que ya existen (defecto: solo quien no tiene)
 *   --json         imprime el reporte completo en JSON
 *
 * En local, tras `npm run build -w apps/api`:
 *   node apps/api/scripts/import-acs-avatars.js --dry-run
 */
'use strict';

const fs = require('fs');
const path = require('path');

function usage(code) {
  console.log(
    'Uso: node import-acs-avatars.js (--dry-run | --apply) [--company=1] [--overwrite] [--json]',
  );
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { dryRun: null, companyId: 1, overwrite: false, json: false };
  for (const arg of argv) {
    if (!arg) continue;
    if (arg === '--dry-run') opts.dryRun = opts.dryRun === false ? 'both' : true;
    else if (arg === '--apply') opts.dryRun = opts.dryRun === true ? 'both' : false;
    else if (arg === '--overwrite') opts.overwrite = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--company=')) opts.companyId = Number(arg.slice('--company='.length));
    else if (arg === '--help' || arg === '-h') usage(0);
    else {
      console.error(`Opción desconocida: ${arg}`);
      usage(2);
    }
  }
  if (opts.dryRun === null || opts.dryRun === 'both') {
    console.error('Indica exactamente uno: --dry-run o --apply');
    usage(2);
  }
  if (!Number.isInteger(opts.companyId) || opts.companyId <= 0) {
    console.error('--company debe ser un entero positivo');
    usage(2);
  }
  return opts;
}

function findDist() {
  const marker = path.join('integra', 'acs-avatar-import.cli-module.js');
  const here = __dirname && __dirname !== '.' ? __dirname : process.cwd();
  const candidates = [
    path.resolve(here, '..', 'dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), 'apps', 'api', 'dist'),
    '/app/apps/api/dist',
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
  }
  console.error(
    `No encuentro ${marker} en: ${candidates.join(', ')}.\n` +
      'Compila/despliega la API con AcsAvatarImportService antes de correr el script.',
  );
  process.exit(1);
}

function kb(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function printReport(r) {
  const s = r.summary;
  console.log('');
  console.log(
    `Empresa ${r.companyId} · ${r.dryRun ? 'SIMULACIÓN (no se escribió nada)' : 'APLICADO'}` +
      `${r.overwrite ? ' · reemplazando avatares existentes' : ''}`,
  );
  console.log(
    `Usuarios activos: ${s.users} · Personas ACS: ${s.people} · Emparejados: ${s.matched}`,
  );

  console.log('');
  console.log(`${r.dryRun ? 'SE IMPORTARÍAN' : 'IMPORTADOS'} (${r.imported.length}):`);
  for (const i of r.imported) {
    console.log(
      `  + ${i.userName}  <-  "${i.personName}" (ACS ${i.personId}, sitio ${i.siteId})` +
        `  score ${i.score} · ${i.reason} · ${kb(i.bytes)} -> ${i.avatarUrl}`,
    );
  }

  console.log('');
  console.log(`OMITIDOS (${r.skipped.length}):`);
  for (const k of r.skipped) {
    const who = k.personName ? `  <-  "${k.personName}" (ACS ${k.personId})` : '';
    console.log(`  - ${k.userName}${who}: ${k.reason}`);
  }

  console.log('');
  console.log(`AMBIGUOS, sin tocar (${r.ambiguous.length}):`);
  for (const a of r.ambiguous) {
    const cands = a.candidates
      .map((c) => `"${c.personName}" (ACS ${c.personId}, sitio ${c.siteId}, foto ${c.hasFace ? 'sí' : 'no'})`)
      .join(' | ');
    console.log(`  ? ${a.userName}: ${a.reason} -> ${cands}`);
  }

  console.log('');
  console.log(`USUARIOS SIN REGISTRO ACS (${r.unmatchedUsers.length}):`);
  if (r.unmatchedUsers.length) {
    console.log(`  ${r.unmatchedUsers.map((u) => u.userName).join(' · ')}`);
  }

  console.log('');
  console.log(`PERSONAS ACS SIN USUARIO (${r.unmatchedPeople.length}):`);
  if (r.unmatchedPeople.length) {
    console.log(`  ${r.unmatchedPeople.map((p) => p.personName).join(' · ')}`);
  }
  console.log('');
}

async function main() {
  // argv[1] es la ruta del script, o '-' cuando entra por stdin.
  const opts = parseArgs(process.argv.slice(2));

  // Este proceso convive con la API viva: nada de consumir colas ni de
  // precalentar streams mientras dura el script.
  process.env.JOBS_RUN_WORKERS = '0';
  process.env.INTEGRA_WARMUP_ENABLED = '0';
  process.env.INTEGRA_CAPABILITIES_PROBE_ENABLED = '0';

  const dist = findDist();
  // Misma instancia de @nestjs/core que la que compiló los módulos.
  const { NestFactory } = require(require.resolve('@nestjs/core', { paths: [dist] }));
  const { AcsAvatarImportCliModule } = require(
    path.join(dist, 'integra', 'acs-avatar-import.cli-module.js'),
  );
  const { AcsAvatarImportService } = require(
    path.join(dist, 'integra', 'acs-avatar-import.service.js'),
  );

  const app = await NestFactory.createApplicationContext(AcsAvatarImportCliModule, {
    logger: ['error', 'warn'],
  });
  let exitCode = 0;
  try {
    const service = app.get(AcsAvatarImportService, { strict: false });
    const report = await service.importAvatars(opts.companyId, {
      dryRun: opts.dryRun,
      overwrite: opts.overwrite,
    });
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    exitCode = 1;
  } finally {
    await app.close().catch(() => undefined);
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
