import { appUrls } from '../common/app-urls.js';

export type PortalTicketClientAction = 'ACK' | 'CONFIRM_RESOLVED' | 'REQUEST_REOPEN';

/** Ruta staff para OT del portal (Activity). */
export function portalTicketStaffUrl(activityId: number): string {
  return appUrls.opsActivity(activityId);
}

/** Ruta staff para solicitud de soporte (ClientTicketRequest). */
export function supportRequestStaffUrl(requestId: number): string {
  return appUrls.opsSupport(requestId);
}

/** Ruta portal cliente para la misma OT. */
export function portalTicketClientUrl(activityId: number): string {
  return appUrls.portalTicket(activityId);
}

export function portalTicketCommentNotifyMeta(
  activityId: number,
  anNumber: string | null | undefined,
  body: string,
) {
  const ref = (anNumber && String(anNumber).trim()) || 'OT';
  return {
    type: 'ACTIVITY_ASSIGNED' as const,
    category: 'tickets',
    channel: 'tickets' as const,
    title: `Cliente comentó ${ref}`,
    message: body.slice(0, 280),
    entityType: 'Activity',
    relatedUrl: portalTicketStaffUrl(activityId),
  };
}

export function portalTicketActionNotifyMeta(
  action: PortalTicketClientAction,
  activityId: number,
  anNumber: string | null | undefined,
  title: string | null | undefined,
  note?: string,
) {
  const ref = (anNumber && String(anNumber).trim()) || 'OT';
  const fallback = (title && String(title).trim()) || ref;
  const noteText = note?.trim() ? note.trim().slice(0, 280) : fallback;
  const relatedUrl = portalTicketStaffUrl(activityId);

  if (action === 'ACK') {
    return {
      type: 'ACTIVITY_ASSIGNED' as const,
      category: 'tickets',
      channel: 'tickets' as const,
      title: `Cliente acusó recibo · ${ref}`,
      message: noteText,
      entityType: 'Activity',
      relatedUrl,
      priority: 'normal' as const,
    };
  }
  if (action === 'CONFIRM_RESOLVED') {
    return {
      type: 'ACTIVITY_APPROVED' as const,
      category: 'tickets',
      channel: 'tickets' as const,
      title: `Cliente confirmó resolución · ${ref}`,
      message: noteText,
      entityType: 'Activity',
      relatedUrl,
      priority: 'normal' as const,
    };
  }
  return {
    type: 'ACTIVITY_REJECTED' as const,
    category: 'tickets',
    channel: 'tickets' as const,
    title: `Cliente pidió reabrir ${ref}`,
    message: noteText,
    entityType: 'Activity',
    relatedUrl,
    priority: 'high' as const,
  };
}
