import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const roles = [
    { nombre: 'PanelWeb', nivelAutoridad: 20 },
    { nombre: 'PanelTienda', nivelAutoridad: 30 },
    { nombre: 'PanelInterno', nivelAutoridad: 40 },
  ];
  for (const role of roles) {
    await prisma.role.upsert({
      where: { nombre: role.nombre },
      update: { nivelAutoridad: role.nivelAutoridad },
      create: role,
    });
  }
  console.log('Roles nivel 20, 30 y 40 agregados o actualizados.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
