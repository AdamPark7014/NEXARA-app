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
 * Equipo oficial NEXARA — alineado con migration 20260620120000_seed_nexara_team.
 * soporte@nexara.com.mx usa ing_soporte (no ing_campo).
 * Contraseñas: Nexara! + número de empleado (únicas).
 */
const DEMO_USERS: DemoUser[] = [
  {
    nombre: 'Claudia Bernal',
    email: 'claudia.bernal@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-010',
    puesto: 'CEO',
    password: 'Nexara!NX010',
  },
  {
    nombre: 'Christian Eduardo Del Pozo Sánchez',
    email: 'gerencia@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-001',
    puesto: 'Director General',
    password: 'Nexara!NX001',
  },
  {
    nombre: 'Adam Del Pozo',
    email: 'developer@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-002',
    puesto: 'Developer / Super Admin',
    password: 'Nexara!NX002',
  },
  {
    nombre: 'Josué Teodulo Cervantes Arellano',
    email: 'infraestructura@nexara.com.mx',
    roleKey: 'arquitecto',
    departmentName: 'Arquitectura',
    employeeNumber: 'NX-003',
    puesto: 'Arquitecto / Director Técnico',
    password: 'Nexara!NX003',
  },
  {
    nombre: 'Karen Elizalde Sarmiento',
    email: 'ventas@nexara.com.mx',
    roleKey: 'coord_admin',
    departmentName: 'Administración',
    employeeNumber: 'NX-101',
    puesto: 'Coordinadora Administrativa',
    password: 'Nexara!NX101',
  },
  {
    nombre: 'Mónica García Guzmán',
    email: 'soluciones@nexara.com.mx',
    roleKey: 'administrativo',
    departmentName: 'Administración',
    employeeNumber: 'NX-102',
    puesto: 'Ejecutiva Administrativa',
    password: 'Nexara!NX102',
  },
  {
    nombre: 'Daniela Galindo Almazán',
    email: 'redes@nexara.com.mx',
    roleKey: 'lider_diseno',
    departmentName: 'Área Creativa',
    employeeNumber: 'NX-201',
    puesto: 'Líder de Área Creativa',
    password: 'Nexara!NX201',
  },
  {
    nombre: 'Luis Joel Aguilar Castillo',
    email: 'direccion.operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Operaciones',
    employeeNumber: 'NX-301',
    puesto: 'Coordinador de Operaciones',
    password: 'Nexara!NX301',
  },
  {
    nombre: 'David Morales Zenón',
    email: 'operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Operaciones',
    employeeNumber: 'NX-302',
    puesto: 'Coordinador de Operaciones',
    password: 'Nexara!NX302',
  },
  {
    nombre: 'José Iván Tapia Reyes',
    email: 'ivan.tapia@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-401',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX401',
  },
  {
    nombre: 'Iván Camargo Cañete',
    email: 'administracion.ventas@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-402',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX402',
  },
  {
    nombre: 'Isaías García Bustamante',
    email: 'isaias.garcia@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-403',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX403',
  },
  {
    nombre: 'Joan Sebastián Sánchez Espinoza',
    email: 'joan.sanchez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-404',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX404',
  },
  {
    nombre: 'Carolina Juárez Álvarez',
    email: 'soporte@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-405',
    puesto: 'Ingeniera de Soporte',
    password: 'Nexara!NX405',
  },
  {
    nombre: 'Ariadna Sierra Gallardo',
    email: 'ariadna.sierra@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-406',
    puesto: 'Ingeniera de Campo',
    password: 'Nexara!NX406',
  },
  {
    nombre: 'Alejandro González Bustamante',
    email: 'alejandro.gonzalez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-407',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX407',
  },
  {
    nombre: 'Israel Ramos Lima',
    email: 'israel.ramos@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-408',
    puesto: 'Ingeniero de Campo',
    password: 'Nexara!NX408',
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

async function ensureDepartment(name: string): Promise<number> {
  const existing = await prisma.department.findUnique({ where: { nombre: name } });
  if (existing) return existing.id;
  const created = await prisma.department.create({ data: { nombre: name } });
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

/** Evita P2002 cuando otro usuario ya tiene el mismo employeeNumber en producción. */
async function resolveEmployeeNumber(
  email: string,
  desired?: string,
  existing?: string | null,
): Promise<string | null | undefined> {
  if (!desired) return existing ?? null;

  const conflict = await prisma.user.findFirst({
    where: { employeeNumber: desired, NOT: { email } },
    select: { email: true, isActive: true },
  });
  if (conflict) {
    if (!conflict.isActive) {
      await prisma.user.update({
        where: { email: conflict.email },
        data: { employeeNumber: null },
      });
      console.warn(
        `   ↪ employeeNumber ${desired} liberado de ${conflict.email} (cuenta inactiva/legacy)`,
      );
      return desired;
    }
    console.warn(
      `   ⚠️  employeeNumber ${desired} ya asignado a ${conflict.email} — se mantiene ${existing ?? 'sin número'} para ${email}`,
    );
    return existing ?? null;
  }

  return desired;
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
    const role = await resolveRole(u.roleKey);
    if (!role) {
      console.warn(`   ⚠️  Rol ${u.roleKey} no existe en DB — se omite ${u.email}`);
      continue;
    }
    const departmentId = await ensureDepartment(u.departmentName);
    const passwordHash = bcryptjs.hashSync(u.password, 10);

    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    const needsPasswordFix =
      !existing ||
      existing.passwordHash === PLACEHOLDER_PASSWORD_HASH ||
      !(await bcryptjs.compare(u.password, existing.passwordHash));

    const employeeNumber = await resolveEmployeeNumber(
      u.email,
      u.employeeNumber,
      existing?.employeeNumber,
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
        },
      });
      if (needsPasswordFix) passwordsFixed += 1;
      console.log(`   ✏️  ${u.email} actualizado (${u.roleKey})`);
      updated += 1;
    } else {
      await prisma.user.create({
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
    'soporte@nexara.com.mx',
    'gerencia@nexara.com.mx',
    'claudia.bernal@nexara.com.mx',
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
