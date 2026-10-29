import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MyActivitiesService } from './my-activities.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';

const CEO = { id: 1, email: null, roleKey: 'ceo', isSuperAdmin: false, permissions: [] };
const LOTE = { observaciones: 'informacion completa gracias', calificacion: 5 };

function armar() {
  const prisma = {
    activity: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map((id) => ({ id, anNumber: `AN-${String(id).padStart(4, '0')}`, titulo: `Actividad ${id}` })),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Christian Eduardo Del Pozo Sánchez' }) },
  };
  const notificationHierarchy = { notifyEvidenceBatchApproved: jest.fn().mockResolvedValue(undefined) };
  const service = new MyActivitiesService(prisma as any, {} as any, {} as any, {} as any, notificationHierarchy as any, {} as any);
  // La regla del botón ya tiene sus pruebas; aquí se cuenta qué se le pide y en qué modo.
  const revisar = jest.spyOn(service as any, 'revisarUnaEvidencia');
  return { service, prisma, notificationHierarchy, revisar };
}

describe('aprobar por lote (Adam, 29-10: las 90 más viejas en espera de revisión)', () => {
  it('cada una pasa por la regla del botón, en silencio, y el aviso va uno por persona', async () => {
    const { service, notificationHierarchy, revisar } = armar();
    revisar.mockResolvedValue(undefined);
    const r = await service.approveTeamEvidenceBatch(CEO, 1, {
      ...LOTE,
      items: [
        { activityId: 10, userId: 58 },
        { activityId: 11, userId: 58 },
        { activityId: 12, userId: 41 },
      ],
    });
    expect(r).toEqual({
      aprobadas: [
        { activityId: 10, userId: 58 },
        { activityId: 11, userId: 58 },
        { activityId: 12, userId: 41 },
      ],
      fallidas: [],
    });
    expect(revisar).toHaveBeenCalledTimes(3);
    expect(revisar).toHaveBeenCalledWith(
      CEO,
      1,
      10,
      58,
      { decision: 'aprobar', observaciones: 'informacion completa gracias', calificacion: 5 },
      { silencioso: true },
    );
    expect(notificationHierarchy.notifyEvidenceBatchApproved).toHaveBeenCalledTimes(2);
    expect(notificationHierarchy.notifyEvidenceBatchApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 58,
        reviewerId: 1,
        score: 5,
        notes: 'informacion completa gracias',
        actividades: [
          { activityId: 10, an: 'AN-0010', titulo: 'Actividad 10' },
          { activityId: 11, an: 'AN-0011', titulo: 'Actividad 11' },
        ],
      }),
    );
  });

  it('la que no pasa la regla se devuelve con su motivo y no detiene las demás', async () => {
    const { service, notificationHierarchy, revisar } = armar();
    revisar
      .mockRejectedValueOnce(new ForbiddenException('Solo sus superiores en esta actividad pueden revisar esta evidencia'))
      .mockResolvedValueOnce(undefined);
    const r = await service.approveTeamEvidenceBatch(CEO, 1, {
      ...LOTE,
      items: [
        { activityId: 20, userId: 7 },
        { activityId: 21, userId: 7 },
      ],
    });
    expect(r.aprobadas).toEqual([{ activityId: 21, userId: 7 }]);
    expect(r.fallidas).toEqual([
      { activityId: 20, userId: 7, motivo: 'Solo sus superiores en esta actividad pueden revisar esta evidencia' },
    ]);
    expect(notificationHierarchy.notifyEvidenceBatchApproved).toHaveBeenCalledTimes(1);
  });

  it('sin observación, calificación fuera de 1–5 o lote vacío o de más de 100: no se toca nada', async () => {
    const { service, revisar } = armar();
    const uno = [{ activityId: 1, userId: 2 }];
    await expect(service.approveTeamEvidenceBatch(CEO, 1, { items: uno, observaciones: 'ok', calificacion: 5 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.approveTeamEvidenceBatch(CEO, 1, { ...LOTE, items: uno, calificacion: 6 })).rejects.toThrow(
      'de 1 a 5',
    );
    await expect(service.approveTeamEvidenceBatch(CEO, 1, { ...LOTE, items: [] })).rejects.toThrow('de 1 a 100');
    const muchas = Array.from({ length: 101 }, (_, i) => ({ activityId: i + 1, userId: 2 }));
    await expect(service.approveTeamEvidenceBatch(CEO, 1, { ...LOTE, items: muchas })).rejects.toThrow('de 1 a 100');
    expect(revisar).not.toHaveBeenCalled();
  });
});

describe('aviso agrupado de la aprobación por lote', () => {
  function avisos() {
    const notificationsService = { createNotification: jest.fn().mockResolvedValue(null) };
    const svc = new NotificationHierarchyService(notificationsService as any, {} as any);
    return { svc, notificationsService };
  }

  it('varias: «Christian aprobó N de tus actividades» con sus AN, calificación y observación', async () => {
    const { svc, notificationsService } = avisos();
    await svc.notifyEvidenceBatchApproved({
      userId: 58,
      reviewerId: 1,
      reviewerName: 'Christian Eduardo Del Pozo Sánchez',
      actividades: Array.from({ length: 10 }, (_, i) => ({ activityId: 100 + i, an: `AN-01${i}`, titulo: 'x' })),
      score: 5,
      notes: 'informacion completa gracias',
    });
    const aviso = notificationsService.createNotification.mock.calls[0][0];
    expect(aviso).toMatchObject({ userId: 58, type: 'EVIDENCE_APPROVED', relatedUrl: '/erp/actividades', triggerUserId: 1 });
    expect(aviso.title).toMatch(/aprobó 10 de tus actividades$/);
    expect(aviso.message).toContain('AN-010, AN-011');
    expect(aviso.message).toContain('y 2 más');
    expect(aviso.message).toContain('Calificación 5 de 5');
    expect(aviso.message).toContain('informacion completa gracias');
  });

  it('una sola: el aviso de siempre, ligado a su actividad', async () => {
    const { svc, notificationsService } = avisos();
    await svc.notifyEvidenceBatchApproved({
      userId: 41,
      reviewerId: 1,
      reviewerName: 'Christian',
      actividades: [{ activityId: 390, an: 'AN-0356', titulo: 'Generar la nómina semanal' }],
      score: 5,
    });
    expect(notificationsService.createNotification.mock.calls[0][0]).toMatchObject({
      relatedEntityId: 390,
      entityType: 'Activity',
      relatedUrl: '/erp/actividades/390/evidencias',
    });
  });

  it('a quien revisó no se le avisa de lo suyo', async () => {
    const { svc, notificationsService } = avisos();
    await svc.notifyEvidenceBatchApproved({ userId: 1, reviewerId: 1, reviewerName: 'Christian', actividades: [{ activityId: 1, an: null, titulo: null }] });
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });
});
