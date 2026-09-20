import { ToolRequestsService } from './tool-requests.service.js';
import { TOOLS_MANAGE_EMAILS } from './tools-access.js';

/**
 * Entrega de una herramienta física bajo concurrencia.
 *
 * Se comprobaba que el artículo estuviera AVAILABLE y **después** se escribía
 * ASSIGNED. Entre las dos cosas caben dos entregas: ambas leían AVAILABLE,
 * ambas pasaban, y la misma herramienta quedaba asignada a dos personas que
 * creen tenerla.
 */

const SOLICITUD = { id: 5, inventoryItemId: 42, usuarioId: 3, toolName: 'Multímetro' };

/** Entregar es administrar: solo Christian e Iván. Iván firma estas entregas. */
const ENCARGADO = { managerEmail: TOOLS_MANAGE_EMAILS[1] };

function build(over: { itemStatus?: string; filasAsignadas?: number } = {}) {
  const tx = {
    toolInventoryItem: {
      findFirst: jest.fn().mockResolvedValue({ status: over.itemStatus ?? 'AVAILABLE' }),
      updateMany: jest.fn().mockResolvedValue({ count: over.filasAsignadas ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    toolRequest: { update: jest.fn().mockResolvedValue({ id: 5, usuario: { id: 3 } }) },
  };

  const prisma = {
    toolRequest: { findFirst: jest.fn().mockResolvedValue(SOLICITUD) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  const service = new ToolRequestsService(
    prisma as any,
    { notifyToolReview: jest.fn().mockResolvedValue(undefined) } as any,
    {} as any,
  );
  // `findById` consulta con includes que no aportan a esta prueba.
  (service as any).findById = jest.fn().mockResolvedValue(SOLICITUD);
  return { service, tx };
}

describe('entregar una herramienta', () => {
  it('la asignación va condicionada a que siga disponible', async () => {
    const { service, tx } = build();
    await service.deliver(5, 7, ENCARGADO);

    const args = tx.toolInventoryItem.updateMany.mock.calls[0][0];
    expect(args.where.status).toBe('AVAILABLE');
    expect(args.data.status).toBe('ASSIGNED');
  });

  it('no usa un update sin guardia', async () => {
    // Era el fallo: dos entregas simultaneas pasaban las dos.
    const { service, tx } = build();
    await service.deliver(5, 7, ENCARGADO);
    expect(tx.toolInventoryItem.update).not.toHaveBeenCalled();
  });

  it('si otra entrega se adelantó, falla en vez de duplicar la asignación', async () => {
    const { service } = build({ filasAsignadas: 0 });
    await expect(service.deliver(5, 7, ENCARGADO)).rejects.toThrow(/ya no está disponible/);
  });

  it('rechaza entregar una herramienta que no está disponible', async () => {
    const { service } = build({ itemStatus: 'ASSIGNED' });
    await expect(service.deliver(5, 7, ENCARGADO)).rejects.toThrow(/ya no está disponible/);
  });

  it('quien no administra herramientas no entrega, aunque la haya disponible', async () => {
    const { service, tx } = build();
    await expect(
      service.deliver(5, 7, { managerEmail: 'operaciones@nexara.com.mx' }),
    ).rejects.toThrow(/Christian e Iván/);
    expect(tx.toolInventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('sin firma de quien entrega, no se entrega', async () => {
    const { service, tx } = build();
    await expect(service.deliver(5, 7)).rejects.toThrow(/Christian e Iván/);
    expect(tx.toolInventoryItem.updateMany).not.toHaveBeenCalled();
  });
});
