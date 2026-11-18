import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROLES } from '../common/rbac/roles.v2.js';

export async function assertRhActor(prisma: PrismaService, sesion: { id: number; isClient?: boolean; isBranchUser?: boolean }, companyId: number, direccion = false) {
  if (sesion?.isClient || sesion?.isBranchUser) throw new ForbiddenException('Solo el personal interno puede acceder a Recursos Humanos.');
  const actor = Number.isSafeInteger(Number(sesion?.id)) && await prisma.user.findFirst({
    where: { id: Number(sesion.id), isActive: true, companyMemberships: { some: { companyId } } },
    select: { id: true, roleKey: true, isActive: true },
  });
  const roles: string[] = direccion ? [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.SUPER_ADMIN] : [ROLES.RH, ROLES.CEO, ROLES.DIR_ADMIN, ROLES.SUPER_ADMIN];
  if (!actor || actor.isActive === false || !roles.includes(String(actor.roleKey))) {
    throw new ForbiddenException(direccion ? 'Solo dirección de esta empresa puede aprobar o rechazar.' : 'Solo RH o dirección de esta empresa pueden acceder.');
  }
  return actor;
}
