import { ForbiddenException } from '@nestjs/common';
import { OperationalProjectsService } from './operational-projects.service';

// Solo Christian desactiva, reactiva o elimina proyectos (misma regla que clientes).
describe('OperationalProjectsService: desactivar y eliminar', () => {
  const proyecto = { id: 7, status: 'ACTIVE', companyId: 1 };
  const nuevo = () => {
    const update = jest.fn().mockResolvedValue({ ...proyecto, status: 'ON_HOLD' });
    const prisma: any = {
      operationalProject: { findFirst: jest.fn().mockResolvedValue(proyecto), update },
    };
    const service = new OperationalProjectsService(prisma, {} as any);
    return { service, update };
  };
  const christian = { id: 1, email: 'gerencia@nexara.com.mx' };
  const jefe = { id: 9, email: 'jefe@nexara.com.mx', roleKey: 'dir_operaciones' };

  it('un jefe no puede desactivar ni eliminar', async () => {
    const { service, update } = nuevo();
    await expect(service.setActive(7, false, jefe, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(7, jefe, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.changeStatus(7, { status: 'ON_HOLD' }, 1, jefe)).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('Christian desactiva (En pausa) y elimina con borrado lógico', async () => {
    const { service, update } = nuevo();
    await service.setActive(7, false, christian, 1);
    expect(update.mock.calls[0][0].data.status).toBe('ON_HOLD');
    await expect(service.remove(7, christian, 1)).resolves.toEqual({ ok: true, id: 7 });
    expect(update.mock.calls[1][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('un jefe sigue pudiendo marcar un proyecto como completado', async () => {
    const { service, update } = nuevo();
    await service.changeStatus(7, { status: 'COMPLETED' }, 1, jefe);
    expect(update.mock.calls[0][0].data.status).toBe('COMPLETED');
  });
});
