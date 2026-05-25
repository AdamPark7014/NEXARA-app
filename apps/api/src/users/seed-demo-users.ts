import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  ORG_ROLE_KEYS,
  ORG_ROLE_BY_KEY,
  ORG_ROLE_TEMPLATES,
  type OrgRoleFlags,
  type OrgRoleKey,
} from '../common/org-roles';

const prisma = new PrismaClient();

/**
 * Mapa de plantillas ERP a un nombre canónico de Role en BD.
 * Cada usuario demo se asocia a una plantilla y obtiene los flags + nivelAutoridad
 * de la jerarquía corporativa (CEO → Directores → Gerentes → Especialistas → Operativos).
 */
const ORG_ROLE_DB_NAME: Record<OrgRoleKey, string> = {
  [ORG_ROLE_KEYS.CEO]: 'Dueño / CEO',
  [ORG_ROLE_KEYS.DIRECTOR_ADMIN]: 'Director Administrativo',
  [ORG_ROLE_KEYS.DIRECTOR_OPS]: 'Director Operativo',
  [ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL]: 'Director Comercial',
  [ORG_ROLE_KEYS.SALES_MANAGER]: 'Gerente de Ventas',
  [ORG_ROLE_KEYS.SALES_REP]: 'Ejecutivo de Ventas',
  [ORG_ROLE_KEYS.PROJECT_MANAGER]: 'Jefe de Proyectos',
  [ORG_ROLE_KEYS.SENIOR_ENGINEER]: 'Ingeniero Senior',
  [ORG_ROLE_KEYS.FIELD_ENGINEER]: 'Ingeniero de Campo',
  [ORG_ROLE_KEYS.DESIGNER]: 'Diseñador / Marketing',
  [ORG_ROLE_KEYS.ADMIN_STAFF]: 'Personal Administrativo',
  [ORG_ROLE_KEYS.ACCOUNTANT]: 'Contador',
  [ORG_ROLE_KEYS.HR_SPECIALIST]: 'Especialista RRHH',
};

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

