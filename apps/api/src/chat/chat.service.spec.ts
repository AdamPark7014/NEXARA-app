import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatChannelKind, ChatMessageKind } from '@prisma/client';
import { ChatService } from './chat.service.js';

describe('ChatService reaction serialization (serializeMessage)', () => {
  const realtime = { emitToRoom: jest.fn() } as any;
  const notifications = {} as any;
  const svc = new ChatService({} as any, realtime, notifications);

  const baseMessage = {
    id: 1,
    channelId: 10,
    authorId: 5,
    parentId: null,
    kind: ChatMessageKind.TEXT,
    body: 'hola',
    attachmentUrl: null,
    attachmentName: null,
    pinnedAt: null,
    editedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    author: { id: 5, nombre: 'Autor', email: 'a@x.com' },
    _count: { replies: 0 },
  };

  function serialize(reactions: any[]) {
    return (svc as any).serializeMessage({ ...baseMessage, reactions });
  }

  beforeEach(() => jest.clearAllMocks());

  it('mantiene count y userIds agregados por emoji (compatibilidad hacia atrás)', () => {
    const result = serialize([
      {
        emoji: '👀',
        userId: 2,
        createdAt: new Date('2026-01-01T10:00:00Z'),
        user: { id: 2, nombre: 'Adam', avatarUrl: null },
      },
      {
        emoji: '👀',
        userId: 3,
        createdAt: new Date('2026-01-01T10:05:00Z'),
        user: { id: 3, nombre: 'Luis', avatarUrl: 'https://x/luis.png' },
      },
    ]);

    expect(result.reactions).toHaveLength(1);
    const reaction = result.reactions[0];
    expect(reaction.emoji).toBe('👀');
    expect(reaction.count).toBe(2);
    expect(reaction.userIds).toEqual([2, 3]);
  });

  it('agrega users[] en el mismo orden recibido (la query ya ordena por createdAt asc → más antiguo primero)', () => {
    const first = new Date('2026-01-01T10:00:00Z');
    const second = new Date('2026-01-01T10:05:00Z');
    const result = serialize([
      { emoji: '👀', userId: 2, createdAt: first, user: { id: 2, nombre: 'Adam', avatarUrl: null } },
      { emoji: '👀', userId: 3, createdAt: second, user: { id: 3, nombre: 'Luis', avatarUrl: null } },
    ]);

    const reaction = result.reactions[0];
    expect(reaction.users.map((u: any) => u.id)).toEqual([2, 3]);
    expect(reaction.users[0].reactedAt).toEqual(first);
    expect(reaction.users[1].reactedAt).toEqual(second);
  });

  it('incluye id/nombre/avatarUrl/reactedAt por reactor', () => {
    const when = new Date('2026-01-02T00:00:00Z');
    const result = serialize([
      { emoji: '🎉', userId: 7, createdAt: when, user: { id: 7, nombre: 'Ana', avatarUrl: 'https://x/ana.png' } },
    ]);

    expect(result.reactions[0].users).toEqual([
      { id: 7, nombre: 'Ana', avatarUrl: 'https://x/ana.png', reactedAt: when },
    ]);
  });

  it('usa null cuando falta avatarUrl o createdAt', () => {
    const result = serialize([{ emoji: '🔥', userId: 9, user: { id: 9, nombre: 'Sin fecha' } }]);

    expect(result.reactions[0].users[0]).toEqual({
      id: 9,
      nombre: 'Sin fecha',
      avatarUrl: null,
      reactedAt: null,
    });
  });

  it('separa grupos por emoji distinto', () => {
    const result = serialize([
      { emoji: '👀', userId: 2, createdAt: new Date(), user: { id: 2, nombre: 'Adam', avatarUrl: null } },
      { emoji: '🎉', userId: 3, createdAt: new Date(), user: { id: 3, nombre: 'Luis', avatarUrl: null } },
    ]);

    expect(result.reactions.map((r: any) => r.emoji).sort()).toEqual(['🎉', '👀']);
  });

  it('devuelve reactions: [] cuando no hay reacciones', () => {
    const result = serialize([]);
    expect(result.reactions).toEqual([]);
  });

  it('la cita de un padre borrado no devuelve el texto original', () => {
    const result = (svc as any).serializeMessage({
      ...baseMessage,
      parentId: 9,
      parent: { id: 9, deletedAt: new Date('2026-09-28T12:00:00Z'), body: 'secreto' },
      reactions: [],
    });
    expect(result.replyTo).toEqual({ id: 9, deleted: true, body: 'Mensaje eliminado' });
    expect(JSON.stringify(result)).not.toContain('secreto');
    expect(result.body).toBe('hola');
  });
});

