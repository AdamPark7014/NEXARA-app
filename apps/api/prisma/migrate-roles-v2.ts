/**
 * NEXARA · Migración de Roles legacy → v2
 *
 * Ejecuta:
 *   pnpm --filter @nexara/api exec ts-node prisma/migrate-roles-v2.ts
 *
 * Qué hace:
 *   1. Lee todos los User con su Role asociado (legacy).
 *   2. Determina la roleKey v2 a partir de Role.orgRoleKey / nombre / flags.
 *   3. Escribe User.roleKey.
 *   4. Imprime resumen.
 *
 * NO borra columnas legacy — eso se hace en otra migración tras validar.
 */
import { PrismaClient } from '@prisma/client';
import { LEGACY_TO_V2, ROLES, type RoleKey } from '../src/common/rbac/roles.v2';

const prisma = new PrismaClient();

function resolveV2Role(role: any): RoleKey {
  if (!role) return ROLES.ADMINISTRATIVO;

  // 1) orgRoleKey explícito (preferido)
  if (role.orgRoleKey && LEGACY_TO_V2[role.orgRoleKey]) {
    return LEGACY_TO_V2[role.orgRoleKey];
  }

  // 2) por nombre del rol legacy
  const nombre = (role.nombre ?? '').toLowerCase();
  const byName: Record<string, RoleKey> = {
    superadmin: ROLES.SUPER_ADMIN,
    super_admin: ROLES.SUPER_ADMIN,
    ceo: ROLES.CEO,
    admin: ROLES.DIR_ADMIN,
    administrador: ROLES.DIR_ADMIN,
    director: ROLES.DIR_OPERACIONES,
    coordinador: ROLES.COORD_OPERACIONES,
    ingeniero: ROLES.ING_CAMPO,
    soporte: ROLES.ING_SOPORTE,
    vendedor: ROLES.VENDEDOR,
    sales_rep: ROLES.VENDEDOR,
    rh: ROLES.RH,
    contabilidad: ROLES.CONTABILIDAD,
    disenador: ROLES.DISENADOR,
    diseñador: ROLES.DISENADOR,
    cliente: ROLES.CLIENTE,
  };
  if (byName[nombre]) return byName[nombre];

  // 3) heurística por nivelAutoridad
  const nivel = role.nivelAutoridad ?? 0;
  if (nivel >= 100) return ROLES.CEO;
  if (nivel >= 90) return ROLES.DIR_ADMIN;
  if (nivel >= 70) return ROLES.COORD_ADMIN;

  // 4) flags acceso*
  if (role.accesoConsoleAdmin) return ROLES.DIR_ADMIN;
  if (role.accesoPanelVentas) return ROLES.VENDEDOR;
  if (role.accesoContabilidad) return ROLES.CONTABILIDAD;
  if (role.accesoActividades) return ROLES.ING_CAMPO;

  return ROLES.ADMINISTRATIVO;
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      roleKey: true,
      role: {
        select: {
          nombre: true,
          orgRoleKey: true,
          nivelAutoridad: true,
          accesoConsoleAdmin: true,
          accesoPanelVentas: true,
          accesoContabilidad: true,
          accesoActividades: true,
        },
      },
    },
  });

  const summary: Record<string, number> = {};
  let updated = 0;

  for (const u of users) {
    const newRole = resolveV2Role(u.role);
    summary[newRole] = (summary[newRole] ?? 0) + 1;

    if (u.roleKey === newRole) continue;

    await prisma.user.update({
      where: { id: u.id },
      data: { roleKey: newRole },
    });
    updated++;
    console.log(`✓ ${u.email}  →  ${newRole}`);
  }

  console.log('\n────── Resumen ──────');
  for (const [role, count] of Object.entries(summary).sort()) {
    console.log(`  ${role.padEnd(20)} ${count}`);
  }
  console.log(`\nUsuarios actualizados: ${updated}/${users.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
