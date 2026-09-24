import { ActivityEvidenceReminderCronService } from './activity-evidence-reminder.cron';

function build(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const older = new Date(nowMs - 25 * 60 * 60 * 1000);
  const newer = new Date(nowMs - 3 * 60 * 60 * 1000);

  const pendingOld = {
    id: 11,
    activityId: 77,
    userId: 5,
    status: 'COMPLETED',
    reviewStatus: 'PENDING',
    completedAt: older,
    correctionSubmittedAt: null,
    updatedAt: older,
    activity: { id: 77, titulo: 'Cableado Rack A', anNumber: 'AN-0077', responsableId: 3, companyId: 99 },
    user: { id: 5, nombre: 'Juan Pérez' },
  };

  const pendingNew = {
    id: 12,
    activityId: 78,
    userId: 6,
    status: 'COMPLETED',
    reviewStatus: 'PENDING',
    completedAt: newer,
    correctionSubmittedAt: null,
    updatedAt: newer,
    activity: { id: 78, titulo: 'Mantenimiento DVR', anNumber: 'AN-0078', responsableId: 4, companyId: 99 },
    user: { id: 6, nombre: 'María Lopez' },
  };

  const prisma: any = {
    activityEvidence: {
      findMany: jest.fn().mockResolvedValue([pendingOld]),
    },
  };
  const notifications: any = {
    createNotification: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const service = new ActivityEvidenceReminderCronService(prisma, notifications);
  return { service, prisma, notifications, now, pendingOld, pendingNew };
}

describe('ActivityEvidenceReminderCronService', () => {
  it('envía un recordatorio por evidencia pendiente >24h al responsable con dedupe 24h', async () => {
    const { service, notifications, now } = build();
    const sent = await service.sendPendingReminders(now);
    expect(sent).toBe(1);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    const payload = notifications.createNotification.mock.calls[0][0];
    expect(payload.userId).toBe(3); // responsableId
    expect(payload.relatedEntityId).toBe(11); // evidence id
    expect(payload.type).toBe('EVIDENCE_SUBMITTED');
    expect(payload.category).toBe('evidences');
    expect(payload.dedupeSeconds).toBe(24 * 60 * 60);
    expect(String(payload.relatedUrl)).toMatch(/\/erp\/actividades\/77\/evidencias$/);
  });
});

