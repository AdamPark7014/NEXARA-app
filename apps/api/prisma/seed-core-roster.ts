/**
 * Seed Core-only ola1 — roster + jerarquía operativa.
 * Idempotente. Run: npm run prisma:seed --workspace=apps/api
 *
 * Flujo servicios: Luis (coord servicios) → Antonio (puente sistemas)
 * → Carolina / Alejandro (soporte). Christian puede asignar a cualquiera.
 * David: instaladores (Joan, Israel, Juan José) · Tarea/Proyecto/Obra.
 */
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

type AccessMode = 'off' | 'on';
type ModuleAccessMap = Record<string, AccessMode>;

type RosterUser = {
  nombre: string;
  email: string;
  roleKey: string;
  departmentName: string;
  employeeNumber: string;
  puesto: string;
  password: string;
  managerEmail: string | null;
  moduleAccess: ModuleAccessMap;
  isActive: boolean;
};

const FULL_OLA1: ModuleAccessMap = {
  pizarra: 'on',
  asistencias: 'on',
  chat: 'on',
  'activities-daily': 'on',
  'activities-projects': 'on',
  'activities-services': 'on',
};

const DAVID_OLA1: ModuleAccessMap = {
  pizarra: 'on',
  asistencias: 'on',
  chat: 'on',
  'activities-daily': 'on',
  'activities-projects': 'on',
  'activities-services': 'off',
};

const BLANK_OLA1: ModuleAccessMap = {
  pizarra: 'off',
  asistencias: 'off',
  chat: 'off',
  'activities-daily': 'off',
  'activities-projects': 'off',
  'activities-services': 'off',
};

const FIELD_MIN: ModuleAccessMap = {
  pizarra: 'on',
  asistencias: 'on',
  chat: 'on',
  'activities-daily': 'on',
  'activities-projects': 'on',
  'activities-services': 'off',
};

/** Luis: coordina servicios (+ tareas generales). */
const LUIS_OLA1: ModuleAccessMap = {
  pizarra: 'on',
  asistencias: 'on',
  chat: 'on',
  'activities-daily': 'on',
  'activities-projects': 'off',
  'activities-services': 'on',
};

/** Antonio: tarea + proyecto (de Christian) + servicio como puente. */
const ANTONIO_OLA1: ModuleAccessMap = {
  pizarra: 'on',
  asistencias: 'on',
  chat: 'on',
  'activities-daily': 'on',
  'activities-projects': 'on',
  'activities-services': 'on',
};

const SOPORTE_MIN: ModuleAccessMap = {
  pizarra: 'on',
  asistencias: 'on',
  chat: 'on',
  'activities-daily': 'on',
  'activities-projects': 'off',
  'activities-services': 'off',
};

