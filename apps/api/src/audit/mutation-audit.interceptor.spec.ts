import { skipsMutationAudit } from './mutation-audit.interceptor';
import { AUDIT_EXCLUDED } from '../prisma/prisma.service';

describe('auditoría · lo que entra a audit_logs', () => {
  it('el webhook de los terminales Hikvision no se audita (cada evento ya está en integra_push_events)', () => {
    expect(skipsMutationAudit('/api/integra/hik/3/b1c2d3e4ff5e6')).toBe(true);
  });

  it('las mutaciones de personas sí se auditan, también las de INTEGRA hechas desde el panel', () => {
    expect(skipsMutationAudit('/api/clients')).toBe(false);
    expect(skipsMutationAudit('/api/activities/12/approve')).toBe(false);
    expect(skipsMutationAudit('/api/integra/devices/7/sync')).toBe(false);
  });

  it('los eventos que empujan los terminales no se copian a la auditoría de Prisma', () => {
    expect(AUDIT_EXCLUDED.has('IntegraPushEvent')).toBe(true);
    expect(AUDIT_EXCLUDED.has('Activity')).toBe(false);
  });
});
