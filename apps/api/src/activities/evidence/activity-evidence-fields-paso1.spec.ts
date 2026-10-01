import { BadRequestException } from '@nestjs/common';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service';

/**
 * Adam vio en el panel que AN-0031 tenía «Evidencia por campos» 2/2 completa sin que a Antonio le
 * apareciera hecho el Paso 1 (foto de entrada): el flujo va por pasos, nadie debería poder
 * documentar un campo sin haber tomado antes su foto de entrada.
 */
function build(opts: { entryPhotoUrl?: string | null; campo?: Record<string, unknown> | null }) {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = {
    activity: {
      findFirst: jest.fn().mockResolvedValue({ id: 31, companyId: 1, estatus: 'En Proceso', titulo: 'Levantamiento', anNumber: 'AN-0031' }),
    },
    activityEvidence: {
      findFirst: jest.fn().mockResolvedValue(opts.entryPhotoUrl === undefined ? null : { entryPhotoUrl: opts.entryPhotoUrl }),
    },
    activityEvidenceField: {
      findFirst: jest.fn().mockResolvedValue(
        opts.campo ?? { id: 15, nombre: 'Cámara 1', momentos: ['ANTES', 'DESPUES'] },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    activityEvidenceFieldPhoto: { upsert },
  };
  const service = new ActivityEvidenceFieldsService(prisma as never);
  return { service, prisma, upsert };
}

const foto = {
  activityId: 31,
  fieldId: 15,
  momento: 'ANTES',
  photoUrl: '/activities/foto.jpg',
  userId: 39,
  companyId: 1,
};

describe('Evidencia por campos: nadie documenta sin haber tomado antes la foto de entrada', () => {
  it('sin foto de entrada, bloquea con un mensaje claro', async () => {
    await expect(build({ entryPhotoUrl: undefined }).service.guardarFoto(foto)).rejects.toThrow(
      'Primero toma la foto de entrada',
    );
  });

  it('con ActivityEvidence pero entryPhotoUrl vacío, también bloquea', async () => {
    const { service, upsert } = build({ entryPhotoUrl: null });
    await expect(service.guardarFoto(foto)).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('con la foto de entrada ya tomada, guarda la foto del campo', async () => {
    const { service, upsert } = build({ entryPhotoUrl: '/activities/entrada.jpg' });
    await service.guardarFoto(foto);
    expect(upsert).toHaveBeenCalled();
  });
});