const ACTIVE_ROSTER: RosterUser[] = [
  {
    nombre: 'Christian Eduardo Del Pozo Sánchez',
    email: 'gerencia@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-001',
    puesto: 'Director General',
    password: 'Nexara!NX001',
    managerEmail: null,
    moduleAccess: FULL_OLA1,
    isActive: true,
  },
  {
    nombre: 'Adam Del Pozo',
    email: 'developer@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-002',
    puesto: 'Developer / Super Admin',
    password: 'Nexara!NX002',
    managerEmail: null,
    moduleAccess: FULL_OLA1,
    isActive: true,
  },
  {
    nombre: 'David Morales Zenón',
    email: 'operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Operaciones',
    employeeNumber: 'NX-302',
    puesto: 'Coordinador de Operaciones',
    password: 'Nexara!NX302',
    managerEmail: 'gerencia@nexara.com.mx',
    moduleAccess: DAVID_OLA1,
    isActive: true,
  },
  {
    nombre: 'Luis Joel Aguilar Castillo',
    email: 'direccion.operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Servicios',
    employeeNumber: 'NX-301',
    puesto: 'Coordinador de Servicios',
    password: 'Nexara!NX301',
    managerEmail: 'gerencia@nexara.com.mx',
    moduleAccess: LUIS_OLA1,
    isActive: true,
  },
  {
    nombre: 'José Antonio Ramírez',
    email: 'jose.ramirez@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Sistemas',
    employeeNumber: 'NX-303',
    puesto: 'Líder de Sistemas',
    password: 'Nexara!NX303',
    managerEmail: 'gerencia@nexara.com.mx',
    moduleAccess: ANTONIO_OLA1,
    isActive: true,
  },
  {
    nombre: 'Carolina Juárez Álvarez',
    email: 'soporte@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Sistemas',
    employeeNumber: 'NX-405',
    puesto: 'Ingeniera de Soporte',
    password: 'Nexara!NX405',
    managerEmail: 'jose.ramirez@nexara.com.mx',
    moduleAccess: SOPORTE_MIN,
    isActive: true,
  },
  {
    nombre: 'Alejandro González Bustamante',
    email: 'alejandro.gonzalez@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Sistemas',
    employeeNumber: 'NX-407',
    puesto: 'Ingeniero de Sistemas',
    password: 'Nexara!NX407',
    managerEmail: 'jose.ramirez@nexara.com.mx',
    moduleAccess: SOPORTE_MIN,
    isActive: true,
  },
  {
    nombre: 'Daniela Hernández',
    email: 'daniela.hernandez@nexara.com.mx',
    roleKey: 'administrativo',
    departmentName: 'Administración',
    employeeNumber: 'NX-103',
    puesto: 'Ejecutiva Administrativa',
    password: 'Nexara!NX103',
    managerEmail: 'gerencia@nexara.com.mx',
    moduleAccess: BLANK_OLA1,
    isActive: true,
  },
  {
    nombre: 'Josué Teodulo Cervantes Arellano',
    email: 'infraestructura@nexara.com.mx',
    roleKey: 'arquitecto',
    departmentName: 'Arquitectura',
    employeeNumber: 'NX-003',
    puesto: 'Arquitecto / Director Técnico',
    password: 'Nexara!NX003',
    managerEmail: 'gerencia@nexara.com.mx',
    moduleAccess: BLANK_OLA1,
    isActive: true,
  },
  {
    nombre: 'Mónica García Guzmán',
    email: 'soluciones@nexara.com.mx',
    roleKey: 'administrativo',
    departmentName: 'Administración',
    employeeNumber: 'NX-102',
    puesto: 'Ejecutiva Administrativa',
    password: 'Nexara!NX102',
    managerEmail: 'gerencia@nexara.com.mx',
    moduleAccess: BLANK_OLA1,
    isActive: true,
  },
  {
    nombre: 'Joan Sebastián Sánchez Espinoza',
    email: 'joan.sanchez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-404',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX404',
    managerEmail: 'operaciones@nexara.com.mx',
    moduleAccess: FIELD_MIN,
    isActive: true,
  },
  {
    nombre: 'Israel Ramos Lima',
    email: 'israel.ramos@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-408',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX408',
    managerEmail: 'operaciones@nexara.com.mx',
    moduleAccess: FIELD_MIN,
    isActive: true,
  },
  {
    nombre: 'Juan José González',
    email: 'juan.gonzalez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-409',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX409',
    managerEmail: 'operaciones@nexara.com.mx',
    moduleAccess: FIELD_MIN,
    isActive: true,
  },
];

const DEACTIVATE_EMAILS = [
  'claudia.bernal@nexara.com.mx',
  'ventas@nexara.com.mx',
  'redes@nexara.com.mx',
  'ivan.tapia@nexara.com.mx',
  'administracion.ventas@nexara.com.mx',
  'isaias.garcia@nexara.com.mx',
  'ariadna.sierra@nexara.com.mx',
];

const ORG_ROLE_KEY_BY_V2: Record<string, string> = {
  ceo: 'ceo',
  arquitecto: 'arquitecto',
  coord_admin: 'director_admin',
  administrativo: 'admin_staff',
  lider_diseno: 'designer',
  coord_operaciones: 'project_manager',
  ing_campo: 'field_engineer',
  ing_soporte: 'senior_engineer',
};

async function resolvePrimaryCompanyId(): Promise<number> {
  const primary =
    (await prisma.companyProfile.findFirst({ where: { isPrimary: true }, select: { id: true } })) ||
    (await prisma.companyProfile.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }));
  if (!primary) throw new Error('No CompanyProfile — create company before seeding');
  return primary.id;
}

