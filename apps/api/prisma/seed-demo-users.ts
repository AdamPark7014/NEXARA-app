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
 * Equipo real de NEXARA (alineado con la sección pública "Nosotros").
 */
const DEMO_USERS: DemoUser[] = [
  // ── Dirección General ─────────────────────────────────────────────────
  {
    nombre: 'Christian Del Pozo',
    email: 'gerencia@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.CEO,
    departmentName: 'Dirección General',
    employeeNumber: 'NX-001',
  },
  {
    nombre: 'Adam Del Pozo',
    email: 'developer@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.CEO, // dev con permisos plenos
    departmentName: 'Dirección General',
    employeeNumber: 'NX-002',
  },

  // ── Direcciones ───────────────────────────────────────────────────────
  {
    nombre: 'Lizeth Antele Antonio',
    email: 'lizeth.antele@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    departmentName: 'Administración',
    employeeNumber: 'NX-030',
  },
  {
    nombre: 'Luis Joel Aguilar',
    email: 'direccion.operaciones@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
    departmentName: 'Operaciones',
    employeeNumber: 'NX-020',
  },
  {
    nombre: 'Karen Elizalde Sarmiento',
    email: 'ventas@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
    departmentName: 'Ventas',
    employeeNumber: 'NX-031',
  },

  // ── Mandos medios y especialistas ─────────────────────────────────────
  {
    nombre: 'Alejandro Gonzales Bustamante',
    email: 'operaciones@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER,
    departmentName: 'Operaciones',
    employeeNumber: 'NX-040',
  },
  {
    nombre: 'Carolina Juarez Alvarez',
    email: 'soporte@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-050',
  },

  // ── Operativos ────────────────────────────────────────────────────────
  {
    nombre: 'Julio Cesar Rivera Vazquez',
    email: 'julio.rivera@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-060',
  },
  {
    nombre: 'David Morales Zenon',
    email: 'david.morales@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-061',
  },
  {
    nombre: 'Israel Ramos Lima',
    email: 'israel.ramos@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-062',
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
