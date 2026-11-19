import { ChatService } from './chat.service';

/** C1 (Programa Velocidad, 18-11-2026): el chat ya no escribe en cada lectura ni cuenta canal por canal. */
describe('chat: lectura ligera', () => {
  function armar() {
    const prisma: any = {
      userCompany: { findFirst: jest.fn().mockResolvedValue({ companyId: 1 }) },
      chatChannelMember: {
        findMany: jest.fn().mockResolvedValue([
          { channelId: 10, lastReadAt: new Date('2026-11-18T10:00:00Z'), joinedAt: new Date('2026-11-01T00:00:00Z'), mutedUntil: null },
          { channelId: 11, lastReadAt: null, joinedAt: new Date('2026-11-02T00:00:00Z'), mutedUntil: null },
          { channelId: 12, lastReadAt: null, joinedAt: new Date('2026-11-02T00:00:00Z'), mutedUntil: new Date('2999-01-01T00:00:00Z') },
        ]),
      },
      chatMessage: {
        groupBy: jest.fn().mockResolvedValue([
          { channelId: 10, _count: { _all: 2 } },
          { channelId: 11, _count: { _all: 5 } },
        ]),
        count: jest.fn(),
      },
    };
    const svc = new ChatService(prisma, {} as any, {} as any);
    return { svc, prisma };
  }

  it('el total de no leídos sale de un solo GROUP BY y no cuenta los silenciados', async () => {
    const { svc, prisma } = armar();
    await expect(svc.unreadCount(7, 1)).resolves.toEqual({ total: 7 });
    expect(prisma.chatMessage.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.chatMessage.count).not.toHaveBeenCalled();
    const where = prisma.chatMessage.groupBy.mock.calls[0][0].where;
    expect(where.OR.map((o: any) => o.channelId)).toEqual([10, 11]);
    expect(where.authorId).toEqual({ not: 7 });
  });

  it('ensureDefaults corre una vez y no en cada lectura', async () => {
    const { svc } = armar();
    const spy = jest.spyOn(svc, 'ensureDefaults').mockResolvedValue(undefined as never);
    await (svc as any).ensureDefaultsSiToca(7, 1);
    await (svc as any).ensureDefaultsSiToca(7, 1);
    await (svc as any).ensureDefaultsSiToca(8, 1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
