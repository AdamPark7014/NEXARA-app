/**
 * Seed de usuarios demo NEXARA — equipo oficial (organigrama v1).
 *
 * Crea/actualiza los miembros del equipo con contraseña ÚNICA por usuario.
 * Es idempotente: puede correrse N veces sin duplicar nada.
 *
 * Run:
 *   cd apps/api && npm run prisma:seed
 */

import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

/** Hash placeholder de la migración seed_nexara_team — no permite login. */
const PLACEHOLDER_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p6ez6kxOEfRkNpDlHlOYIi';

/**
 * Obtiene la contraseña desde variables de entorno, evitando literales en el repo.
 * Nombre: SEED_PASSWORD_<EMAIL_SLUG>, p. ej. SEED_PASSWORD_GERENCIA_NEXARA_COM_MX
 * Si falta, devuelve 'x' (login inservible en la práctica) y avisa por consola.
 */
function seedPassword(email: string): string {
  const varName =
    'SEED_PASSWORD_' + email.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  const value = process.env[varName]?.trim();
  if (!value) {
    console.warn(`   ⚠️  Falta ${varName} para ${email} — usando marcador local 'x'`);
    return 'x';
  }
  return value;
}

type DemoUser = {
  nombre: string;
  email: string;
  roleKey: string;
  departmentName: string;
  employeeNumber?: string;
  puesto?: string;
  /** Contraseña en claro (única por usuario). */
  password: string;
};

/**
 * Roster alineado con Excel de credenciales / producción (2026-09).
 * play.review vive en seed-play-reviewer (tenant demo aislado).
 */
const DEMO_USERS: DemoUser[] = [
  {
    nombre: 'Claudia Bernal',
    email: 'claudia.bernal@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-010',
    puesto: 'Tester de plataforma',
    password: seedPassword('claudia.bernal@nexara.com.mx'),
  },
  {
    nombre: 'Christian Eduardo Del Pozo Sánchez',
    email: 'gerencia@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-001',
    puesto: 'Director General',
    password: seedPassword('gerencia@nexara.com.mx'),
  },
  {
    nombre: 'Adam Del Pozo',
    email: 'developer@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-002',
    puesto: 'Developer / Super Admin',
    password: seedPassword('developer@nexara.com.mx'),
  },
  {
    nombre: 'Josué Teodulo Cervantes Arellano',
    email: 'infraestructura@nexara.com.mx',
    roleKey: 'arquitecto',
    departmentName: 'Arquitectura',
    employeeNumber: 'JT90072601',
    puesto: 'Encargado de Obra',
    password: seedPassword('infraestructura@nexara.com.mx'),
  },
  {
    nombre: 'Paulina Tlapaltotoli Álvarez',
    email: 'finanzas@nexara.com.mx',
    roleKey: 'administrativo',
    departmentName: 'Administración',
    employeeNumber: 'PT81062607',
    puesto: 'Contador(a) General',
    password: seedPassword('finanzas@nexara.com.mx'),
  },
  {
    nombre: 'Daniela Galindo Almazán',
    email: 'redes@nexara.com.mx',
    roleKey: 'lider_diseno',
    departmentName: 'Área Creativa',
    employeeNumber: 'DG04082605',
    puesto: 'Diseñadora',
    password: seedPassword('redes@nexara.com.mx'),
  },
  {
    nombre: 'Luis Joel Aguilar Castillo',
    email: 'direccion.operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Operaciones',
    employeeNumber: 'LJ75100126',
    puesto: 'Encargado de servicios',
    password: seedPassword('direccion.operaciones@nexara.com.mx'),
  },
  {
    nombre: 'David Morales Zenón',
    email: 'operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Operaciones',
    employeeNumber: 'DM91030125',
    puesto: 'Encargado de instalación',
    password: seedPassword('operaciones@nexara.com.mx'),
  },
  {
    nombre: 'Iván Camargo Cañete',
    email: 'administracion.ventas@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'IC91052710',
    puesto: 'Técnico Instalador',
    password: seedPassword('administracion.ventas@nexara.com.mx'),
  },
  {
    nombre: 'Joan Sebastián Sánchez Espinoza',
    email: 'joan.sanchez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'JS03052901',
    puesto: 'Técnico Instalador',
    password: seedPassword('joan.sanchez@nexara.com.mx'),
  },
  {
    nombre: 'Carolina Juárez Álvarez',
    email: 'soporte@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Ingeniería',
    employeeNumber: 'CJ26210822',
    puesto: 'Ingeniero de Campo / Técnico de Campo',
    password: seedPassword('soporte@nexara.com.mx'),
  },
  {
    nombre: 'Alejandro González Bustamante',
    email: 'alejandro.gonzalez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'AG78051905',
    puesto: 'Ingeniero de Campo / Técnico de Campo',
    password: seedPassword('alejandro.gonzalez@nexara.com.mx'),
  },
  {
    nombre: 'Israel Ramos Lima',
    email: 'israel.ramos@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'IR93050000',
    puesto: 'Técnico Instalador',
    password: seedPassword('israel.ramos@nexara.com.mx'),
  },
  {
    nombre: 'José Antonio Ramírez Salazar',
    email: 'jose.ramirez@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Ingeniería',
    employeeNumber: 'JA91091706',
    puesto: 'Encargado de soporte',
    password: seedPassword('jose.ramirez@nexara.com.mx'),
  },
  {
    nombre: 'Juan José González Rojas',
    email: 'juan.gonzalez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'JJ00092606',
    puesto: 'Técnico Instalador',
    password: seedPassword('juan.gonzalez@nexara.com.mx'),
  },
  {
    nombre: 'Roberto Paul Vivanco López',
    email: 'roberto.vivanco@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Ingeniería',
    employeeNumber: 'RP95042606',
    puesto: 'Ingeniero de Campo / Técnico de Campo',
    password: seedPassword('roberto.vivanco@nexara.com.mx'),
  },
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

/** Búsqueda por nombre cuando orgRoleKey no coincide (DB team migration vs catálogo legacy). */
const ROLE_NOMBRE_HINTS: Record<string, string[]> = {
  ceo: ['CEO', 'Director General', 'Dueño'],
  coord_admin: ['Coordinador Administrativo', 'Coord. Admin', 'Director Administrativo'],
  administrativo: ['Administrativo', 'Admin Staff', 'Personal Administrativo'],
  lider_diseno: ['Líder de Diseño', 'Lider de Diseno', 'Creativa', 'Diseñador'],
  coord_operaciones: ['Coordinador de Operaciones', 'Jefe de Proyectos', 'Project Manager'],
  ing_campo: ['Ingeniero de Campo', 'Field Engineer'],
  ing_soporte: ['Ingeniero Senior', 'Soporte', 'Senior Engineer'],
  arquitecto: ['Arquitecto'],
};

async function resolvePrimaryCompanyId(): Promise<number> {
  const primary =
    (await prisma.companyProfile.findFirst({ where: { isPrimary: true }, select: { id: true } })) ||
    (await prisma.companyProfile.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }));
  if (!primary) {
    throw new Error('No CompanyProfile found — create a company before seeding users');
  }
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

