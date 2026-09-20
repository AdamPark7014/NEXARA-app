import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivitiesService } from '../activities/activities.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canPeerRequestTarget } from './peer-org-rank.js';

/**
 * Solicitudes de equipo entre pares.
 * Independiente de `me/activities/:id/rechazar` (esa ruta sigue en 403 para OT del jefe).
 */
export type PeerViewer = { id: number; email?: string | null };

const USER_SELECT = {
  id: true,
  nombre: true,
  email: true,
  avatarUrl: true,
  puesto: true,
  roleKey: true,
} as const;

const DETAIL_INCLUDE = {
  fromUser: { select: USER_SELECT },
  toUser: { select: USER_SELECT },
  activity: { select: { id: true, anNumber: true, titulo: true } },
} as const;

@Injectable()
export class PeerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
  ) {}

  private requireCompany(companyId: number | null): number {
    if (companyId == null) {
      throw new BadRequestException('Se requiere empresa activa');
    }
    return companyId;
  }

  async listMine(viewer: PeerViewer, companyId: number | null) {
    const cid = this.requireCompany(companyId);
    const [sent, received] = await Promise.all([
      this.prisma.activityPeerRequest.findMany({
        where: { fromUserId: viewer.id, companyId: cid },
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.activityPeerRequest.findMany({
        where: { toUserId: viewer.id, companyId: cid },
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { sent, received };
  }

  async create(
    viewer: PeerViewer,
    companyId: number | null,
    body: { toUserId?: number; title?: string; description?: string },
  ) {
    const cid = this.requireCompany(companyId);
    const title = String(body?.title ?? '').trim();
    if (!title) throw new BadRequestException('El título es obligatorio');
    if (title.length > 200) throw new BadRequestException('El título admite máximo 200 caracteres');

    const toUserId = Number(body?.toUserId);
    if (!Number.isFinite(toUserId) || toUserId <= 0) {
      throw new BadRequestException('Destinatario inválido');
    }
    if (toUserId === viewer.id) {
      throw new BadRequestException('No puedes enviarte una solicitud a ti mismo');
    }

    const [fromUser, toUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: viewer.id },
        select: USER_SELECT,
      }),
      this.prisma.user.findUnique({
        where: { id: toUserId },
        select: { ...USER_SELECT, isActive: true },
      }),
    ]);
    if (!fromUser || !toUser || toUser.isActive === false) {
      throw new NotFoundException('No encontramos a esa persona');
    }

    // Destino: mismo rango org o superior (pares/jefes). Subordinados: vía OT normal.
    if (!canPeerRequestTarget(fromUser, toUser)) {
      throw new ForbiddenException(
        'Solo puedes pedir ayuda a alguien de tu mismo rango o superior en la organización',
      );
    }

    return this.prisma.activityPeerRequest.create({
      data: {
        fromUserId: viewer.id,
        toUserId,
        title,
        description: body?.description?.trim() || null,
        companyId: cid,
        status: 'PENDING',
      },
      include: DETAIL_INCLUDE,
    });
  }

  async accept(viewer: PeerViewer, companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const request = await this.prisma.activityPeerRequest.findFirst({
      where: { id, companyId: cid, toUserId: viewer.id, status: 'PENDING' },
      include: DETAIL_INCLUDE,
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o ya resuelta');

    const activity = await this.activities.create(
      {
        titulo: request.title,
        descripcion: request.description ?? undefined,
        responsableId: viewer.id,
        creadoPorId: request.fromUserId,
        assignmentCharge: 'ejecucion',
        coreKind: 'tarea',
        prioridad: 'MEDIA',
      },
      cid,
    );

    const updated = await this.prisma.activityPeerRequest.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED', activityId: activity.id },
      include: DETAIL_INCLUDE,
    });
    return updated;
  }

  async reject(viewer: PeerViewer, companyId: number | null, id: number, reason?: string) {
    const cid = this.requireCompany(companyId);
    const rejectReason = String(reason ?? '').trim();
    if (rejectReason.length < 3) {
      throw new BadRequestException('Indica el motivo del rechazo (mínimo 3 caracteres)');
    }

    const request = await this.prisma.activityPeerRequest.findFirst({
      where: { id, companyId: cid, toUserId: viewer.id, status: 'PENDING' },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada o ya resuelta');

    return this.prisma.activityPeerRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', rejectReason },
      include: DETAIL_INCLUDE,
    });
  }
}
