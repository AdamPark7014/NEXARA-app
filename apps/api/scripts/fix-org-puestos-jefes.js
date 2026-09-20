/**
 * One-shot idempotente: alinea puestos de encargados, el jefe de Josué (Obra)
 * y la raíz del organigrama (Christian DG; Claudia = tester, fuera del chart).
 *
 *   cd apps/api && node scripts/fix-org-puestos-jefes.js
 *   # o en el contenedor:
 *   docker exec -i -w /app/apps/api nexara-api node scripts/fix-org-puestos-jefes.js
 *
 * Idempotente: si puesto/managerId ya coinciden, solo lo reporta.
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CHRISTIAN = 'gerencia@nexara.com.mx';
const CLAUDIA = 'claudia.bernal@nexara.com.mx';

const UPDATES = [
  { email: CHRISTIAN, puesto: 'Director General', managerEmail: null },
  { email: CLAUDIA, puesto: 'Tester de plataforma', managerEmail: null },
  { email: 'jose.ramirez@nexara.com.mx', puesto: 'Encargado de soporte' },
  { email: 'operaciones@nexara.com.mx', puesto: 'Encargado de instalación' },
  { email: 'direccion.operaciones@nexara.com.mx', puesto: 'Encargado de servicios' },
  { email: 'daniela.hernandez@nexara.com.mx', puesto: 'Encargada comercial' },
  {
    email: 'infraestructura@nexara.com.mx',
    puesto: 'Encargado de Obra',
    managerEmail: CHRISTIAN,
  },
];

async function findByEmail(email) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, puesto: true, managerId: true, nombre: true },
  });
}

async function main() {
  console.log('🔧 [fix-org-puestos-jefes] Alineando puestos / jefes…');
  let changed = 0;

  const christian = await findByEmail(CHRISTIAN);
  if (!christian) {
    console.error(`❌ ${CHRISTIAN} no existe — aborto`);
    process.exit(1);
  }

  const claudia = await findByEmail(CLAUDIA);

  for (const update of UPDATES) {
    const user = await findByEmail(update.email);
    if (!user) {
      console.log(`   ⚠️  ${update.email} no existe — omitido`);
      continue;
    }

    const data = {};
    if (update.puesto && user.puesto !== update.puesto) {
      data.puesto = update.puesto;
    }

    if (Object.prototype.hasOwnProperty.call(update, 'managerEmail')) {
      if (update.managerEmail === null) {
        if (user.managerId != null) data.managerId = null;
      } else {
        const manager = await findByEmail(update.managerEmail);
        if (!manager) {
          console.log(`   ⚠️  jefe ${update.managerEmail} no existe — omitido manager de ${update.email}`);
        } else if (user.managerId !== manager.id) {
          data.managerId = manager.id;
        }
      }
    }

    if (Object.keys(data).length === 0) {
      console.log(`   ✓  ${update.email} ya OK (${update.puesto})`);
      continue;
    }

    await prisma.user.update({ where: { id: user.id }, data });
    changed += 1;
    console.log(
      `   ✏️  ${update.email}` +
        (data.puesto ? ` · puesto→${data.puesto}` : '') +
        (Object.prototype.hasOwnProperty.call(data, 'managerId')
          ? ` · manager→${update.managerEmail ?? 'null'}`
          : ''),
    );
  }

  // Quien reportaba a Claudia (tester) pasa a Christian.
  if (claudia) {
    const reportingToClaudia = await prisma.user.findMany({
      where: { managerId: claudia.id },
      select: { id: true, email: true },
    });
    for (const u of reportingToClaudia) {
      await prisma.user.update({
        where: { id: u.id },
        data: { managerId: christian.id },
      });
      changed += 1;
      console.log(`   ✏️  ${u.email} · manager Claudia→Christian`);
    }
  }

  console.log(`✅ listo · cambios: ${changed}`);
}

main()
  .catch((e) => {
    console.error('❌ fix-org-puestos-jefes falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
