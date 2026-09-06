/**
 * Metadatos de push eficientes: canal Android, collapse key FCM, prioridad.
 * Una misma entidad/acción colapsa en la bandeja en vez de spamear.
 */

export type PushRoutingChannel = 'default' | 'alerts' | 'tickets' | 'gps' | 'ops' | 'chat' | 'approvals';

export function channelForCategory(category?: string | null): PushRoutingChannel {
  const c = (category || '').toLowerCase();
  if (c.includes('ticket') || c.includes('support') || c.includes('alarm')) return 'tickets';
  if (c.includes('gps')) return 'gps';
  if (c.includes('chat') || c.includes('mention')) return 'chat';
  if (c.includes('approv') || c.includes('workflow')) return 'approvals';
  if (
    c.includes('activit') ||
    c.includes('evidence') ||
    c.includes('viatic') ||
    c.includes('ops') ||
    c.includes('vehicle') ||
    c.includes('tool')
  ) {
    return 'ops';
  }
  if (c.includes('security') || c.includes('alert') || c.includes('critical')) return 'alerts';
  return 'default';
}

/** Clave estable para reemplazar push previos de la misma entidad/acción. */
export function buildCollapseKey(opts: {
  event?: string | null;
  type?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  userId?: number | null;
}): string {
  const event = (opts.event || opts.type || 'notice').toString().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const ent = (opts.entityType || 'x').toString().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const id = opts.entityId != null && opts.entityId > 0 ? String(opts.entityId) : '0';
  const uid = opts.userId != null && opts.userId > 0 ? String(opts.userId) : '0';
  return `nx_${event}_${ent}_${id}_u${uid}`.slice(0, 64);
}
