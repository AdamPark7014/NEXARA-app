import { ToolRequestsService } from './tool-requests.service.js';
import { TOOLS_MANAGE_EMAILS } from './tools-access.js';

/**
 * Entrega y devolución con evidencia (Adam, 21-11-2026): la herramienta sale con fotos de
 * «antes» y quien la entregó; vuelve con su estado, fotos de «después» y quien la recibió.
 * Las apps anteriores siguen entregando y recibiendo sin nada de eso.
 */

const EN_USO = { id: 5, inventoryItemId: 42, usuarioId: 3, toolName: 'Multímetro', status: 'IN_USE' };
const FOTOS = [{ url: '/uploads/tools/despues-1.jpg' }, { url: '/uploads/tools/despues-2.jpg' }];

function build(solicitud: Record<string, unknown> = EN_USO) {
  const tx = {
    toolInventoryItem: {
      findFirst: jest.fn().mockResolvedValue({ status: 'AVAILABLE' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    toolRequest: { update: jest.fn().mockResolvedValue({ id: 5, usuario: { id: 3 } }) },
  };
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const service = new ToolRequestsService(
    prisma as any,
    { notifyToolReview: jest.fn().mockResolvedValue(undefined) } as any,
    {} as any,
  );
  (service as any).findById = jest.fn().mockResolvedValue(solicitud);
  return { service, tx };
}

describe('entregar con evidencia', () => {
  it('guarda las fotos de antes y quién entregó', async () => {
    const { service, tx } = build({ ...EN_USO, status: 'APPROVED' });
    await service.deliver(5, 7, {
      managerEmail: TOOLS_MANAGE_EMAILS[1],
      entregadoPorId: 9,
      fotos: [{ url: '/uploads/tools/antes.jpg' }, { url: 'data:image/png;base64,AAAA' }],
    });
    const data = tx.toolRequest.update.mock.calls[0][0].data;
    expect(data.deliveredById).toBe(9);
    expect(data.deliveryPhotos).toEqual([{ url: '/uploads/tools/antes.jpg' }]);
    expect(data.status).toBe('IN_USE');
  });

  it('una app anterior entrega sin fotos y no escribe una lista vacía', async () => {
    const { service, tx } = build({ ...EN_USO, status: 'APPROVED' });
    await service.deliver(5, 7, { managerEmail: TOOLS_MANAGE_EMAILS[1] });
    const data = tx.toolRequest.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('deliveryPhotos');
    expect(data.deliveredById).toBeNull();
  });
});

describe('recibir una herramienta', () => {
  it('en buen estado: vuelve disponible, con fotos y quién la recibió', async () => {
    const { service, tx } = build();
    await service.return(5, undefined, undefined, 7, { condicion: 'BIEN', fotos: FOTOS, recibidoPorId: 9 });
    const data = tx.toolRequest.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'RETURNED',
      returnCondition: 'BIEN',
      returnPhotos: FOTOS,
      receivedById: 9,
      damageDescription: null,
      damagePhotoUrl: null,
    });
    expect(tx.toolInventoryItem.update.mock.calls[0][0].data).toEqual({ status: 'AVAILABLE' });
  });

  it('dañada: queda en reparación y la primera foto llena la foto de daño', async () => {
    const { service, tx } = build();
    await service.return(5, 'Pantalla rota', undefined, 7, { condicion: 'DANADA', fotos: FOTOS, recibidoPorId: 9 });
    const data = tx.toolRequest.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'DAMAGED',
      returnCondition: 'DANADA',
      damageDescription: 'Pantalla rota',
      damagePhotoUrl: FOTOS[0].url,
      returnNotes: null,
    });
    expect(tx.toolInventoryItem.update.mock.calls[0][0].data).toEqual({ status: 'IN_REPAIR' });
  });

  it('desgaste normal: disponible, y la nota no se guarda como daño', async () => {
    const { service, tx } = build();
    await service.return(5, 'Puntas gastadas', undefined, 7, { condicion: 'DESGASTE', fotos: FOTOS });
    const data = tx.toolRequest.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'RETURNED', damageDescription: null, returnNotes: 'Puntas gastadas' });
  });

  it('extraviada: se da de baja con su motivo', async () => {
    const { service, tx } = build();
    await service.return(5, 'Se quedó en la obra', undefined, 7, { condicion: 'EXTRAVIADA', fotos: [] });
    expect(tx.toolRequest.update.mock.calls[0][0].data).toMatchObject({ status: 'DAMAGED', returnCondition: 'EXTRAVIADA' });
    expect(tx.toolInventoryItem.update.mock.calls[0][0].data).toEqual({
      status: 'RETIRED',
      retiredReason: 'Extraviada en préstamo: Se quedó en la obra',
    });
  });

  it('una app anterior (sin condición) sigue recibiendo: con daño y sin daño', async () => {
    const conDanio = build();
    await conDanio.service.return(5, 'Cable pelado', undefined, 7);
    expect(conDanio.tx.toolRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'DAMAGED',
      returnCondition: 'DANADA',
      damageDescription: 'Cable pelado',
    });

    const sinDanio = build();
    await sinDanio.service.return(5, undefined, undefined, 7);
    expect(sinDanio.tx.toolRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'RETURNED',
      returnCondition: 'BIEN',
    });
  });

  it('con condición y sin foto no se recibe ni se toca el inventario', async () => {
    const { service, tx } = build();
    await expect(service.return(5, undefined, undefined, 7, { condicion: 'BIEN', fotos: [] })).rejects.toThrow(
      /foto de cómo vuelve/,
    );
    expect(tx.toolRequest.update).not.toHaveBeenCalled();
    expect(tx.toolInventoryItem.update).not.toHaveBeenCalled();
  });

  it('doble toque: lo ya recibido no se recibe otra vez', async () => {
    const { service, tx } = build({ ...EN_USO, status: 'RETURNED' });
    await expect(service.return(5, undefined, undefined, 7, { condicion: 'BIEN', fotos: FOTOS })).rejects.toThrow(
      /ya se recibió/,
    );
    expect(tx.toolRequest.update).not.toHaveBeenCalled();
  });
});
