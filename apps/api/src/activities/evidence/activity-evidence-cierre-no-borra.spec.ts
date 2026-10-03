import { ActivityEvidenceService } from './activity-evidence.service';
import { fotosAlCerrarPaso } from './evidence-flow.helpers';

/**
 * «Que las evidencias no se eliminen» (Adam, 02-10). Cada foto libre se guarda al tomarla y solo
 * se quita con su botón. Cerrar el paso (o reenviarlo corregido) escribía la lista que mandara el
 * cliente tal cual: con campos la web y las apps mandan `[]`, y con una pantalla atrasada llega
 * solo un pedazo. En los dos casos se borraban fotos que nadie había quitado.
 */
const GEO_A = { latitude: 19.1, longitude: -98.2, capturedAt: null };
const GEO_B = { latitude: 19.2, longitude: -98.3, capturedAt: null };

function armar(opts: {
  evidence?: Record<string, unknown>;
  activity?: Record<string, unknown>;
  campos?: unknown[];
} = {}) {
  const evidence: any = {
    id: 55,
    activityId: 2,
    userId: 7,
    companyId: 1,
    status: 'EVIDENCE_PHOTOS',
    reviewStatus: 'PENDING',
    evidencePhotos: ['/a.jpg', '/b.jpg'],
    evidencePhotosGeo: [GEO_A, GEO_B],
    ...opts.evidence,
  };
  const activity: any = {
    id: 2,
    estatus: 'En Proceso',
    companyId: 1,
    workType: null,
    coreKind: 'tarea',
    evidencePhotoRequired: 2,
    responsableId: 7,
    indicaciones: null,
    ...opts.activity,
  };
  const prisma: any = {
    activity: {
      findFirst: jest.fn(async () => activity),
      update: jest.fn(async ({ data }: any) => Object.assign(activity, data)),
    },
    activityEvidence: {
      findFirst: jest.fn(async () => evidence),
      update: jest.fn(async ({ data }: any) => Object.assign(evidence, data)),
    },
    activityAssignee: { findFirst: jest.fn(async () => null) },
  };
  const avisos: any = { notifyActivityProgress: jest.fn() };
  const campos: any = { listarCamposDeActividad: jest.fn(async () => opts.campos ?? []) };
  const service = new ActivityEvidenceService(prisma, {} as any, avisos, undefined, campos);
  return { service, prisma, evidence, avisos };
}

/** Un campo ya documentado: con él la actividad va «por campos» y el cliente manda `[]`. */
const CAMPO_COMPLETO = [
  { id: 1, nombre: 'Cámara 1', momentos: ['antes'], fotos: { antes: { photoUrl: '/c.jpg' } }, pendientes: [], completo: true },
];

describe('fotosAlCerrarPaso', () => {
  it('lista vacía o un pedazo de lo guardado: lo guardado se queda', () => {
    expect(fotosAlCerrarPaso(['/a.jpg', '/b.jpg'], [])).toEqual({ fotos: ['/a.jpg', '/b.jpg'], conservaGuardadas: true });
    expect(fotosAlCerrarPaso(['/a.jpg', '/b.jpg', '/c.jpg'], ['/a.jpg', '/b.jpg'])).toEqual({
      fotos: ['/a.jpg', '/b.jpg', '/c.jpg'],
      conservaGuardadas: true,
    });
    expect(fotosAlCerrarPaso(['/a.jpg'], null)).toEqual({ fotos: ['/a.jpg'], conservaGuardadas: true });
  });

  it('la misma lista (aunque venga en otro orden) se respeta como llega', () => {
    expect(fotosAlCerrarPaso(['/a.jpg', '/b.jpg'], ['/b.jpg', '/a.jpg'])).toEqual({
      fotos: ['/b.jpg', '/a.jpg'],
      conservaGuardadas: false,
    });
  });

  it('si trae fotos que el servidor no tenía, manda la lista recibida (apps que envían todo al final)', () => {
    expect(fotosAlCerrarPaso([], ['/x.jpg', '/y.jpg'])).toEqual({ fotos: ['/x.jpg', '/y.jpg'], conservaGuardadas: false });
    expect(fotosAlCerrarPaso(null, ['/x.jpg'])).toEqual({ fotos: ['/x.jpg'], conservaGuardadas: false });
    // Cola sin conexión: reenvía sus fotos como archivos nuevos; no se duplican con las del borrador.
    expect(fotosAlCerrarPaso(['/a.jpg', '/borrador-3.jpg'], ['/a.jpg', '/reenviada-3.jpg'])).toEqual({
      fotos: ['/a.jpg', '/reenviada-3.jpg'],
      conservaGuardadas: false,
    });
  });
});

