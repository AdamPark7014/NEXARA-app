import { VehiclesService } from './vehicles.service';
import { buildApprovalChain, stepRoleAt } from '../common/rbac/hierarchical-approval';
import { ROLES } from '../common/rbac/roles.v2';

/**
 * Autos: Liz (coord_admin) aprueba y la solicitud pasa al CEO. Antes ese paso intermedio solo
 * cambiaba `approvalStep` y nadie se enteraba: la solicitud se quedaba esperando.
 */
describe('solicitud de vehículo · aviso al siguiente aprobador', () => {
  function build(record: Record<string, unknown>) {
    const prisma: any = {
      vehicleControl: {
        findFirst: jest.fn().mockResolvedValue({ id: 9, companyId: 1, estatusAprobacion: 'Pendiente', approvalStep: 0, approvalTrail: [], nombreVehiculo: 'Nissan Frontier', ...record }),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 9, solicitanteId: 5, ...data })),
      },
    };
    const hierarchy = {
      notifyVehicleNextStep: jest.fn().mockResolvedValue(undefined),
      notifyVehicleApproved: jest.fn().mockResolvedValue(undefined),
      notifyVehicleRejected: jest.fn().mockResolvedValue(undefined),
    };
    const service = new VehiclesService(prisma, hierarchy as any);
    return { service, prisma, hierarchy };
  }

  it('la cadena real de autos es Liz y luego CEO', () => {
    const chain = buildApprovalChain('vehicles', 0);
    expect(chain.map((s) => s.role)).toEqual([ROLES.COORD_ADMIN, ROLES.CEO]);
    expect(stepRoleAt(chain, 1)).toBe(ROLES.CEO);
  });

  it('cuando Liz aprueba, avisa al CEO con su nombre y su nota', async () => {
    const { service, hierarchy } = build({});
    const liz = { id: 3, nombre: 'Liz', roleKey: ROLES.COORD_ADMIN };
    const res: any = await service.approveOrReject(9, liz, 'approve', { note: 'va a Puebla centro' }, 1);

    expect(res.estatusAprobacion).toBe('Pendiente');
    expect(res.approvalStep).toBe(1);
    expect(hierarchy.notifyVehicleNextStep).toHaveBeenCalledWith(9, ROLES.CEO, 'Liz', 'Nissan Frontier', 'va a Puebla centro');
    expect(hierarchy.notifyVehicleApproved).not.toHaveBeenCalled();
  });

  it('cuando el CEO da la autorización final no hay paso siguiente: avisa al solicitante', async () => {
    const { service, hierarchy } = build({ approvalStep: 1 });
    const ceo = { id: 1, nombre: 'Director', roleKey: ROLES.CEO };
    await service.approveOrReject(9, ceo, 'approve', {}, 1);

    expect(hierarchy.notifyVehicleNextStep).not.toHaveBeenCalled();
    expect(hierarchy.notifyVehicleApproved).toHaveBeenCalledWith(5, 9, 'Nissan Frontier');
  });
});