/** Roles v2 que deben existir para el organigrama (la migración SQL no crea ing_soporte). */
async function ensureV2Roles() {
  const required: { orgRoleKey: string; nombre: string }[] = [
    { orgRoleKey: 'ing_soporte', nombre: 'Ingeniero de Soporte' },
  ];
  for (const r of required) {
    const hit = await prisma.role.findFirst({ where: { orgRoleKey: r.orgRoleKey } });
    if (!hit) {
      await prisma.role.create({ data: { nombre: r.nombre, orgRoleKey: r.orgRoleKey } });
      console.log(`   ✨ Rol ${r.orgRoleKey} creado`);
    }
  }
}

/** Evita P2002 cuando otro usuario ya tiene el mismo employeeNumber en el tenant. */
async function resolveEmployeeNumber(
  email: string,
  companyId: number,
  desired?: string,
  existing?: string | null,
): Promise<string | null | undefined> {
  if (!desired) return existing ?? null;

  const conflict = await prisma.userCompany.findFirst({
    where: {
      companyId,
      employeeNumber: desired,
      user: { NOT: { email } },
    },
    select: { user: { select: { email: true, isActive: true } } },
  });
  if (conflict) {
    if (!conflict.user.isActive) {
      await prisma.userCompany.updateMany({
        where: { companyId, employeeNumber: desired },
        data: { employeeNumber: null },
      });
      console.warn(
        `   ↪ employeeNumber ${desired} liberado de ${conflict.user.email} (cuenta inactiva/legacy)`,
      );
      return desired;
    }
    console.warn(
      `   ⚠️  employeeNumber ${desired} ya asignado a ${conflict.user.email} — se mantiene ${existing ?? 'sin número'} para ${email}`,
    );
    return existing ?? null;
  }

  return desired;
}

