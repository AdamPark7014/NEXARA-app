import { AiTriageService } from './ai-triage.service.js';

describe('AiTriageService (rules engine)', () => {
  const prisma = {
    featureFlag: { findFirst: jest.fn().mockResolvedValue(null) },
    activity: { count: jest.fn().mockResolvedValue(0) },
  } as any;

  const svc = new AiTriageService(prisma);

  it('classifies emergencies as P0', async () => {
    const result = await svc.triageActivityText(
      { title: 'URGENTE: CCTV caído en sucursal', description: 'Sin servicio total' },
      1,
    );
    expect(result.priority).toBe('P0');
    expect(result.ticketType).toBe('EMERGENCIA');
    expect(result.risk).toBe('high');
    expect(result.provider).toBe('rules');
  });

  it('classifies preventive work', async () => {
    const result = await svc.triageActivityText(
      { title: 'Mantenimiento preventivo programado NVR' },
      1,
    );
    expect(result.ticketType).toBe('PREVENTIVO');
    expect(result.priority).toBe('P3');
  });

  it('requires companyId', async () => {
    await expect(svc.triageActivityText({ title: 'x' }, null)).rejects.toThrow();
  });
});
