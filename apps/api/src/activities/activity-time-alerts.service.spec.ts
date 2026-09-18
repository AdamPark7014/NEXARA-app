import { ActivityTimeAlertsService } from './activity-time-alerts.service';

const AHORA = new Date('2026-09-18T18:00:00.000Z');
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);

function build(filas: unknown[]) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = { activityAssignee: { findMany: jest.fn().mockResolvedValue(filas), update } };
  const avisos = { notifyActivityOvertime: jest.fn().mockResolvedValue(undefined) };
  const service = new ActivityTimeAlertsService(prisma as never, avisos as never);
  return { service, prisma, avisos, update };
}

const fila = (over: Record<string, unknown> = {}) => ({
  id: 1,
  userId: 9,
  activityId: 10,
  horasPlan: '2',
  inicioRealAt: hace(155),
  activity: { estatus: 'En Proceso' },
  ...over,
});

describe('aviso de tiempo excedido', () => {
  it('avisa una vez y deja marcado alertaExcesoAt', async () => {
    const { service, avisos, update } = build([fila()]);
    await (service as never as { escanear: (d: Date) => Promise<void> }).escanear(AHORA);

    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { alertaExcesoAt: AHORA } });
    expect(avisos.notifyActivityOvertime).toHaveBeenCalledWith({
      activityId: 10,
      userId: 9,
      minutosPlan: 120,
      minutosReales: 155,
    });
  });

  it('no avisa si todavía está dentro del plan', async () => {
    const { service, avisos, update } = build([fila({ inicioRealAt: hace(30) })]);
    await (service as never as { escanear: (d: Date) => Promise<void> }).escanear(AHORA);

    expect(update).not.toHaveBeenCalled();
    expect(avisos.notifyActivityOvertime).not.toHaveBeenCalled();
  });

  it('una actividad ya cerrada no genera aviso', async () => {
    const { service, avisos } = build([fila({ activity: { estatus: 'Finalizada' } })]);
    await (service as never as { escanear: (d: Date) => Promise<void> }).escanear(AHORA);

    expect(avisos.notifyActivityOvertime).not.toHaveBeenCalled();
  });

  it('una actividad de varios días no se da por excedida por el reloj corrido', async () => {
    const { service, avisos, update } = build([
      fila({
        inicioRealAt: hace(3 * 24 * 60),
        activity: { estatus: 'En Proceso', periodoInicio: '2026-09-16', periodoFin: '2026-09-25' },
      }),
    ]);
    await (service as never as { escanear: (d: Date) => Promise<void> }).escanear(AHORA);

    expect(update).not.toHaveBeenCalled();
    expect(avisos.notifyActivityOvertime).not.toHaveBeenCalled();
  });

  it('con periodo de un solo día el tiempo estimado sí cuenta', async () => {
    const { service, avisos } = build([
      fila({ activity: { estatus: 'En Proceso', periodoInicio: '2026-09-18', periodoFin: '2026-09-18' } }),
    ]);
    await (service as never as { escanear: (d: Date) => Promise<void> }).escanear(AHORA);

    expect(avisos.notifyActivityOvertime).toHaveBeenCalled();
  });
});
