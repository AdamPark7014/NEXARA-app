import { NotificationsService } from './notifications.service.js';

function crear(preferencia: string | null | 'falla') {
  const create = jest.fn(async ({ data }: any) => ({ id: 1, ...data, triggerUser: null }));
  const findUnique = jest.fn(async () => {
    if (preferencia === 'falla') throw new Error('caída');
    return preferencia == null ? null : { value: preferencia };
  });
  const prisma: any = {
    notification: { create, findFirst: jest.fn(async () => null) },
    userPreference: { findUnique },
  };
  const push = { sendToUser: jest.fn(async () => undefined) };
  const servicio = new NotificationsService(prisma, push as any);
  return { servicio, create, findUnique };
}

const informativo = { userId: 5, type: 'EVIDENCE_SUBMITTED', category: 'evidence', title: 't', message: 'm' };

describe('NotificationsService · modo «solo el resumen y lo urgente»', () => {
  it('con el modo activado, un aviso informativo no se crea', async () => {
    const { servicio, create } = crear('1');
    expect(await servicio.createNotification(informativo)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('con el modo activado, lo urgente y lo que pide decisión sí llega', async () => {
    const { servicio, create } = crear('1');
    await servicio.createNotification({ ...informativo, priority: 'high' });
    await servicio.createNotification({ userId: 5, type: 'WORKFLOW_PENDING', category: 'workflow', title: 't', message: 'm' });
    await servicio.createNotification({ ...informativo, category: 'resumen-ceo' });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('sin el modo (o con la preferencia en 0), todo llega como siempre', async () => {
    const sin = crear(null);
    await sin.servicio.createNotification(informativo);
    expect(sin.create).toHaveBeenCalledTimes(1);

    const apagado = crear('0');
    await apagado.servicio.createNotification(informativo);
    expect(apagado.create).toHaveBeenCalledTimes(1);
  });

  it('si la preferencia no se puede leer, se avisa (ante la duda no se esconde nada)', async () => {
    const { servicio, create } = crear('falla');
    await servicio.createNotification(informativo);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('solo consulta la preferencia para avisos informativos y la guarda un rato', async () => {
    const { servicio, findUnique } = crear('0');
    await servicio.createNotification({ userId: 5, type: 'SLA_ALERT', category: 'sla', title: 't', message: 'm' });
    expect(findUnique).not.toHaveBeenCalled();
    await servicio.createNotification(informativo);
    await servicio.createNotification({ ...informativo, title: 'otro' });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
