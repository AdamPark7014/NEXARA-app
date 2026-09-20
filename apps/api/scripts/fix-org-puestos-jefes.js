/**
 * Idempotente: alinea puestos y jefes del organigrama (Adam 19-09-2026).
 *
 * - Puestos: JA soporte, David instalación, Luis servicios, Daniela H. comercial
 * - Josué (encargado de obra) reporta a Christian; fuera del equipo de José Antonio
 *
 * Uso: node apps/api/scripts/fix-org-puestos-jefes.js
 * (desde apps/api con DATABASE_URL cargado, o con dotenv del .env)
 */
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../../.env'),
    path.join(__dirname, '../../../deploy/.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PUESTOS = [
  { email: 'jose.ramirez@nexara.com.mx', puesto: 'Encargado de soporte' },
  { email: 'operaciones@nexara.com.mx', puesto: 'Encargado de instalación' },
  { email: 'direccion.operaciones@nexara.com.mx', puesto: 'Encargado de servicios' },
  { email: 'daniela.hernandez@nexara.com.mx', puesto: 'Encargada comercial' },
  { email: 'infraestructura@nexara.com.mx', puesto: 'Encargado de Obra' },
];

async function main() {
  const christian = await prisma.user.findFirst({
    where: { email: 'gerencia@nexara.com.mx' },
    select: { id: true, nombre: true },
  });
  if (!christian) throw new Error('No está gerencia@ (Christian)');

  for (const row of PUESTOS) {
    const u = await prisma.user.findFirst({ where: { email: row.email } });
    if (!u) {
      console.warn(`SKIP sin usuario: ${row.email}`);
      continue;
    }
    const data = { puesto: row.puesto };
    if (row.email === 'infraestructura@nexara.com.mx') {
      data.managerId = christian.id;
    }
    await prisma.user.update({ where: { id: u.id }, data });
    console.log(`OK ${row.email} → puesto=${row.puesto}${data.managerId ? ` manager=${christian.nombre}` : ''}`);
  }

  // Si alguien quedó colgando de José Antonio siendo encargado de obra, corregir.
  const ja = await prisma.user.findFirst({ where: { email: 'jose.ramirez@nexara.com.mx' } });
  if (ja) {
    const wrong = await prisma.user.findMany({
      where: {
        managerId: ja.id,
        OR: [
          { email: 'infraestructura@nexara.com.mx' },
          { puesto: { contains: 'Obra', mode: 'insensitive' } },
        ],
      },
    });
    for (const w of wrong) {
      await prisma.user.update({
        where: { id: w.id },
        data: { managerId: christian.id },
      });
      console.log(`FIX jefe: ${w.email || w.nombre} → Christian (era José Antonio)`);
    }
  }

  console.log('Listo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
