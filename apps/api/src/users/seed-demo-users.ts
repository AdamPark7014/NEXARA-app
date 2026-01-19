import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Crear roles y departamento únicos
  const ceoRole = await prisma.role.upsert({
    where: { nombre: 'CEO' },
    update: { nivelAutoridad: 100 },
    create: { nombre: 'CEO', nivelAutoridad: 100 },
  });
  const cooRole = await prisma.role.upsert({
    where: { nombre: 'COO' },
    update: { nivelAutoridad: 50 },
    create: { nombre: 'COO', nivelAutoridad: 50 },
  });
  const staffRole = await prisma.role.upsert({
    where: { nombre: 'Staff' },
    update: { nivelAutoridad: 10 },
    create: { nombre: 'Staff', nivelAutoridad: 10 },
  });
  const deptGeneral = await prisma.department.upsert({
    where: { nombre: 'General' },
    update: {},
    create: { nombre: 'General' },
  });

  // Eliminar todos los usuarios previos
  await prisma.user.deleteMany({});

  // Crear usuarios solicitados

  // Contraseñas memorizables, diferenciadas y con mayor dificultad para altos rangos
  const passCEO1 = 'NexaraCeo2026@!2888';
  const passCEO2 = 'NexaraDev2026@!30';
  const passCOO = 'NexaraCoo2026!@';
  const passStaff1 = 'NexaraSoporte2026!';
  const passStaff2 = 'NexaraSistemas2026!';

  await prisma.user.create({
    data: {
      nombre: 'Christian Del Pozo (CEO)',
      email: 'gerencia@nexara.com.mx',
      passwordHash: await bcrypt.hash(passCEO1, 10),
      roleId: ceoRole.id,
      departmentId: deptGeneral.id,
    },
  });
  await prisma.user.create({
    data: {
      nombre: 'Karen Elizalde Sarmiento (COO)',
      email: 'ventas@nexara.com.mx',
      passwordHash: await bcrypt.hash(passCOO, 10),
      roleId: cooRole.id,
      departmentId: deptGeneral.id,
    },
  });
  await prisma.user.create({
    data: {
      nombre: 'Carolina Juarez Alvarez (Ingeniera de Soporte)',
      email: 'soporte@nexara.com.mx',
      passwordHash: await bcrypt.hash(passStaff1, 10),
      roleId: staffRole.id,
      departmentId: deptGeneral.id,
    },
  });
  await prisma.user.create({
    data: {
      nombre: 'Alejandro Gonzales (Ingeniero de Sistemas)',
      email: 'sistemas@nexara.com.mx',
      passwordHash: await bcrypt.hash(passStaff2, 10),
      roleId: staffRole.id,
      departmentId: deptGeneral.id,
    },
  });
  await prisma.user.create({
    data: {
      nombre: 'Adam Del Pozo (Desarrollador)',
      email: 'developer@nexara.com.mx',
      passwordHash: await bcrypt.hash(passCEO2, 10),
      roleId: ceoRole.id,
      departmentId: deptGeneral.id,
    },
  });

  console.log('Contraseñas asignadas:');
  console.log('Christian Del Pozo (CEO):', passCEO1);
  console.log('Adam Del Pozo (Desarrollador):', passCEO2);
  console.log('Karen Elizalde Sarmiento (COO):', passCOO);
  console.log('Carolina Juarez Alvarez (Ingeniera de Soporte):', passStaff1);
  console.log('Alejandro Gonzales (Ingeniero de Sistemas):', passStaff2);

  console.log('Usuarios demo actualizados.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
