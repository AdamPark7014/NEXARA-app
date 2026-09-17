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
