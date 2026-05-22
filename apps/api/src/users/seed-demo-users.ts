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

const normalizeIdentity = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const PROTECTED_EMAILS = new Set(['gerencia@nexara.com.mx', 'developer@nexara.com.mx']);

const buildRoleAccess = (overrides: Partial<{
  accesoConsole: boolean;
  accesoConsoleAdmin: boolean;
  accesoActividades: boolean;
  accesoEvidencias: boolean;
  accesoViaticos: boolean;
  accesoVehiculos: boolean;
  accesoAsistencia: boolean;
  accesoGps: boolean;
  accesoGestionUsuarios: boolean;
  accesoGestionTienda: boolean;
  accesoGestionWeb: boolean;
  accesoGestionCvs: boolean;
  accesoPanelVentas: boolean;
  accesoContabilidad: boolean;
  accesoCotizaciones: boolean;
  accesoInventario: boolean;
  accesoCompras: boolean;
  accesoManufactura: boolean;
  accesoCalidad: boolean;
  accesoMantenimiento: boolean;
  accesoSeguridad: boolean;
  accesoDocumentos: boolean;
  accesoWorkflow: boolean;
  accesoAuditoria: boolean;
  accesoBI: boolean;
  accesoBanca: boolean;
  accesoMultas: boolean;
  accesoClientes: boolean;
  accesoLunchBreaks: boolean;
}>) => ({
  nivelAutoridad: 0,
  accesoConsole: false,
  accesoConsoleAdmin: false,
  accesoActividades: false,
  accesoEvidencias: false,
  accesoViaticos: false,
  accesoVehiculos: false,
  accesoAsistencia: false,
  accesoGps: false,
  accesoGestionUsuarios: false,
  accesoGestionTienda: false,
  accesoGestionWeb: false,
  accesoGestionCvs: false,
  accesoPanelVentas: false,
  accesoContabilidad: false,
  accesoCotizaciones: false,
  accesoInventario: false,
  accesoCompras: false,
  accesoManufactura: false,
  accesoCalidad: false,
  accesoMantenimiento: false,
  accesoSeguridad: false,
  accesoDocumentos: false,
  accesoWorkflow: false,
  accesoAuditoria: false,
  accesoBI: false,
  accesoBanca: false,
  accesoMultas: false,
  accesoClientes: false,
  accesoLunchBreaks: false,
  ...overrides,
});

const upsertRoleWithAccess = async (
  nombre: string,
  access: Parameters<typeof buildRoleAccess>[0],
) => {
  const payload = buildRoleAccess(access);
  return prisma.role.upsert({
    where: { nombre },
    update: payload,
    create: {
      nombre,
      ...payload,
    },
  });
};

const syncUserByIdentity = async (data: {
  nombre: string;
  email: string;
  passwordHash: string;
  roleId: number;
  departmentId: number;
  emailAliases?: string[];
  nameAliases?: string[];
}) => {
  const aliases = [...new Set([data.email, ...(data.emailAliases ?? [])])];
  const normalizedTargetNames = [data.nombre, ...(data.nameAliases ?? [])].map(normalizeIdentity);

  const direct = await prisma.user.findUnique({ where: { email: data.email } });

  const candidates = direct
    ? [direct]
    : await prisma.user.findMany({
        where: {
          OR: [
            { email: { in: aliases } },
            { nombre: { equals: data.nombre, mode: 'insensitive' as const } },
            ...((data.nameAliases ?? []).map((alias) => ({
              nombre: { equals: alias, mode: 'insensitive' as const },
            }))),
          ],
        },
      });

  const bestMatch =
    candidates.find((u) => u.email === data.email) ??
    candidates.find((u) => aliases.includes(u.email)) ??
    candidates.find((u) => normalizedTargetNames.includes(normalizeIdentity(u.nombre)));

  if (!bestMatch) {
    return upsertUser({
      nombre: data.nombre,
      email: data.email,
      passwordHash: data.passwordHash,
      roleId: data.roleId,
      departmentId: data.departmentId,
    });
  }

  return prisma.user.update({
    where: { id: bestMatch.id },
    data: {
      nombre: data.nombre,
      email: data.email,
      passwordHash: data.passwordHash,
      roleId: data.roleId,
      departmentId: data.departmentId,
    },
  });
};

