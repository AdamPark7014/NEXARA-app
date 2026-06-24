/**
 * Seed de usuarios demo NEXARA — equipo real alineado con organigrama.
 *
 * Crea/actualiza:
 *  - Departamentos (Dirección General, Administración, Operaciones, Ingeniería…)
 *  - Usuarios reales del equipo NEXARA con sus roles
 *  - Password universal demo: "Nexara2026!" (cambiar en producción)
 *
 * Es idempotente: puede correrse N veces sin duplicar nada.
 *
 * Run:
 *   npm run prisma:seed
 */

import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Nexara2026!';
const DEMO_PASSWORD_HASH = bcryptjs.hashSync(DEMO_PASSWORD, 10);

// ORG_ROLE_KEYS inline (sin dependencias externas)
// Mapeados a los roles existentes en la BD
const ORG_ROLE_KEYS = {
  CEO: 'ceo',
  DIRECTOR_ADMIN: 'coord_admin',
  DIRECTOR_OPS: 'coord_operaciones',
  DIRECTOR_COMMERCIAL: 'coord_admin', // fallback
  PROJECT_MANAGER: 'coord_operaciones', // usa coord_operaciones
  SENIOR_ENGINEER: 'arquitecto',
  FIELD_ENGINEER: 'ing_campo',
  SPECIALIST: 'administrativo',
} as const;

type OrgRoleKey = typeof ORG_ROLE_KEYS[keyof typeof ORG_ROLE_KEYS];

type DemoUser = {
  nombre: string;
  email: string;
  orgRoleKey: OrgRoleKey;
  departmentName: string;
  employeeNumber?: string;
};

/**
 * Equipo real de NEXARA (alineado con el organigrama oficial).
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
    // Buscar role por orgRoleKey
    const role = await prisma.role.findUnique({ where: { orgRoleKey: u.orgRoleKey } });
    if (!role) {
      console.warn(`   ⚠️  Rol ${u.orgRoleKey} no existe en DB — se omite ${u.email}`);
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

async function main() {
  await seedDemoUsers();
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
