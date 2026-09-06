import {
  portalTicketActionNotifyMeta,
  portalTicketCommentNotifyMeta,
  portalTicketStaffUrl,
} from './portal-ticket-notify.js';

describe('portal-ticket-notify (armor)', () => {
  it('comment meta apunta a ops activity y canal tickets', () => {
    const meta = portalTicketCommentNotifyMeta(42, 'AN-9', 'Hola equipo');
    expect(meta.relatedUrl).toBe(portalTicketStaffUrl(42));
    expect(meta.channel).toBe('tickets');
    expect(meta.message).toContain('Hola');
  });

  it('ACK / CONFIRM / REOPEN usan prioridades y titles distintos', () => {
    const ack = portalTicketActionNotifyMeta('ACK', 1, 'AN-1', 'OT');
    const ok = portalTicketActionNotifyMeta('CONFIRM_RESOLVED', 1, 'AN-1', 'OT');
    const reopen = portalTicketActionNotifyMeta('REQUEST_REOPEN', 1, 'AN-1', 'OT', 'faltó cable');
    expect(ack.title).toMatch(/acusó recibo/i);
    expect(ok.type).toBe('ACTIVITY_APPROVED');
    expect(reopen.priority).toBe('high');
    expect(reopen.message).toContain('cable');
  });
});