const cleanupIdentityDuplicates = async (data: {
  targetUserId: number;
  email: string;
  emailAliases?: string[];
  nombre: string;
  nameAliases?: string[];
}) => {
  const emails = [...new Set([data.email, ...(data.emailAliases ?? [])])];
  const normalizedNames = new Set(
    [data.nombre, ...(data.nameAliases ?? [])].map((entry) => normalizeIdentity(entry)),
  );

  const pool = await prisma.user.findMany({
    where: {
      email: { endsWith: '@nexara.com.mx' },
    },
    select: { id: true, email: true, nombre: true },
  });

  const duplicateIds = pool
    .filter((u) => {
      if (u.id === data.targetUserId) return false;
      if (PROTECTED_EMAILS.has(u.email)) return false;

      const sameEmailIdentity = emails.includes(u.email);
      const sameNameIdentity = normalizedNames.has(normalizeIdentity(u.nombre));
      return sameEmailIdentity || sameNameIdentity;
    })
    .map((u) => u.id);

  if (duplicateIds.length === 0) return 0;

  const deleted = await prisma.user.deleteMany({
    where: { id: { in: duplicateIds } },
  });

  return deleted.count;
};

async function main() {
  try {
    console.log('[SEED] Iniciando seed-demo-users.ts...');
    console.log('[SEED] DATABASE_URL:', process.env.DATABASE_URL || 'NO DEFINIDO');
    
    // Roles con permisos explícitos según requerimiento
    console.log('[SEED] Creando roles...');
    const roleConsolaUsuario = await upsertRoleWithAccess('Consola Usuario', {
      accesoConsole: true,
    });
    console.log(`[SEED] ✓ Rol 'Consola Usuario' id=${roleConsolaUsuario.id}`);
    
    const rolePanelVentasSolo = await upsertRoleWithAccess('Panel Ventas', {
      accesoPanelVentas: true,
    });
    console.log(`[SEED] ✓ Rol 'Panel Ventas' id=${rolePanelVentasSolo.id}`);
    
    const roleConsolaCotizaciones = await upsertRoleWithAccess('Consola + Cotizaciones', {
      accesoConsole: true,
      accesoCotizaciones: true,
    });
    console.log(`[SEED] ✓ Rol 'Consola + Cotizaciones' id=${roleConsolaCotizaciones.id}`);
    
    const roleConsolaGestionCvs = await upsertRoleWithAccess('Consola + Gestion CVs', {
      accesoConsole: true,
      accesoGestionCvs: true,
    });
    console.log(`[SEED] ✓ Rol 'Consola + Gestion CVs' id=${roleConsolaGestionCvs.id}`);
    
    const roleAdmin4Accesos = await upsertRoleWithAccess('Admin 4 Accesos', {
      accesoConsole: true,
      accesoConsoleAdmin: true,
      accesoGestionUsuarios: true,
      accesoContabilidad: true,
    });
    console.log(`[SEED] ✓ Rol 'Admin 4 Accesos' id=${roleAdmin4Accesos.id}`);

    // Departamentos específicos según tabla operativa
    console.log('[SEED] Creando departamentos...');
    const deptVentas = await prisma.department.upsert({
      where: { nombre: 'Ventas' },
      update: {},
      create: { nombre: 'Ventas' },
    });
    console.log(`[SEED] ✓ Departamento 'Ventas' id=${deptVentas.id}`);
    
    const deptIngCampo = await prisma.department.upsert({
      where: { nombre: 'Ingeniería de campo' },
      update: {},
      create: { nombre: 'Ingeniería de campo' },
    });
    console.log(`[SEED] ✓ Departamento 'Ingeniería de campo' id=${deptIngCampo.id}`);
    
    const deptAdministracion = await prisma.department.upsert({
      where: { nombre: 'Administración' },
      update: {},
      create: { nombre: 'Administración' },
    });
    console.log(`[SEED] ✓ Departamento 'Administración' id=${deptAdministracion.id}`);
    
    const deptOperaciones = await prisma.department.upsert({
      where: { nombre: 'Operaciones' },
      update: {},
      create: { nombre: 'Operaciones' },
    });
    console.log(`[SEED] ✓ Departamento 'Operaciones' id=${deptOperaciones.id}`);

    // Actualizar o crear usuarios demo por email

  // Contraseñas memorizables, diferenciadas y con mayor dificultad para altos rangos
  const passCEO = 'NexaraCeo2026@12888';
  const passDeveloper = 'Developer2026@Nexara';
  const passCOO = 'NexaraCoo2026!@';
  const passSoporte = 'NexaraSoporte2026!';
  const passOperaciones = 'NexaraSistemas2026!';
  const passVendedor = 'vendedor2026@!';
  const passJulio = 'Julio@006Pr7NHv';
  const passDavid = 'David@005Q6txCt';
  const passIsrael = 'Israel@0269$74uB';
  const passLuis = 'NexaraLui2026!@';
  const passLizbeth = 'Lizeth@0098%nzrv';

  // Superadmins protegidos
  console.log('[SEED] Creando usuarios...');
  console.log(`[SEED] Usando roleAdmin4Accesos.id=${roleAdmin4Accesos.id}, deptAdministracion.id=${deptAdministracion.id}`);
  
  const userGerencia = await syncUserByIdentity({
    nombre: 'Christian Del Pozo',
    email: 'gerencia@nexara.com.mx',
    passwordHash: await bcrypt.hash(passCEO, 10),
    roleId: roleAdmin4Accesos.id,
    departmentId: deptAdministracion.id,
    nameAliases: ['Christian Del Pozo', 'Christian'],
  });
  console.log(`[SEED] ✓ Usuario 'gerencia@nexara.com.mx' id=${userGerencia.id}`);
  
  const userDeveloper = await syncUserByIdentity({
    nombre: 'Adam Del Pozo',
    email: 'developer@nexara.com.mx',
    passwordHash: await bcrypt.hash(passDeveloper, 10),
    roleId: roleAdmin4Accesos.id,
    departmentId: deptAdministracion.id,
    nameAliases: ['Adam Del Pozo', 'Adam'],
  });
  console.log(`[SEED] ✓ Usuario 'developer@nexara.com.mx' id=${userDeveloper.id}`);

  const userKaren = await syncUserByIdentity({
    nombre: 'Karen Elizalde Sarmiento',
    email: 'ventas@nexara.com.mx',
    passwordHash: await bcrypt.hash(passCOO, 10),
    roleId: roleConsolaCotizaciones.id,
    departmentId: deptVentas.id,
    nameAliases: ['Karen Elizalde Sarmiento', 'Karen'],
  });
  console.log(`[SEED] ✓ Usuario 'ventas@nexara.com.mx' id=${userKaren.id}`);
  
  const userCarolina = await syncUserByIdentity({
    nombre: 'Carolina Juarez Alvarez',
    email: 'soporte@nexara.com.mx',
    passwordHash: await bcrypt.hash(passSoporte, 10),
    roleId: roleConsolaUsuario.id,
    departmentId: deptIngCampo.id,
    nameAliases: ['Carolina Juarez Alvarez', 'Carolina'],
  });
  console.log(`[SEED] ✓ Usuario 'soporte@nexara.com.mx' id=${userCarolina.id}`);
  
  const userAlejandro = await syncUserByIdentity({
    nombre: 'Alejandro Gonzales Bustamante',
    email: 'operaciones@nexara.com.mx',
    passwordHash: await bcrypt.hash(passOperaciones, 10),
    roleId: roleConsolaGestionCvs.id,
    departmentId: deptIngCampo.id,
    emailAliases: ['sistemas@nexara.com.mx'],
    nameAliases: ['Alejandro Gonzales Bustamante', 'Alejandro Gonzales', 'Alejandro'],
  });
  console.log(`[SEED] ✓ Usuario 'operaciones@nexara.com.mx' id=${userAlejandro.id}`);
  
  const userKarina = await syncUserByIdentity({
    nombre: 'Karina Martinez Flores',
    email: 'vendedor@nexara.com.mx',
    passwordHash: await bcrypt.hash(passVendedor, 10),
    roleId: rolePanelVentasSolo.id,
    departmentId: deptVentas.id,
    nameAliases: ['Karina Martinez Flores', 'Karina'],
  });
  console.log(`[SEED] ✓ Usuario 'vendedor@nexara.com.mx' id=${userKarina.id}`);
  
  const userJulio = await syncUserByIdentity({
    nombre: 'Julio Cesar Rivera Vazquez',
    email: 'julio.rivazquez@nexara.com.mx',
    passwordHash: await bcrypt.hash(passJulio, 10),
    roleId: roleConsolaUsuario.id,
    departmentId: deptIngCampo.id,
    nameAliases: ['Julio Cesar Rivera Vazquez', 'Julio César Rivera Vázquez', 'Julio'],
  });
  console.log(`[SEED] ✓ Usuario 'julio.rivazquez@nexara.com.mx' id=${userJulio.id}`);
  
  const userDavid = await syncUserByIdentity({
    nombre: 'David Morales Zenon',
    email: 'david.morzenon@nexara.com.mx',
    passwordHash: await bcrypt.hash(passDavid, 10),
    roleId: roleConsolaUsuario.id,
    departmentId: deptIngCampo.id,
    nameAliases: ['David Morales Zenon', 'David'],
  });
  console.log(`[SEED] ✓ Usuario 'david.morzenon@nexara.com.mx' id=${userDavid.id}`);
  
  const userIsrael = await syncUserByIdentity({
    nombre: 'Israel Ramos Lima',
    email: 'israel.ralima@nexara.com.mx',
    passwordHash: await bcrypt.hash(passIsrael, 10),
    roleId: roleConsolaUsuario.id,
    departmentId: deptIngCampo.id,
    nameAliases: ['Israel Ramos Lima', 'Israel'],
  });
  console.log(`[SEED] ✓ Usuario 'israel.ralima@nexara.com.mx' id=${userIsrael.id}`);
  
  const userLuis = await syncUserByIdentity({
    nombre: 'Luis Joel Aguilar',
    email: 'direccion.operaciones@nexara.com.mx',
    passwordHash: await bcrypt.hash(passLuis, 10),
    roleId: roleAdmin4Accesos.id,
    departmentId: deptOperaciones.id,
    nameAliases: ['Luis Joel Aguilar', 'Luis'],
  });
  console.log(`[SEED] ✓ Usuario 'direccion.operaciones@nexara.com.mx' id=${userLuis.id}`);
  
  const userLizeth = await syncUserByIdentity({
    nombre: 'Lizeth Antele Antonio',
    email: 'administracion@nexara.com.mx',
    passwordHash: await bcrypt.hash(passLizbeth, 10),
    roleId: roleAdmin4Accesos.id,
    departmentId: deptAdministracion.id,
    nameAliases: ['Lizeth Antele Antonio', 'Lizbeth Antele Antonio', 'Lizeth', 'Lizbeth'],
  });
  console.log(`[SEED] ✓ Usuario 'administracion@nexara.com.mx' id=${userLizeth.id}`);

  console.log('[SEED] Limpiando duplicados...');
  const duplicateCounts = await Promise.all([
    cleanupIdentityDuplicates({ targetUserId: userGerencia.id, email: 'gerencia@nexara.com.mx', nombre: 'Christian Del Pozo', nameAliases: ['Christian Del Pozo', 'Christian'] }),
    cleanupIdentityDuplicates({ targetUserId: userDeveloper.id, email: 'developer@nexara.com.mx', nombre: 'Adam Del Pozo', nameAliases: ['Adam Del Pozo', 'Adam'] }),
    cleanupIdentityDuplicates({ targetUserId: userKaren.id, email: 'ventas@nexara.com.mx', nombre: 'Karen Elizalde Sarmiento', nameAliases: ['Karen Elizalde Sarmiento', 'Karen'] }),
    cleanupIdentityDuplicates({ targetUserId: userCarolina.id, email: 'soporte@nexara.com.mx', nombre: 'Carolina Juarez Alvarez', nameAliases: ['Carolina Juarez Alvarez', 'Carolina'] }),
    cleanupIdentityDuplicates({ targetUserId: userAlejandro.id, email: 'operaciones@nexara.com.mx', emailAliases: ['sistemas@nexara.com.mx'], nombre: 'Alejandro Gonzales Bustamante', nameAliases: ['Alejandro Gonzales Bustamante', 'Alejandro Gonzales', 'Alejandro'] }),
    cleanupIdentityDuplicates({ targetUserId: userKarina.id, email: 'vendedor@nexara.com.mx', nombre: 'Karina Martinez Flores', nameAliases: ['Karina Martinez Flores', 'Karina'] }),
    cleanupIdentityDuplicates({ targetUserId: userJulio.id, email: 'julio.rivazquez@nexara.com.mx', nombre: 'Julio Cesar Rivera Vazquez', nameAliases: ['Julio Cesar Rivera Vazquez', 'Julio César Rivera Vázquez', 'Julio'] }),
    cleanupIdentityDuplicates({ targetUserId: userDavid.id, email: 'david.morzenon@nexara.com.mx', nombre: 'David Morales Zenon', nameAliases: ['David Morales Zenon', 'David'] }),
    cleanupIdentityDuplicates({ targetUserId: userIsrael.id, email: 'israel.ralima@nexara.com.mx', nombre: 'Israel Ramos Lima', nameAliases: ['Israel Ramos Lima', 'Israel'] }),
    cleanupIdentityDuplicates({ targetUserId: userLuis.id, email: 'direccion.operaciones@nexara.com.mx', nombre: 'Luis Joel Aguilar', nameAliases: ['Luis Joel Aguilar', 'Luis'] }),
    cleanupIdentityDuplicates({ targetUserId: userLizeth.id, email: 'administracion@nexara.com.mx', nombre: 'Lizeth Antele Antonio', nameAliases: ['Lizeth Antele Antonio', 'Lizbeth Antele Antonio', 'Lizeth', 'Lizbeth'] }),
  ]);

  const duplicatesRemoved = duplicateCounts.reduce((sum, count) => sum + count, 0);

  const removedDemoEmails = [
    'demo.panelweb@nexara.com.mx',
    'demo.paneltienda@nexara.com.mx',
    'demo.panelinterno@nexara.com.mx',
    'sistemas@nexara.com.mx',
  ];

  const removedUsers = await prisma.user.deleteMany({
    where: {
      email: { in: removedDemoEmails },
    },
  });

  console.log('Contraseñas asignadas:');
  console.log('Christian Del Pozo (CEO/Gerencia):', passCEO);
  console.log('Adam Del Pozo (Developer):', passDeveloper);
  console.log('Karen Elizalde Sarmiento (COO):', passCOO);
  console.log('Carolina Juarez Alvarez (Ingeniera de Soporte):', passSoporte);
  console.log('Alejandro Gonzales Bustamante (Ingeniero de Sistemas):', passOperaciones);
  console.log('Karina Martinez Flores (Vendedora):', passVendedor);
  console.log('Julio Cesar Rivera Vazquez (IDC/Instalador):', passJulio);
  console.log('David Morales Zenon (IDC/Instalador):', passDavid);
  console.log('Israel Ramos Lima (IDC/Instalador):', passIsrael);
  console.log('Luis Joel Aguilar (Coordinador de Operaciones):', passLuis);
  console.log('Lizbeth Antele Antonio (Administracion):', passLizbeth);
  console.log('Usuarios eliminados por limpieza de seed:', removedUsers.count);
  console.log('Duplicados eliminados por match de identidad:', duplicatesRemoved);
  console.log('Usuarios demo actualizados.');
  console.log('[SEED] ✓ Seed completado exitosamente');
  } catch (error) {
    console.error('[SEED] ❌ Error en seed-demo-users:', error);
    throw error;
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());


