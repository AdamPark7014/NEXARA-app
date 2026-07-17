import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatChannelKind, ChatMessageKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

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
  ) {}

  async ensureDefaults(userId: number) {
    // Soft-retire the old DMS channel so Chat is not tied to Documents.
    await this.prisma.chatChannel.updateMany({
      where: { slug: 'documentos', isArchived: false },
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
      const channel = await this.prisma.chatChannel.upsert({
        where: { slug: d.slug },
        create: {
          kind: ChatChannelKind.PUBLIC,
          slug: d.slug,
          name: d.name,
          topic: d.topic,
          description: d.description,
          createdById: userId,
        },
        update: {
          topic: d.topic,
          description: d.description,
          isArchived: false,
        },
      });
      await this.prisma.chatChannelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId } },
        create: { channelId: channel.id, userId, role: 'member' },
        update: {},
      });
    }
  }

  private room(channelId: number) {
    return `chat:${channelId}`;
  }

  private preview(body: string) {
    const clean = body.replace(/\s+/g, ' ').trim();
    return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
  }

  private async assertChannelAccess(channelId: number, userId: number) {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        members: { where: { userId }, take: 1 },
      },
    });
    if (!channel || channel.isArchived || channel.kind === ChatChannelKind.DOCUMENT) {
      throw new NotFoundException('Canal no encontrado');
    }
    if (channel.kind === ChatChannelKind.PUBLIC) {
      if (!channel.members.length) {
        await this.prisma.chatChannelMember.create({
          data: { channelId, userId, role: 'member' },
        });
      }
      return channel;
    }
    if (!channel.members.length) {
      throw new ForbiddenException('No tienes acceso a este canal');
    }
    return channel;
  }

  async listChannels(userId: number) {
    await this.ensureDefaults(userId);

    const channels = await this.prisma.chatChannel.findMany({
      where: {
        isArchived: false,
        kind: { not: ChatChannelKind.DOCUMENT },
        OR: [
          { kind: ChatChannelKind.PUBLIC },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: {
          include: { user: { select: authorSelect } },
        },
        _count: { select: { members: true } },
      },
      orderBy: [{ kind: 'asc' }, { lastMessageAt: 'desc' }, { name: 'asc' }],
    });

    const withCounts = await Promise.all(
      channels.map(async (ch) => {
        const membership = ch.members.find((m) => m.userId === userId) ?? null;
        const since = membership?.lastReadAt ?? membership?.joinedAt ?? null;
        const unreadCount = since
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
          peer = ch.members.find((m) => m.userId !== userId)?.user ?? null;
          if (peer) displayName = peer.nombre || peer.email;
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
        };
      }),
    );

    return withCounts.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
  }

  async getChannel(channelId: number, userId: number) {
    const channel = await this.assertChannelAccess(channelId, userId);
    const members = await this.prisma.chatChannelMember.findMany({
      where: { channelId },
      include: { user: { select: authorSelect } },
      orderBy: { joinedAt: 'asc' },
      take: 100,
    });

    let displayName = channel.name;
    let peer: { id: number; nombre: string; email: string } | null = null;
    if (channel.kind === ChatChannelKind.DIRECT) {
      peer = members.find((m) => m.userId !== userId)?.user ?? null;
      if (peer) displayName = peer.nombre || peer.email;
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
  ) {
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
      const exists = await this.prisma.chatChannel.findUnique({ where: { slug } });
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
        members: {
          create: { userId, role: 'owner' },
        },
      },
    });

    return this.getChannel(channel.id, userId);
  }

  private dmKey(a: number, b: number) {
    return [a, b].sort((x, y) => x - y).join(':');
  }

  async openDirect(userId: number, otherUserId: number) {
    if (userId === otherUserId) throw new BadRequestException('No puedes abrir un DM contigo mismo');
    const other = await this.prisma.user.findFirst({
      where: { id: otherUserId, isActive: true },
      select: authorSelect,
    });
    if (!other) throw new NotFoundException('Usuario no encontrado');

    const key = this.dmKey(userId, otherUserId);
    let channel = await this.prisma.chatChannel.findUnique({ where: { dmKey: key } });
    if (!channel) {
      channel = await this.prisma.chatChannel.create({
        data: {
          kind: ChatChannelKind.DIRECT,
          dmKey: key,
          name: other.nombre || other.email || `Usuario ${other.id}`,
          topic: 'Mensaje directo',
          createdById: userId,
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

    const detail = await this.getChannel(channel.id, userId);
    return { ...detail, name: display, peer: other, self: me };
  }

  async listMessages(channelId: number, userId: number, opts?: { beforeId?: number; limit?: number; parentId?: number | null }) {
    await this.assertChannelAccess(channelId, userId);
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
    const parentId = opts?.parentId === undefined ? null : opts.parentId;

    const where: Prisma.ChatMessageWhereInput = {
      channelId,
      deletedAt: null,
      parentId,
      ...(opts?.beforeId ? { id: { lt: opts.beforeId } } : {}),
    };

    const rows = await this.prisma.chatMessage.findMany({
      where,
      include: {
        author: { select: authorSelect },
        reactions: {
          include: { user: { select: { id: true, nombre: true } } },
        },
        _count: { select: { replies: true } },
      },
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
      editedAt: m.editedAt,
      createdAt: m.createdAt,
      author: m.author,
      replyCount: m._count?.replies ?? 0,
      reactions: [...reactionMap.values()],
    };
  }

  async postMessage(channelId: number, userId: number, input: PostMessageInput) {
    const channel = await this.assertChannelAccess(channelId, userId);
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

    return payload;
  }

  async markRead(channelId: number, userId: number) {
    await this.assertChannelAccess(channelId, userId);
    await this.prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, role: 'member', lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  async toggleReaction(messageId: number, userId: number, emoji: string) {
    const clean = (emoji ?? '').trim().slice(0, 32);
    if (!clean) throw new BadRequestException('Emoji inválido');

    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    await this.assertChannelAccess(message.channelId, userId);

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

  async listColleagues(userId: number, q?: string) {
    const query = (q ?? '').trim();
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: userId },
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

  async editMessage(messageId: number, userId: number, body: string) {
    const clean = (body ?? '').trim();
    if (!clean) throw new BadRequestException('El mensaje no puede estar vacío');
    if (clean.length > 8000) throw new BadRequestException('Mensaje demasiado largo');

    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (message.authorId !== userId) throw new ForbiddenException('Solo puedes editar tus mensajes');
    await this.assertChannelAccess(message.channelId, userId);

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

  async deleteMessage(messageId: number, userId: number) {
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (message.authorId !== userId) throw new ForbiddenException('Solo puedes eliminar tus mensajes');
    await this.assertChannelAccess(message.channelId, userId);

    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: '' },
    });

    this.realtime.emitToRoom(this.room(message.channelId), 'chat:message-deleted', {
      id: messageId,
      channelId: message.channelId,
      parentId: message.parentId,
    });

    if (!message.parentId) {
      const latest = await this.prisma.chatMessage.findFirst({
        where: { channelId: message.channelId, deletedAt: null, parentId: null },
        orderBy: { createdAt: 'desc' },
      });
      await this.prisma.chatChannel.update({
        where: { id: message.channelId },
        data: {
          lastMessageAt: latest?.createdAt ?? null,
          lastMessagePreview: latest ? this.preview(latest.body) : null,
        },
      });
    }

    return { ok: true, id: messageId };
  }

  async updateTopic(channelId: number, userId: number, topic: string) {
    await this.assertChannelAccess(channelId, userId);
    const clean = (topic ?? '').trim().slice(0, 500);
    const channel = await this.prisma.chatChannel.update({
      where: { id: channelId },
      data: { topic: clean || null },
    });
    this.realtime.emitToRoom(this.room(channelId), 'chat:channel-updated', {
      id: channelId,
      topic: channel.topic,
    });
    return this.getChannel(channelId, userId);
  }

  async searchMessages(userId: number, q: string, channelId?: number) {
    const query = (q ?? '').trim();
    if (query.length < 2) return { messages: [] };
    if (channelId) await this.assertChannelAccess(channelId, userId);

    const accessible = channelId
      ? [{ id: channelId }]
      : await this.prisma.chatChannel.findMany({
          where: {
            isArchived: false,
            kind: { not: ChatChannelKind.DOCUMENT },
            OR: [
              { kind: ChatChannelKind.PUBLIC },
              { members: { some: { userId } } },
            ],
          },
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
}
