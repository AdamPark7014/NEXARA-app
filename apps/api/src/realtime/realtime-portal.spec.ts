import { esSocketDePortal, soloMetadatos } from './realtime.gateway.js';

describe('Tiempo real · portales', () => {
  it('reconoce los sockets de portal por su id', () => {
    expect(esSocketDePortal('client:12')).toBe(true);
    expect(esSocketDePortal('branch:3')).toBe(true);
    expect(esSocketDePortal(7)).toBe(false);
    expect(esSocketDePortal('7')).toBe(false);
    expect(esSocketDePortal(undefined)).toBe(false);
  });

  it('a un portal solo le llega qué cambió, nunca datos', () => {
    const fuera = soloMetadatos({
      model: 'Attendance',
      action: 'create',
      timestamp: '2026-10-31T10:00:00Z',
      entity: { userId: 4, email: 'luis@nexara.com.mx' },
      siteId: 9,
      nombre: 'Luis',
    });
    expect(fuera).toEqual({ model: 'Attendance', action: 'create', timestamp: '2026-10-31T10:00:00Z' });
    expect(soloMetadatos({ entity: 'IntegraRecurringVisitor', personId: 5 })).toEqual({ entity: 'IntegraRecurringVisitor' });
    expect(soloMetadatos(null)).toEqual({});
  });
});
