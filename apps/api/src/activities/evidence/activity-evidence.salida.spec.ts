import { ActivityEvidenceService, coordenadasDeFoto, urlDeFotoGuardable } from './activity-evidence.service';
import { materializarAdjuntosDeCorreccion } from './evidence-flow.helpers';

/** Lo que hace el controlador de verdad: escribe el archivo y devuelve su ruta. */
const GUARDAR = {
  foto: jest.fn(() => '/activities/1758150000000-abc.jpg'),
  pdf: jest.fn(() => '/activities/1758150000000-abc.pdf'),
};

const INICIO = { lat: 19.0414, lng: -98.2063 };
/** Lo que manda la cámara: el data URL completo, no una ruta. */
const BASE64 = `data:image/jpeg;base64,${'A'.repeat(4000)}`;

function armar(overrides: { evidence?: Record<string, unknown>; activity?: Record<string, unknown> } = {}) {
  const evidence: any = {
    id: 55,
    activityId: 7,
    userId: 3,
    companyId: 1,
    status: 'EXIT_PHOTO',
    reviewStatus: 'PENDING',
    entryLatitude: INICIO.lat,
    entryLongitude: INICIO.lng,
    entryPhotoUploadedAt: new Date('2026-09-17T15:00:00Z'),
    exitPhotoUploadedAt: null,
    ...overrides.evidence,
  };
  const activity: any = {
    id: 7,
    companyId: 1,
    estatus: 'En Proceso',
    coreKind: 'tarea',
    workType: null,
    evidencePhotoRequired: 4,
    responsableId: 3,
    indicaciones: null,
    titulo: 'Mantenimiento',
    anNumber: 'AN-0007',
    ...overrides.activity,
  };

  const prisma: any = {
    activity: {
      findFirst: jest.fn().mockResolvedValue(activity),
      findUnique: jest.fn().mockResolvedValue(activity),
      update: jest.fn(async ({ data }: any) => Object.assign(activity, data)),
    },
    activityEvidence: {
      findFirst: jest.fn().mockResolvedValue(evidence),
      findUnique: jest.fn().mockResolvedValue(evidence),
      findMany: jest.fn().mockResolvedValue([{ userId: 3, status: 'COMPLETED' }]),
      update: jest.fn(async ({ data }: any) => Object.assign(evidence, data)),
      create: jest.fn(async ({ data }: any) => ({ ...evidence, ...data })),
    },
    activityAssignee: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 9, inicioRealAt: new Date('2026-09-17T15:00:00Z'), finRealAt: null, horasReales: null }),
      findMany: jest.fn().mockResolvedValue([{ userId: 3, rol: 'TECNICO' }]),
      update: jest.fn(async ({ data }: any) => data),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 3, nombre: 'Antonio', managerId: null }) },
  };

  const avisos: any = {
    notifyActivityProgress: jest.fn(),
    notifyEvidenceSubmitted: jest.fn(),
    notifyActivityAutoCompleted: jest.fn(),
  };
  const geofence: any = { validarSalida: jest.fn().mockResolvedValue(undefined), estado: jest.fn() };
  const service = new ActivityEvidenceService(prisma, {} as any, avisos, geofence);
  return { service, prisma, avisos, geofence, evidence, activity };
}

/** Última `data` con la que se llamó a `activityEvidence.update`. */
const ultimoUpdate = (prisma: any) => prisma.activityEvidence.update.mock.calls.at(-1)[0].data;

describe('coordenadasDeFoto', () => {
  it('acepta números y también el texto que manda un cliente viejo', () => {
    expect(coordenadasDeFoto(19.0414, -98.2063)).toEqual({ latitude: 19.0414, longitude: -98.2063 });
    expect(coordenadasDeFoto('19.0414', '-98.2063')).toEqual({ latitude: 19.0414, longitude: -98.2063 });
  });

  it('rechaza lo que no es una lectura real', () => {
    expect(coordenadasDeFoto(null, null)).toBeNull();
    expect(coordenadasDeFoto(undefined, undefined)).toBeNull();
    expect(coordenadasDeFoto('', '')).toBeNull();
    expect(coordenadasDeFoto(0, 0)).toBeNull(); // teléfono sin permiso de ubicación
    expect(coordenadasDeFoto(95, 10)).toBeNull();
  });
});

describe('urlDeFotoGuardable', () => {
  it('deja pasar una ruta y rechaza el base64 crudo con un mensaje claro', () => {
    expect(urlDeFotoGuardable('/activities/x.jpg', 'salida')).toBe('/activities/x.jpg');
    // La columna es VARCHAR(500): antes esto llegaba a Postgres y reventaba con un 500.
    expect(() => urlDeFotoGuardable(BASE64, 'salida')).toThrow(/no se subió correctamente/i);
    expect(() => urlDeFotoGuardable('', 'salida')).toThrow(/No llegó la foto/i);
  });
});