describe('cerrar el paso de evidencias no borra fotos guardadas', () => {
  it('por campos llega `[]`: las fotos libres que ya estaban siguen ahí, con su ubicación', async () => {
    const { service, evidence } = armar({ campos: CAMPO_COMPLETO });
    const out = await service.saveEvidencePhotos(2, 7, [], 1, []);
    expect(out.evidencePhotos).toEqual(['/a.jpg', '/b.jpg']);
    expect(evidence.evidencePhotosGeo).toEqual([GEO_A, GEO_B]);
    expect(out.status).toBe('SERVICE_SHEET_DATA');
  });

  it('una pantalla atrasada manda menos fotos de las guardadas: no se pierde ninguna', async () => {
    const { service, evidence, avisos } = armar({
      evidence: { evidencePhotos: ['/a.jpg', '/b.jpg', '/c.jpg'], evidencePhotosGeo: [GEO_A, GEO_B, null] },
    });
    const out = await service.saveEvidencePhotos(2, 7, ['/a.jpg', '/b.jpg'], 1, [null, null]);
    expect(out.evidencePhotos).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    // La ubicación que llega no está alineada con las guardadas: no las pisa.
    expect(evidence.evidencePhotosGeo).toEqual([GEO_A, GEO_B, null]);
    expect(avisos.notifyActivityProgress).toHaveBeenCalledWith(expect.objectContaining({ fotos: 3 }));
  });

  it('el envío normal (la misma lista) sigue igual: avanza el paso y guarda la ubicación', async () => {
    const { service, evidence } = armar();
    const out = await service.saveEvidencePhotos(2, 7, ['/a.jpg', '/b.jpg'], 1, [GEO_B, GEO_A]);
    expect(out.evidencePhotos).toEqual(['/a.jpg', '/b.jpg']);
    expect(evidence.evidencePhotosGeo).toEqual([GEO_B, GEO_A]);
    expect(out.status).toBe('SERVICE_SHEET_DATA');
  });

  it('una app que manda todo al final (sin borradores) sigue guardando su lista', async () => {
    const { service } = armar({ evidence: { evidencePhotos: [], evidencePhotosGeo: null } });
    const out = await service.saveEvidencePhotos(2, 7, ['/x.jpg', '/y.jpg'], 1);
    expect(out.evidencePhotos).toEqual(['/x.jpg', '/y.jpg']);
  });

  it('sigue exigiendo el mínimo: sin fotos guardadas ni recibidas no avanza', async () => {
    const { service } = armar({ evidence: { evidencePhotos: ['/a.jpg'], evidencePhotosGeo: null } });
    await expect(service.saveEvidencePhotos(2, 7, [], 1)).rejects.toThrow(/al menos 2 fotos/);
  });
});

describe('corregir el paso de evidencias tampoco las borra', () => {
  // Le devolvieron dos pasos: al corregir las fotos queda pendiente la salida (no cierra la actividad).
  const DEVUELTA = {
    reviewStatus: 'REJECTED',
    rejectedSteps: ['EVIDENCE_PHOTOS', 'EXIT_PHOTO'],
    rejectedStep: 'EVIDENCE_PHOTOS',
  };

  it('por campos la corrección llega con `[]`: las fotos libres se conservan', async () => {
    const { service, evidence } = armar({ evidence: DEVUELTA, campos: CAMPO_COMPLETO });
    const out = await service.resubmitStep(2, 7, 'EVIDENCE_PHOTOS', { photoUrls: [], photoGeo: [] }, 1);
    expect(out.evidencePhotos).toEqual(['/a.jpg', '/b.jpg']);
    expect(evidence.evidencePhotosGeo).toEqual([GEO_A, GEO_B]);
  });

  it('sin `photoUrls` en el cuerpo (por campos) tampoco se vacían', async () => {
    const { service } = armar({ evidence: DEVUELTA, campos: CAMPO_COMPLETO });
    const out = await service.resubmitStep(2, 7, 'EVIDENCE_PHOTOS', {}, 1);
    expect(out.evidencePhotos).toEqual(['/a.jpg', '/b.jpg']);
  });

  it('con fotos nuevas, la corrección reemplaza como siempre', async () => {
    const { service } = armar({ evidence: DEVUELTA });
    const out = await service.resubmitStep(2, 7, 'EVIDENCE_PHOTOS', { photoUrls: ['/a.jpg', '/nueva.jpg'] }, 1);
    expect(out.evidencePhotos).toEqual(['/a.jpg', '/nueva.jpg']);
  });
});
