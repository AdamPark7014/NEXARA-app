/**
 * Seed de usuarios demo NEXARA — equipo real + 1 usuario por cada rol nuevo.
 *
 * Crea/actualiza:
 *  - 13 plantillas ORG_ROLE_TEMPLATES (Roles)
 *  - Departamentos (Dirección General, Ventas, Operaciones, Administración…)
 *  - 1 usuario real por cada rol del ERP tech-services
 *  - Password universal demo: "Nexara2026!" (cambiar en producción)
 *
 * Es idempotente: puede correrse N veces sin duplicar nada.
 *
 * Run:
 *   cd apps/api && npx ts-node prisma/seed-demo-users.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ORG_ROLE_TEMPLATES, ORG_ROLE_KEYS, type OrgRoleKey, type OrgRoleTemplate } from '../src/common/org-roles.ts';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Nexara2026!';
const DEMO_PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);

type DemoUser = {
  nombre: string;
  email: string;
  orgRoleKey: OrgRoleKey;
  /** Departamento — si no existe se crea. */
  departmentName: string;
  /** Número de empleado opcional (solo informativo). */
  employeeNumber?: string;
};

/**
 * Equipo real de NEXARA (alineado con el organigrama oficial).
 * Solo usuarios presentes en el organigrama V2 2026.
 */
const DEMO_USERS: DemoUser[] = [
  // ── Dirección General ─────────────────────────────────────────────────
  {
    nombre: 'Christian Eduardo Del Pozo Sánchez',
    email: 'gerencia@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.CEO,
    departmentName: 'Dirección General',
    employeeNumber: 'NX-001',
  },

  // ── Administración ────────────────────────────────────────────────────
  {
    nombre: 'Karen Elizalde Sarmiento',
    email: 'ventas@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    departmentName: 'Administración',
    employeeNumber: 'NX-101',
  },
  {
    nombre: 'Mónica García Guzmán',
    email: 'monica.garcia@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SPECIALIST,
    departmentName: 'Administración',
    employeeNumber: 'NX-102',
  },

  // ── Área Creativa ─────────────────────────────────────────────────────
  {
    nombre: 'Daniela Galindo Almanzán',
    email: 'redes@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SPECIALIST,
    departmentName: 'Área Creativa',
    employeeNumber: 'NX-201',
  },

  // ── Operaciones ───────────────────────────────────────────────────────
  {
    nombre: 'Luis Job Aguilar Castillo',
    email: 'direction.operaciones@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
    departmentName: 'Operaciones',
    employeeNumber: 'NX-301',
  },
  {
    nombre: 'David Morales Zenón',
    email: 'operaciones@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER,
    departmentName: 'Operaciones',
    employeeNumber: 'NX-302',
  },

  // ── Arquitectura e Infraestructura ────────────────────────────────────
  {
    nombre: 'Josué Teodulo Cervantes Abellano',
    email: 'infraestructura@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER,
    departmentName: 'Arquitectura',
    employeeNumber: 'NX-401',
  },

  // ── Ingeniería ────────────────────────────────────────────────────────
  {
    nombre: 'José Juan Tapa Reyes',
    email: 'jose.tapa@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-501',
  },
  {
    nombre: 'Juan Carrillo Carrete',
    email: 'juan.carrillo@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-502',
  },
  {
    nombre: 'Isaías García Bustamante',
    email: 'isaias.garcia@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-503',
  },
  {
    nombre: 'María Sánchez Espinoza',
    email: 'maria.sanchez@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-504',
  },
  {
    nombre: 'Daniela Arévez Álvarez',
    email: 'daniela.arevez@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-505',
  },
  {
    nombre: 'Juana Sierra Gallardo',
    email: 'juana.sierra@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-506',
  },
  {
    nombre: 'María González Bustamante',
    email: 'maria.gonzalez@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-507',
  },
  {
    nombre: 'Melisa Ramos Lima',
    email: 'melisa.ramos@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería',
    employeeNumber: 'NX-508',
  },
];

async function seedRoleTemplates() {
  console.log('🌱 [demo-users] Upsert de plantillas de rol ERP…');
  let count = 0;
  for (const template of ORG_ROLE_TEMPLATES) {
    const { orgRoleKey, nombre, nivelAutoridad, flags } = template;
    await prisma.role.upsert({
      where: { nombre },
      update: { orgRoleKey, nivelAutoridad, ...flags },
      create: { nombre, orgRoleKey, nivelAutoridad, ...flags },
    });
    count += 1;
  }
  console.log(`   ✅ ${count} roles ERP sincronizados.`);
}

async function ensureDepartment(name: string): Promise<number> {
  const existing = await prisma.department.findUnique({ where: { nombre: name } });
  if (existing) return existing.id;
  const created = await prisma.department.create({ data: { nombre: name } });
  return created.id;
}

async function seedDemoUsers() {
  console.log('🌱 [demo-users] Upsert de usuarios demo…');
  let created = 0;
  let updated = 0;

  for (const u of DEMO_USERS) {
    const template = ORG_ROLE_TEMPLATES.find((t: OrgRoleTemplate) => t.orgRoleKey === u.orgRoleKey);
    if (!template) {
      console.warn(`   ⚠️  Sin plantilla para ${u.orgRoleKey} — se omite ${u.email}`);
      continue;
    }
    const role = await prisma.role.findUnique({ where: { nombre: template.nombre } });
    if (!role) {
      console.warn(`   ⚠️  Rol ${template.nombre} no existe en DB — se omite ${u.email}`);
      continue;
    }
    const departmentId = await ensureDepartment(u.departmentName);

    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      await prisma.user.update({
        where: { email: u.email },
        data: {
          nombre: u.nombre,
          roleId: role.id,
          departmentId,
          employeeNumber: u.employeeNumber ?? existing.employeeNumber,
        },
      });
      updated += 1;
    } else {
      await prisma.user.create({
        data: {
          nombre: u.nombre,
          email: u.email,
          passwordHash: DEMO_PASSWORD_HASH,
          roleId: role.id,
          departmentId,
          employeeNumber: u.employeeNumber,
        },
      });
      created += 1;
    }
  }

  console.log(`   ✅ ${created} usuarios creados · ${updated} actualizados`);
  console.log(`   🔑 Password demo: ${DEMO_PASSWORD}`);
}

async function printSummary() {
  console.log('\n📋 Resumen final por rol:');
  for (const template of ORG_ROLE_TEMPLATES) {
    const role = await prisma.role.findUnique({ where: { nombre: template.nombre } });
    if (!role) continue;
    const users = await prisma.user.findMany({
      where: { roleId: role.id },
      select: { nombre: true, email: true },
      orderBy: { id: 'asc' },
    });
    if (users.length === 0) continue;
    const lead = users[0];
    const extra = users.length > 1 ? ` (+${users.length - 1})` : '';
    console.log(
      `   · ${template.label.padEnd(32)} → ${lead.nombre}${extra} <${lead.email}>`,
    );
  }
}

async function main() {
  await seedRoleTemplates();
  await seedDemoUsers();
  await printSummary();
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
