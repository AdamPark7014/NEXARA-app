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
import { ORG_ROLE_TEMPLATES, ORG_ROLE_KEYS, type OrgRoleKey, type OrgRoleTemplate } from '../../src/common/org-roles';

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
 * Equipo NEXARA real + 1 usuario por rol nuevo.
 *
 * Los emails marcados con (real) ya viven en seed-onboarding-demo.ts y se usan
 * para vincular procesos, tickets, viáticos, etc.
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
  // Karen consolida Dirección Comercial + Dirección Administrativa
  // (los poderes de Lizeth se le transfirieron en su totalidad).
  {
    nombre: 'Luis Joel Aguilar',
    email: 'direccion.operaciones@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
    departmentName: 'Operaciones',
    employeeNumber: 'NX-020',
  },
  {
    nombre: 'Karen Elizalde',
    email: 'ventas@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    departmentName: 'Ventas',
    employeeNumber: 'NX-030',
  },

  // ── Mandos medios ─────────────────────────────────────────────────────
  {
    nombre: 'Alejandro Gonzales',
    email: 'operaciones@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER,
    departmentName: 'Operaciones',
    employeeNumber: 'NX-040',
  },
  {
    nombre: 'Mariana Cervantes',
    email: 'gerencia.ventas@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SALES_MANAGER,
    departmentName: 'Ventas',
    employeeNumber: 'NX-041',
  },
  {
    nombre: 'Roberto Salinas',
    email: 'almacen@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
    departmentName: 'Almacén',
    employeeNumber: 'NX-042',
  },
  {
    nombre: 'Sofía Madrigal',
    email: 'mantenimiento@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR,
    departmentName: 'Operaciones',
    employeeNumber: 'NX-043',
  },
  {
    nombre: 'Diego Acosta',
    email: 'noc.lead@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.NOC_LEAD,
    departmentName: 'NOC',
    employeeNumber: 'NX-044',
  },

  // ── Especialistas ─────────────────────────────────────────────────────
  {
    nombre: 'Carolina Juárez',
    email: 'soporte@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-050',
  },
  {
    nombre: 'Paola Reyes',
    email: 'contabilidad@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.ACCOUNTANT,
    departmentName: 'Administración',
    employeeNumber: 'NX-051',
  },
  {
    nombre: 'Daniela Vargas',
    email: 'rh@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.HR_SPECIALIST,
    departmentName: 'Administración',
    employeeNumber: 'NX-052',
  },
  {
    nombre: 'Andrea Cisneros',
    email: 'marketing@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.DESIGNER,
    departmentName: 'Marketing',
    employeeNumber: 'NX-053',
  },
  {
    nombre: 'Héctor Ramírez',
    email: 'compras@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
    departmentName: 'Compras',
    employeeNumber: 'NX-054',
  },
  {
    nombre: 'Mónica Esparza',
    email: 'helpdesk@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SUPPORT_AGENT,
    departmentName: 'Soporte',
    employeeNumber: 'NX-055',
  },

  // ── Operativos ────────────────────────────────────────────────────────
  {
    nombre: 'Karina Martínez',
    email: 'vendedor@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.SALES_REP,
    departmentName: 'Ventas',
    employeeNumber: 'NX-060',
  },
  {
    nombre: 'Julio Rivazquez',
    email: 'julio.rivazquez@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-061',
  },
  {
    nombre: 'David Morzenon',
    email: 'david.morzenon@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-062',
  },
  {
    nombre: 'Israel Ralima',
    email: 'israel.ralima@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    departmentName: 'Ingeniería de campo',
    employeeNumber: 'NX-063',
  },
  {
    nombre: 'Brenda Soto',
    email: 'recepcion@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.ADMIN_STAFF,
    departmentName: 'Administración',
    employeeNumber: 'NX-064',
  },
  {
    nombre: 'Eduardo Quintero',
    email: 'noc.operador@nexara.com.mx',
    orgRoleKey: ORG_ROLE_KEYS.NOC_OPERATOR,
    departmentName: 'NOC',
    employeeNumber: 'NX-065',
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
