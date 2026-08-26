const { PrismaClient } = require('@prisma/client');
const bcryptjs = require('bcryptjs');

const prisma = new PrismaClient();
const REVIEWER_EMAIL = (process.env.PLAY_REVIEWER_EMAIL || 'play.review@nexara.com.mx').trim().toLowerCase();
const REVIEWER_NAME = 'Revisor Google Play';
const DEMO_COMPANY_SLUG = 'nexara-demo';
const DEMO_DEPARTMENT = 'Demostración';
const DEMO_EMPLOYEE_NUMBER = 'DEMO-01';
const ROLE_CANDIDATES = ['ceo', 'coord_admin', 'coord_operaciones', 'administrativo'];

async function ensureDemoCompany() {
  const existing = await prisma.companyProfile.findUnique({
    where: { slug: DEMO_COMPANY_SLUG },
    select: { id: true, isPrimary: true, isActive: true },
  });
  if (existing) {
    if (existing.isPrimary) throw new Error('Demo company is primary — abort');
    if (!existing.isActive) {
      await prisma.companyProfile.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return existing.id;
  }
  const created = await prisma.companyProfile.create({
    data: {
      slug: DEMO_COMPANY_SLUG,
      legalName: 'NEXARA Demo (revisión de tiendas)',
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
  return created.id;
}

async function ensureDepartment(companyId) {
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

async function resolveRole() {
  for (const key of ROLE_CANDIDATES) {
    const hit = await prisma.role.findFirst({ where: { orgRoleKey: key }, select: { id: true } });
    if (hit) return { id: hit.id, roleKey: key };
  }
  const fallback = await prisma.role.findFirst({
    where: { NOT: { orgRoleKey: 'super_admin' } },
    orderBy: { id: 'asc' },
    select: { id: true, orgRoleKey: true },
  });
  if (!fallback) throw new Error('No roles in DB');
  return { id: fallback.id, roleKey: fallback.orgRoleKey || 'desconocido' };
}

async function main() {
  const password = process.env.PLAY_REVIEWER_PASSWORD || 'NxDemoReview2026x7';
  const companyId = await ensureDemoCompany();
  const departmentId = await ensureDepartment(companyId);
  const role = await resolveRole();
  const passwordHash = bcryptjs.hashSync(password, 10);
  const existing = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL }, select: { id: true } });
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
    ? await prisma.user.update({ where: { id: existing.id }, data: shared, select: { id: true } })
    : await prisma.user.create({ data: { email: REVIEWER_EMAIL, ...shared }, select: { id: true } });
  await prisma.userCompany.deleteMany({ where: { userId: user.id, NOT: { companyId } } });
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    create: { userId: user.id, companyId, isDefault: true, employeeNumber: DEMO_EMPLOYEE_NUMBER },
    update: { isDefault: true, employeeNumber: DEMO_EMPLOYEE_NUMBER },
  });
  console.log('OK', REVIEWER_EMAIL, user.id);
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
