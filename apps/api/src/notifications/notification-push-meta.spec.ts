import { buildCollapseKey, channelForCategory } from './notification-push-meta.js';

describe('notification-push-meta', () => {
  it('enruta categorías operativas a canal ops', () => {
    expect(channelForCategory('activities')).toBe('ops');
    expect(channelForCategory('evidences')).toBe('ops');
    expect(channelForCategory('viatics')).toBe('ops');
  });

  it('enruta tickets y alarmas a tickets', () => {
    expect(channelForCategory('tickets')).toBe('tickets');
    expect(channelForCategory('integra-alarms')).toBe('tickets');
  });

  it('collapse key es estable por evento+entidad+usuario', () => {
    const a = buildCollapseKey({
      type: 'ACTIVITY_STARTED',
      entityType: 'Activity',
      entityId: 42,
      userId: 7,
    });
    const b = buildCollapseKey({
      type: 'ACTIVITY_STARTED',
      entityType: 'Activity',
      entityId: 42,
      userId: 7,
    });
    expect(a).toBe(b);
    expect(a).toContain('activity_started');
    expect(a).toContain('42');
  });
});
