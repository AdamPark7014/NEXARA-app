import { buildReceipts, chatReceiptState } from './chat-receipt.js';

describe('chatReceiptState', () => {
  it('una palomita gris cuando nadie lo tiene', () => {
    expect(chatReceiptState(2, 0, 0)).toBe('sent');
    expect(chatReceiptState(0, 0, 0)).toBe('sent');
  });

  it('dos grises cuando alguien lo tiene y no lo vieron todos', () => {
    expect(chatReceiptState(1, 1, 0)).toBe('delivered');
    expect(chatReceiptState(4, 2, 1)).toBe('delivered');
    expect(chatReceiptState(4, 4, 3)).toBe('delivered');
  });

  it('dos azules solo cuando lo vieron todos los destinatarios', () => {
    expect(chatReceiptState(1, 1, 1)).toBe('read');
    expect(chatReceiptState(5, 5, 5)).toBe('read');
  });
});

describe('buildReceipts', () => {
  const at = new Date('2026-09-28T18:00:00Z');

  it('cuenta entrega y lectura solo de los destinatarios', () => {
    const receipts = buildReceipts(
      [10, 11],
      [2, 3],
      [
        { messageId: 10, userId: 2, readAt: at },
        { messageId: 10, userId: 3, readAt: null },
        { messageId: 10, userId: 99, readAt: at },
        { messageId: 11, userId: 2, readAt: at },
        { messageId: 11, userId: 3, readAt: at },
      ],
    );
    expect(receipts).toEqual([
      { messageId: 10, state: 'delivered', readCount: 1, recipientCount: 2 },
      { messageId: 11, state: 'read', readCount: 2, recipientCount: 2 },
    ]);
  });
});
