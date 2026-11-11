import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { esDeTodaLaEmpresa, subarbolIds, type Alcanzador } from '../me/equipo-alcance.js';

/**
 * Quién ve una reunión (Adam, 11-11-2026):
 * - Christian (dirección de toda la empresa) ve todas, con minuta y transcripción.
 * - Las que ya existían antes de esta regla (`soloDireccion`) solo las ve dirección.
 * - Las demás: quien estuvo (asistentes y quien la condujo) y, por jerarquía, el jefe de cualquiera
 *   de ellos hacia arriba, aunque el jefe no haya estado.
 */
export type ReunionVisible = {
  soloDireccion: boolean;
  facilitadorId: number | null;
  asistentes: Array<{ userId: number }>;
};

export function veReunion(
  visor: Alcanzador,
  reunion: ReunionVisible,
  usuarios: Array<{ id: number; managerId: number | null }>,
): boolean {
  if (esDeTodaLaEmpresa(visor)) return true;
  if (reunion.soloDireccion) return false;
  const presentes = new Set<number>(reunion.asistentes.map((a) => Number(a.userId)));
  if (reunion.facilitadorId != null) presentes.add(Number(reunion.facilitadorId));
  const visorId = Number(visor.id);
  if (presentes.has(visorId)) return true;
  // El jefe de un presente lo tiene en su organigrama hacia abajo.
  const suGente = subarbolIds(visorId, usuarios);
  for (const id of presentes) if (suGente.has(id)) return true;
  return false;
}

export const SELECT_VISIBILIDAD = {
  soloDireccion: true,
  facilitadorId: true,
  asistentes: { select: { userId: true } },
} as const;

/** Jefe de cada persona, para subir por el organigrama. */
export async function organigrama(prisma: PrismaService) {
  return prisma.user.findMany({ select: { id: true, managerId: true } });
}

export function visorDe(user: any): Alcanzador {
  return {
    id: Number(user?.id),
    email: user?.email ?? null,
    roleKey: user?.roleKey ?? null,
    isSuperAdmin: Boolean(user?.isSuperAdmin || user?.superadmin),
  };
}

/**
 * En toda ruta con `:id` de reunión: si quien pregunta no la puede ver, responde como si no existiera.
 * Las rutas sin `:id` (lista, mis acuerdos, lecciones) filtran en el servicio.
 */
@Injectable()
export class ReunionVisibleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) return true;
    const reunion = await this.prisma.operationalMeeting.findUnique({ where: { id }, select: SELECT_VISIBILIDAD });
    if (!reunion) return true; // el servicio contesta su propio 404
    if (veReunion(visorDe(req.user), reunion, await organigrama(this.prisma))) return true;
    throw new NotFoundException('Reunión no encontrada');
  }
}