async function ensureUserCompany(
  userId: number,
  companyId: number,
  employeeNumber?: string | null,
) {
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

async function resolveRole(v2RoleKey: string) {
  // 1) orgRoleKey = clave v2 (migración seed_nexara_team: coord_admin, ing_campo, …)
  const byV2Org = await prisma.role.findFirst({ where: { orgRoleKey: v2RoleKey } });
  if (byV2Org) return byV2Org;

  // 2) catálogo legacy org-roles (director_admin, field_engineer, …)
  const legacyOrg = ORG_ROLE_KEY_BY_V2[v2RoleKey];
  if (legacyOrg && legacyOrg !== v2RoleKey) {
    const byLegacy = await prisma.role.findFirst({ where: { orgRoleKey: legacyOrg } });
    if (byLegacy) return byLegacy;
  }

  // 3) nombre aproximado
  const hints = ROLE_NOMBRE_HINTS[v2RoleKey] ?? [];
  for (const hint of hints) {
    const byName = await prisma.role.findFirst({
      where: { nombre: { contains: hint, mode: 'insensitive' } },
    });
    if (byName) return byName;
  }

  return null;
}

async function seedDemoUsers() {
  console.log('🌱 [demo-users] Upsert de usuarios demo…');
  await ensureV2Roles();
  const companyId = await resolvePrimaryCompanyId();
  console.log(`   🏢 companyId=${companyId}`);

  // Etiqueta formal del rol CEO (sin "Dueño").
  const ceoRenamed = await prisma.role.updateMany({
    where: {
      OR: [{ orgRoleKey: 'ceo' }, { nombre: { contains: 'Dueño', mode: 'insensitive' } }],
    },
    data: { nombre: 'CEO' },
  });
  if (ceoRenamed.count > 0) {
    console.log(`   ✏️  Rol CEO renombrado (${ceoRenamed.count})`);
  }

  let created = 0;
  let updated = 0;
  let passwordsFixed = 0;

  for (const u of DEMO_USERS) {
    if (!u.password) {
      console.warn(
        `   ⚠️  ${u.email} se omite: falta su contraseña.
` +
          '      La cuenta de revisión de tiendas NO va aquí: vive en su propio
' +
          '      tenant aislado. Usa `npm run seed:play-reviewer`.',
      );
      continue;
    }
    const role = await resolveRole(u.roleKey);
    if (!role) {
      console.warn(`   ⚠️  Rol ${u.roleKey} no existe en DB — se omite ${u.email}`);
      continue;
    }
    const departmentId = await ensureDepartment(u.departmentName, companyId);
    const passwordHash = bcryptjs.hashSync(u.password, 10);

    const existing = await prisma.user.findUnique({
      where: { email: u.email },
      include: { companyMemberships: { where: { companyId }, take: 1 } },
    });
    const needsPasswordFix =
      !existing ||
      existing.passwordHash === PLACEHOLDER_PASSWORD_HASH ||
      !(await bcryptjs.compare(u.password, existing.passwordHash));

    const existingEmp =
      existing?.companyMemberships?.[0]?.employeeNumber ?? existing?.employeeNumber ?? null;
    const employeeNumber = await resolveEmployeeNumber(
      u.email,
      companyId,
      u.employeeNumber,
      existingEmp,
    );

    if (existing) {
      await prisma.user.update({
        where: { email: u.email },
        data: {
          nombre: u.nombre,
          passwordHash,
          roleId: role.id,
          roleKey: u.roleKey,
          departmentId,
          employeeNumber,
          puesto: u.puesto ?? existing.puesto,
          isActive: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await ensureUserCompany(existing.id, companyId, employeeNumber);
      if (needsPasswordFix) passwordsFixed += 1;
      console.log(`   ✏️  ${u.email} actualizado (${u.roleKey})`);
      updated += 1;
    } else {
      const createdUser = await prisma.user.create({
        data: {
          nombre: u.nombre,
          email: u.email,
          passwordHash,
          roleId: role.id,
          roleKey: u.roleKey,
          departmentId,
          employeeNumber: employeeNumber ?? undefined,
          puesto: u.puesto,
          isActive: true,
        },
      });
      await ensureUserCompany(createdUser.id, companyId, employeeNumber);
      console.log(`   ✨ ${u.email} creado (${u.roleKey})`);
      created += 1;
    }
  }

  console.log(`   ✅ ${created} creados · ${updated} actualizados · ${passwordsFixed} passwords corregidos`);
  console.log('   🔑 Contraseñas únicas por usuario (ver Excel / seed DEMO_USERS.password)');
}

async function verifyLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`   ❌ ${email} — no existe en DB`);
    return;
  }
  const ok = await bcryptjs.compare(password, user.passwordHash);
  console.log(`   ${ok ? '✅' : '❌'} ${email} — login ${ok ? 'OK' : 'FALLA'} (roleKey: ${user.roleKey ?? '—'})`);
}

async function main() {
  await seedDemoUsers();
  console.log('\n📊 Verificación de login demo:');
  const samples = [
    'gerencia@nexara.com.mx',
    'finanzas@nexara.com.mx',
    'jose.ramirez@nexara.com.mx',
    'operaciones@nexara.com.mx',
  ];
  for (const email of samples) {
    const u = DEMO_USERS.find((d) => d.email === email);
    if (u) await verifyLogin(u.email, u.password);
  }
}

main()
  .then(() => {
    console.log('\n✨ seed-demo-users completado.');
  })
  .catch((e) => {
    console.error('❌ seed-demo-users falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
