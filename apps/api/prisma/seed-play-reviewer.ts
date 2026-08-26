/**
 * Cuenta de revisión para tiendas de aplicaciones (Google Play / App Store).
 *
 * Google exige credenciales de prueba cuando toda la app está detrás de login
 * (Play Console → Contenido de la app → Acceso a la app). Entregar la cuenta de
 * un empleado real expondría datos personales de clientes y colaboradores al
 * revisor, así que esta cuenta vive en su **propio tenant demo**: el aislamiento
 * duro del ADR-0014 la mantiene fuera de los datos de la empresa primaria.
 *
 * Es idempotente — puede correrse N veces.
 *
 * Run:
 *   cd apps/api && npm run seed:play-reviewer
 *
 * Para fijar la contraseña en vez de generarla:
 *   PLAY_REVIEWER_PASSWORD='...' npm run seed:play-reviewer
 */

import { randomInt } from 'crypto';
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

const REVIEWER_EMAIL = (process.env.PLAY_REVIEWER_EMAIL || 'play.review@nexara.com.mx')
  .trim()
  .toLowerCase();
const REVIEWER_NAME = 'Revisor Google Play';
const DEMO_COMPANY_SLUG = 'nexara-demo';
const DEMO_COMPANY_LEGAL_NAME = 'NEXARA Demo (revisión de tiendas)';
const DEMO_DEPARTMENT = 'Demostración';
const DEMO_EMPLOYEE_NUMBER = 'DEMO-01';

/** Roles candidatos, de mayor a menor alcance. Nunca `super_admin`: eso cruza tenants. */
const ROLE_CANDIDATES = ['ceo', 'coord_admin', 'coord_operaciones', 'administrativo'];

/**
 * Contraseña larga y aleatoria. Sin caracteres ambiguos (0/O, 1/l/I) porque un
 * humano la va a teclear en un dispositivo de prueba, y sin símbolos que Play
 * Console pueda mutilar al copiar.
 */
function generatePassword(length = 21): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  // Garantiza al menos un dígito y una mayúscula por si hay validación de fuerza.
  return `Nx${out}7`;
}

async function ensureDemoCompany(): Promise<number> {
  const existing = await prisma.companyProfile.findUnique({
    where: { slug: DEMO_COMPANY_SLUG },
    select: { id: true, isActive: true, isPrimary: true },
  });

  if (existing) {
    if (existing.isPrimary) {
      throw new Error(
        `La empresa ${DEMO_COMPANY_SLUG} está marcada como primaria. Aborto: la cuenta demo no debe vivir en el tenant real.`,
      );
    }
    if (!existing.isActive) {
      await prisma.companyProfile.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    console.log(`   🏢 Tenant demo existente (id=${existing.id})`);
    return existing.id;
  }

  const created = await prisma.companyProfile.create({
    data: {
      slug: DEMO_COMPANY_SLUG,
      legalName: DEMO_COMPANY_LEGAL_NAME,
      tradeName: 'NEXARA Demo',
      rfc: 'XAXX010101000',
      fiscalRegime: 'R601',
      contactEmail: 'gerencia@nexara.com.mx',
      websiteUrl: 'https://nexara.com.mx',
      brandPrimary: '#0ea5e9',
      brandSecondary: '#16a34a',
      isPrimary: false,
      isActive: true,
    },
    select: { id: true },
  });
  console.log(`   ✨ Tenant demo creado (id=${created.id})`);
  return created.id;
}

async function ensureDepartment(companyId: number): Promise<number> {
  const existing = await prisma.department.findUnique({
    where: { companyId_nombre: { companyId, nombre: DEMO_DEPARTMENT } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.department.create({
    data: { nombre: DEMO_DEPARTMENT, companyId },
    select: { id: true },
  });
  return created.id;
}

async function resolveRole(): Promise<{ id: number; roleKey: string }> {
  for (const key of ROLE_CANDIDATES) {
    const hit = await prisma.role.findFirst({
      where: { orgRoleKey: key },
      select: { id: true },
    });
    if (hit) return { id: hit.id, roleKey: key };
  }
  const fallback = await prisma.role.findFirst({
    where: { NOT: { orgRoleKey: 'super_admin' } },
    orderBy: { id: 'asc' },
    select: { id: true, orgRoleKey: true },
  });
  if (!fallback) throw new Error('No hay roles en la base de datos — corre el seed principal primero.');
  return { id: fallback.id, roleKey: fallback.orgRoleKey ?? 'desconocido' };
}

async function seedReviewer() {
  console.log('🌱 [play-reviewer] Provisionando cuenta de revisión…');

  const companyId = await ensureDemoCompany();
  const departmentId = await ensureDepartment(companyId);
  const role = await resolveRole();
  console.log(`   🔑 Rol asignado: ${role.roleKey} (id=${role.id})`);

  const password = process.env.PLAY_REVIEWER_PASSWORD?.trim() || generatePassword();
  const passwordHash = bcryptjs.hashSync(password, 10);

  const existing = await prisma.user.findUnique({
    where: { email: REVIEWER_EMAIL },
    select: { id: true },
  });

  // MFA apagado y candado limpio a propósito: un revisor de Google no puede
  // resolver un TOTP y un bloqueo por intentos fallidos tumba la revisión.
  const shared = {
    nombre: REVIEWER_NAME,
    passwordHash,
    roleId: role.id,
    roleKey: role.roleKey,
    departmentId,
    puesto: 'Cuenta de demostración',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    failedLoginCount: 0,
    lockedUntil: null,
  };

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: shared,
        select: { id: true },
      })
    : await prisma.user.create({
        data: { email: REVIEWER_EMAIL, ...shared },
        select: { id: true },
      });

  console.log(`   ${existing ? '✏️ ' : '✨'} Usuario ${REVIEWER_EMAIL} (id=${user.id})`);

  // La membresía al tenant demo debe ser la ÚNICA. Si un login previo la inscribió
  // en la empresa primaria, se limpia aquí.
  const strays = await prisma.userCompany.deleteMany({
    where: { userId: user.id, NOT: { companyId } },
  });
  if (strays.count > 0) {
    console.log(`   🧹 ${strays.count} membresía(s) ajena(s) eliminada(s)`);
  }

  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    create: {
      userId: user.id,
      companyId,
      isDefault: true,
      employeeNumber: DEMO_EMPLOYEE_NUMBER,
    },
    update: { isDefault: true, employeeNumber: DEMO_EMPLOYEE_NUMBER },
  });

  const ok = await bcryptjs.compare(
    password,
    (await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    })).passwordHash,
  );

  console.log(`\n   ${ok ? '✅' : '❌'} Verificación de login: ${ok ? 'OK' : 'FALLA'}`);
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(' Pegar en Play Console → Contenido de la app → Acceso a la app');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(` Nombre de las credenciales : Cuenta de demostración NEXARA`);
  console.log(` Usuario                    : ${REVIEWER_EMAIL}`);
  console.log(` Contraseña                 : ${password}`);
  console.log('──────────────────────────────────────────────────────────────');
  console.log(' Guarda la contraseña ahora: sólo se muestra en esta corrida.');
  console.log(' Si se pierde, vuelve a correr el seed para generar otra.\n');
}

seedReviewer()
  .then(() => {
    console.log('✨ seed-play-reviewer completado.');
  })
  .catch((e) => {
    console.error('❌ seed-play-reviewer falló:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
