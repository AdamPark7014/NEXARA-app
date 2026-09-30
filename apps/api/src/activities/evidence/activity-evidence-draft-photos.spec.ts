import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityEvidenceService } from './activity-evidence.service';

/**
 * «Fotos en sitio» (sin campos) se perdían si la persona salía de la pantalla antes de tocar
 * «enviar»: se acumulaban solo en memoria del cliente. `addEvidencePhoto` las manda de inmediato,
 * igual que ya hacían las fotos por campo — así nada se pierde si sale o la app muere en segundo
 * plano. `saveEvidencePhotos` (el envío final) sigue igual: valida el mínimo y avanza el paso.
 */
const ACTIVITY = {
  id: 2,
  estatus: 'En Proceso',
  companyId: 1,
  workType: null,
  coreKind: 'tarea',
  evidencePhotoRequired: 2,
  responsableId: 7,
  indicaciones: null,
};

function armar(evidenceOverrides: Record<string, unknown> = {}) {
  const evidence: any = {
    id: 55,
    activityId: 2,
    userId: 7,
    companyId: 1,
    status: 'EVIDENCE_PHOTOS',
    reviewStatus: 'PENDING',
    evidencePhotos: [],
    evidencePhotosGeo: null,
    ...evidenceOverrides,
  };
  const prisma: any = {
    activity: { findFirst: jest.fn(async () => ACTIVITY) },
    activityEvidence: {
      findFirst: jest.fn(async () => evidence),
      create: jest.fn(async () => evidence),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(evidence, data);
        return evidence;
      }),
    },
    activityAssignee: { findFirst: jest.fn(async () => null) },
  };
  const service = new ActivityEvidenceService(prisma, {} as any, {} as any);
  return { service, prisma, evidence };
}

describe('ActivityEvidenceService.addEvidencePhoto', () => {
  it('agrega una foto de inmediato, sin cerrar el paso', async () => {
    const { service } = armar();
    const r1 = await service.addEvidencePhoto(2, 7, '/uploads/a.jpg', { latitude: 19.1, longitude: -98.2 }, 1);
    expect(r1.evidencePhotos).toEqual(['/uploads/a.jpg']);
    expect(r1.status).toBe('EVIDENCE_PHOTOS');
    expect(r1.evidencePhotosGeo).toEqual([{ latitude: 19.1, longitude: -98.2, capturedAt: null }]);

    const r2 = await service.addEvidencePhoto(2, 7, '/uploads/b.jpg', null, 1);
    expect(r2.evidencePhotos).toEqual(['/uploads/a.jpg', '/uploads/b.jpg']);
    expect(r2.evidencePhotosGeo).toEqual([{ latitude: 19.1, longitude: -98.2, capturedAt: null }, null]);
  });

  it('varias fotos seguidas quedan todas, en orden (nada se pierde entre una y otra)', async () => {
    const { service, evidence } = armar();
    for (const url of ['/1.jpg', '/2.jpg', '/3.jpg']) {
      await service.addEvidencePhoto(2, 7, url, null, 1);
    }
    expect(evidence.evidencePhotos).toEqual(['/1.jpg', '/2.jpg', '/3.jpg']);
  });

  it('rechaza si ya no está en el paso de evidencias (ya enviado o en otro paso)', async () => {
    const { service } = armar({ status: 'SERVICE_SHEET_PDF' });
    await expect(service.addEvidencePhoto(2, 7, '/uploads/a.jpg', null, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige la url de la foto', async () => {
    const { service } = armar();
    await expect(service.addEvidencePhoto(2, 7, '', null, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ActivityEvidenceService.removeEvidencePhoto en modo borrador', () => {
  it('deja bajar hasta 0 mientras sigue capturando (el envío final ya exige el mínimo)', async () => {
    const { service, evidence } = armar({
      evidencePhotos: ['/a.jpg'],
      evidencePhotosGeo: [{ latitude: 1, longitude: 2, capturedAt: null }],
    });
    const r = await service.removeEvidencePhoto(2, 7, 0, 1);
    expect(r.evidencePhotos).toEqual([]);
    expect(r.evidencePhotosGeo).toBe(Prisma.DbNull);
  });

  it('el geo se quita alineado al índice removido, no solo la foto', async () => {
    const { service, evidence } = armar({
      evidencePhotos: ['/a.jpg', '/b.jpg'],
      evidencePhotosGeo: [{ latitude: 1, longitude: 2, capturedAt: null }, { latitude: 3, longitude: 4, capturedAt: null }],
    });
    const r = await service.removeEvidencePhoto(2, 7, 0, 1);
    expect(r.evidencePhotos).toEqual(['/b.jpg']);
    expect(r.evidencePhotosGeo).toEqual([{ latitude: 3, longitude: 4, capturedAt: null }]);
  });

  it('sigue exigiendo el mínimo una vez que la evidencia ya se envió (edición posterior)', async () => {
    const { service } = armar({ status: 'SERVICE_SHEET_PDF', evidencePhotos: ['/a.jpg', '/b.jpg'] });
    await expect(service.removeEvidencePhoto(2, 7, 0, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
