import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const upsertUser = async (data: {
  nombre: string;
  email: string;
  passwordHash: string;
  roleId: number;
  departmentId: number;
}) =>
  prisma.user.upsert({
    where: { email: data.email },
    update: {
      nombre: data.nombre,
      passwordHash: data.passwordHash,
      roleId: data.roleId,
      departmentId: data.departmentId,
    },
    create: data,
  });

async function main() {
  // Crear roles y departamento únicos
  const ceoRole = await prisma.role.upsert({
    where: { nombre: 'CEO' },
    update: {
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
      accesoGestionUsuarios: true,
      accesoGestionTienda: true,
      accesoGestionWeb: true,
      accesoContabilidad: true,
    },
    create: {
      nombre: 'CEO',
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
      accesoGestionUsuarios: true,
      accesoGestionTienda: true,
      accesoGestionWeb: true,
      accesoContabilidad: true,
    },
  });
  const cooRole = await prisma.role.upsert({
    where: { nombre: 'COO' },
    update: {
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
      accesoGestionUsuarios: true,
      accesoContabilidad: true,
    },
    create: {
      nombre: 'COO',
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
      accesoGestionUsuarios: true,
      accesoContabilidad: true,
    },
  });
  const staffRole = await prisma.role.upsert({
    where: { nombre: 'Staff' },
    update: {
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
    },
    create: {
      nombre: 'Staff',
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
    },
  });
  // Nuevos roles
  const panelWebRole = await prisma.role.upsert({
    where: { nombre: 'PanelWeb' },
    update: { nivelAutoridad: 0, accesoGestionWeb: true },
    create: { nombre: 'PanelWeb', nivelAutoridad: 0, accesoGestionWeb: true },
  });
  const panelTiendaRole = await prisma.role.upsert({
    where: { nombre: 'PanelTienda' },
    update: { nivelAutoridad: 0, accesoGestionTienda: true },
    create: { nombre: 'PanelTienda', nivelAutoridad: 0, accesoGestionTienda: true },
  });
  const panelInternoRole = await prisma.role.upsert({
    where: { nombre: 'PanelInterno' },
    update: {
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
    },
    create: {
      nombre: 'PanelInterno',
      nivelAutoridad: 0,
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoAsistencia: true,
      accesoGps: true,
    },
  });
  const deptGeneral = await prisma.department.upsert({
    where: { nombre: 'General' },
    update: {},
    create: { nombre: 'General' },
  });

  // Actualizar o crear usuarios demo por email

  // Contraseñas memorizables, diferenciadas y con mayor dificultad para altos rangos
  const passCEO1 = 'NexaraCeo2026@!2888';
  const passCEO2 = 'NexaraDev2026@!30';
  const passCOO = 'NexaraCoo2026!@';
  const passStaff1 = 'NexaraSoporte2026!';
  const passStaff2 = 'NexaraSistemas2026!';
  // Contraseñas para nuevos roles demo
  const passPanelWeb = 'DemoPanelWeb2026!';
  const passPanelTienda = 'DemoPanelTienda2026!';
  const passPanelInterno = 'DemoPanelInterno2026!';
  // Usuarios demo para nuevos roles
  await upsertUser({
    nombre: 'Usuario Demo Panel Web',
    email: 'demo.panelweb@nexara.com.mx',
    passwordHash: await bcrypt.hash(passPanelWeb, 10),
    roleId: panelWebRole.id,
    departmentId: deptGeneral.id,
  });
  await upsertUser({
    nombre: 'Usuario Demo Panel Tienda',
    email: 'demo.paneltienda@nexara.com.mx',
    passwordHash: await bcrypt.hash(passPanelTienda, 10),
    roleId: panelTiendaRole.id,
    departmentId: deptGeneral.id,
  });
  await upsertUser({
    nombre: 'Usuario Demo Panel Interno',
    email: 'demo.panelinterno@nexara.com.mx',
    passwordHash: await bcrypt.hash(passPanelInterno, 10),
    roleId: panelInternoRole.id,
    departmentId: deptGeneral.id,
  });

  await upsertUser({
    nombre: 'Christian Del Pozo (CEO)',
    email: 'gerencia@nexara.com.mx',
    passwordHash: await bcrypt.hash(passCEO1, 10),
    roleId: ceoRole.id,
    departmentId: deptGeneral.id,
  });
  await upsertUser({
    nombre: 'Karen Elizalde Sarmiento (COO)',
    email: 'ventas@nexara.com.mx',
    passwordHash: await bcrypt.hash(passCOO, 10),
    roleId: cooRole.id,
    departmentId: deptGeneral.id,
  });
  await upsertUser({
    nombre: 'Carolina Juarez Alvarez (Ingeniera de Soporte)',
    email: 'soporte@nexara.com.mx',
    passwordHash: await bcrypt.hash(passStaff1, 10),
    roleId: staffRole.id,
    departmentId: deptGeneral.id,
  });
  await upsertUser({
    nombre: 'Alejandro Gonzales (Ingeniero de Sistemas)',
    email: 'sistemas@nexara.com.mx',
    passwordHash: await bcrypt.hash(passStaff2, 10),
    roleId: staffRole.id,
    departmentId: deptGeneral.id,
  });
  await upsertUser({
    nombre: 'Adam Del Pozo (Desarrollador)',
    email: 'developer@nexara.com.mx',
    passwordHash: await bcrypt.hash(passCEO2, 10),
    roleId: ceoRole.id,
    departmentId: deptGeneral.id,
  });

  console.log('Contraseñas asignadas:');
  console.log('Christian Del Pozo (CEO):', passCEO1);
  console.log('Adam Del Pozo (Desarrollador):', passCEO2);
  console.log('Karen Elizalde Sarmiento (COO):', passCOO);
  console.log('Carolina Juarez Alvarez (Ingeniera de Soporte):', passStaff1);
  console.log('Alejandro Gonzales (Ingeniero de Sistemas):', passStaff2);
  console.log('Usuario Demo Panel Web:', passPanelWeb);
  console.log('Usuario Demo Panel Tienda:', passPanelTienda);
  console.log('Usuario Demo Panel Interno:', passPanelInterno);

  console.log('Usuarios demo actualizados.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
