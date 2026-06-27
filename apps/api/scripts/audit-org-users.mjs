#!/usr/bin/env node
/**
 * Audita usuarios en DB vs organigrama oficial (seed-demo-users.ts).
 *
 * Uso local:
 *   cd apps/api && node scripts/audit-org-users.mjs
 *
 * Uso en servidor (Postgres en Docker):
 *   docker exec -i nexara-db psql -U nexara -d nexara -f - < apps/api/scripts/audit-org-users.sql
 *   — o copia las queries SQL que imprime este script.
 */
import { PrismaClient } from '@prisma/client';

/** Debe coincidir con DEMO_USERS en prisma/seed-demo-users.ts */
const OFFICIAL = [
  { email: 'gerencia@nexara.com.mx', roleKey: 'ceo', employeeNumber: 'NX-001' },
  { email: 'developer@nexara.com.mx', roleKey: 'ceo', employeeNumber: 'NX-002' },
  { email: 'infraestructura@nexara.com.mx', roleKey: 'arquitecto', employeeNumber: 'NX-003' },
  { email: 'ventas@nexara.com.mx', roleKey: 'coord_admin', employeeNumber: 'NX-101' },
  { email: 'soluciones@nexara.com.mx', roleKey: 'administrativo', employeeNumber: 'NX-102' },
  { email: 'redes@nexara.com.mx', roleKey: 'lider_diseno', employeeNumber: 'NX-201' },
  { email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones', employeeNumber: 'NX-301' },
  { email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones', employeeNumber: 'NX-302' },
  { email: 'ivan.tapia@nexara.com.mx', roleKey: 'ing_campo', employeeNumber: 'NX-401' },
  { email: 'administracion.ventas@nexara.com.mx', roleKey: 'ing_campo', employeeNumber: 'NX-402' },
  { email: 'isaias.garcia@nexara.com.mx', roleKey: 'ing_campo', employeeNumber: 'NX-403' },
  { email: 'joan.sanchez@nexara.com.mx', roleKey: 'ing_campo', employeeNumber: 'NX-404' },
  { email: 'soporte@nexara.com.mx', roleKey: 'ing_soporte', employeeNumber: 'NX-405' },
  { email: 'ariadna.sierra@nexara.com.mx', roleKey: 'ing_campo', employeeNumber: 'NX-406' },
  { email: 'alejandro.gonzalez@nexara.com.mx', roleKey: 'ing_campo', employeeNumber: 'NX-407' },
  { email: 'israel.ramos@nexara.com.mx', roleKey: 'ing_campo', employeeNumber: 'NX-408' },
];

const OFFICIAL_EMAILS = new Set(OFFICIAL.map((u) => u.email.toLowerCase()));
const OFFICIAL_BY_EMAIL = new Map(OFFICIAL.map((u) => [u.email.toLowerCase(), u]));

const prisma = new PrismaClient();

function section(title) {
  console.log(`\n${'═'.repeat(72)}\n${title}\n${'═'.repeat(72)}`);
}

async function main() {
  section('NEXARA · Auditoría usuarios vs organigrama');

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      nombre: true,
      roleKey: true,
      employeeNumber: true,
      isActive: true,
      role: { select: { nombre: true, orgRoleKey: true } },
    },
    orderBy: { email: 'asc' },
  });

  console.log(`Total en DB: ${users.length} · Oficial esperado: ${OFFICIAL.length}`);

  section('1) Emails duplicados');
  const byEmail = new Map();
  for (const u of users) {
    const key = (u.email ?? '').toLowerCase();
    byEmail.set(key, (byEmail.get(key) ?? 0) + 1);
  }
  const dupEmails = [...byEmail.entries()].filter(([, n]) => n > 1);
  if (!dupEmails.length) console.log('✅ Ninguno');
  else dupEmails.forEach(([e, n]) => console.log(`❌ ${e} × ${n}`));

  section('2) employeeNumber duplicados');
  const byEmp = new Map();
  for (const u of users) {
    if (!u.employeeNumber) continue;
    byEmp.set(u.employeeNumber, (byEmp.get(u.employeeNumber) ?? 0) + 1);
  }
  const dupEmp = [...byEmp.entries()].filter(([, n]) => n > 1);
  if (!dupEmp.length) console.log('✅ Ninguno');
  else dupEmp.forEach(([e, n]) => console.log(`❌ ${e} × ${n}`));

  section('3) Usuarios FUERA del organigrama');
  const extras = users.filter((u) => !OFFICIAL_EMAILS.has((u.email ?? '').toLowerCase()));
  if (!extras.length) console.log('✅ Ninguno');
  else {
    for (const u of extras) {
      console.log(
        `❌ id=${u.id} ${u.email} · ${u.nombre} · roleKey=${u.roleKey ?? '—'} · rol=${u.role?.nombre ?? '—'} · activo=${u.isActive}`,
      );
    }
  }

  section('4) Miembros del organigrama FALTANTES en DB');
  const inDb = new Set(users.map((u) => (u.email ?? '').toLowerCase()));
  const missing = OFFICIAL.filter((o) => !inDb.has(o.email.toLowerCase()));
  if (!missing.length) console.log('✅ Todos presentes');
  else missing.forEach((o) => console.log(`❌ Falta ${o.email} (${o.roleKey})`));

  section('5) roleKey / employeeNumber distinto al seed');
  let drift = 0;
  for (const u of users) {
    const expected = OFFICIAL_BY_EMAIL.get((u.email ?? '').toLowerCase());
    if (!expected) continue;
    const issues = [];
    if (u.roleKey !== expected.roleKey) {
      issues.push(`roleKey DB="${u.roleKey ?? 'null'}" esperado="${expected.roleKey}"`);
    }
    if (expected.employeeNumber && u.employeeNumber && u.employeeNumber !== expected.employeeNumber) {
      issues.push(`employeeNumber DB="${u.employeeNumber}" esperado="${expected.employeeNumber}"`);
    }
    if (issues.length) {
      drift += 1;
      console.log(`⚠️  ${u.email}: ${issues.join(' · ')}`);
    }
  }
  if (!drift) console.log('✅ Todos alineados con seed-demo-users.ts');

  section('6) Resumen por roleKey (solo organigrama)');
  const officialUsers = users.filter((u) => OFFICIAL_EMAILS.has((u.email ?? '').toLowerCase()));
  const byRole = new Map();
  for (const u of officialUsers) {
    const k = u.roleKey ?? '(sin roleKey)';
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...byRole.entries()].sort()) console.log(`   ${k}: ${n}`);

  const ok =
    !dupEmails.length &&
    !dupEmp.length &&
    !extras.length &&
    !missing.length &&
    drift === 0;

  section(ok ? '✅ AUDITORÍA OK' : '❌ HAY PROBLEMAS — revisar arriba');
  if (extras.length) {
    console.log('\nPara listar extras en SQL (servidor):');
    console.log(`SELECT id, email, nombre, "roleKey", "employeeNumber", "isActive"
FROM "User"
WHERE LOWER(email) NOT IN (${[...OFFICIAL_EMAILS].map((e) => `'${e}'`).join(', ')})
ORDER BY email;`);
  }
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
