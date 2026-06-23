const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedRoles() {
  console.log('🌱 Seeding legacy panel roles...');
  
  const roles = [
    { nombre: 'PanelWeb', nivelAutoridad: 20 },
    { nombre: 'PanelInterno', nivelAutoridad: 40 },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { nombre: role.nombre },
      update: { nivelAutoridad: role.nivelAutoridad },
      create: role,
    });
    console.log(`✅ Rol ${role.nombre} creado/actualizado`);
  }

  console.log('🌱 Seeding ERP org role templates + demo users (ts-node)...');
  const { execSync } = require('child_process');
  const path = require('path');
  const apiDir = path.join(__dirname, '..');
  execSync('npx ts-node prisma/seed-demo-users.ts', { cwd: apiDir, stdio: 'inherit' });

  console.log('🌱 Seeding workflow definitions (ts-node)...');
  execSync('npx ts-node prisma/seed-workflows.ts', { cwd: apiDir, stdio: 'inherit' });
}

async function seedProjects() {
  console.log('🌱 Seeding projects...');
  
  const projects = [
    {
      slug: 'proyecto-demo-1',
      title: 'Proyecto Demo 1',
      sector: 'Tecnología',
      summary: 'Descripción del proyecto demo',
      mainImage: '/uploads/projects/demo.jpg',
    },
    {
      slug: 'proyecto-demo-2',
      title: 'Proyecto Demo 2',
      sector: 'Tecnología',
      summary: 'Segundo proyecto de ejemplo',
      mainImage: '/uploads/projects/demo2.jpg',
    },
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: project,
      create: project,
    });
    console.log(`✅ Proyecto "${project.title}" creado/actualizado`);
  }
}

async function main() {
  try {
    await seedRoles();
    await seedProjects();
    console.log('\n✨ Seeding completado exitosamente!');
  } catch (error) {
    console.error('❌ Error durante seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