describe('ChatService.toggleReaction — forma de la query y del payload realtime', () => {
  function makePrisma(overrides: { existing?: any } = {}) {
    const refreshed = {
      id: 1,
      channelId: 10,
      authorId: 5,
      parentId: null,
      kind: ChatMessageKind.TEXT,
      body: 'hola',
      attachmentUrl: null,
      attachmentName: null,
      pinnedAt: null,
      editedAt: null,
      createdAt: new Date(),
      author: { id: 5, nombre: 'Autor', email: 'a@x.com' },
      reactions: [
        {
          emoji: '👀',
          userId: 1,
          createdAt: new Date(),
          user: { id: 1, nombre: 'Yo', avatarUrl: null },
        },
      ],
      _count: { replies: 0 },
    };
    return {
      chatMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, channelId: 10, deletedAt: null }),
        findUnique: jest.fn().mockResolvedValue(refreshed),
      },
      chatMessageReaction: {
        findUnique: jest.fn().mockResolvedValue(overrides.existing ?? null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      chatChannel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          isArchived: false,
          kind: ChatChannelKind.PUBLIC,
          members: [{ userId: 1 }],
        }),
      },
    };
  }

  it('pide reactions ordenadas asc por createdAt e incluye avatarUrl del user', async () => {
    const prisma = makePrisma();
    const realtime = { emitToRoom: jest.fn() };
    const svc = new ChatService(prisma as any, realtime as any, {} as any);

    const payload = await svc.toggleReaction(1, 1, '👀', null);

    expect(prisma.chatMessage.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          reactions: {
            orderBy: { createdAt: 'asc' },
            include: { user: { select: { id: true, nombre: true, avatarUrl: true } } },
          },
        }),
      }),
    );
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      expect.any(String),
      'chat:message-updated',
      payload,
    );
    expect(payload.reactions[0].users[0]).toMatchObject({ id: 1, nombre: 'Yo', avatarUrl: null });
  });
});

describe('ChatService lecturas por mensaje', () => {
  function makeSvc() {
    const prisma = {
      chatChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 3,
          companyId: 9,
          isArchived: false,
          kind: ChatChannelKind.PUBLIC,
          members: [{ userId: 1 }],
        }),
      },
      chatChannelMember: {
        findMany: jest.fn().mockResolvedValue([{ userId: 1 }, { userId: 2 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([{ id: 10, authorId: 2 }]),
        findFirst: jest.fn(),
      },
      chatMessageRead: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const realtime = { emitToUser: jest.fn(), emitToRoom: jest.fn() };
    const svc = new ChatService(prisma as any, realtime as any, {} as any);
    return { prisma, realtime, svc };
  }

  it('marca visto con createMany y companyId, sin la llave messageId_userId', async () => {
    const { prisma, realtime, svc } = makeSvc();
    prisma.chatMessageRead.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ messageId: 10, userId: 1, readAt: new Date('2026-09-28T18:00:00Z') }]);

    const result = await svc.markMessagesSeen(3, 1, [10, 10, -3, 10], 9);

    expect(result).toMatchObject({ ok: true, updated: 1 });
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channelId: 3,
          companyId: 9,
          authorId: { not: 1 },
        }),
      }),
    );
    const created = prisma.chatMessageRead.createMany.mock.calls[0][0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data).toEqual([
      expect.objectContaining({ messageId: 10, userId: 1, companyId: 9 }),
    ]);
    expect(created.data[0].readAt).toBeInstanceOf(Date);
    expect(prisma.chatMessageRead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 1, companyId: 9, readAt: null }),
      }),
    );
    expect(JSON.stringify(prisma.chatMessageRead.createMany.mock.calls)).not.toContain('messageId_userId');
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      2,
      'chat:receipt',
      expect.objectContaining({
        channelId: 3,
        receipts: [expect.objectContaining({ messageId: 10, state: 'read', recipientCount: 1 })],
      }),
    );
  });

  it('la entrega deja readAt en null y no mueve el último leído del canal', async () => {
    const { prisma, svc } = makeSvc();
    await svc.markMessagesDelivered(3, 1, [10], 9);
    const created = prisma.chatMessageRead.createMany.mock.calls[0][0];
    expect(created.data[0].readAt).toBeNull();
    expect(prisma.chatChannelMember.updateMany).not.toHaveBeenCalled();
  });
});

