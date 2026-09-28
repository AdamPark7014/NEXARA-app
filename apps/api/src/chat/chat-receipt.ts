/** Palomitas de un mensaje propio: enviado, entregado o visto por todos. */
export type ChatReceiptState = 'sent' | 'delivered' | 'read';

export type ChatReceipt = {
  messageId: number;
  state: ChatReceiptState;
  readCount: number;
  recipientCount: number;
};

/**
 * Una gris = enviado (nadie lo tiene).
 * Dos grises = entregado: alguien ya lo tiene, pero no lo vieron todos.
 * Dos azules = visto por todos los destinatarios.
 * Sin destinatarios se queda en enviado.
 */
export function chatReceiptState(
  recipientCount: number,
  deliveredCount: number,
  readCount: number,
): ChatReceiptState {
  if (recipientCount > 0 && readCount >= recipientCount) return 'read';
  if (deliveredCount > 0) return 'delivered';
  return 'sent';
}

export function buildReceipts(
  messageIds: number[],
  recipientIds: number[],
  rows: Array<{ messageId: number; userId: number; readAt: Date | null }>,
): ChatReceipt[] {
  const recipients = new Set(recipientIds);
  const byMessage = new Map<number, { delivered: number; read: number }>();
  for (const id of messageIds) byMessage.set(id, { delivered: 0, read: 0 });
  for (const row of rows) {
    if (!recipients.has(row.userId)) continue;
    const bucket = byMessage.get(row.messageId);
    if (!bucket) continue;
    bucket.delivered += 1;
    if (row.readAt) bucket.read += 1;
  }
  const recipientCount = recipients.size;
  return messageIds.map((messageId) => {
    const bucket = byMessage.get(messageId) ?? { delivered: 0, read: 0 };
    return {
      messageId,
      state: chatReceiptState(recipientCount, bucket.delivered, bucket.read),
      readCount: bucket.read,
      recipientCount,
    };
  });
}
