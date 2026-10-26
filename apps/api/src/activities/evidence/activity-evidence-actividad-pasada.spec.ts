import { ActivityEvidenceService, urlDeFotoGuardable } from './activity-evidence.service';

/**
 * Texto viejo, dos frases, citado para que no vuelva:
 * «Ya no estás en esta actividad: se la pasaron a otro compañero. Tu avance quedó guardado.»
 * «No se pudo guardar la foto de salida: la imagen no se subió correctamente. Vuelve a tomarla.»
 */
const PASADA_VIEJO =
  'Ya no estás en esta actividad: se la pasaron a otro compañero. Tu avance quedó guardado.';
const PASADA =
  'Ya no estás en esta actividad: se la pasaron a otro compañero y tu avance quedó guardado.';

const FOTO_VIEJO =
  'No se pudo guardar la foto de salida: la imagen no se subió correctamente. Vuelve a tomarla.';
const FOTO =
  'No se pudo guardar la foto de salida: la imagen no se subió correctamente, vuelve a tomarla.';

const BASE64 = `data:image/jpeg;base64,${'A'.repeat(4000)}`;

function frases(texto: string): string[] {
  return texto
    .split(/[.!?]+/)
    .map((parte) => parte.trim())
    .filter(Boolean);
}

describe('avisos cuando la actividad ya es de otro', () => {
  it('deja los dos avisos en una sola frase y cita el texto viejo', async () => {
    const activity = {
      id: 7,
      estatus: 'En Proceso',
      companyId: 1,
      workType: null,
      coreKind: 'tarea',
      evidencePhotoRequired: 4,
      responsableId: 9,
      indicaciones: null,
    };
    const prisma: any = {
      activity: { findFirst: jest.fn().mockResolvedValue(activity) },
      activityAssignee: {
        findFirst: jest.fn().mockResolvedValue({ retiradoAt: new Date('2026-10-01T12:00:00Z') }),
      },
      activityEvidence: { findFirst: jest.fn(), create: jest.fn() },
    };
    const service = new ActivityEvidenceService(prisma, {} as any, {} as any);

    await expect(service.getOrCreateActivityEvidence(7, 3, 1)).rejects.toMatchObject({
      message: PASADA,
      status: 403,
    });
    expect(PASADA).not.toBe(PASADA_VIEJO);
    expect(frases(PASADA)).toEqual([
      'Ya no estás en esta actividad: se la pasaron a otro compañero y tu avance quedó guardado',
    ]);
    expect(prisma.activityEvidence.create).not.toHaveBeenCalled();

    expect(() => urlDeFotoGuardable(BASE64, 'salida')).toThrow(FOTO);
    expect(FOTO).not.toBe(FOTO_VIEJO);
    expect(FOTO).toMatch(/no se subió correctamente/i);
    expect(frases(FOTO)).toEqual([
      'No se pudo guardar la foto de salida: la imagen no se subió correctamente, vuelve a tomarla',
    ]);
  });
});
