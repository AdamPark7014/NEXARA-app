import { BadRequestException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

/**
 * Perfil desactivado: su historial se queda, pero ya no se le asigna nada. El selector ya lo
 * esconde; esto cierra la puerta en la API (dirección o el mismo departamento pasaban el permiso
 * de asignación sin mirar si la persona seguía activa).
 */
function build(persona: { isActive: boolean; nombre: string } | null) {
  const create = jest.fn();
  const update = jest.fn();
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(persona) },
    activity: {
      findFirst: jest.fn().mockResolvedValue({ estatus: 'Asignada', responsableId: 39, companyId: 1 }),
      create,
      update,
    },
  };
  const service = new ActivitiesService(prisma as never, {} as never, { publishEntityLifecycle: jest.fn() } as never);
  return { service, create, update };
}

describe('no se asigna trabajo a un perfil desactivado', () => {
  it('alta: rechaza si el responsable está desactivado', async () => {
    const { service, create } = build({ isActive: false, nombre: 'Juan Pérez' });
    await expect(
      service.create({ titulo: 'Revisión', responsableId: 77, creadoPorId: 1 } as never, 1),
    ).rejects.toThrow(new BadRequestException('Juan Pérez está desactivado; no se le puede asignar trabajo'));
    expect(create).not.toHaveBeenCalled();
  });

  it('reasignar: rechaza pasar la actividad a alguien desactivado', async () => {
    const { service, update } = build({ isActive: false, nombre: 'Juan Pérez' });
    await expect(service.update(31, { responsableId: 77 } as never, { id: 1 }, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('editar otra cosa de una actividad que ya era suya no revisa al responsable', async () => {
    const { service } = build({ isActive: false, nombre: 'Juan Pérez' });
    const svc = service as unknown as { assertResponsableActivo: jest.Mock };
    const spy = jest.spyOn(svc, 'assertResponsableActivo');
    await service.update(31, { responsableId: 39 } as never, { id: 1 }, 1).catch(() => undefined);
    expect(spy).not.toHaveBeenCalled();
  });
});
