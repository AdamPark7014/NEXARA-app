import { NotificationHierarchyService } from './notification-hierarchy.service.js';

/**
 * Adam (01-11-2026): «que todo lo vea Cristian, pero Cristian no tenga que hacer nada». Christian hacía
 * el 81 % de las revisiones y recibía cada evidencia: ahora le llega a quien le toca.
 */
function crear(opts: { ceos?: Array<{ id: number }> } = {}) {
  const createNotification = jest.fn(async (_n: any) => ({}));
  const servicio = new NotificationHierarchyService({ createNotification } as any, {} as any);
  jest.spyOn(servicio as any, 'getCeoUserIds').mockResolvedValue((opts.ceos ?? [{ id: 1 }]).map((c) => c.id));
  jest.spyOn(servicio as any, 'getEvidenceReviewerUserIds').mockResolvedValue([1, 2]);
  jest.spyOn(servicio as any, 'getSupervisors').mockResolvedValue([{ id: 1 }]);
  return { servicio, createNotification };
}

const destinos = (m: jest.Mock) => m.mock.calls.map((c) => c[0].userId).sort((a: number, b: number) => a - b);

describe('evidencia lista para revisión', () => {
  it('le llega a su jefe y al responsable, no a dirección', async () => {
    const { servicio, createNotification } = crear();
    await servicio.notifyEvidenceSubmitted(10, 400, 'Cableado', 'Técnico', 'AN-0400', 20, [30], false);
    expect(destinos(createNotification)).toEqual([20, 30]);
    expect(createNotification.mock.calls[0][0]).toMatchObject({ type: 'EVIDENCE_SUBMITTED', priority: 'normal' });
  });

  it('si su jefe es Christian, sí le llega: es su gente', async () => {
    const { servicio, createNotification } = crear();
    await servicio.notifyEvidenceSubmitted(10, 400, 'Facturas', 'Administración', 'AN-0401', 10, [1], false);
    expect(destinos(createNotification)).toEqual([1]);
  });

  it('quien no tiene a nadie arriba no se queda sin revisor', async () => {
    const { servicio, createNotification } = crear();
    await servicio.notifyEvidenceSubmitted(10, 400, 'Cableado', 'Técnico', 'AN-0402', 10, [], false);
    expect(destinos(createNotification)).toEqual([1, 2]);
  });
});

describe('evidencia aprobada o devuelta', () => {
  it('le llega a su dueño y al responsable; a dirección ya no', async () => {
    const { servicio, createNotification } = crear();
    await servicio.notifyEvidenceReview(20, 400, 'Cableado', 'approved', 'David', undefined, [10], 30);
    expect(destinos(createNotification)).toEqual([10, 20]);
  });
});