async function ensureDepartment(name: string, companyId: number): Promise<number> {
  const existing = await prisma.department.findUnique({
    where: { companyId_nombre: { companyId, nombre: name } },
  });
  if (existing) return existing.id;
  const created = await prisma.department.create({ data: { nombre: name, companyId } });
  return created.id;
}

async function ensureV2Roles() {
  const required = [
    { orgRoleKey: 'ing_soporte', nombre: 'Ingeniero de Soporte' },
    { orgRoleKey: 'coord_operaciones', nombre: 'Coordinador de Operaciones' },
  ];
  for (const r of required) {
    const hit = await prisma.role.findFirst({ where: { orgRoleKey: r.orgRoleKey } });
    if (!hit) {
      await prisma.role.create({ data: { nombre: r.nombre, orgRoleKey: r.orgRoleKey } });
    }
  }
}

async function resolveRole(v2RoleKey: string) {
  const byV2 = await prisma.role.findFirst({ where: { orgRoleKey: v2RoleKey } });
  if (byV2) return byV2;
  const legacy = ORG_ROLE_KEY_BY_V2[v2RoleKey];
  if (legacy && legacy !== v2RoleKey) {
    const byLegacy = await prisma.role.findFirst({ where: { orgRoleKey: legacy } });
    if (byLegacy) return byLegacy;
  }
  return null;
}

async function ensureUserCompany(userId: number, companyId: number, employeeNumber?: string | null) {
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: {
      userId,
      companyId,
      isDefault: true,
      employeeNumber: employeeNumber ?? undefined,
    },
    update: {
      ...(employeeNumber != null ? { employeeNumber } : {}),
    },
  });
}

async function seedCoreRoster() {
  console.log('🌱 [core-roster] Upsert roster Core ola1…');
  await ensureV2Roles();
  const companyId = await resolvePrimaryCompanyId();

  const emailToId = new Map<string, number>();

  for (const u of ACTIVE_ROSTER) {
    const role = await resolveRole(u.roleKey);
    if (!role) {
      console.warn(`   ⚠️  Rol ${u.roleKey} ausente — omite ${u.email}`);
      continue;
    }
    const departmentId = await ensureDepartment(u.departmentName, companyId);
    const passwordHash = bcryptjs.hashSync(u.password, 10);
    const existing = await prisma.user.findUnique({ where: { email: u.email } });

    if (existing) {
      await prisma.user.update({
        where: { email: u.email },
        data: {
          nombre: u.nombre,
          passwordHash,
          roleId: role.id,
          roleKey: u.roleKey,
          departmentId,
          employeeNumber: u.employeeNumber,
          puesto: u.puesto,
          isActive: u.isActive,
          moduleAccess: u.moduleAccess,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await ensureUserCompany(existing.id, companyId, u.employeeNumber);
      emailToId.set(u.email, existing.id);
      console.log(`   ✏️  ${u.email}`);
    } else {
      const created = await prisma.user.create({
        data: {
          nombre: u.nombre,
          email: u.email,
          passwordHash,
          roleId: role.id,
          roleKey: u.roleKey,
          departmentId,
          employeeNumber: u.employeeNumber,
          puesto: u.puesto,
          isActive: u.isActive,
          moduleAccess: u.moduleAccess,
        },
      });
      await ensureUserCompany(created.id, companyId, u.employeeNumber);
      emailToId.set(u.email, created.id);
      console.log(`   ✨ ${u.email}`);
    }
  }

  for (const u of ACTIVE_ROSTER) {
    const id = emailToId.get(u.email);
    if (!id) continue;
    const managerId = u.managerEmail ? emailToId.get(u.managerEmail) ?? null : null;
    await prisma.user.update({ where: { id }, data: { managerId } });
  }

  const deactivate = await prisma.user.updateMany({
    where: { email: { in: DEACTIVATE_EMAILS } },
    data: { isActive: false },
  });
  console.log(`   💤 desactivados: ${deactivate.count}`);
  console.log(`   ✅ roster activo: ${ACTIVE_ROSTER.length}`);
}

async function main() {
  await seedCoreRoster();
}

main()
  .then(() => console.log('\n✨ seed-core-roster completado.'))
  .catch((e) => {
    console.error('❌ seed-core-roster falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
