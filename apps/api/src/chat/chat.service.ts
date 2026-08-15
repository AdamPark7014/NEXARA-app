import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatChannelKind, ChatMessageKind, Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { getOrgTier, ORG_ROLE_KEYS, ORG_TIER, type OrgRoleKey } from '../common/org-roles.js';
import { isSuperAdminEmail } from '../common/platform-accounts.js';
import { resolveUploadsDir } from '../common/uploads-path.js';
import { assertCompanyAccess, companyWhere, requireCompanyId, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';

type UploadedChatFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const BLOCKED_ATTACHMENT_EXT = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.sh', '.vbs', '.js', '.jar', '.app',
]);

const authorSelect = {
  id: true,
  nombre: true,
  email: true,
} as const;

export type PostMessageInput = {
  body: string;
  parentId?: number | null;
  kind?: ChatMessageKind;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
};

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private async resolveUserCompanyId(userId: number, explicit?: number | null): Promise<number> {
    if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);
    const membership = await this.prisma.userCompany.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      select: { companyId: true },
    });
    return resolveRequiredCompanyId(this.prisma, membership?.companyId ?? null);
  }

  async ensureDefaults(userId: number, companyId?: number | null) {
    const cid = await this.resolveUserCompanyId(userId, companyId);
    // Soft-retire the old DMS channel so Chat is not tied to Documents.
    await this.prisma.chatChannel.updateMany({
      where: { slug: 'documentos', companyId: cid, isArchived: false },
      data: {
        isArchived: true,
        topic: 'Archivado — usar Chat general',
      },
    });

    const defaults = [
      {
        slug: 'general',
        name: 'general',
        topic: 'Conversación del equipo',
        description: 'Canal abierto para toda la organización',
      },
      {
        slug: 'anuncios',
        name: 'anuncios',
        topic: 'Avisos importantes del equipo',
        description: 'Comunicados y novedades',
      },
    ];

    for (const d of defaults) {
      let channel = await this.prisma.chatChannel.findFirst({
        where: { slug: d.slug, companyId: cid },
      });
      if (!channel) {
        channel = await this.prisma.chatChannel.create({
          data: {
            kind: ChatChannelKind.PUBLIC,
            slug: d.slug,
            name: d.name,
            topic: d.topic,
            description: d.description,
            createdById: userId,
            companyId: cid,
          },
        });
      } else {
        channel = await this.prisma.chatChannel.update({
          where: { id: channel.id },
          data: {
            topic: d.topic,
            description: d.description,
            isArchived: false,
          },
        });
      }
      await this.syncOrgChannelMembers(channel.id, cid);
    }
  }

  /** Une a usuarios activos de la empresa al canal org y saca a los inactivos. */
  async syncOrgChannelMembers(channelId: number, companyId?: number) {
    const memberWhere = companyId
      ? { isActive: true, companyMemberships: { some: { companyId } } }
      : { isActive: true };
    const activeUsers = await this.prisma.user.findMany({
      where: memberWhere,
      select: { id: true },
    });
    if (activeUsers.length) {
      await this.prisma.chatChannelMember.createMany({
        data: activeUsers.map((u) => ({
          channelId,
          userId: u.id,
          role: 'member',
        })),
        skipDuplicates: true,
      });
    }
    await this.prisma.chatChannelMember.deleteMany({
      where: {
        channelId,
        user: { isActive: false },
      },
    });
  }

  /** Alta de un usuario nuevo en canales org (#general, #anuncios). */
  async addUserToOrgChannels(userId: number, companyId?: number | null) {
    const cid = await this.resolveUserCompanyId(userId, companyId);
    const channels = await this.prisma.chatChannel.findMany({
      where: { slug: { in: ['general', 'anuncios'] }, companyId: cid, isArchived: false },
      select: { id: true },
    });
    for (const ch of channels) {
      await this.prisma.chatChannelMember.upsert({
        where: { channelId_userId: { channelId: ch.id, userId } },
        create: { channelId: ch.id, userId, role: 'member' },
        update: {},
      });
    }
  }

  /** Baja de chat al desactivar / eliminar usuario. */
  async removeUserMemberships(userId: number) {
    await this.prisma.chatChannelMember.deleteMany({ where: { userId } });
  }

  private room(channelId: number) {
    return `chat:${channelId}`;
  }

  private preview(body: string) {
    const clean = body.replace(/\s+/g, ' ').trim();
    return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
  }

  /**
   * IDs de reportes directos e indirectos (árbol managerId).
   *
   * `User` no tiene `companyId` —la pertenencia va por `UserCompany`— y por eso
   * tampoco entra en el middleware de tenant. Sin acotar por empresa esto
   * cargaba el directorio completo de **todas** las empresas en cada llamada, y
   * un `managerId` que cruzara empresas habría arrastrado subordinados ajenos
   * al alcance del chat.
   */
  private async listDescendantIds(userId: number, companyId: number): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        companyMemberships: { some: { companyId } },
      },
      select: { id: true, managerId: true },
    });
    const byManager = new Map<number, number[]>();
    for (const r of rows) {
      if (r.managerId == null) continue;
      const list = byManager.get(r.managerId) ?? [];
      list.push(r.id);
      byManager.set(r.managerId, list);
    }
    const out: number[] = [];
    const queue = [...(byManager.get(userId) ?? [])];
    const seen = new Set<number>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      for (const child of byManager.get(id) ?? []) queue.push(child);
    }
    return out;
  }

  private async resolveChatScope(userId: number, companyId?: number | null): Promise<{
    isOmniscient: boolean;
    reportIds: number[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        role: { select: { orgRoleKey: true, nivelAutoridad: true } },
      },
    });
    const orgKey = (user?.role?.orgRoleKey as OrgRoleKey | null) ?? null;
    const tier =
      user?.role?.nivelAutoridad ??
      getOrgTier(orgKey, isSuperAdminEmail(user?.email));
    const isOmniscient =
      tier >= ORG_TIER.EXECUTIVE ||
      orgKey === ORG_ROLE_KEYS.CEO ||
      isSuperAdminEmail(user?.email);
    const reportIds = isOmniscient
      ? []
      : await this.listDescendantIds(userId, await this.resolveUserCompanyId(userId, companyId));
    return { isOmniscient, reportIds };
  }

  private async assertChannelAccess(
    channelId: number,
    userId: number,
    opts?: { write?: boolean },
    companyId?: number | null,
  ) {
    const write = Boolean(opts?.write);
    const channel =
      companyId != null
        ? await this.prisma.chatChannel.findFirst({
            where: { id: channelId, ...companyWhere(companyId) },
            include: {
              members: { where: { userId }, take: 1 },
            },
          })
        : await this.prisma.chatChannel.findUnique({
            where: { id: channelId },
            include: {
              members: { where: { userId }, take: 1 },
            },
          });
    if (companyId != null) {
      assertCompanyAccess(channel, companyId, 'Canal');
    }
    if (!channel || channel.isArchived || channel.kind === ChatChannelKind.DOCUMENT) {
      throw new NotFoundException('Canal no encontrado');
    }
    if (channel.kind === ChatChannelKind.PUBLIC) {
      if (!channel.members.length) {
        await this.prisma.chatChannelMember.create({
          data: { channelId, userId, role: 'member' },
        });
      }
      return { channel, supervised: false, readOnly: false };
    }

    const isMember = channel.members.length > 0;
    if (isMember) {
      return { channel, supervised: false, readOnly: false };
    }

    // Supervisión jerárquica: lectura de privadas/DMs del equipo (sin publicar).
    const scope = await this.resolveChatScope(userId, companyId);
    if (scope.isOmniscient) {
      if (write) throw new ForbiddenException('Solo lectura en supervisión');
      return { channel, supervised: true, readOnly: true };
    }
    if (scope.reportIds.length) {
      const teamHit = await this.prisma.chatChannelMember.findFirst({
        where: {
          channelId,
          userId: { in: scope.reportIds },
        },
        select: { id: true },
      });
      if (teamHit) {
        if (write) throw new ForbiddenException('Solo lectura en supervisión');
        return { channel, supervised: true, readOnly: true };
      }
    }

    throw new ForbiddenException('No tienes acceso a este canal');
  }

  async listChannels(userId: number, companyId?: number | null) {
    const cid = await this.resolveUserCompanyId(userId, companyId);
    await this.ensureDefaults(userId, cid);
    const scope = await this.resolveChatScope(userId, cid);

    const where: Prisma.ChatChannelWhereInput = {
      isArchived: false,
      kind: { not: ChatChannelKind.DOCUMENT },
      ...companyWhere(cid),
    };

    if (scope.isOmniscient) {
      // Dueño / CEO: todas las conversaciones
    } else if (scope.reportIds.length) {
      where.OR = [
        { kind: ChatChannelKind.PUBLIC },
        { members: { some: { userId } } },
        { members: { some: { userId: { in: scope.reportIds } } } },
      ];
    } else {
      where.OR = [
        { kind: ChatChannelKind.PUBLIC },
        { members: { some: { userId } } },
      ];
    }

    const channels = await this.prisma.chatChannel.findMany({
      where,
      include: {
        members: {
          where: { user: { isActive: true } },
          include: { user: { select: authorSelect } },
        },
        _count: {
          select: {
            members: { where: { user: { isActive: true } } },
          },
        },
      },
      orderBy: [{ kind: 'asc' }, { lastMessageAt: 'desc' }, { name: 'asc' }],
    });

    const withCounts = await Promise.all(
      channels.map(async (ch) => {
        const membership = ch.members.find((m) => m.userId === userId) ?? null;
        const supervised = !membership && ch.kind !== ChatChannelKind.PUBLIC;
        const since = membership?.lastReadAt ?? membership?.joinedAt ?? null;
        const unreadCount =
          since && !supervised
            ? await this.prisma.chatMessage.count({
                where: {
                  channelId: ch.id,
                  deletedAt: null,
                  parentId: null,
                  authorId: { not: userId },
                  createdAt: { gt: since },
                },
              })
            : 0;

        let displayName = ch.name;
        let peer: { id: number; nombre: string; email: string } | null = null;
        if (ch.kind === ChatChannelKind.DIRECT) {
          if (membership) {
            peer = ch.members.find((m) => m.userId !== userId)?.user ?? null;
            if (peer) displayName = peer.nombre || peer.email;
          } else {
            const others = ch.members.map((m) => m.user).filter(Boolean);
            peer = others[0] ?? null;
            displayName =
              others.map((u) => u.nombre || u.email).filter(Boolean).join(' · ') ||
              ch.name;
          }
        }

        return {
          id: ch.id,
          kind: ch.kind,
          slug: ch.slug,
          name: displayName,
          topic: ch.topic,
          description: ch.description,
          peer,
          memberCount: ch._count.members,
          lastMessageAt: ch.lastMessageAt,
          lastMessagePreview: ch.lastMessagePreview,
          unread: unreadCount > 0,
          unreadCount,
          lastReadAt: membership?.lastReadAt ?? null,
          muted:
            membership?.mutedUntil != null &&
            membership.mutedUntil.getTime() > Date.now(),
          mutedUntil: membership?.mutedUntil ?? null,
          supervised,
          readOnly: supervised,
        };
      }),
    );

    return withCounts.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
  }

  async getChannel(channelId: number, userId: number, companyId?: number | null) {
    const access = await this.assertChannelAccess(channelId, userId, undefined, companyId);
    const channel = access.channel;
    const members = await this.prisma.chatChannelMember.findMany({
      where: { channelId, user: { isActive: true } },
      include: { user: { select: authorSelect } },
      orderBy: { joinedAt: 'asc' },
      take: 200,
    });

    let displayName = channel.name;
    let peer: { id: number; nombre: string; email: string } | null = null;
    if (channel.kind === ChatChannelKind.DIRECT) {
      if (!access.supervised) {
        peer = members.find((m) => m.userId !== userId)?.user ?? null;
        if (peer) displayName = peer.nombre || peer.email;
      } else {
        const others = members.map((m) => m.user).filter(Boolean);
        peer = others[0] ?? null;
        displayName =
          others.map((u) => u.nombre || u.email).filter(Boolean).join(' · ') ||
          channel.name;
      }
    }

    return {
      id: channel.id,
      kind: channel.kind,
      slug: channel.slug,
      name: displayName,
      topic: channel.topic,
      description: channel.description,
      peer,
      lastMessageAt: channel.lastMessageAt,
      memberCount: members.length,
      supervised: access.supervised,
      readOnly: access.readOnly,
      muted:
        !access.supervised &&
        members.some(
          (m) =>
            m.userId === userId &&
            m.mutedUntil != null &&
            m.mutedUntil.getTime() > Date.now(),
        ),
      mutedUntil:
        members.find((m) => m.userId === userId)?.mutedUntil ?? null,
      members: members.map((m) => ({
        id: m.user.id,
        nombre: m.user.nombre,
        email: m.user.email,
        role: m.role,
        lastReadAt: m.lastReadAt,
      })),
    };
  }

  async createChannel(
    userId: number,
    input: { name: string; kind?: 'PUBLIC' | 'PRIVATE'; topic?: string; description?: string },
    companyId?: number | null,
  ) {
    const cid = await this.resolveUserCompanyId(userId, companyId);
    const name = input.name?.trim();
    if (!name || name.length < 2) throw new BadRequestException('Nombre de canal inválido');
    const kind = input.kind === 'PRIVATE' ? ChatChannelKind.PRIVATE : ChatChannelKind.PUBLIC;
    const slugBase = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    const slug = kind === ChatChannelKind.PUBLIC ? slugBase || `canal-${Date.now()}` : null;

    if (slug) {
      const exists = await this.prisma.chatChannel.findFirst({ where: { slug, companyId: cid } });
      if (exists) throw new BadRequestException('Ya existe un canal con ese nombre');
    }

    const channel = await this.prisma.chatChannel.create({
      data: {
        kind,
        slug,
        name: name.replace(/^#/, ''),
        topic: input.topic?.trim() || null,
        description: input.description?.trim() || null,
        createdById: userId,
        companyId: cid,
        members: {
          create: { userId, role: 'owner' },
        },
      },
    });

    return this.getChannel(channel.id, userId, cid);
  }

  private dmKey(a: number, b: number) {
    return [a, b].sort((x, y) => x - y).join(':');
  }

  async openDirect(userId: number, otherUserId: number, companyId?: number | null) {
    if (userId === otherUserId) throw new BadRequestException('No puedes abrir un DM contigo mismo');
    const cid = await this.resolveUserCompanyId(userId, companyId);
    const other = await this.prisma.user.findFirst({
      where: { id: otherUserId, isActive: true },
      select: authorSelect,
    });
    if (!other) throw new NotFoundException('Usuario no encontrado');

    const key = this.dmKey(userId, otherUserId);
    let channel = await this.prisma.chatChannel.findFirst({ where: { dmKey: key, companyId: cid } });
    if (!channel) {
      channel = await this.prisma.chatChannel.create({
        data: {
          kind: ChatChannelKind.DIRECT,
          dmKey: key,
          name: other.nombre || other.email || `Usuario ${other.id}`,
          topic: 'Mensaje directo',
          createdById: userId,
          companyId: cid,
          members: {
            create: [
              { userId, role: 'member' },
              { userId: otherUserId, role: 'member' },
            ],
          },
        },
      });
    } else {
      await this.prisma.chatChannelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId } },
        create: { channelId: channel.id, userId, role: 'member' },
        update: {},
      });
    }

    // For the current user, surface the other person's name
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authorSelect,
    });
    const display =
      channel.kind === ChatChannelKind.DIRECT
        ? other.nombre || other.email
        : channel.name;

    const detail = await this.getChannel(channel.id, userId, cid);
    return { ...detail, name: display, peer: other, self: me };
  }

  async listMessages(
    channelId: number,
    userId: number,
    opts?: { beforeId?: number; aroundId?: number; limit?: number; parentId?: number | null },
    companyId?: number | null,
  ) {
    await this.assertChannelAccess(channelId, userId, undefined, companyId);
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
    const parentId = opts?.parentId === undefined ? null : opts.parentId;

    const include = {
      author: { select: authorSelect },
      reactions: {
        include: { user: { select: { id: true, nombre: true } } },
      },
      _count: { select: { replies: true } },
    } as const;

    if (opts?.aroundId != null && Number.isFinite(opts.aroundId)) {
      const aroundId = opts.aroundId;
      const half = Math.max(1, Math.floor(limit / 2));
      const baseWhere: Prisma.ChatMessageWhereInput = {
        channelId,
        deletedAt: null,
        parentId,
      };
      const [olderOrEq, newer] = await Promise.all([
        this.prisma.chatMessage.findMany({
          where: { ...baseWhere, id: { lte: aroundId } },
          include,
          orderBy: { id: 'desc' },
          take: half + 1,
        }),
        this.prisma.chatMessage.findMany({
          where: { ...baseWhere, id: { gt: aroundId } },
          include,
          orderBy: { id: 'asc' },
          take: half,
        }),
      ]);
      const rows = [...olderOrEq.reverse(), ...newer];
      return {
        messages: rows.map((m) => this.serializeMessage(m)),
        hasMore: olderOrEq.length === half + 1,
      };
    }

    const where: Prisma.ChatMessageWhereInput = {
      channelId,
      deletedAt: null,
      parentId,
      ...(opts?.beforeId ? { id: { lt: opts.beforeId } } : {}),
    };

    const rows = await this.prisma.chatMessage.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const messages = rows.reverse().map((m) => this.serializeMessage(m));
    return { messages, hasMore: rows.length === limit };
  }

  private serializeMessage(m: {
    id: number;
    channelId: number;
    authorId: number;
    parentId: number | null;
    kind: ChatMessageKind;
    body: string;
    attachmentUrl: string | null;
    attachmentName: string | null;
    pinnedAt?: Date | null;
    editedAt: Date | null;
    createdAt: Date;
    author: { id: number; nombre: string; email: string };
    reactions: Array<{ emoji: string; userId: number; user: { id: number; nombre: string } }>;
    _count?: { replies: number };
  }) {
    const reactionMap = new Map<string, { emoji: string; count: number; userIds: number[] }>();
    for (const r of m.reactions) {
      const cur = reactionMap.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [] };
      cur.count += 1;
      cur.userIds.push(r.userId);
      reactionMap.set(r.emoji, cur);
    }
    return {
      id: m.id,
      channelId: m.channelId,
      authorId: m.authorId,
      parentId: m.parentId,
      kind: m.kind,
      body: m.body,
      attachmentUrl: m.attachmentUrl,
      attachmentName: m.attachmentName,
      pinnedAt: m.pinnedAt ?? null,
      editedAt: m.editedAt,
      createdAt: m.createdAt,
      author: m.author,
      replyCount: m._count?.replies ?? 0,
      reactions: [...reactionMap.values()],
    };
  }

  async postMessage(
    channelId: number,
    userId: number,
    input: PostMessageInput,
    companyId?: number | null,
  ) {
    const access = await this.assertChannelAccess(channelId, userId, { write: true }, companyId);
    const channel = access.channel;
    const body = (input.body ?? '').trim();
    if (!body && !input.attachmentUrl) {
      throw new BadRequestException('El mensaje no puede estar vacío');
    }
    if (body.length > 8000) throw new BadRequestException('Mensaje demasiado largo');

    let parentId: number | null = input.parentId ?? null;
    if (parentId) {
      const parent = await this.prisma.chatMessage.findFirst({
        where: { id: parentId, channelId, deletedAt: null, parentId: null },
      });
      if (!parent) throw new BadRequestException('Hilo padre no válido');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        channelId,
        authorId: userId,
        parentId,
        kind: input.kind ?? ChatMessageKind.TEXT,
        body: body || (input.attachmentName ? `Archivo: ${input.attachmentName}` : ''),
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentName: input.attachmentName ?? null,
        companyId: channel.companyId,
      },
      include: {
        author: { select: authorSelect },
        reactions: { include: { user: { select: { id: true, nombre: true } } } },
        _count: { select: { replies: true } },
      },
    });

    if (!parentId) {
      await this.prisma.chatChannel.update({
        where: { id: channelId },
        data: {
          lastMessageAt: message.createdAt,
          lastMessagePreview: this.preview(message.body),
        },
      });
    }

    await this.prisma.chatChannelMember.updateMany({
      where: { channelId, userId },
      data: { lastReadAt: new Date() },
    });

    const payload = this.serializeMessage(message);
    this.realtime.emitToRoom(this.room(channelId), 'chat:message', payload);
    // Also nudge members who aren't in the room yet
    const members = await this.prisma.chatChannelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'chat:channel-activity', {
        channelId,
        preview: this.preview(message.body),
        at: message.createdAt,
        kind: channel.kind,
      });
    }

    void this.notifyUserMentions({
      body: message.body,
      channelId,
      channelName: channel.name,
      messageId: message.id,
      authorId: userId,
      authorName: message.author?.nombre ?? 'Alguien',
    }).catch(() => undefined);

    return payload;
  }

  /** Notifica a usuarios mencionados con tokens `[@nombre](user:id)`. */
  private async notifyUserMentions(opts: {
    body: string;
    channelId: number;
    channelName: string;
    messageId: number;
    authorId: number;
    authorName: string;
  }) {
    const ids = new Set<number>();
    const re = /\]\(user:(\d+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(opts.body))) {
      const id = Number(match[1]);
      if (Number.isFinite(id) && id > 0 && id !== opts.authorId) ids.add(id);
    }
    if (ids.size === 0) return;

    const preview = this.preview(opts.body).slice(0, 140);
    await Promise.all(
      [...ids].map((userId) =>
        this.notifications.createNotification({
          userId,
          type: 'CHAT_MENTION',
          category: 'chat',
          title: `${opts.authorName} te mencionó en #${opts.channelName}`,
          message: preview || 'Te mencionaron en el chat',
          triggerUserId: opts.authorId,
          relatedEntityId: opts.messageId,
          entityType: 'chat_message',
          relatedUrl: `/erp/chat?channel=${opts.channelId}&msg=${opts.messageId}`,
          priority: 'normal',
        } as any),
      ),
    );
  }

  async markRead(channelId: number, userId: number, companyId?: number | null) {
    const access = await this.assertChannelAccess(channelId, userId, undefined, companyId);
    if (access.readOnly) return { ok: true };
    await this.prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, role: 'member', lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  async toggleReaction(
    messageId: number,
    userId: number,
    emoji: string,
    companyId?: number | null,
  ) {
    const clean = (emoji ?? '').trim().slice(0, 32);
    if (!clean) throw new BadRequestException('Emoji inválido');

    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        deletedAt: null,
        ...(companyId != null ? companyWhere(companyId) : {}),
      },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (companyId != null) assertCompanyAccess(message, companyId, 'Mensaje');
    await this.assertChannelAccess(message.channelId, userId, { write: true }, companyId);

    const existing = await this.prisma.chatMessageReaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji: clean },
      },
    });

    if (existing) {
      await this.prisma.chatMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.chatMessageReaction.create({
        data: { messageId, userId, emoji: clean },
      });
    }

    const refreshed = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        author: { select: authorSelect },
        reactions: { include: { user: { select: { id: true, nombre: true } } } },
        _count: { select: { replies: true } },
      },
    });
    if (!refreshed) throw new NotFoundException('Mensaje no encontrado');
    const payload = this.serializeMessage(refreshed);
    this.realtime.emitToRoom(this.room(message.channelId), 'chat:message-updated', payload);
    return payload;
  }

  async listColleagues(userId: number, q?: string, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const query = (q ?? '').trim();
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: userId },
        companyMemberships: { some: { companyId: tenantId } },
        ...(query
          ? {
              OR: [
                { nombre: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, nombre: true, email: true },
      orderBy: { nombre: 'asc' },
      take: 40,
    });
  }

  async searchMentionables(
    userId: number,
    q: string,
    kind?: 'USER' | 'ACTIVITY' | 'EVIDENCE',
    companyId?: number | null,
  ) {
    const query = (q ?? '').trim().slice(0, 100);
    const tenantId = requireCompanyId(companyId);
    const scope = await this.resolveChatScope(userId, tenantId);
    const scopedUserIds = [userId, ...scope.reportIds];
    const activityScope: Prisma.ActivityWhereInput = scope.isOmniscient
      ? {}
      : {
          OR: [
            { responsableId: { in: scopedUserIds } },
            { creadoPorId: { in: scopedUserIds } },
          ],
        };

    const [users, activities, evidences] = await Promise.all([
      !kind || kind === 'USER'
        ? this.prisma.user.findMany({
            where: {
              isActive: true,
              companyMemberships: { some: { companyId: tenantId } },
              ...(query
                ? {
                    OR: [
                      { nombre: { contains: query, mode: 'insensitive' as const } },
                      { email: { contains: query, mode: 'insensitive' as const } },
                    ],
                  }
                : {}),
            },
            select: { id: true, nombre: true, email: true },
            orderBy: { nombre: 'asc' },
            take: 20,
          })
        : Promise.resolve([]),
      !kind || kind === 'ACTIVITY'
        ? this.prisma.activity.findMany({
            where: {
              AND: [
                activityScope,
                ...(query
                  ? [
                      {
                        OR: [
                          { anNumber: { contains: query, mode: 'insensitive' as const } },
                          { titulo: { contains: query, mode: 'insensitive' as const } },
                          { estatus: { contains: query, mode: 'insensitive' as const } },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            select: { id: true, anNumber: true, titulo: true, estatus: true },
            orderBy: { fechaAsignacion: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
      !kind || kind === 'EVIDENCE'
        ? this.prisma.evidence.findMany({
            where: {
              actividad: activityScope,
              ...(query
                ? {
                    OR: [
                      { tipoEvidencia: { contains: query, mode: 'insensitive' as const } },
                      { comentarios: { contains: query, mode: 'insensitive' as const } },
                      {
                        actividad: {
                          AND: [
                            activityScope,
                            {
                              OR: [
                                { anNumber: { contains: query, mode: 'insensitive' as const } },
                                { titulo: { contains: query, mode: 'insensitive' as const } },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                  }
                : {}),
            },
            select: {
              id: true,
              tipoEvidencia: true,
              estatus: true,
              actividadId: true,
              actividad: { select: { anNumber: true, titulo: true } },
            },
            orderBy: { subidoEn: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    return [
      ...users.map((u) => ({
        kind: 'USER' as const,
        id: u.id,
        label: u.nombre,
        subtitle: u.email,
      })),
      ...activities.map((a) => ({
        kind: 'ACTIVITY' as const,
        id: a.id,
        label: `${a.anNumber} · ${a.titulo}`,
        subtitle: a.estatus,
        href: `/ops/activities/${a.id}`,
      })),
      ...evidences.map((e) => ({
        kind: 'EVIDENCE' as const,
        id: e.id,
        label: `Evidencia #${e.id} · ${e.tipoEvidencia}`,
        subtitle: `${e.actividad.anNumber} · ${e.actividad.titulo} · ${e.estatus}`,
        href: `/ops/activities/${e.actividadId}/evidences`,
      })),
    ];
  }

  async editMessage(
    messageId: number,
    userId: number,
    body: string,
    companyId?: number | null,
  ) {
    const clean = (body ?? '').trim();
    if (!clean) throw new BadRequestException('El mensaje no puede estar vacío');
    if (clean.length > 8000) throw new BadRequestException('Mensaje demasiado largo');

    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        deletedAt: null,
        ...(companyId != null ? companyWhere(companyId) : {}),
      },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (companyId != null) assertCompanyAccess(message, companyId, 'Mensaje');
    if (message.authorId !== userId) throw new ForbiddenException('Solo puedes editar tus mensajes');
    const editDeadline = message.createdAt.getTime() + 60 * 60 * 1000;
    if (Date.now() > editDeadline) {
      throw new ForbiddenException('Los mensajes solo se pueden editar durante la primera hora');
    }
    await this.assertChannelAccess(message.channelId, userId, { write: true }, companyId);

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: clean, editedAt: new Date() },
      include: {
        author: { select: authorSelect },
        reactions: { include: { user: { select: { id: true, nombre: true } } } },
        _count: { select: { replies: true } },
      },
    });

    if (!updated.parentId) {
      const latest = await this.prisma.chatMessage.findFirst({
        where: { channelId: updated.channelId, deletedAt: null, parentId: null },
        orderBy: { createdAt: 'desc' },
      });
      if (latest?.id === updated.id) {
        await this.prisma.chatChannel.update({
          where: { id: updated.channelId },
          data: { lastMessagePreview: this.preview(clean) },
        });
      }
    }

    const payload = this.serializeMessage(updated);
    this.realtime.emitToRoom(this.room(updated.channelId), 'chat:message-updated', payload);
    return payload;
  }

  async updateTopic(
    channelId: number,
    userId: number,
    topic: string,
    companyId?: number | null,
  ) {
    await this.assertChannelAccess(channelId, userId, { write: true }, companyId);
    const clean = (topic ?? '').trim().slice(0, 500);
    const channel = await this.prisma.chatChannel.update({
      where: { id: channelId },
      data: { topic: clean || null },
    });
    this.realtime.emitToRoom(this.room(channelId), 'chat:channel-updated', {
      id: channelId,
      topic: channel.topic,
    });
    return this.getChannel(channelId, userId, companyId);
  }

  async addMember(
    channelId: number,
    userId: number,
    targetUserId: number,
    companyId?: number | null,
  ) {
    const access = await this.assertChannelAccess(channelId, userId, { write: true }, companyId);
    if (
      access.channel.kind !== ChatChannelKind.PUBLIC &&
      access.channel.kind !== ChatChannelKind.PRIVATE
    ) {
      throw new BadRequestException('Este tipo de conversación no admite invitaciones');
    }
    const tenantId = requireCompanyId(companyId);
    const target = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        isActive: true,
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      create: { channelId, userId: targetUserId, role: 'member' },
      update: {},
    });

    this.realtime.emitToRoom(this.room(channelId), 'chat:members-changed', { channelId });
    this.realtime.emitToUser(targetUserId, 'chat:members-changed', { channelId });
    return this.getChannel(channelId, userId, companyId);
  }

  async leaveChannel(channelId: number, userId: number, companyId?: number | null) {
    const channel =
      companyId != null
        ? await this.prisma.chatChannel.findFirst({
            where: { id: channelId, ...companyWhere(companyId) },
          })
        : await this.prisma.chatChannel.findUnique({ where: { id: channelId } });
    if (companyId != null) assertCompanyAccess(channel, companyId, 'Canal');
    if (!channel) throw new NotFoundException('Canal no encontrado');
    if (channel.kind === ChatChannelKind.DIRECT) {
      throw new BadRequestException('No puedes salir de un mensaje directo');
    }
    if (channel.slug === 'general' || channel.slug === 'anuncios') {
      throw new BadRequestException('No puedes salir de un canal general de la organización');
    }
    await this.prisma.chatChannelMember.deleteMany({ where: { channelId, userId } });
    this.realtime.emitToRoom(this.room(channelId), 'chat:members-changed', { channelId });
    return { ok: true };
  }

  async setChannelMuted(
    channelId: number,
    userId: number,
    muted: boolean,
    companyId?: number | null,
  ) {
    const access = await this.assertChannelAccess(channelId, userId, undefined, companyId);
    if (access.supervised || access.readOnly) {
      throw new ForbiddenException('No puedes silenciar una conversación en solo lectura');
    }
    const mutedUntil = muted ? new Date('2099-12-31T00:00:00.000Z') : null;
    await this.prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, role: 'member', mutedUntil },
      update: { mutedUntil },
    });
    return this.getChannel(channelId, userId, companyId);
  }

  async listPinnedMessages(channelId: number, userId: number, companyId?: number | null) {
    await this.assertChannelAccess(channelId, userId, undefined, companyId);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        pinnedAt: { not: null },
      },
      include: {
        author: { select: authorSelect },
        reactions: { include: { user: { select: { id: true, nombre: true } } } },
        _count: { select: { replies: true } },
      },
      orderBy: { pinnedAt: 'desc' },
      take: 50,
    });
    return { messages: rows.map((m) => this.serializeMessage(m)) };
  }

  async togglePin(messageId: number, userId: number, companyId?: number | null) {
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        deletedAt: null,
        ...(companyId != null ? companyWhere(companyId) : {}),
      },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (companyId != null) assertCompanyAccess(message, companyId, 'Mensaje');
    await this.assertChannelAccess(message.channelId, userId, { write: true }, companyId);

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: message.pinnedAt
        ? { pinnedAt: null, pinnedById: null }
        : { pinnedAt: new Date(), pinnedById: userId },
      include: {
        author: { select: authorSelect },
        reactions: { include: { user: { select: { id: true, nombre: true } } } },
        _count: { select: { replies: true } },
      },
    });

    const payload = this.serializeMessage(updated);
    this.realtime.emitToRoom(this.room(message.channelId), 'chat:message-updated', payload);
    return payload;
  }

  async searchMessages(userId: number, q: string, channelId?: number, companyId?: number | null) {
    const query = (q ?? '').trim();
    if (query.length < 2) return { messages: [] };
    if (channelId) await this.assertChannelAccess(channelId, userId, undefined, companyId);

    const scope = await this.resolveChatScope(userId, companyId);
    const where: Prisma.ChatChannelWhereInput = {
      isArchived: false,
      kind: { not: ChatChannelKind.DOCUMENT },
    };
    if (!scope.isOmniscient) {
      if (scope.reportIds.length) {
        where.OR = [
          { kind: ChatChannelKind.PUBLIC },
          { members: { some: { userId } } },
          { members: { some: { userId: { in: scope.reportIds } } } },
        ];
      } else {
        where.OR = [
          { kind: ChatChannelKind.PUBLIC },
          { members: { some: { userId } } },
        ];
      }
    }

    const accessible = channelId
      ? [{ id: channelId }]
      : await this.prisma.chatChannel.findMany({
          where,
          select: { id: true },
          take: 200,
        });

    const ids = accessible.map((c) => c.id);
    if (!ids.length) return { messages: [] };

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        channelId: { in: ids },
        deletedAt: null,
        body: { contains: query, mode: 'insensitive' },
      },
      include: {
        author: { select: authorSelect },
        channel: { select: { id: true, name: true, kind: true, slug: true } },
        reactions: { include: { user: { select: { id: true, nombre: true } } } },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return {
      messages: rows.map((m) => ({
        ...this.serializeMessage(m),
        channel: m.channel,
      })),
    };
  }

  async saveAttachment(file: UploadedChatFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo vacío o inválido');
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('El archivo excede el límite de 20 MB');
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_ATTACHMENT_EXT.has(ext)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }

    const uploadDir = resolveUploadsDir('chat');
    await fs.mkdir(uploadDir, { recursive: true });

    const safeBase = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase || 'archivo'}`;
    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, file.buffer);

    return {
      url: `/uploads/chat/${filename}`,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
  }
}