describe('saveExitPhoto', () => {
  it('guarda la foto de salida, valida la geocerca y cierra el paso', async () => {
    const { service, prisma, geofence } = armar();
    const out = await service.saveExitPhoto(7, 3, '/activities/salida.jpg', INICIO.lat, INICIO.lng, 1);
    expect(geofence.validarSalida).toHaveBeenCalledWith(7, 3, INICIO.lat, INICIO.lng);
    expect(out.status).toBe('COMPLETED');
    expect(ultimoUpdate(prisma).exitPhotoUrl).toBe('/activities/salida.jpg');
    // La foto de salida cierra el tiempo real de esa persona (contrato del viernes, B).
    expect(prisma.activityAssignee.update).toHaveBeenCalled();
  });

  it('acepta coordenadas que llegan como texto', async () => {
    const { service, geofence } = armar();
    await service.saveExitPhoto(7, 3, '/activities/salida.jpg', '19.0414' as any, '-98.2063' as any, 1);
    expect(geofence.validarSalida).toHaveBeenCalledWith(7, 3, 19.0414, -98.2063);
  });

  it('no guarda el base64 crudo en una columna de 500', async () => {
    const { service } = armar();
    await expect(
      service.saveExitPhoto(7, 3, BASE64, INICIO.lat, INICIO.lng, 1),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('resubmitStep EXIT_PHOTO (corrección)', () => {
  const rechazada = {
    evidence: { status: 'EXIT_PHOTO', reviewStatus: 'REJECTED', rejectedSteps: ['EXIT_PHOTO'] },
  };

  it('no revienta cuando el cuerpo llega sin `data`', async () => {
    const { service } = armar(rechazada);
    // Antes: TypeError leyendo `latitude` de undefined → 500 sin mensaje.
    await expect(service.resubmitStep(7, 3, 'EXIT_PHOTO', undefined, 1)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('guarda la corrección de la foto de salida y cierra el tiempo real', async () => {
    const { service, prisma, geofence } = armar(rechazada);
    await service.resubmitStep(
      7,
      3,
      'EXIT_PHOTO',
      { photoUrl: '/activities/salida-2.jpg', latitude: INICIO.lat, longitude: INICIO.lng },
      1,
    );
    expect(geofence.validarSalida).toHaveBeenCalledWith(7, 3, INICIO.lat, INICIO.lng);
    expect(ultimoUpdate(prisma).exitPhotoUrl).toBe('/activities/salida-2.jpg');
    expect(prisma.activityAssignee.update).toHaveBeenCalled();
  });

  it('rechaza el base64 crudo en vez de dejar que truene la base', async () => {
    const { service } = armar(rechazada);
    await expect(
      service.resubmitStep(7, 3, 'EXIT_PHOTO', { photoUrl: BASE64, latitude: INICIO.lat, longitude: INICIO.lng }, 1),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('materializarAdjuntosDeCorreccion', () => {
  /**
   * La corrección manda la foto igual que el paso original (base64 de la cámara). El
   * controlador la tiene que volver archivo antes de llamar al servicio; sin esto el
   * data URL entero terminaba en `exitPhotoUrl` y la foto de salida fallaba.
   */
  it('convierte a archivo el base64 de la foto de salida y deja el resto igual', () => {
    const salida = materializarAdjuntosDeCorreccion(
      { photoUrl: BASE64, latitude: INICIO.lat, longitude: INICIO.lng },
      GUARDAR,
    );
    expect(salida.photoUrl).toBe('/activities/1758150000000-abc.jpg');
    expect(salida.latitude).toBe(INICIO.lat);
    expect(salida.longitude).toBe(INICIO.lng);
  });

  it('convierte las fotos de evidencia sin tocar las que ya son rutas', () => {
    const salida = materializarAdjuntosDeCorreccion(
      { photoUrls: [BASE64, '/activities/ya-subida.jpg'] },
      GUARDAR,
    );
    expect(salida.photoUrls).toEqual(['/activities/1758150000000-abc.jpg', '/activities/ya-subida.jpg']);
  });

  it('convierte el PDF de la hoja de servicio', () => {
    const salida = materializarAdjuntosDeCorreccion(
      { pdfUrl: `data:application/pdf;base64,${'A'.repeat(900)}` },
      GUARDAR,
    );
    expect(salida.pdfUrl).toBe('/activities/1758150000000-abc.pdf');
  });

  it('no estorba cuando no hay cuerpo', () => {
    expect(materializarAdjuntosDeCorreccion(undefined, GUARDAR)).toBeUndefined();
    expect(materializarAdjuntosDeCorreccion({ formData: { notas: 'ok' } }, GUARDAR)).toEqual({
      formData: { notas: 'ok' },
    });
  });
});
