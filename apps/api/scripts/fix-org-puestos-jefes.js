/**
 * One-shot idempotente: alinea puestos de encargados y el jefe de Josué (Obra)
 * en la BD de producción / staging. No crea usuarios; solo actualiza.
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

const UPDATES = [
  { email: 'jose.ramirez@nexara.com.mx', puesto: 'Encargado de soporte' },
  { email: 'operaciones@nexara.com.mx', puesto: 'Encargado de instalación' },
  { email: 'direccion.operaciones@nexara.com.mx', puesto: 'Encargado de servicios' },
  { email: 'daniela.hernandez@nexara.com.mx', puesto: 'Encargada comercial' },
  {
    email: 'infraestructura@nexara.com.mx',
    puesto: 'Encargado de Obra',
    managerEmail: 'gerencia@nexara.com.mx',
  },
];

async function main() {
  console.log('🔧 [fix-org-puestos-jefes] Alineando puestos / jefes…');
  let changed = 0;

  for (const update of UPDATES) {
    const user = await prisma.user.findUnique({
      where: { email: update.email },
      select: { id: true, email: true, puesto: true, managerId: true },
    });
    if (!user) {
      console.log(`   ⚠️  ${update.email} no existe — omitido`);
      continue;
    }

    const data = {};
    if (user.puesto !== update.puesto) {
      data.puesto = update.puesto;
    }

    if (update.managerEmail) {
      const manager = await prisma.user.findUnique({
        where: { email: update.managerEmail },
        select: { id: true, email: true },
      });
      if (!manager) {
        console.log(`   ⚠️  jefe ${update.managerEmail} no existe — omitido manager de ${update.email}`);
      } else if (user.managerId !== manager.id) {
        data.managerId = manager.id;
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
        (data.managerId != null ? ` · manager→${update.managerEmail}` : ''),
    );
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
