import { BadRequestException } from '@nestjs/common';
import { ActivitySessionsService } from './activity-sessions.service';

/**
 * El reloj no volvió a abrirse. El aviso era dos frases; ahora es una.
 * Quién puede reanudar no cambia: sigue la persona asignada, y el fallo
 * sigue siendo que `abrir` no dejó la sesión corriendo.
 *
 * Texto viejo: «No se pudo reanudar la actividad. Intenta de nuevo.»
 */
const FRASE = 'No se pudo reanudar la actividad: intenta de nuevo.';
const TEXTO_VIEJO = 'No se pudo reanudar la actividad. Intenta de nuevo.';

const EMPRESA = 7;
const TECNICO = 30;

describe('reanudar cuando el reloj no se abre', () => {
  it('lo dice en una frase, y ya no con el texto viejo de dos frases', async () => {
    const sesiones = [
      {
        id: 1,
        activityId: 10,
        userId: TECNICO,
        companyId: EMPRESA,
        startedAt: new Date('2026-09-15T15:00:00-06:00'),
        endedAt: new Date('2026-09-15T17:00:00-06:00'),
        endReason: 'PAUSA',
        endedById: TECNICO,
        nota: null,
      },
    ];
    const prisma: any = {
      activityWorkSession: {
        findMany: jest.fn(async () => sesiones.map((s) => ({ ...s, endedBy: null }))),
        create: jest.fn(async () => {
          throw new Error('la base no escribió la sesión');
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => sesiones.length),
      },
      activityAssignee: {
        findFirst: jest.fn(async () => ({
          id: 9,
          companyId: EMPRESA,
          rol: 'TECNICO',
          retiradoAt: null,
          inicioRealAt: new Date('2026-09-15T15:00:00-06:00'),
          finRealAt: null,
          activity: {
            titulo: 'Instalar cámaras',
            estatus: 'En Proceso',
            assignmentCharge: 'ejecucion',
            deletedAt: null,
          },
        })),
      },
      activity: { findFirst: jest.fn(async () => null) },
      attendance: { findFirst: jest.fn(async () => null) },
      user: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    };
    const service = new ActivitySessionsService(prisma);

    let mensaje = '';
    try {
      await service.reanudar({ userId: TECNICO, activityId: 10, companyId: EMPRESA });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      mensaje = error instanceof BadRequestException ? error.message : '';
    }

    expect(mensaje).toBe(FRASE);
    expect(mensaje).not.toBe(TEXTO_VIEJO);
    expect(mensaje).not.toContain('Intenta de nuevo.');
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].endedAt).not.toBeNull();
  });
});
