import { PrismaClient } from '@prisma/client';
import { ORG_ROLE_TEMPLATES } from '../src/common/org-roles.ts';

const prisma = new PrismaClient();

async function main() {
  for (const template of ORG_ROLE_TEMPLATES) {
    const { orgRoleKey, nombre, nivelAutoridad, flags } = template;
    await prisma.role.upsert({
      where: { nombre },
      update: { orgRoleKey, nivelAutoridad, ...flags },
      create: { nombre, orgRoleKey, nivelAutoridad, ...flags },
    });
  }
  console.log(`${ORG_ROLE_TEMPLATES.length} roles organizacionales ERP upserted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