const flagsToRolePayload = (key: OrgRoleKey) => {
  const template = ORG_ROLE_BY_KEY[key];
  if (!template) throw new Error(`Plantilla ERP no encontrada: ${key}`);
  return {
    nombre: ORG_ROLE_DB_NAME[key],
    orgRoleKey: key,
    nivelAutoridad: template.nivelAutoridad,
    ...(template.flags as unknown as Partial<OrgRoleFlags>),
  };
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

/**
 * Crea/actualiza un Role por plantilla ERP y devuelve su id.
 * Llave única: nombre (definido en ORG_ROLE_DB_NAME).
 */
const upsertOrgRole = async (key: OrgRoleKey) => {
  const payload = flagsToRolePayload(key);
  return prisma.role.upsert({
    where: { nombre: payload.nombre },
    update: payload,
    create: payload,
  });
};

const seedAllOrgRoleTemplates = async () => {
  console.log('[SEED] Upserting ERP org role templates (jerarquía completa)...');
  for (const template of ORG_ROLE_TEMPLATES) {
    await upsertOrgRole(template.orgRoleKey);
  }
  console.log(`[SEED] ✓ ${ORG_ROLE_TEMPLATES.length} plantillas org ERP`);
};

async function main() {
  try {
    console.log('[SEED] Iniciando seed-demo-users.ts...');
    console.log('[SEED] DATABASE_URL:', process.env.DATABASE_URL || 'NO DEFINIDO');

    await seedAllOrgRoleTemplates();

    // ── Roles ERP referenciados por usuarios demo ────────────────────────
    const roleCEO = await upsertOrgRole(ORG_ROLE_KEYS.CEO);
    const roleDirectorAdmin = await upsertOrgRole(ORG_ROLE_KEYS.DIRECTOR_ADMIN);
    const roleDirectorOps = await upsertOrgRole(ORG_ROLE_KEYS.DIRECTOR_OPS);
    const roleDirectorCommercial = await upsertOrgRole(ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL);
    const roleSalesRep = await upsertOrgRole(ORG_ROLE_KEYS.SALES_REP);
    const roleProjectManager = await upsertOrgRole(ORG_ROLE_KEYS.PROJECT_MANAGER);
    const roleSeniorEngineer = await upsertOrgRole(ORG_ROLE_KEYS.SENIOR_ENGINEER);
    const roleFieldEngineer = await upsertOrgRole(ORG_ROLE_KEYS.FIELD_ENGINEER);

    console.log('[SEED] ✓ Roles ERP referenciados por usuarios demo creados');

    // ── Departamentos corporativos ───────────────────────────────────────
    const departmentDefs = [
      'Dirección General',
      'Ventas',
      'Ingeniería de campo',
      'Administración',
      'Operaciones',
      'Marketing',
    ];

    const departments: Record<string, { id: number }> = {};
    for (const nombre of departmentDefs) {
      const dept = await prisma.department.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      });
      departments[nombre] = dept;
    }
    console.log(`[SEED] ✓ ${departmentDefs.length} departamentos corporativos`);

    // ── Passwords memorizables por jerarquía ─────────────────────────────
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

    console.log('[SEED] Creando/sincronizando usuarios con jerarquía ERP...');

    // ── EJECUTIVO — Dueño / CEO ──────────────────────────────────────────
    const userGerencia = await syncUserByIdentity({
      nombre: 'Christian Del Pozo',
      email: 'gerencia@nexara.com.mx',
      passwordHash: await bcrypt.hash(passCEO, 10),
      roleId: roleCEO.id,
      departmentId: departments['Dirección General'].id,
      nameAliases: ['Christian Del Pozo', 'Christian'],
    });
    console.log(`[SEED] ✓ CEO: ${userGerencia.email} (id=${userGerencia.id})`);

    // Developer mantiene acceso ejecutivo total (superadmin de facto).
    const userDeveloper = await syncUserByIdentity({
      nombre: 'Adam Del Pozo',
      email: 'developer@nexara.com.mx',
      passwordHash: await bcrypt.hash(passDeveloper, 10),
      roleId: roleCEO.id,
      departmentId: departments['Dirección General'].id,
      nameAliases: ['Adam Del Pozo', 'Adam'],
    });
    console.log(`[SEED] ✓ Developer/CEO: ${userDeveloper.email} (id=${userDeveloper.id})`);

    // ── DIRECCIÓN — Administración ──────────────────────────────────────
    const userLizeth = await syncUserByIdentity({
      nombre: 'Lizeth Antele Antonio',
      email: 'administracion@nexara.com.mx',
      passwordHash: await bcrypt.hash(passLizbeth, 10),
      roleId: roleDirectorAdmin.id,
      departmentId: departments['Administración'].id,
      nameAliases: ['Lizeth Antele Antonio', 'Lizbeth Antele Antonio', 'Lizeth', 'Lizbeth'],
    });
    console.log(`[SEED] ✓ Director Admin: ${userLizeth.email} (id=${userLizeth.id})`);

    // ── DIRECCIÓN — Operaciones ─────────────────────────────────────────
    const userLuis = await syncUserByIdentity({
      nombre: 'Luis Joel Aguilar',
      email: 'direccion.operaciones@nexara.com.mx',
      passwordHash: await bcrypt.hash(passLuis, 10),
      roleId: roleDirectorOps.id,
      departmentId: departments['Operaciones'].id,
      nameAliases: ['Luis Joel Aguilar', 'Luis'],
    });
    console.log(`[SEED] ✓ Director Operativo: ${userLuis.email} (id=${userLuis.id})`);

    // ── DIRECCIÓN — Comercial (Karen lidera ventas) ─────────────────────
    const userKaren = await syncUserByIdentity({
      nombre: 'Karen Elizalde Sarmiento',
      email: 'ventas@nexara.com.mx',
      passwordHash: await bcrypt.hash(passCOO, 10),
      roleId: roleDirectorCommercial.id,
      departmentId: departments['Ventas'].id,
      nameAliases: ['Karen Elizalde Sarmiento', 'Karen'],
    });
    console.log(`[SEED] ✓ Director Comercial: ${userKaren.email} (id=${userKaren.id})`);

    // ── JEFE DE PROYECTOS (sistemas/operaciones) ────────────────────────
    const userAlejandro = await syncUserByIdentity({
      nombre: 'Alejandro Gonzales Bustamante',
      email: 'operaciones@nexara.com.mx',
      passwordHash: await bcrypt.hash(passOperaciones, 10),
      roleId: roleProjectManager.id,
      departmentId: departments['Operaciones'].id,
      emailAliases: ['sistemas@nexara.com.mx'],
      nameAliases: ['Alejandro Gonzales Bustamante', 'Alejandro Gonzales', 'Alejandro'],
    });
    console.log(`[SEED] ✓ Jefe Proyectos: ${userAlejandro.email} (id=${userAlejandro.id})`);

    // ── INGENIERO SENIOR (soporte técnico) ──────────────────────────────
    const userCarolina = await syncUserByIdentity({
      nombre: 'Carolina Juarez Alvarez',
      email: 'soporte@nexara.com.mx',
      passwordHash: await bcrypt.hash(passSoporte, 10),
      roleId: roleSeniorEngineer.id,
      departmentId: departments['Ingeniería de campo'].id,
      nameAliases: ['Carolina Juarez Alvarez', 'Carolina'],
    });
    console.log(`[SEED] ✓ Ingeniero Senior: ${userCarolina.email} (id=${userCarolina.id})`);

    // ── EJECUTIVO DE VENTAS ─────────────────────────────────────────────
    const userKarina = await syncUserByIdentity({
      nombre: 'Karina Martinez Flores',
      email: 'vendedor@nexara.com.mx',
      passwordHash: await bcrypt.hash(passVendedor, 10),
      roleId: roleSalesRep.id,
      departmentId: departments['Ventas'].id,
      nameAliases: ['Karina Martinez Flores', 'Karina'],
    });
    console.log(`[SEED] ✓ Ejecutivo Ventas: ${userKarina.email} (id=${userKarina.id})`);

    // ── INGENIEROS DE CAMPO (instaladores IDC) ──────────────────────────
    const userJulio = await syncUserByIdentity({
      nombre: 'Julio Cesar Rivera Vazquez',
      email: 'julio.rivazquez@nexara.com.mx',
      passwordHash: await bcrypt.hash(passJulio, 10),
      roleId: roleFieldEngineer.id,
      departmentId: departments['Ingeniería de campo'].id,
      nameAliases: ['Julio Cesar Rivera Vazquez', 'Julio César Rivera Vázquez', 'Julio'],
    });
    console.log(`[SEED] ✓ Ingeniero Campo: ${userJulio.email} (id=${userJulio.id})`);

    const userDavid = await syncUserByIdentity({
      nombre: 'David Morales Zenon',
      email: 'david.morzenon@nexara.com.mx',
      passwordHash: await bcrypt.hash(passDavid, 10),
      roleId: roleFieldEngineer.id,
      departmentId: departments['Ingeniería de campo'].id,
      nameAliases: ['David Morales Zenon', 'David'],
    });
    console.log(`[SEED] ✓ Ingeniero Campo: ${userDavid.email} (id=${userDavid.id})`);

    const userIsrael = await syncUserByIdentity({
      nombre: 'Israel Ramos Lima',
      email: 'israel.ralima@nexara.com.mx',
      passwordHash: await bcrypt.hash(passIsrael, 10),
      roleId: roleFieldEngineer.id,
      departmentId: departments['Ingeniería de campo'].id,
      nameAliases: ['Israel Ramos Lima', 'Israel'],
    });
    console.log(`[SEED] ✓ Ingeniero Campo: ${userIsrael.email} (id=${userIsrael.id})`);

    // ── Limpieza de duplicados y aliases legacy ─────────────────────────
    console.log('[SEED] Limpiando duplicados de identidad...');
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

    // Limpiar buzones de demo previos
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

    // ── Resumen final con jerarquía visible ─────────────────────────────
    console.log('');
    console.log('═════════════════════════════════════════════════════════════');
    console.log(' Jerarquía ERP — Usuarios demo NEXARA');
    console.log('═════════════════════════════════════════════════════════════');
    console.log(' 🏛️  EJECUTIVO');
    console.log(`   • Christian Del Pozo (CEO):                ${passCEO}`);
    console.log(`   • Adam Del Pozo (Developer/CEO):           ${passDeveloper}`);
    console.log(' 🧭 DIRECCIÓN');
    console.log(`   • Lizeth Antele (Director Admin):          ${passLizbeth}`);
    console.log(`   • Luis Joel Aguilar (Director Ops):        ${passLuis}`);
    console.log(`   • Karen Elizalde (Director Comercial):     ${passCOO}`);
    console.log(' 🧩 MANDOS MEDIOS');
    console.log(`   • Alejandro Gonzales (Jefe Proyectos):     ${passOperaciones}`);
    console.log(' 🔧 ESPECIALISTAS');
    console.log(`   • Carolina Juárez (Ingeniero Senior):      ${passSoporte}`);
    console.log(' 💼 EQUIPO COMERCIAL');
    console.log(`   • Karina Martínez (Ejecutivo Ventas):      ${passVendedor}`);
    console.log(' 🛠️  CAMPO');
    console.log(`   • Julio Rivera (Ingeniero Campo):          ${passJulio}`);
    console.log(`   • David Morales (Ingeniero Campo):         ${passDavid}`);
    console.log(`   • Israel Ramos (Ingeniero Campo):          ${passIsrael}`);
    console.log('═════════════════════════════════════════════════════════════');
    console.log(`Duplicados removidos:        ${duplicatesRemoved}`);
    console.log(`Buzones demo legacy removidos: ${removedUsers.count}`);
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
