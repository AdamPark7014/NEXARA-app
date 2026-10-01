import { BadRequestException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

/**
 * El gate de evidencias mínimas antes de Finalizada: una actividad con «Evidencia por campos»
 * (AN-0031 de Antonio, en producción) se queda bloqueada para siempre si el gate solo mira las
 * categorías fijas (llegada/salida/hoja) del modelo `Evidence` viejo, que esos campos nunca
 * llenan. Debe mandar el progreso de los campos cuando la actividad los tiene.
 */
function build(opts: {
  prev?: Record<string, unknown> | null;
  campos?: Array<{ nombre: string; momentos: string[]; fotos: Array<{ momento: string }> }>;
  legacyEvidence?: Array<{ tipoEvidencia: string }>;
}) {
  const update = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 31, anNumber: 'AN-0031', titulo: 'Levantamiento', responsableId: 39, companyId: 1, ...args.data }),
  );
  const prisma = {
    activity: {
      findFirst: jest.fn().mockResolvedValue(opts.prev ?? { estatus: 'En Proceso', companyId: 1, anNumber: 'AN-0031', titulo: 'Levantamiento' }),
      update,
    },
    activityEvidenceField: { findMany: jest.fn().mockResolvedValue(opts.campos ?? []) },
    evidence: { findMany: jest.fn().mockResolvedValue(opts.legacyEvidence ?? []) },
  };
  const avisos = { notifyActivityMarkedFinished: jest.fn().mockResolvedValue(undefined), notifyActivityStarted: jest.fn().mockResolvedValue(undefined) };
  const eventos = { publishEntityLifecycle: jest.fn() };
  const service = new ActivitiesService(prisma as never, avisos as never, eventos as never);
  return { service, update, prisma };
}

describe('gate de evidencias mínimas antes de Finalizada', () => {
  it('con «Evidencia por campos» 100% completa, finaliza sin tocar el modelo Evidence viejo', async () => {
    const { service, update, prisma } = build({
      campos: [
        {
          nombre: 'Cámara 1',
          momentos: ['ANTES', 'DESPUES'],
          fotos: [{ momento: 'ANTES' }, { momento: 'DESPUES' }],
        },
      ],
    });
    await service.update(31, { estatus: 'Finalizada' } as never, { id: 1 }, 1);
    expect(update).toHaveBeenCalled();
    expect(prisma.evidence.findMany).not.toHaveBeenCalled();
  });

  it('con «Evidencia por campos» incompleta, bloquea y dice qué falta', async () => {
    const { service, update } = build({
      campos: [
        {
          nombre: 'Cámara 1',
          momentos: ['ANTES', 'DESPUES'],
          fotos: [{ momento: 'ANTES' }],
        },
      ],
    });
    await expect(service.update(31, { estatus: 'Finalizada' } as never, { id: 1 }, 1)).rejects.toMatchObject({
      response: { missingEvidence: ['Cámara 1 (después)'] },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('sin campos propios, sigue el flujo viejo (llegada + salida/hoja del modelo Evidence)', async () => {
    const { service, update } = build({ campos: [], legacyEvidence: [{ tipoEvidencia: 'Foto llegada' }, { tipoEvidencia: 'Foto salida' }] });
    await service.update(31, { estatus: 'Finalizada' } as never, { id: 1 }, 1);
    expect(update).toHaveBeenCalled();
  });

  it('sin campos propios y sin evidencia vieja, sigue bloqueando como siempre', async () => {
    const { service } = build({ campos: [], legacyEvidence: [] });
    await expect(service.update(31, { estatus: 'Finalizada' } as never, { id: 1 }, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
