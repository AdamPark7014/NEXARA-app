/**
 * Seed de usuarios demo NEXARA — equipo oficial (organigrama v1).
 *
 * Crea/actualiza los 16 miembros del equipo con contraseña demo universal.
 * Es idempotente: puede correrse N veces sin duplicar nada.
 *
 * Password demo: Nexara2026!
 *
 * Run:
 *   cd apps/api && npm run prisma:seed
 */

import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Nexara2026!';
const DEMO_PASSWORD_HASH = bcryptjs.hashSync(DEMO_PASSWORD, 10);

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
};

/**
 * Equipo oficial NEXARA — alineado con migration 20260620120000_seed_nexara_team.
 * soporte@nexara.com.mx usa ing_soporte (no ing_campo).
 */
const DEMO_USERS: DemoUser[] = [
  {
    nombre: 'Christian Eduardo Del Pozo Sánchez',
    email: 'gerencia@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-001',
    puesto: 'Director General',
  },
  {
    nombre: 'Adam Del Pozo',
    email: 'developer@nexara.com.mx',
    roleKey: 'ceo',
    departmentName: 'Dirección General',
    employeeNumber: 'NX-002',
    puesto: 'Developer / Super Admin',
  },
  {
    nombre: 'Josué Teodulo Cervantes Arellano',
    email: 'infraestructura@nexara.com.mx',
    roleKey: 'arquitecto',
    departmentName: 'Arquitectura',
    employeeNumber: 'NX-003',
    puesto: 'Arquitecto / Director Técnico',
  },
  {
    nombre: 'Karen Elizalde Sarmiento',
    email: 'ventas@nexara.com.mx',
    roleKey: 'coord_admin',
    departmentName: 'Administración',
    employeeNumber: 'NX-101',
    puesto: 'Coordinadora Administrativa',
  },
  {
    nombre: 'Mónica García Guzmán',
    email: 'soluciones@nexara.com.mx',
    roleKey: 'administrativo',
    departmentName: 'Administración',
    employeeNumber: 'NX-102',
    puesto: 'Ejecutiva Administrativa',
  },
  {
    nombre: 'Daniela Galindo Almazán',
    email: 'redes@nexara.com.mx',
    roleKey: 'lider_diseno',
    departmentName: 'Área Creativa',
    employeeNumber: 'NX-201',
    puesto: 'Líder de Área Creativa',
  },
  {
    nombre: 'Luis Joel Aguilar Castillo',
    email: 'direccion.operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Operaciones',
    employeeNumber: 'NX-301',
    puesto: 'Coordinador de Operaciones',
  },
  {
    nombre: 'David Morales Zenón',
    email: 'operaciones@nexara.com.mx',
    roleKey: 'coord_operaciones',
    departmentName: 'Operaciones',
    employeeNumber: 'NX-302',
    puesto: 'Coordinador de Operaciones',
  },
  {
    nombre: 'José Iván Tapia Reyes',
    email: 'ivan.tapia@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-401',
    puesto: 'Ingeniero de Campo',
  },
  {
    nombre: 'Iván Camargo Cañete',
    email: 'administracion.ventas@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-402',
    puesto: 'Ingeniero de Campo',
  },
  {
    nombre: 'Isaías García Bustamante',
    email: 'isaias.garcia@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-403',
    puesto: 'Ingeniero de Campo',
  },
  {
    nombre: 'Joan Sebastián Sánchez Espinoza',
    email: 'joan.sanchez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-404',
    puesto: 'Ingeniero de Campo',
  },
  {
    nombre: 'Carolina Juárez Álvarez',
    email: 'soporte@nexara.com.mx',
    roleKey: 'ing_soporte',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-405',
    puesto: 'Ingeniera de Soporte',
  },
  {
    nombre: 'Ariadna Sierra Gallardo',
    email: 'ariadna.sierra@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-406',
    puesto: 'Ingeniera de Campo',
  },
  {
    nombre: 'Alejandro González Bustamante',
    email: 'alejandro.gonzalez@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-407',
    puesto: 'Ingeniero de Campo',
  },
  {
    nombre: 'Israel Ramos Lima',
    email: 'israel.ramos@nexara.com.mx',
    roleKey: 'ing_campo',
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-408',
    puesto: 'Ingeniero de Campo',
  },
];

const ORG_ROLE_KEY_BY_V2: Record<string, string> = {
  ceo: 'ceo',
  arquitecto: 'project_manager',
  coord_admin: 'director_admin',
  administrativo: 'admin_staff',
  lider_diseno: 'designer',
  coord_operaciones: 'project_manager',
  ing_campo: 'field_engineer',
  ing_soporte: 'senior_engineer',
};

async function ensureDepartment(name: string): Promise<number> {
  const existing = await prisma.department.findUnique({ where: { nombre: name } });
  if (existing) return existing.id;
  const created = await prisma.department.create({ data: { nombre: name } });
  return created.id;
}

async function resolveRole(v2RoleKey: string) {
  if (v2RoleKey === 'arquitecto') {
    const byName = await prisma.role.findFirst({
      where: { nombre: { contains: 'Arquitecto', mode: 'insensitive' } },
    });
    if (byName) return byName;
  }

  const orgRoleKey = ORG_ROLE_KEY_BY_V2[v2RoleKey] ?? v2RoleKey;
  const byOrg = await prisma.role.findFirst({ where: { orgRoleKey } });
  if (byOrg) return byOrg;

  return null;
}

async function seedDemoUsers() {
  console.log('🌱 [demo-users] Upsert de usuarios demo…');

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

    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    const needsPasswordFix =
      !existing ||
      existing.passwordHash === PLACEHOLDER_PASSWORD_HASH ||
      !(await bcryptjs.compare(DEMO_PASSWORD, existing.passwordHash));

    if (existing) {
      await prisma.user.update({
        where: { email: u.email },
        data: {
          nombre: u.nombre,
          passwordHash: DEMO_PASSWORD_HASH,
          roleId: role.id,
          roleKey: u.roleKey,
          departmentId,
          employeeNumber: u.employeeNumber ?? existing.employeeNumber,
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
          passwordHash: DEMO_PASSWORD_HASH,
          roleId: role.id,
          roleKey: u.roleKey,
          departmentId,
          employeeNumber: u.employeeNumber,
          puesto: u.puesto,
          isActive: true,
        },
      });
      console.log(`   ✨ ${u.email} creado (${u.roleKey})`);
      created += 1;
    }
  }

  console.log(`   ✅ ${created} creados · ${updated} actualizados · ${passwordsFixed} passwords corregidos`);
  console.log(`   🔑 Password demo: ${DEMO_PASSWORD}`);
}

async function verifyLogin(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`   ❌ ${email} — no existe en DB`);
    return;
  }
  const ok = await bcryptjs.compare(DEMO_PASSWORD, user.passwordHash);
  console.log(`   ${ok ? '✅' : '❌'} ${email} — login ${ok ? 'OK' : 'FALLA'} (roleKey: ${user.roleKey ?? '—'})`);
}

async function main() {
  await seedDemoUsers();
  console.log('\n📊 Verificación de login demo:');
  await verifyLogin('soporte@nexara.com.mx');
  await verifyLogin('gerencia@nexara.com.mx');
  await verifyLogin('operaciones@nexara.com.mx');
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