describe('ChatService.deleteMessage', () => {
  const mensaje = {
    id: 44,
    channelId: 7,
    authorId: 8,
    parentId: null as number | null,
    companyId: 3,
    createdAt: new Date('2026-09-28T15:00:00Z'),
    deletedAt: null,
    body: 'borra esto',
    pinnedAt: new Date('2026-09-28T15:01:00Z'),
  };

  function makeSvc(found: typeof mensaje | null = mensaje) {
    const prisma = {
      chatMessage: {
        findFirst: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockResolvedValue({ ...mensaje, deletedAt: new Date(), deletedById: 1 }),
      },
      chatChannel: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const realtime = { emitToCompany: jest.fn(), emitToRoom: jest.fn(), emitToUser: jest.fn() };
    const svc = new ChatService(prisma as any, realtime as any, {} as any);
    return { prisma, realtime, svc };
  }

  it('responde 403 a cualquiera que no sea el usuario 1, sin tocar la base', async () => {
    const { prisma, realtime, svc } = makeSvc();
    await expect(svc.deleteMessage(44, 2, 3)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatMessage.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
    expect(realtime.emitToCompany).not.toHaveBeenCalled();
  });

  it('el CEO borra un mensaje ajeno de su empresa, lo desfija y avisa a la empresa', async () => {
    const { prisma, realtime, svc } = makeSvc();
    prisma.chatMessage.findFirst
      .mockResolvedValueOnce(mensaje)
      .mockResolvedValueOnce({ body: 'el anterior', createdAt: new Date('2026-09-28T14:00:00Z') });

    const result = await svc.deleteMessage(44, 1, 3);

    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 44, deletedAt: null, companyId: 3 }),
      }),
    );
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 44 },
        data: expect.objectContaining({
          deletedById: 1,
          pinnedAt: null,
          pinnedById: null,
        }),
      }),
    );
    expect(prisma.chatMessage.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.chatChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ lastMessagePreview: 'el anterior' }),
      }),
    );
    expect(realtime.emitToCompany).toHaveBeenCalledWith(
      3,
      'chat:message-deleted',
      expect.objectContaining({ id: 44, channelId: 7, authorId: 8, parentId: null }),
    );
    expect(realtime.emitToCompany).toHaveBeenCalledWith(
      3,
      'chat:message:deleted',
      expect.objectContaining({ id: 44, lastMessagePreview: 'el anterior' }),
    );
    expect(JSON.stringify(result)).not.toContain('borra esto');
  });

  it('404 si el mensaje es de otra empresa o ya estaba borrado', async () => {
    const { prisma, svc } = makeSvc(null);
    await expect(svc.deleteMessage(44, 1, 3)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
  });

  it('una respuesta borrada no reescribe la vista previa del canal', async () => {
    const reply = { ...mensaje, parentId: 10 };
    const { prisma, svc } = makeSvc(reply);
    await svc.deleteMessage(44, 1, 3);
    expect(prisma.chatChannel.update).not.toHaveBeenCalled();
    expect(prisma.chatMessage.findFirst).toHaveBeenCalledTimes(1);
  });
});
