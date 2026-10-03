import { NotificationHierarchyService } from './notification-hierarchy.service.js';

/**
 * Textos de los avisos de actividad que dependen de dos reglas de Adam (02-10):
 * lo comercial no es trabajo «en sitio» (no «llega», inicia la actividad) y el radio de la
 * geocerca pasó de 100 m a 500 m.
 */
function crear(actividad: { coreKind: string | null }) {
  const createNotification = jest.fn(async (_n: any) => ({}));
  const prisma = {
    activity: {
      findUnique: jest.fn(async () => ({
        titulo: 'Visita a Grupo Alfa',
        coreKind: actividad.coreKind,
        responsableId: 5,
        creadoPorId: 5,
        client: { name: 'Grupo Alfa' },
      })),
    },
    user: {
      findUnique: jest.fn(async () => ({ id: 41, nombre: 'Paulina Tlapaltotoli', managerId: null, department: null, role: null })),
      findMany: jest.fn(async () => []),
    },
    activityAssignee: { findMany: jest.fn(async () => []) },
  };
  const servicio = new NotificationHierarchyService({ createNotification } as any, prisma as any);
  return { servicio, createNotification };
}

const mensajes = (createNotification: jest.Mock) => createNotification.mock.calls.map((c) => String(c[0].message));

describe('aviso de inicio de una actividad', () => {
  it('comercial: dice «Inicio de actividad», no «Llegó»', async () => {
    const { servicio, createNotification } = crear({ coreKind: 'comercial' });
    await servicio.notifyActivityProgress({ activityId: 9, actorId: 41, paso: 'inicio', at: new Date('2026-10-02T16:30:00Z') });
    expect(createNotification).toHaveBeenCalledTimes(1);
    const [mensaje] = mensajes(createNotification);
    expect(mensaje).toContain('Inicio de actividad a las');
    expect(mensaje).not.toContain('Llegó');
  });

  it.each(['servicio', 'proyecto', 'obra', 'tarea', null])('%s: sigue diciendo «Llegó a las…»', async (coreKind) => {
    const { servicio, createNotification } = crear({ coreKind });
    await servicio.notifyActivityProgress({ activityId: 9, actorId: 41, paso: 'inicio', at: new Date('2026-10-02T16:30:00Z') });
    const [mensaje] = mensajes(createNotification);
    expect(mensaje).toContain('Llegó a las');
  });
});

describe('aviso de salida de zona', () => {
  it('a la persona le dice el máximo vigente: 500 m', async () => {
    const { servicio, createNotification } = crear({ coreKind: 'obra' });
    await servicio.notifyActivityOutOfZone({ activityId: 9, userId: 41, distanciaM: 730, alertId: 3 });
    const propio = createNotification.mock.calls.map((c) => c[0]).find((n) => n.userId === 41);
    expect(propio.message).toContain('Te alejaste 730 m del punto de inicio (máx. 500 m)');
  });
});
