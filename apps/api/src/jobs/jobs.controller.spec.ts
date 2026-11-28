import { PERMISSIONS } from '../common/permissions';
import { JobsController } from './jobs.controller';

describe('JobsController', () => {
  const cola = {
    getStats: jest.fn(),
    getDlq: jest.fn(),
    getStatsDetallado: jest.fn(),
    enqueue: jest.fn(),
  };
  const controlador = new JobsController(cola as never);

  beforeEach(() => jest.clearAllMocks());

  it('GET /jobs/dlq espera al servicio y conserva la forma { items }', async () => {
    cola.getDlq.mockResolvedValue([{ id: '7', name: 'email.send', origen: 'memoria' }]);

    await expect(controlador.dlq()).resolves.toEqual({ items: [{ id: '7', name: 'email.send', origen: 'memoria' }] });
  });

  it('GET /jobs/stats/detalle devuelve lo que calcula el servicio', async () => {
    const detalle = { backend: 'bullmq', colas: [], redis: null };
    cola.getStatsDetallado.mockResolvedValue(detalle);

    await expect(controlador.statsDetalle()).resolves.toBe(detalle);
  });

  it('GET /jobs/stats sigue igual', () => {
    cola.getStats.mockReturnValue({ backend: 'memory' });

    expect(controlador.stats()).toEqual({ backend: 'memory' });
  });

  it('las rutas nuevas piden el mismo permiso de administración que las demás', () => {
    const permisosDe = (metodo: keyof JobsController) =>
      Reflect.getMetadata('rbac', JobsController.prototype[metodo] as unknown as object)?.permissions;

    expect(permisosDe('statsDetalle')).toEqual([PERMISSIONS.CONSOLE_ADMIN]);
    expect(permisosDe('dlq')).toEqual([PERMISSIONS.CONSOLE_ADMIN]);
    expect(permisosDe('stats')).toEqual([PERMISSIONS.CONSOLE_ADMIN]);
  });
});
