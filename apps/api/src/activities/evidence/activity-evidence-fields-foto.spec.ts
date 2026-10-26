import { BadRequestException } from '@nestjs/common';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service';

/**
 * La foto de un punto que no llegó al servidor se avisaba en dos frases.
 * El nombre sale del campo (`Cámara 1` es el dato de la fila, no un destino inventado).
 */
const FRASE_VIEJA =
  'No se pudo guardar la foto de «Cámara 1»: la imagen no se subió correctamente. Vuelve a tomarla.';
const FRASE =
  'No se pudo guardar la foto de «Cámara 1»: la imagen no se subió correctamente, vuelve a tomarla.';

function build() {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = {
    activity: {
      findFirst: jest.fn().mockResolvedValue({
        id: 31,
        companyId: 1,
        estatus: 'En Proceso',
        titulo: 'Levantamiento',
        anNumber: 'AN-0031',
      }),
    },
    activityEvidence: {
      findFirst: jest.fn().mockResolvedValue({ entryPhotoUrl: '/activities/entrada.jpg', status: 'IN_PROGRESS', reviewStatus: 'PENDING' }),
    },
    activityEvidenceField: {
      findFirst: jest.fn().mockResolvedValue({ id: 15, nombre: 'Cámara 1', momentos: ['ANTES', 'DESPUES'] }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    activityEvidenceFieldPhoto: { upsert, findFirst: jest.fn().mockResolvedValue(null) },
    activityAssignee: { findFirst: jest.fn().mockResolvedValue({ id: 70 }) },
  };
  const service = new ActivityEvidenceFieldsService(prisma as never);
  return { service, upsert };
}

describe('foto de un punto que no se subió', () => {
  it('lo dice en una sola frase y ya no usa las dos de antes', async () => {
    const { service, upsert } = build();
    const dataUrl = `data:image/jpeg;base64,${'A'.repeat(40)}`;

    await expect(
      service.guardarFoto({
        activityId: 31,
        fieldId: 15,
        momento: 'ANTES',
        photoUrl: dataUrl,
        userId: 39,
        companyId: 1,
      }),
    ).rejects.toThrow(FRASE);

    await expect(
      service.guardarFoto({
        activityId: 31,
        fieldId: 15,
        momento: 'ANTES',
        photoUrl: dataUrl,
        userId: 39,
        companyId: 1,
      }),
    ).rejects.not.toThrow(FRASE_VIEJA);

    expect(FRASE_VIEJA).toContain('. Vuelve a tomarla.');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('la excepción es 400 y el texto es exactamente la frase nueva, no la vieja', async () => {
    const { service } = build();
    const error = await service
      .guardarFoto({
        activityId: 31,
        fieldId: 15,
        momento: 'ANTES',
        photoUrl: 'data:image/jpeg;base64,AAAA',
        userId: 39,
        companyId: 1,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    const mensaje = (error as BadRequestException).message;
    expect(mensaje).toBe(FRASE);
    expect(mensaje).not.toBe(FRASE_VIEJA);
  });
});
