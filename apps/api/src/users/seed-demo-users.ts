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
  [ORG_ROLE_KEYS.WAREHOUSE_MANAGER]: 'Gerente de Almacén',
  [ORG_ROLE_KEYS.PROCUREMENT_OFFICER]: 'Comprador / Procurement',
  [ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR]: 'Coordinador de Mantenimiento',
  [ORG_ROLE_KEYS.SUPPORT_AGENT]: 'Agente de Soporte',
  [ORG_ROLE_KEYS.NOC_LEAD]: 'Líder NOC',
  [ORG_ROLE_KEYS.NOC_OPERATOR]: 'Operador NOC',
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
    // Nota: DIRECTOR_COMMERCIAL sigue existiendo como plantilla en org-roles,
    // pero Karen consolida sus poderes vía DIRECTOR_ADMIN (super-set).
    await upsertOrgRole(ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL);
    const roleSalesRep = await upsertOrgRole(ORG_ROLE_KEYS.SALES_REP);
    const roleProjectManager = await upsertOrgRole(ORG_ROLE_KEYS.PROJECT_MANAGER);
    const roleSeniorEngineer = await upsertOrgRole(ORG_ROLE_KEYS.SENIOR_ENGINEER);
    const roleFieldEngineer = await upsertOrgRole(ORG_ROLE_KEYS.FIELD_ENGINEER);
    // Roles adicionales necesarios para probar los 5 paneles consolidados
    // (ERP, CRM, OPS, STUDIO, LAB) con un demo por rol clave.
    const roleDesigner = await upsertOrgRole(ORG_ROLE_KEYS.DESIGNER);
    const roleAccountant = await upsertOrgRole(ORG_ROLE_KEYS.ACCOUNTANT);
    const roleHrSpecialist = await upsertOrgRole(ORG_ROLE_KEYS.HR_SPECIALIST);
    const roleWarehouseManager = await upsertOrgRole(ORG_ROLE_KEYS.WAREHOUSE_MANAGER);
    const roleMaintenanceCoord = await upsertOrgRole(ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR);
    const roleSupportAgent = await upsertOrgRole(ORG_ROLE_KEYS.SUPPORT_AGENT);
    const roleNocLead = await upsertOrgRole(ORG_ROLE_KEYS.NOC_LEAD);
    const roleAdminStaff = await upsertOrgRole(ORG_ROLE_KEYS.ADMIN_STAFF);

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

    // ── Password uniforme para todos los usuarios demo ───────────────────
    // NOTA: El archivo .js compilado usa 'Nexara2026!' para todos los usuarios.
    // Mantener SINCRONIZADO: cambiar aquí = cambiar en el .js también.
    const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Nexara2026!';
    const demoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    // Variables locales por compatibilidad (todas usan el mismo hash)
    const passCEO = demoPasswordHash;
    const passDeveloper = demoPasswordHash;
    const passCOO = demoPasswordHash;
    const passSoporte = demoPasswordHash;
    const passOperaciones = demoPasswordHash;
    const passVendedor = demoPasswordHash;
    const passJulio = demoPasswordHash;
    const passDavid = demoPasswordHash;
    const passIsrael = demoPasswordHash;
    const passLuis = demoPasswordHash;
    const passDesigner = demoPasswordHash;
    const passAccountant = demoPasswordHash;
    const passHr = demoPasswordHash;
    const passWarehouse = demoPasswordHash;
    const passMaintenance = demoPasswordHash;
    const passSupport = demoPasswordHash;
    const passNoc = demoPasswordHash;
    const passAdminStaff = 'Nexara2026!';

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

    // ── DIRECCIÓN — Karen consolida Comercial + Administración ──────────
    // Se transfieren a Karen todos los poderes que tenía Lizeth (Dir. Admin).
    // Su rol pasa a DIRECTOR_ADMIN (super-set: Admin + Comercial) y
    // hereda el buzón administracion@ como alias para mantener histórico.
    const userKaren = await syncUserByIdentity({
      nombre: 'Karen Elizalde Sarmiento',
      email: 'ventas@nexara.com.mx',
      passwordHash: await bcrypt.hash(passCOO, 10),
      roleId: roleDirectorAdmin.id,
      departmentId: departments['Ventas'].id,
      emailAliases: ['administracion@nexara.com.mx'],
      nameAliases: ['Karen Elizalde Sarmiento', 'Karen'],
    });
    console.log(`[SEED] ✓ Director Admin + Comercial: ${userKaren.email} (id=${userKaren.id})`);

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

    // ── DEMOS DE COBERTURA POR PANEL ────────────────────────────────────
    // Un usuario por rol clave para que el QA visual cubra los 5 paneles
    // consolidados (ERP, CRM, OPS, STUDIO, LAB) con un solo seed.

    // DISEÑADORA → aterriza en STUDIO (sitio público, redes, casos)
    const userDesigner = await syncUserByIdentity({
      nombre: 'Vania Salgado',
      email: 'diseno@nexara.com.mx',
      passwordHash: await bcrypt.hash(passDesigner, 10),
      roleId: roleDesigner.id,
      departmentId: departments['Marketing'].id,
      nameAliases: ['Vania Salgado', 'Vania'],
    });
    console.log(`[SEED] ✓ Diseñadora (STUDIO): ${userDesigner.email}`);

    // CONTADORA → aterriza en ERP (contabilidad, facturación, banca)
    const userAccountant = await syncUserByIdentity({
      nombre: 'Karla Ruiz',
      email: 'contabilidad@nexara.com.mx',
      passwordHash: await bcrypt.hash(passAccountant, 10),
      roleId: roleAccountant.id,
      departmentId: departments['Administración'].id,
      nameAliases: ['Karla Ruiz', 'Karla'],
    });
    console.log(`[SEED] ✓ Contadora (ERP): ${userAccountant.email}`);

    // ESPECIALISTA RH → aterriza en ERP (RH, asistencia, multas)
    const userHr = await syncUserByIdentity({
      nombre: 'Adriana Castro',
      email: 'rh@nexara.com.mx',
      passwordHash: await bcrypt.hash(passHr, 10),
      roleId: roleHrSpecialist.id,
      departmentId: departments['Administración'].id,
      nameAliases: ['Adriana Castro', 'Adriana'],
    });
    console.log(`[SEED] ✓ Especialista RH (ERP): ${userHr.email}`);

    // GERENTE DE ALMACÉN → aterriza en ERP (warehouse, stock, procurement)
    const userWarehouse = await syncUserByIdentity({
      nombre: 'Mario Lozano',
      email: 'almacen@nexara.com.mx',
      passwordHash: await bcrypt.hash(passWarehouse, 10),
      roleId: roleWarehouseManager.id,
      departmentId: departments['Operaciones'].id,
      nameAliases: ['Mario Lozano', 'Mario'],
    });
    console.log(`[SEED] ✓ Gerente Almacén (ERP): ${userWarehouse.email}`);

    // COORD. MANTENIMIENTO → aterriza en OPS (contratos, visitas, SLA)
    const userMaintenance = await syncUserByIdentity({
      nombre: 'Ronaldo Hernández',
      email: 'mantenimiento@nexara.com.mx',
      passwordHash: await bcrypt.hash(passMaintenance, 10),
      roleId: roleMaintenanceCoord.id,
      departmentId: departments['Operaciones'].id,
      nameAliases: ['Ronaldo Hernández', 'Ronaldo Hernandez', 'Ronaldo'],
    });
    console.log(`[SEED] ✓ Coord. Mantenimiento (OPS): ${userMaintenance.email}`);

    // AGENTE DE SOPORTE → aterriza en OPS (bandeja, SLA)
    const userSupportAgent = await syncUserByIdentity({
      nombre: 'Brandon Castillo',
      email: 'soporte.tickets@nexara.com.mx',
      passwordHash: await bcrypt.hash(passSupport, 10),
      roleId: roleSupportAgent.id,
      departmentId: departments['Operaciones'].id,
      nameAliases: ['Brandon Castillo', 'Brandon'],
    });
    console.log(`[SEED] ✓ Agente Soporte (OPS): ${userSupportAgent.email}`);

    // LÍDER NOC → aterriza en OPS (monitoreo de uptime de clientes)
    const userNocLead = await syncUserByIdentity({
      nombre: 'Sandra López',
      email: 'noc@nexara.com.mx',
      passwordHash: await bcrypt.hash(passNoc, 10),
      roleId: roleNocLead.id,
      departmentId: departments['Operaciones'].id,
      nameAliases: ['Sandra López', 'Sandra Lopez', 'Sandra'],
    });
    console.log(`[SEED] ✓ Líder NOC (OPS): ${userNocLead.email}`);

    // PERSONAL ADMINISTRATIVO → aterriza en ERP (documentos, agenda, KB)
    const userAdminStaff = await syncUserByIdentity({
      nombre: 'Eduardo Mendoza',
      email: 'admin.staff@nexara.com.mx',
      passwordHash: await bcrypt.hash(passAdminStaff, 10),
      roleId: roleAdminStaff.id,
      departmentId: departments['Administración'].id,
      nameAliases: ['Eduardo Mendoza', 'Eduardo'],
    });
    console.log(`[SEED] ✓ Personal Admin (ERP): ${userAdminStaff.email}`);

    // ── Limpieza de duplicados y aliases legacy ─────────────────────────
    console.log('[SEED] Limpiando duplicados de identidad...');
    const duplicateCounts = await Promise.all([
      cleanupIdentityDuplicates({ targetUserId: userGerencia.id, email: 'gerencia@nexara.com.mx', nombre: 'Christian Del Pozo', nameAliases: ['Christian Del Pozo', 'Christian'] }),
      cleanupIdentityDuplicates({ targetUserId: userDeveloper.id, email: 'developer@nexara.com.mx', nombre: 'Adam Del Pozo', nameAliases: ['Adam Del Pozo', 'Adam'] }),
      cleanupIdentityDuplicates({ targetUserId: userKaren.id, email: 'ventas@nexara.com.mx', emailAliases: ['administracion@nexara.com.mx'], nombre: 'Karen Elizalde Sarmiento', nameAliases: ['Karen Elizalde Sarmiento', 'Karen', 'Lizeth Antele Antonio', 'Lizbeth Antele Antonio', 'Lizeth', 'Lizbeth'] }),
      cleanupIdentityDuplicates({ targetUserId: userCarolina.id, email: 'soporte@nexara.com.mx', nombre: 'Carolina Juarez Alvarez', nameAliases: ['Carolina Juarez Alvarez', 'Carolina'] }),
      cleanupIdentityDuplicates({ targetUserId: userAlejandro.id, email: 'operaciones@nexara.com.mx', emailAliases: ['sistemas@nexara.com.mx'], nombre: 'Alejandro Gonzales Bustamante', nameAliases: ['Alejandro Gonzales Bustamante', 'Alejandro Gonzales', 'Alejandro'] }),
      cleanupIdentityDuplicates({ targetUserId: userKarina.id, email: 'vendedor@nexara.com.mx', nombre: 'Karina Martinez Flores', nameAliases: ['Karina Martinez Flores', 'Karina'] }),
      cleanupIdentityDuplicates({ targetUserId: userJulio.id, email: 'julio.rivazquez@nexara.com.mx', nombre: 'Julio Cesar Rivera Vazquez', nameAliases: ['Julio Cesar Rivera Vazquez', 'Julio César Rivera Vázquez', 'Julio'] }),
      cleanupIdentityDuplicates({ targetUserId: userDavid.id, email: 'david.morzenon@nexara.com.mx', nombre: 'David Morales Zenon', nameAliases: ['David Morales Zenon', 'David'] }),
      cleanupIdentityDuplicates({ targetUserId: userIsrael.id, email: 'israel.ralima@nexara.com.mx', nombre: 'Israel Ramos Lima', nameAliases: ['Israel Ramos Lima', 'Israel'] }),
      cleanupIdentityDuplicates({ targetUserId: userLuis.id, email: 'direccion.operaciones@nexara.com.mx', nombre: 'Luis Joel Aguilar', nameAliases: ['Luis Joel Aguilar', 'Luis'] }),
      cleanupIdentityDuplicates({ targetUserId: userDesigner.id, email: 'diseno@nexara.com.mx', nombre: 'Vania Salgado', nameAliases: ['Vania Salgado', 'Vania'] }),
      cleanupIdentityDuplicates({ targetUserId: userAccountant.id, email: 'contabilidad@nexara.com.mx', nombre: 'Karla Ruiz', nameAliases: ['Karla Ruiz', 'Karla'] }),
      cleanupIdentityDuplicates({ targetUserId: userHr.id, email: 'rh@nexara.com.mx', nombre: 'Adriana Castro', nameAliases: ['Adriana Castro', 'Adriana'] }),
      cleanupIdentityDuplicates({ targetUserId: userWarehouse.id, email: 'almacen@nexara.com.mx', nombre: 'Mario Lozano', nameAliases: ['Mario Lozano', 'Mario'] }),
      cleanupIdentityDuplicates({ targetUserId: userMaintenance.id, email: 'mantenimiento@nexara.com.mx', nombre: 'Ronaldo Hernández', nameAliases: ['Ronaldo Hernández', 'Ronaldo Hernandez', 'Ronaldo'] }),
      cleanupIdentityDuplicates({ targetUserId: userSupportAgent.id, email: 'soporte.tickets@nexara.com.mx', nombre: 'Brandon Castillo', nameAliases: ['Brandon Castillo', 'Brandon'] }),
      cleanupIdentityDuplicates({ targetUserId: userNocLead.id, email: 'noc@nexara.com.mx', nombre: 'Sandra López', nameAliases: ['Sandra López', 'Sandra Lopez', 'Sandra'] }),
      cleanupIdentityDuplicates({ targetUserId: userAdminStaff.id, email: 'admin.staff@nexara.com.mx', nombre: 'Eduardo Mendoza', nameAliases: ['Eduardo Mendoza', 'Eduardo'] }),
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

    // Defensa adicional: si quedó algún usuario residual de Lizeth/Lizbeth
    // (distinto a Karen, que ya tiene administracion@ como alias), bórralo.
    const removedLizeth = await prisma.user.deleteMany({
      where: {
        id: { not: userKaren.id },
        OR: [
          { email: 'administracion@nexara.com.mx' },
          { nombre: { contains: 'Lizeth', mode: 'insensitive' } },
          { nombre: { contains: 'Lizbeth', mode: 'insensitive' } },
        ],
      },
    });
    if (removedLizeth.count > 0) {
      console.log(`[SEED] 🗑️  Lizeth/Lizbeth residual eliminado: ${removedLizeth.count} registro(s)`);
    }

    // ── Resumen final con jerarquía visible y panel HOME nuevo ──────────
    // Modelo de 5 paneles consolidados (single source of truth = access-matrix.ts):
    //   ⚙️  ERP    → Administración, finanzas, RH, almacén, BI, gobierno
    //   📈 CRM    → Pipeline comercial, cotizaciones, clientes
    //   🚀 OPS    → Campo, NOC, soporte y mantenimiento
    //   🎨 STUDIO → Sitio público, marketing, redes
    //   🧪 LAB    → Sandbox técnico / playground (CEO + Developer)
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════════════════');
    console.log(' Usuarios demo NEXARA — Jerarquía ERP + Panel HOME (5 paneles consolidados)');
    console.log('══════════════════════════════════════════════════════════════════════════════');
    const rows: Array<{ tier: string; name: string; role: string; panel: string; url: string; pass: string }> = [
      { tier: '🏛️  EJECUTIVO',    name: 'Christian Del Pozo',  role: 'CEO',              panel: '⚙️  ERP',    url: '/erp/dashboard',     pass: passCEO },
      { tier: '🏛️  EJECUTIVO',    name: 'Adam Del Pozo',       role: 'Developer/CEO',    panel: '🧪 LAB',     url: '/lab',               pass: passDeveloper },
      { tier: '🧭 DIRECCIÓN',     name: 'Luis Joel Aguilar',   role: 'Director Ops',     panel: '🚀 OPS',     url: '/ops/dashboard',     pass: passLuis },
      { tier: '🧭 DIRECCIÓN',     name: 'Karen Elizalde',      role: 'Director Admin',   panel: '⚙️  ERP',    url: '/erp/dashboard',     pass: passCOO },
      { tier: '🧩 MANDOS MEDIOS', name: 'Alejandro Gonzales',  role: 'Jefe Proyectos',   panel: '🚀 OPS',     url: '/ops/dashboard',     pass: passOperaciones },
      { tier: '🧩 MANDOS MEDIOS', name: 'Mario Lozano',        role: 'Almacén',          panel: '⚙️  ERP',    url: '/erp/warehouse',     pass: passWarehouse },
      { tier: '🧩 MANDOS MEDIOS', name: 'Ronaldo Hernández',   role: 'Mantenimiento',    panel: '🚀 OPS',     url: '/ops/dashboard',     pass: passMaintenance },
      { tier: '🧩 MANDOS MEDIOS', name: 'Sandra López',        role: 'Líder NOC',        panel: '🚀 OPS',     url: '/ops/noc',           pass: passNoc },
      { tier: '🔧 ESPECIALISTAS', name: 'Carolina Juárez',     role: 'Ingeniero Senior', panel: '🚀 OPS',     url: '/ops/dashboard',     pass: passSoporte },
      { tier: '🔧 ESPECIALISTAS', name: 'Karla Ruiz',          role: 'Contadora',        panel: '⚙️  ERP',    url: '/erp/accounting',    pass: passAccountant },
      { tier: '🔧 ESPECIALISTAS', name: 'Adriana Castro',      role: 'RH',               panel: '⚙️  ERP',    url: '/erp/hr',            pass: passHr },
      { tier: '🔧 ESPECIALISTAS', name: 'Brandon Castillo',    role: 'Soporte',          panel: '🚀 OPS',     url: '/ops/support',       pass: passSupport },
      { tier: '🔧 ESPECIALISTAS', name: 'Vania Salgado',       role: 'Diseñadora',       panel: '🎨 STUDIO',  url: '/studio/dashboard',  pass: passDesigner },
      { tier: '💼 EQUIPO COMERCIAL', name: 'Karina Martínez',  role: 'Ejecutivo Ventas', panel: '📈 CRM',     url: '/crm/dashboard',     pass: passVendedor },
      { tier: '🛠️  CAMPO',        name: 'Julio Rivera',        role: 'Ingeniero Campo',  panel: '🚀 OPS',     url: '/ops/my-activities', pass: passJulio },
      { tier: '🛠️  CAMPO',        name: 'David Morales',       role: 'Ingeniero Campo',  panel: '🚀 OPS',     url: '/ops/my-activities', pass: passDavid },
      { tier: '🛠️  CAMPO',        name: 'Israel Ramos',        role: 'Ingeniero Campo',  panel: '🚀 OPS',     url: '/ops/my-activities', pass: passIsrael },
      { tier: '🛠️  ADMIN',        name: 'Eduardo Mendoza',     role: 'Admin Staff',      panel: '⚙️  ERP',    url: '/erp/dashboard',     pass: passAdminStaff },
    ];
    let currentTier = '';
    for (const r of rows) {
      if (r.tier !== currentTier) {
        console.log('');
        console.log(` ${r.tier}`);
        currentTier = r.tier;
      }
      const namePad = r.name.padEnd(22);
      const rolePad = r.role.padEnd(20);
      const panelPad = r.panel.padEnd(12);
      const urlPad = r.url.padEnd(22);
      console.log(`   • ${namePad} ${rolePad} → ${panelPad} ${urlPad} ${r.pass}`);
    }
    console.log('══════════════════════════════════════════════════════════════════════════════');
    console.log(`Duplicados removidos:           ${duplicatesRemoved}`);
    console.log(`Buzones demo legacy removidos:  ${removedUsers.count}`);
    console.log(`Total usuarios demo activos:    ${rows.length}`);
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
